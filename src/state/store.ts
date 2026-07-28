import AsyncStorage from '@react-native-async-storage/async-storage';
import { DateTime } from 'luxon';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { canAddToWardrobe, canAddToWishlist, canMoveToWardrobe } from '@/domain/entitlements';
import { alreadyLogged } from '@/domain/sotd';
import { ownedBottles, wishlistBottles } from '@/domain/stats';
import {
  DEFAULT_SETTINGS,
  type Fragrance,
  type FragranceDraft,
  type Settings,
  type SotdEntry,
} from '@/domain/types';
import { todayIso } from '@/lib/dates';
import { newId } from '@/lib/id';

// ---------------------------------------------------------------------------
// The app's single source of truth, persisted to AsyncStorage.
//
// LOCAL-FIRST by design: every write lands on the device immediately, so the app
// is fully usable offline and on first launch before any network call. Supabase
// is a mirror (see src/lib/sync.ts), not the write path — which is what lets the
// wardrobe render instantly and never show a spinner to add a bottle.
//
// GATING LIVES HERE. The free-tier caps are enforced in the actions, not in the
// screens, so there is exactly one place to get it right and no screen can route
// around it. Actions return a discriminated result instead of throwing.
// ---------------------------------------------------------------------------

export type MutationResult<T = void> =
  | ({ ok: true } & (T extends void ? object : { value: T }))
  | { ok: false; reason: 'cap-wardrobe' | 'cap-wishlist' | 'duplicate' | 'not-found' };

export interface AppState {
  /** True once the persisted state has been read back from disk. */
  hydrated: boolean;
  /** Supabase user id when signed in (anonymous counts), else null. */
  userId: string | null;
  isPremium: boolean;

  fragrances: Fragrance[];
  sotd: SotdEntry[];
  settings: Settings;

  /** Bumped on every local mutation so the sync layer knows work is pending. */
  dirtyAt: string | null;

  // --- actions ---
  setHydrated(v: boolean): void;
  setUserId(id: string | null): void;
  setPremium(v: boolean): void;

  addFragrance(draft: FragranceDraft): MutationResult<Fragrance>;
  updateFragrance(id: string, patch: Partial<FragranceDraft>): MutationResult<Fragrance>;
  deleteFragrance(id: string): MutationResult;
  moveToWardrobe(id: string): MutationResult<Fragrance>;
  moveToWishlist(id: string): MutationResult<Fragrance>;

  logSotd(input: {
    fragranceId: string;
    date?: string;
    occasion?: string | null;
    weather?: string | null;
    mood?: string | null;
    note?: string | null;
    rating?: number;
  }): MutationResult<SotdEntry>;
  updateSotd(id: string, patch: Partial<Omit<SotdEntry, 'id' | 'createdAt'>>): MutationResult<SotdEntry>;
  deleteSotd(id: string): MutationResult;

  updateSettings(patch: Partial<Settings>): void;
  completeOnboarding(answers: { families: string[]; sizeBand: string | null }): void;

  /** Replace everything — used by cloud restore and by the demo seeder. */
  replaceAll(data: { fragrances: Fragrance[]; sotd: SotdEntry[]; settings?: Partial<Settings> }): void;
  /** Wipe local data (delete-my-data / sign-out). */
  clearAll(): void;
}

const nowIso = () => DateTime.utc().toISO()!;

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      userId: null,
      isPremium: false,
      fragrances: [],
      sotd: [],
      settings: { ...DEFAULT_SETTINGS },
      dirtyAt: null,

      setHydrated: (v) => set({ hydrated: v }),
      setUserId: (id) => set({ userId: id }),
      setPremium: (v) => set({ isPremium: v }),

      addFragrance(draft) {
        const { fragrances, isPremium } = get();
        // The cap is checked against the list the bottle is JOINING, so a
        // wishlist add is never blocked by a full wardrobe and vice versa.
        if (draft.inWishlist) {
          if (!canAddToWishlist(wishlistBottles(fragrances).length, isPremium)) {
            return { ok: false, reason: 'cap-wishlist' };
          }
        } else if (!canAddToWardrobe(ownedBottles(fragrances).length, isPremium)) {
          return { ok: false, reason: 'cap-wardrobe' };
        }

        const stamp = nowIso();
        const fragrance: Fragrance = {
          ...draft,
          name: draft.name.trim(),
          brand: draft.brand.trim(),
          id: newId(),
          createdAt: stamp,
          updatedAt: stamp,
        };
        set({ fragrances: [fragrance, ...fragrances], dirtyAt: stamp });
        return { ok: true, value: fragrance };
      },

      updateFragrance(id, patch) {
        const { fragrances } = get();
        const existing = fragrances.find((f) => f.id === id);
        if (!existing) return { ok: false, reason: 'not-found' };

        // `inWishlist` is deliberately NOT settable here — moving between shelf
        // and wishlist changes which cap applies, so it goes through the
        // dedicated moveTo* actions that check the destination cap.
        const { inWishlist: _ignored, ...safePatch } = patch;
        const updated: Fragrance = {
          ...existing,
          ...safePatch,
          name: (safePatch.name ?? existing.name).trim(),
          brand: (safePatch.brand ?? existing.brand).trim(),
          updatedAt: nowIso(),
        };
        set({
          fragrances: fragrances.map((f) => (f.id === id ? updated : f)),
          dirtyAt: updated.updatedAt,
        });
        return { ok: true, value: updated };
      },

      deleteFragrance(id) {
        const { fragrances, sotd } = get();
        if (!fragrances.some((f) => f.id === id)) return { ok: false, reason: 'not-found' };
        set({
          fragrances: fragrances.filter((f) => f.id !== id),
          // Diary entries for a removed bottle go with it, matching the ON
          // DELETE CASCADE in Postgres so local and remote agree after a sync.
          sotd: sotd.filter((e) => e.fragranceId !== id),
          dirtyAt: nowIso(),
        });
        return { ok: true };
      },

      moveToWardrobe(id) {
        const { fragrances, isPremium } = get();
        const existing = fragrances.find((f) => f.id === id);
        if (!existing) return { ok: false, reason: 'not-found' };
        if (!existing.inWishlist) return { ok: true, value: existing };
        // Gated by the WARDROBE cap: parking bottles on the wishlist and
        // promoting them must not be a way past the free limit.
        if (!canMoveToWardrobe(ownedBottles(fragrances).length, isPremium)) {
          return { ok: false, reason: 'cap-wardrobe' };
        }
        const updated = { ...existing, inWishlist: false, updatedAt: nowIso() };
        set({
          fragrances: fragrances.map((f) => (f.id === id ? updated : f)),
          dirtyAt: updated.updatedAt,
        });
        return { ok: true, value: updated };
      },

      moveToWishlist(id) {
        const { fragrances, isPremium } = get();
        const existing = fragrances.find((f) => f.id === id);
        if (!existing) return { ok: false, reason: 'not-found' };
        if (existing.inWishlist) return { ok: true, value: existing };
        if (!canAddToWishlist(wishlistBottles(fragrances).length, isPremium)) {
          return { ok: false, reason: 'cap-wishlist' };
        }
        const updated = { ...existing, inWishlist: true, updatedAt: nowIso() };
        set({
          fragrances: fragrances.map((f) => (f.id === id ? updated : f)),
          dirtyAt: updated.updatedAt,
        });
        return { ok: true, value: updated };
      },

      logSotd(input) {
        const { fragrances, sotd } = get();
        const date = input.date ?? todayIso();
        if (!fragrances.some((f) => f.id === input.fragranceId)) {
          return { ok: false, reason: 'not-found' };
        }
        // Mirrors the unique (user, fragrance, date) constraint. A double tap on
        // the log button must not create two wears — that would inflate every
        // most-worn and cost-per-wear figure downstream.
        if (alreadyLogged(sotd, input.fragranceId, date)) {
          return { ok: false, reason: 'duplicate' };
        }

        const entry: SotdEntry = {
          id: newId(),
          fragranceId: input.fragranceId,
          date,
          occasion: input.occasion ?? null,
          weather: input.weather ?? null,
          mood: input.mood ?? null,
          note: input.note ?? null,
          rating: (input.rating ?? 0) as SotdEntry['rating'],
          createdAt: nowIso(),
        };
        set({ sotd: [entry, ...sotd], dirtyAt: entry.createdAt });
        return { ok: true, value: entry };
      },

      updateSotd(id, patch) {
        const { sotd } = get();
        const existing = sotd.find((e) => e.id === id);
        if (!existing) return { ok: false, reason: 'not-found' };
        const updated = { ...existing, ...patch };
        set({ sotd: sotd.map((e) => (e.id === id ? updated : e)), dirtyAt: nowIso() });
        return { ok: true, value: updated };
      },

      deleteSotd(id) {
        const { sotd } = get();
        if (!sotd.some((e) => e.id === id)) return { ok: false, reason: 'not-found' };
        set({ sotd: sotd.filter((e) => e.id !== id), dirtyAt: nowIso() });
        return { ok: true };
      },

      updateSettings(patch) {
        set({ settings: { ...get().settings, ...patch }, dirtyAt: nowIso() });
      },

      completeOnboarding(answers) {
        set({
          settings: {
            ...get().settings,
            favoriteFamilies: answers.families,
            collectionSizeBand: answers.sizeBand,
            onboardedAt: nowIso(),
          },
          dirtyAt: nowIso(),
        });
      },

      replaceAll(data) {
        set({
          fragrances: data.fragrances,
          sotd: data.sotd,
          settings: { ...get().settings, ...(data.settings ?? {}) },
          dirtyAt: nowIso(),
        });
      },

      clearAll() {
        set({
          fragrances: [],
          sotd: [],
          settings: { ...DEFAULT_SETTINGS },
          dirtyAt: nowIso(),
        });
      },
    }),
    {
      name: 'scentkeep-store-v1',
      storage: createJSONStorage(() => AsyncStorage),
      // `isPremium` is deliberately persisted so the app opens in the right tier
      // offline, but it is re-verified against RevenueCat on every launch — the
      // stored value is a cache, never the authority.
      partialize: (s) => ({
        fragrances: s.fragrances,
        sotd: s.sotd,
        settings: s.settings,
        isPremium: s.isPremium,
        userId: s.userId,
        dirtyAt: s.dirtyAt,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

// --- selectors (kept out of components so they're testable) ------------------

export const selectOwned = (s: AppState) => ownedBottles(s.fragrances);
export const selectWishlist = (s: AppState) => wishlistBottles(s.fragrances);
export const selectById = (id: string) => (s: AppState) => s.fragrances.find((f) => f.id === id);
export const selectNeedsOnboarding = (s: AppState) => s.settings.onboardedAt === null;
