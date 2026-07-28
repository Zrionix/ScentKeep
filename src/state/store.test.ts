import { FREE_LIMITS } from '@/domain/entitlements';
import { emptyDraft } from '@/domain/types';
import { useStore } from './store';

const reset = () =>
  useStore.setState({
    fragrances: [],
    sotd: [],
    isPremium: false,
    deletedFragranceIds: [],
    deletedSotdIds: [],
    dirtyAt: null,
  });

const add = (name: string, over: Parameters<typeof emptyDraft>[0] = {}) =>
  useStore.getState().addFragrance(emptyDraft({ name, ...over }));

const fillWardrobe = (n: number) => {
  for (let i = 0; i < n; i += 1) add(`Bottle ${i}`);
};

beforeEach(reset);

describe('addFragrance', () => {
  it('adds a bottle with a generated id and timestamps', () => {
    const r = add('Aventus', { brand: 'Creed' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.value.createdAt).toBeTruthy();
    expect(useStore.getState().fragrances).toHaveLength(1);
  });

  it('trims whitespace from name and house', () => {
    const r = add('  Layton  ', { brand: '  Parfums de Marly  ' });
    expect(r.ok && r.value.name).toBe('Layton');
    expect(r.ok && r.value.brand).toBe('Parfums de Marly');
  });

  it('puts the newest bottle first', () => {
    add('First');
    add('Second');
    expect(useStore.getState().fragrances[0].name).toBe('Second');
  });

  it('marks the store dirty so sync knows there is work', () => {
    expect(useStore.getState().dirtyAt).toBeNull();
    add('Anything');
    expect(useStore.getState().dirtyAt).not.toBeNull();
  });
});

describe('free-tier caps are enforced in the store', () => {
  it('blocks the bottle past the wardrobe cap', () => {
    fillWardrobe(FREE_LIMITS.wardrobe);
    const blocked = add('One Too Many');
    expect(blocked).toEqual({ ok: false, reason: 'cap-wardrobe' });
    expect(useStore.getState().fragrances).toHaveLength(FREE_LIMITS.wardrobe);
  });

  it('lets premium go past the cap', () => {
    useStore.setState({ isPremium: true });
    fillWardrobe(FREE_LIMITS.wardrobe + 5);
    expect(useStore.getState().fragrances).toHaveLength(FREE_LIMITS.wardrobe + 5);
  });

  it('does not let a full wardrobe block a wishlist add', () => {
    fillWardrobe(FREE_LIMITS.wardrobe);
    expect(add('Wanted', { inWishlist: true }).ok).toBe(true);
  });

  it('blocks the item past the wishlist cap', () => {
    for (let i = 0; i < FREE_LIMITS.wishlist; i += 1) add(`Want ${i}`, { inWishlist: true });
    expect(add('Too many wants', { inWishlist: true })).toEqual({ ok: false, reason: 'cap-wishlist' });
  });

  it('counts wardrobe and wishlist against separate caps', () => {
    fillWardrobe(FREE_LIMITS.wardrobe);
    for (let i = 0; i < FREE_LIMITS.wishlist; i += 1) add(`Want ${i}`, { inWishlist: true });
    const s = useStore.getState();
    expect(s.fragrances.filter((f) => !f.inWishlist)).toHaveLength(FREE_LIMITS.wardrobe);
    expect(s.fragrances.filter((f) => f.inWishlist)).toHaveLength(FREE_LIMITS.wishlist);
  });
});

describe('moveToWardrobe — the cap-bypass path', () => {
  it('refuses to promote a wishlist bottle when the wardrobe is full', () => {
    // Without this, a free user parks bottles on the wishlist and promotes them
    // one at a time to exceed the wardrobe cap indefinitely.
    fillWardrobe(FREE_LIMITS.wardrobe);
    const want = add('Parked', { inWishlist: true });
    expect(want.ok).toBe(true);
    if (!want.ok) return;

    expect(useStore.getState().moveToWardrobe(want.value.id)).toEqual({
      ok: false,
      reason: 'cap-wardrobe',
    });
    expect(useStore.getState().fragrances.find((f) => f.id === want.value.id)?.inWishlist).toBe(true);
  });

  it('promotes when there is room', () => {
    fillWardrobe(FREE_LIMITS.wardrobe - 1);
    const want = add('Parked', { inWishlist: true });
    if (!want.ok) throw new Error('setup failed');
    expect(useStore.getState().moveToWardrobe(want.value.id).ok).toBe(true);
    expect(useStore.getState().fragrances.find((f) => f.id === want.value.id)?.inWishlist).toBe(false);
  });

  it('is a no-op for a bottle already on the shelf', () => {
    const f = add('Owned');
    if (!f.ok) throw new Error('setup failed');
    expect(useStore.getState().moveToWardrobe(f.value.id).ok).toBe(true);
  });

  it('reports not-found for an unknown id', () => {
    expect(useStore.getState().moveToWardrobe('nope')).toEqual({ ok: false, reason: 'not-found' });
  });
});

describe('updateFragrance', () => {
  it('patches fields and bumps updatedAt', () => {
    const f = add('Old Name');
    if (!f.ok) throw new Error('setup failed');
    const r = useStore.getState().updateFragrance(f.value.id, { name: 'New Name', rating: 5 });
    expect(r.ok && r.value.name).toBe('New Name');
    expect(r.ok && r.value.rating).toBe(5);
  });

  it('ignores an attempt to flip inWishlist, which would skip the cap check', () => {
    fillWardrobe(FREE_LIMITS.wardrobe);
    const want = add('Parked', { inWishlist: true });
    if (!want.ok) throw new Error('setup failed');

    // A screen calling updateFragrance({ inWishlist: false }) must not be a
    // second, unchecked route onto a full shelf.
    useStore.getState().updateFragrance(want.value.id, { inWishlist: false } as never);
    expect(useStore.getState().fragrances.find((f) => f.id === want.value.id)?.inWishlist).toBe(true);
  });

  it('reports not-found for an unknown id', () => {
    expect(useStore.getState().updateFragrance('nope', { name: 'x' })).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });
});

describe('deleteFragrance', () => {
  it('removes the bottle and its diary entries together', () => {
    const f = add('Doomed');
    if (!f.ok) throw new Error('setup failed');
    useStore.getState().logSotd({ fragranceId: f.value.id, date: '2026-07-01' });
    useStore.getState().logSotd({ fragranceId: f.value.id, date: '2026-07-02' });
    expect(useStore.getState().sotd).toHaveLength(2);

    useStore.getState().deleteFragrance(f.value.id);
    expect(useStore.getState().fragrances).toHaveLength(0);
    // Matches ON DELETE CASCADE in Postgres, so a later sync doesn't resurrect
    // orphaned diary rows that point at a bottle that no longer exists.
    expect(useStore.getState().sotd).toHaveLength(0);
  });

  it('leaves other bottles’ entries alone', () => {
    const a = add('Keep');
    const b = add('Delete');
    if (!a.ok || !b.ok) throw new Error('setup failed');
    useStore.getState().logSotd({ fragranceId: a.value.id, date: '2026-07-01' });
    useStore.getState().logSotd({ fragranceId: b.value.id, date: '2026-07-01' });

    useStore.getState().deleteFragrance(b.value.id);
    expect(useStore.getState().sotd).toHaveLength(1);
    expect(useStore.getState().sotd[0].fragranceId).toBe(a.value.id);
  });
});

describe('logSotd', () => {
  it('logs a wear against an owned bottle', () => {
    const f = add('Today’s Pick');
    if (!f.ok) throw new Error('setup failed');
    const r = useStore.getState().logSotd({ fragranceId: f.value.id, occasion: 'Work' });
    expect(r.ok).toBe(true);
    expect(useStore.getState().sotd).toHaveLength(1);
    expect(r.ok && r.value.occasion).toBe('Work');
  });

  it('refuses a duplicate for the same bottle on the same day', () => {
    // Guards a double-tap on the log button, which would otherwise double-count
    // every wear and corrupt most-worn / cost-per-wear.
    const f = add('Once Only');
    if (!f.ok) throw new Error('setup failed');
    expect(useStore.getState().logSotd({ fragranceId: f.value.id, date: '2026-07-28' }).ok).toBe(true);
    expect(useStore.getState().logSotd({ fragranceId: f.value.id, date: '2026-07-28' })).toEqual({
      ok: false,
      reason: 'duplicate',
    });
    expect(useStore.getState().sotd).toHaveLength(1);
  });

  it('allows two DIFFERENT bottles on the same day', () => {
    const a = add('Morning');
    const b = add('Evening');
    if (!a.ok || !b.ok) throw new Error('setup failed');
    useStore.getState().logSotd({ fragranceId: a.value.id, date: '2026-07-28' });
    expect(useStore.getState().logSotd({ fragranceId: b.value.id, date: '2026-07-28' }).ok).toBe(true);
  });

  it('allows the same bottle on a different day', () => {
    const f = add('Daily Driver');
    if (!f.ok) throw new Error('setup failed');
    useStore.getState().logSotd({ fragranceId: f.value.id, date: '2026-07-27' });
    expect(useStore.getState().logSotd({ fragranceId: f.value.id, date: '2026-07-28' }).ok).toBe(true);
  });

  it('refuses to log against a bottle that is not in the collection', () => {
    expect(useStore.getState().logSotd({ fragranceId: 'ghost' })).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });

  it('is never capped for free users — logging is always allowed', () => {
    // Free users are limited on how much history they can READ, not on logging.
    const f = add('Workhorse');
    if (!f.ok) throw new Error('setup failed');
    for (let i = 0; i < 100; i += 1) {
      useStore.getState().logSotd({ fragranceId: f.value.id, date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}` });
    }
    expect(useStore.getState().sotd.length).toBeGreaterThan(20);
    expect(useStore.getState().isPremium).toBe(false);
  });
});

describe('deleteSotd', () => {
  it('removes one entry and reports not-found otherwise', () => {
    const f = add('Bottle');
    if (!f.ok) throw new Error('setup failed');
    const e = useStore.getState().logSotd({ fragranceId: f.value.id });
    if (!e.ok) throw new Error('setup failed');
    expect(useStore.getState().deleteSotd(e.value.id).ok).toBe(true);
    expect(useStore.getState().sotd).toHaveLength(0);
    expect(useStore.getState().deleteSotd('nope')).toEqual({ ok: false, reason: 'not-found' });
  });
});

describe('settings + onboarding', () => {
  it('patches settings without clobbering the rest', () => {
    useStore.getState().updateSettings({ reminderTime: '07:15' });
    const s = useStore.getState().settings;
    expect(s.reminderTime).toBe('07:15');
    expect(s.reminderEnabled).toBe(true); // untouched default
  });

  it('records onboarding answers and stamps completion', () => {
    useStore.getState().completeOnboarding({ families: ['Woody', 'Amber'], sizeBand: '5-15' });
    const s = useStore.getState().settings;
    expect(s.favoriteFamilies).toEqual(['Woody', 'Amber']);
    expect(s.collectionSizeBand).toBe('5-15');
    expect(s.onboardedAt).not.toBeNull();
  });
});

describe('replaceAll / clearAll', () => {
  it('replaces the whole collection (cloud restore)', () => {
    add('Local');
    useStore.getState().replaceAll({
      fragrances: [],
      sotd: [],
      settings: { currency: 'EUR' },
    });
    expect(useStore.getState().fragrances).toHaveLength(0);
    expect(useStore.getState().settings.currency).toBe('EUR');
  });

  it('wipes everything back to defaults (delete-my-data)', () => {
    add('Doomed');
    useStore.getState().updateSettings({ currency: 'GBP' });
    useStore.getState().clearAll();
    const s = useStore.getState();
    expect(s.fragrances).toEqual([]);
    expect(s.sotd).toEqual([]);
    expect(s.settings.currency).toBe('USD');
  });
});

describe('deletion tombstones', () => {
  // Without tombstones, sync pushes upserts, pulls everything back, and the
  // bottle the user deleted returns on the next launch — the server still had
  // it, and the merge reads it as a row the device was missing.
  it('records a tombstone when a bottle is deleted', () => {
    const f = add('Doomed');
    if (!f.ok) throw new Error('setup failed');
    useStore.getState().deleteFragrance(f.value.id);
    expect(useStore.getState().deletedFragranceIds).toEqual([f.value.id]);
  });

  it('records a tombstone when a diary entry is deleted', () => {
    const f = add('Bottle');
    if (!f.ok) throw new Error('setup failed');
    const e = useStore.getState().logSotd({ fragranceId: f.value.id });
    if (!e.ok) throw new Error('setup failed');
    useStore.getState().deleteSotd(e.value.id);
    expect(useStore.getState().deletedSotdIds).toEqual([e.value.id]);
  });

  it('does not duplicate a tombstone', () => {
    const f = add('Doomed');
    if (!f.ok) throw new Error('setup failed');
    useStore.getState().deleteFragrance(f.value.id);
    useStore.getState().deleteFragrance(f.value.id); // already gone
    expect(useStore.getState().deletedFragranceIds).toHaveLength(1);
  });

  it('clears only the tombstones the server actually accepted', () => {
    const a = add('A');
    const b = add('B');
    if (!a.ok || !b.ok) throw new Error('setup failed');
    useStore.getState().deleteFragrance(a.value.id);
    useStore.getState().deleteFragrance(b.value.id);

    // Sync applied only the first deletion; the second must stay pending so the
    // next attempt retries it instead of silently resurrecting the row.
    useStore.getState().clearTombstones([a.value.id], []);
    expect(useStore.getState().deletedFragranceIds).toEqual([b.value.id]);
  });

  it('keeps a tombstone created while a sync was in flight', () => {
    const a = add('A');
    if (!a.ok) throw new Error('setup failed');
    useStore.getState().deleteFragrance(a.value.id);

    const b = add('B');
    if (!b.ok) throw new Error('setup failed');
    useStore.getState().deleteFragrance(b.value.id);

    // The sync that started before B was deleted reports only A.
    useStore.getState().clearTombstones([a.value.id], []);
    expect(useStore.getState().deletedFragranceIds).toContain(b.value.id);
  });

  it('bounds the tombstone list so it cannot grow without limit', () => {
    useStore.setState({ isPremium: true });
    for (let i = 0; i < 520; i += 1) {
      const f = add(`Bottle ${i}`);
      if (f.ok) useStore.getState().deleteFragrance(f.value.id);
    }
    expect(useStore.getState().deletedFragranceIds.length).toBeLessThanOrEqual(500);
  });

  it('drops tombstones entirely on delete-my-data', () => {
    const f = add('Doomed');
    if (!f.ok) throw new Error('setup failed');
    useStore.getState().deleteFragrance(f.value.id);
    useStore.getState().clearAll();
    expect(useStore.getState().deletedFragranceIds).toEqual([]);
    expect(useStore.getState().deletedSotdIds).toEqual([]);
  });
});

describe('downgrade behaviour', () => {
  it('keeps over-cap data on downgrade rather than deleting it', () => {
    // A lapsed subscriber must never lose bottles. The cap blocks NEW adds; it
    // does not prune what is already there.
    useStore.setState({ isPremium: true });
    fillWardrobe(FREE_LIMITS.wardrobe + 8);
    useStore.setState({ isPremium: false });

    expect(useStore.getState().fragrances).toHaveLength(FREE_LIMITS.wardrobe + 8);
    expect(add('New one while over cap')).toEqual({ ok: false, reason: 'cap-wardrobe' });
  });
});
