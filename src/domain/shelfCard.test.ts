import { makeEntry, makeFragrance } from './fixtures';
import { buildShelfCard, CARD_SLOTS, MIN_BOTTLES_FOR_CARD } from './shelfCard';
import type { Fragrance, Rating } from './types';

const shelf = (n: number, over: (i: number) => Partial<Fragrance> = () => ({})): Fragrance[] =>
  Array.from({ length: n }, (_, i) =>
    makeFragrance({ id: `f${i}`, name: `Bottle ${i}`, brand: `House ${i}`, ...over(i) }),
  );

describe('buildShelfCard', () => {
  it('refuses to make a card from a shelf too small to be one', () => {
    expect(buildShelfCard(shelf(MIN_BOTTLES_FOR_CARD - 1), [])).toBeNull();
    expect(buildShelfCard([], [])).toBeNull();
  });

  it('never shows more than the slots available', () => {
    const card = buildShelfCard(shelf(20), [])!;
    expect(card.entries).toHaveLength(CARD_SLOTS);
  });

  it('ignores wishlist bottles — the card is what you own', () => {
    const list = [...shelf(3), makeFragrance({ id: 'w', name: 'Wish', inWishlist: true })];
    const card = buildShelfCard(list, [])!;
    expect(card.entries.map((e) => e.fragrance.id)).not.toContain('w');
    expect(card.stat).toContain('3 bottles');
  });

  it('never puts a price on the card', () => {
    // The one rule that matters. A collection photo circulating with what
    // everything cost is a shopping list for a burglar.
    const list = shelf(4, () => ({ price: 495, currency: 'USD' }));
    const card = buildShelfCard(list, [])!;
    const text = [card.title, card.stat, ...card.entries.map((e) => e.caption)].join(' ');
    expect(text).not.toMatch(/495|USD|\$/);
  });

  describe('most worn', () => {
    const list = shelf(4);
    const entries = [
      makeEntry({ id: 'a', fragranceId: 'f2', date: '2026-01-01' }),
      makeEntry({ id: 'b', fragranceId: 'f2', date: '2026-01-02' }),
      makeEntry({ id: 'c', fragranceId: 'f1', date: '2026-01-03' }),
    ];

    it('leads with the bottle actually worn most', () => {
      const card = buildShelfCard(list, entries, 'most-worn')!;
      expect(card.entries[0].fragrance.id).toBe('f2');
      expect(card.entries[0].caption).toBe('2 wears');
    });

    it('singularises a single wear', () => {
      const card = buildShelfCard(list, entries, 'most-worn')!;
      expect(card.entries[1].caption).toBe('1 wear');
    });

    it('falls back to the house rather than printing "0 wears"', () => {
      const card = buildShelfCard(list, entries, 'most-worn')!;
      const unworn = card.entries.find((e) => e.fragrance.id === 'f0')!;
      expect(unworn.caption).toBe('House 0');
    });

    it('degrades to top-rated when nothing has been logged at all', () => {
      const card = buildShelfCard(shelf(4, (i) => ({ rating: i as Rating })), [], 'most-worn')!;
      expect(card.mode).toBe('top-rated');
      expect(card.title).toBe('Top rated');
      expect(card.entries[0].fragrance.id).toBe('f3');
    });

    it('counts only wears of bottles still in the collection', () => {
      // A diary entry for a deleted bottle must not inflate the headline.
      const ghost = [...entries, makeEntry({ id: 'x', fragranceId: 'gone', date: '2026-01-04' })];
      expect(buildShelfCard(list, ghost, 'most-worn')!.stat).toContain('3 wears');
    });
  });

  describe('top rated', () => {
    it('orders by rating and shows stars', () => {
      const card = buildShelfCard(shelf(4, (i) => ({ rating: (i + 1) as Rating })), [], 'top-rated')!;
      expect(card.entries[0].fragrance.id).toBe('f3');
      expect(card.entries[0].caption).toBe('★★★★');
    });

    it('shows the house rather than an empty star row for an unrated bottle', () => {
      const card = buildShelfCard(shelf(3), [], 'top-rated')!;
      expect(card.entries[0].caption).toBe('House 0');
    });
  });

  describe('recent', () => {
    it('orders by when the bottle was added, newest first', () => {
      const list = shelf(3, (i) => ({ createdAt: `2026-01-0${i + 1}T00:00:00.000Z` }));
      const card = buildShelfCard(list, [], 'recent')!;
      expect(card.entries.map((e) => e.fragrance.id)).toEqual(['f2', 'f1', 'f0']);
    });
  });

  it('breaks ties by name so the card does not reshuffle between renders', () => {
    const list = [
      makeFragrance({ id: 'b', name: 'Beta' }),
      makeFragrance({ id: 'a', name: 'Alpha' }),
      makeFragrance({ id: 'c', name: 'Gamma' }),
    ];
    expect(buildShelfCard(list, [])!.entries.map((e) => e.fragrance.name)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ]);
  });

  it('leaves the wear count out of the headline when nothing is logged', () => {
    expect(buildShelfCard(shelf(3), [])!.stat).toBe('3 bottles');
  });
});
