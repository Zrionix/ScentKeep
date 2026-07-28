import { withDefaults, type Fragrance, type Settings, type SotdEntry } from '@/domain/types';
import type { FragranceRow, SotdRow } from './backend/database.types';
import { getSupabaseClient } from './supabaseClient';

// ---------------------------------------------------------------------------
// Cloud backup & sync — a PREMIUM feature (brief §3).
//
// The device is the source of truth; this pushes it up and pulls it back on a
// new install. Conflicts resolve last-write-wins on `updated_at`, which is the
// right call for a single-user collection: there is no second editor to lose a
// change to, and the alternative (merge prompts) is user-hostile for a diary.
//
// Everything here is best-effort. A failed sync must never lose local data or
// block the UI — it just leaves `dirtyAt` set so the next attempt retries.
// ---------------------------------------------------------------------------

export interface SyncResult {
  ok: boolean;
  pushed: number;
  pulled: number;
  /** Set when sync did not run; `reason` explains which precondition failed. */
  skipped?: 'not-configured' | 'not-signed-in' | 'not-premium';
  error?: string;
}

function toFragranceRow(f: Fragrance, userId: string): FragranceRow {
  return {
    id: f.id,
    user_id: userId,
    name: f.name,
    brand: f.brand,
    photo_url: f.photoUrl,
    notes_top: f.notesTop,
    notes_heart: f.notesHeart,
    notes_base: f.notesBase,
    family: f.family ?? null,
    size_ml: f.sizeMl,
    price: f.price,
    currency: f.currency,
    purchase_date: f.purchaseDate,
    seasons: f.seasons,
    occasions: f.occasions,
    longevity: f.longevity,
    sillage: f.sillage,
    rating: f.rating,
    in_wishlist: f.inWishlist,
    notes: f.notes,
    type: f.type,
    concentration: f.concentration,
    house_tier: f.houseTier,
    sprays_per_wear: f.spraysPerWear,
    remaining_ml: f.remainingMl,
    remaining_ml_at: f.remainingMlAt,
    wishlist_kind: f.wishlistKind,
    created_at: f.createdAt,
    updated_at: f.updatedAt,
  };
}

export function fromFragranceRow(r: FragranceRow): Fragrance {
  // Routed through `withDefaults` so a row written by an older client — or one
  // fetched before a column existed — arrives complete rather than with
  // `undefined` where the app expects a value.
  return withDefaults({
    id: r.id,
    name: r.name,
    brand: r.brand,
    photoUrl: r.photo_url,
    notesTop: r.notes_top,
    notesHeart: r.notes_heart,
    notesBase: r.notes_base,
    family: r.family,
    sizeMl: r.size_ml,
    price: r.price,
    currency: r.currency,
    purchaseDate: r.purchase_date,
    seasons: r.seasons as Fragrance['seasons'],
    occasions: r.occasions as Fragrance['occasions'],
    longevity: r.longevity as Fragrance['longevity'],
    sillage: r.sillage as Fragrance['sillage'],
    rating: r.rating as Fragrance['rating'],
    inWishlist: r.in_wishlist,
    notes: r.notes,
    type: (r.type ?? 'bottle') as Fragrance['type'],
    concentration: r.concentration as Fragrance['concentration'],
    houseTier: r.house_tier as Fragrance['houseTier'],
    spraysPerWear: r.sprays_per_wear,
    remainingMl: r.remaining_ml,
    remainingMlAt: r.remaining_ml_at,
    wishlistKind: (r.wishlist_kind ?? 'buy') as Fragrance['wishlistKind'],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
}

function toSotdRow(e: SotdEntry, userId: string): SotdRow {
  return {
    id: e.id,
    user_id: userId,
    fragrance_id: e.fragranceId,
    date: e.date,
    occasion: e.occasion,
    weather: e.weather,
    mood: e.mood,
    note: e.note,
    rating: e.rating,
    created_at: e.createdAt,
  };
}

export function fromSotdRow(r: SotdRow): SotdEntry {
  return {
    id: r.id,
    fragranceId: r.fragrance_id,
    date: r.date,
    occasion: r.occasion,
    weather: r.weather,
    mood: r.mood,
    note: r.note,
    rating: r.rating as SotdEntry['rating'],
    createdAt: r.created_at,
  };
}

/**
 * Merges remote rows into local ones, keeping whichever side was written last.
 * Exported because this is the part worth testing on its own — a merge that
 * silently drops an edit is the kind of bug users notice weeks later.
 */
export function mergeByUpdatedAt(local: Fragrance[], remote: Fragrance[]): Fragrance[] {
  const byId = new Map<string, Fragrance>();
  for (const f of local) byId.set(f.id, f);
  for (const r of remote) {
    const existing = byId.get(r.id);
    if (!existing || r.updatedAt > existing.updatedAt) byId.set(r.id, r);
  }
  return [...byId.values()];
}

/** Diary entries are immutable once written, so a union by id is the whole merge. */
export function mergeEntries(local: SotdEntry[], remote: SotdEntry[]): SotdEntry[] {
  const byId = new Map<string, SotdEntry>();
  for (const e of local) byId.set(e.id, e);
  for (const e of remote) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()];
}

export interface SyncInput {
  userId: string | null;
  isPremium: boolean;
  fragrances: Fragrance[];
  sotd: SotdEntry[];
  settings: Settings;
  /** Rows deleted locally that the cloud may still hold. See the store. */
  deletedFragranceIds?: string[];
  deletedSotdIds?: string[];
}

/**
 * Pushes local state up, then pulls anything the cloud has that we don't.
 * Returns the merged data for the caller to write back into the store.
 */
export async function syncNow(
  input: SyncInput,
): Promise<
  SyncResult & {
    merged?: { fragrances: Fragrance[]; sotd: SotdEntry[] };
    /** Tombstones the server accepted; the caller clears exactly these. */
    appliedDeletions?: { fragranceIds: string[]; sotdIds: string[] };
  }
> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, pushed: 0, pulled: 0, skipped: 'not-configured' };
  if (!input.userId) return { ok: false, pushed: 0, pulled: 0, skipped: 'not-signed-in' };
  if (!input.isPremium) return { ok: false, pushed: 0, pulled: 0, skipped: 'not-premium' };

  const userId = input.userId;

  try {
    // Bottles must land before diary entries: the composite FK on sotd_entries
    // points at (fragrance_id, user_id), so an entry pushed first would be
    // rejected for referencing a bottle the server hasn't seen yet.
    if (input.fragrances.length) {
      const { error } = await supabase
        .from('fragrances')
        .upsert(input.fragrances.map((f) => toFragranceRow(f, userId)), { onConflict: 'id' });
      if (error) return { ok: false, pushed: 0, pulled: 0, error: error.message };
    }

    if (input.sotd.length) {
      const { error } = await supabase
        .from('sotd_entries')
        .upsert(input.sotd.map((e) => toSotdRow(e, userId)), { onConflict: 'id' });
      if (error) return { ok: false, pushed: input.fragrances.length, pulled: 0, error: error.message };
    }

    await supabase.from('settings').upsert(
      {
        user_id: userId,
        reminder_enabled: input.settings.reminderEnabled,
        reminder_time: input.settings.reminderTime,
        rediscover_enabled: input.settings.rediscoverEnabled,
        theme_preference: input.settings.themePreference,
        currency: input.settings.currency,
        favorite_families: input.settings.favoriteFamilies,
        collection_size_band: input.settings.collectionSizeBand,
        onboarded_at: input.settings.onboardedAt,
      },
      { onConflict: 'user_id' },
    );

    // Deletions must be applied to the server BEFORE the pull. Upserts alone
    // leave a deleted row sitting in the cloud, and the pull then hands it
    // straight back — the bottle the user deleted reappears on next launch.
    const deletedFragranceIds = input.deletedFragranceIds ?? [];
    const deletedSotdIds = input.deletedSotdIds ?? [];
    const appliedDeletions = { fragranceIds: [] as string[], sotdIds: [] as string[] };

    if (deletedSotdIds.length) {
      const { error } = await supabase.from('sotd_entries').delete().in('id', deletedSotdIds);
      if (!error) appliedDeletions.sotdIds = deletedSotdIds;
    }
    if (deletedFragranceIds.length) {
      // Diary rows cascade from the bottle, so this covers both.
      const { error } = await supabase.from('fragrances').delete().in('id', deletedFragranceIds);
      if (!error) appliedDeletions.fragranceIds = deletedFragranceIds;
    }

    const [remoteFrags, remoteSotd] = await Promise.all([
      supabase.from('fragrances').select('*'),
      supabase.from('sotd_entries').select('*'),
    ]);

    // Belt and braces: filter the pull against the tombstones too, so a
    // deletion whose server-side delete failed still doesn't resurrect locally.
    const deadFragrances = new Set(deletedFragranceIds);
    const deadSotd = new Set(deletedSotdIds);

    const remoteF = (remoteFrags.data ?? [])
      .map(fromFragranceRow)
      .filter((f) => !deadFragrances.has(f.id));
    const remoteS = (remoteSotd.data ?? [])
      .map(fromSotdRow)
      .filter((e) => !deadSotd.has(e.id) && !deadFragrances.has(e.fragranceId));

    const merged = {
      fragrances: mergeByUpdatedAt(input.fragrances, remoteF),
      sotd: mergeEntries(input.sotd, remoteS),
    };

    return {
      ok: true,
      pushed: input.fragrances.length + input.sotd.length,
      pulled: remoteF.length + remoteS.length,
      merged,
      appliedDeletions,
    };
  } catch (e) {
    return { ok: false, pushed: 0, pulled: 0, error: e instanceof Error ? e.message : 'Sync failed.' };
  }
}

/**
 * Removes every cloud row for the signed-in user, leaving the local copy alone.
 * Used by "stop syncing" and as the cloud half of delete-my-data.
 */
export async function purgeCloud(userId: string | null): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return { ok: true };
  try {
    // sotd_entries cascade from fragrances, but deleting explicitly keeps this
    // honest if the cascade is ever changed.
    await supabase.from('sotd_entries').delete().eq('user_id', userId);
    await supabase.from('fragrances').delete().eq('user_id', userId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not clear cloud data.' };
  }
}
