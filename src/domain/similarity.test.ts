import { makeFragrance } from './fixtures';
import {
  collectionShape,
  CONCENTRATED_ABOVE,
  DUPLICATE_THRESHOLD,
  FAMILY_ONLY_SCORE,
  MIN_CLASSIFIED_FOR_GAPS,
  SIMILAR_THRESHOLD,
  similarity,
  similarTo,
  triageWishlist,
} from './similarity';

const woodyBase = (id: string, over = {}) =>
  makeFragrance({
    id,
    family: 'Woody',
    notesTop: 'Bergamot',
    notesHeart: 'Violet',
    notesBase: 'Cedar, Sandalwood',
    ...over,
  });

describe('similarity', () => {
  it('scores a bottle against itself as nothing — it is not its own match', () => {
    const f = woodyBase('a');
    expect(similarity(f, f)).toMatchObject({ basis: 'none', score: 0 });
  });

  it('scores two identical pyramids at the top of the range', () => {
    const s = similarity(woodyBase('a'), woodyBase('b'));
    expect(s.basis).toBe('notes');
    expect(s.score).toBe(1);
    expect(s.shared.map((n) => n.label).sort()).toEqual([
      'Bergamot',
      'Cedar',
      'Sandalwood',
      'Violet',
    ]);
  });

  it('weights a shared base far above a shared opening', () => {
    const target = woodyBase('target');
    const sharesBase = makeFragrance({
      id: 'base',
      family: 'Woody',
      notesTop: 'Cardamom',
      notesHeart: 'Iris',
      notesBase: 'Cedar, Sandalwood',
    });
    const sharesTop = makeFragrance({
      id: 'top',
      family: 'Woody',
      notesTop: 'Bergamot',
      notesHeart: 'Iris',
      notesBase: 'Vetiver, Patchouli',
    });

    expect(similarity(target, sharesBase).score).toBeGreaterThan(
      similarity(target, sharesTop).score,
    );
  });

  it('does not reward a bottle simply for carrying more notes', () => {
    // Cosine rather than raw overlap. The sprawling pyramid shares the same two
    // base notes as the tight one, so it must not out-rank it.
    const target = woodyBase('target');
    const tight = makeFragrance({ id: 'tight', notesBase: 'Cedar, Sandalwood' });
    const sprawling = makeFragrance({
      id: 'sprawl',
      notesTop: 'Lemon, Lime, Orange, Grapefruit, Mandarin',
      notesHeart: 'Rose, Jasmine, Ylang, Tuberose',
      notesBase: 'Cedar, Sandalwood, Musk, Amber, Vanilla, Tonka',
    });
    expect(similarity(target, tight).score).toBeGreaterThan(
      similarity(target, sprawling).score,
    );
  });

  it('falls back to family, capped, when neither side has notes', () => {
    const a = makeFragrance({ id: 'a', family: 'Amber' });
    const b = makeFragrance({ id: 'b', family: 'Amber' });
    expect(similarity(a, b)).toMatchObject({
      basis: 'family',
      score: FAMILY_ONLY_SCORE,
      shared: [],
    });
  });

  it('caps the family-only score below the threshold that calls things similar', () => {
    // Otherwise "both Woody" alone would be presented as a real match, and
    // Woody spans dry cedar and sweet oud.
    expect(FAMILY_ONLY_SCORE).toBeLessThan(SIMILAR_THRESHOLD);
  });

  it('says nothing when there is nothing to compare', () => {
    const a = makeFragrance({ id: 'a' });
    const b = makeFragrance({ id: 'b' });
    expect(similarity(a, b)).toMatchObject({ basis: 'none', score: 0 });
  });

  it('says nothing when only one side has notes', () => {
    const a = woodyBase('a', { family: null });
    const b = makeFragrance({ id: 'b' });
    expect(similarity(a, b).basis).toBe('none');
  });

  it('matches notes across tiers and across spelling', () => {
    const a = makeFragrance({ id: 'a', notesBase: 'Woods' });
    const b = makeFragrance({ id: 'b', notesBase: 'wood' });
    expect(similarity(a, b).shared).toHaveLength(1);
  });

  it('reports shared notes at the heavier of the two tiers', () => {
    const a = makeFragrance({ id: 'a', notesTop: 'Vanilla' });
    const b = makeFragrance({ id: 'b', notesBase: 'Vanilla' });
    expect(similarity(a, b).shared[0].tier).toBe('base');
  });
});

describe('similarTo', () => {
  const target = woodyBase('target');
  const shelf = [
    target,
    makeFragrance({ id: 'close', family: 'Woody', notesBase: 'Cedar, Sandalwood' }),
    makeFragrance({ id: 'far', family: 'Citrus', notesTop: 'Lemon', notesBase: 'Musk' }),
    makeFragrance({
      id: 'wish',
      family: 'Woody',
      notesBase: 'Cedar, Sandalwood',
      inWishlist: true,
    }),
  ];

  it('never returns the target itself', () => {
    expect(similarTo(target, shelf).map((m) => m.fragrance.id)).not.toContain('target');
  });

  it('excludes wishlist rows by default', () => {
    expect(similarTo(target, shelf).map((m) => m.fragrance.id)).not.toContain('wish');
  });

  it('includes wishlist rows when asked', () => {
    const ids = similarTo(target, shelf, { includeWishlist: true }).map((m) => m.fragrance.id);
    expect(ids).toContain('wish');
  });

  it('returns nothing rather than a weak match', () => {
    const unrelated = makeFragrance({ id: 'x', notesBase: 'Seaweed' });
    expect(similarTo(target, [unrelated])).toEqual([]);
  });

  it('ranks best first and honours the limit', () => {
    const ranked = similarTo(target, shelf, { limit: 1, minScore: 0 });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].fragrance.id).toBe('close');
  });

  it('copes with an empty shelf', () => {
    expect(similarTo(target, [])).toEqual([]);
  });
});

describe('collectionShape', () => {
  const many = (family: string, n: number, from = 0) =>
    Array.from({ length: n }, (_, i) => makeFragrance({ id: `${family}-${from + i}`, family }));

  it('reports how many bottles it had to leave out', () => {
    const shape = collectionShape([
      ...many('Woody', 3),
      makeFragrance({ id: 'bare-1' }),
      makeFragrance({ id: 'bare-2' }),
    ]);
    expect(shape.classified).toBe(3);
    expect(shape.unclassified).toBe(2);
  });

  it('ignores wishlist rows — a gap is about what you own', () => {
    const shape = collectionShape([
      ...many('Woody', 3),
      makeFragrance({ id: 'w', family: 'Green', inWishlist: true }),
    ]);
    expect(shape.classified).toBe(3);
    expect(shape.missing).not.toContain('Woody');
  });

  it('stays silent about gaps until there is enough to go on', () => {
    const shape = collectionShape(many('Woody', MIN_CLASSIFIED_FOR_GAPS - 1));
    expect(shape.tooSparse).toBe(true);
    expect(shape.missing).toEqual([]);
  });

  it('names a family that dominates the shelf', () => {
    const shape = collectionShape([...many('Woody', 6), ...many('Citrus', 2)]);
    expect(shape.tooSparse).toBe(false);
    expect(shape.concentrations[0]).toMatchObject({ family: 'Woody', count: 6 });
    expect(shape.concentrations[0].share).toBeGreaterThan(CONCENTRATED_ABOVE);
  });

  it('lists the known families the shelf has nothing in', () => {
    const shape = collectionShape([...many('Woody', 4), ...many('Citrus', 3)]);
    expect(shape.missing).toContain('Gourmand');
    expect(shape.missing).not.toContain('Woody');
    expect(shape.missing).not.toContain('Citrus');
  });

  it('matches a family case-insensitively so "woody" is not a second family', () => {
    const shape = collectionShape([
      ...many('Woody', 4),
      makeFragrance({ id: 'lower-1', family: 'woody' }),
      ...many('Citrus', 2),
    ]);
    expect(shape.missing).not.toContain('Woody');
  });

  it('survives a collection with nothing classified', () => {
    const shape = collectionShape([makeFragrance({ id: 'a' })]);
    expect(shape).toMatchObject({ classified: 0, unclassified: 1, tooSparse: true });
    expect(shape.concentrations).toEqual([]);
  });
});

describe('triageWishlist', () => {
  const owned = [
    woodyBase('owned-woody'),
    makeFragrance({
      id: 'owned-gourmand',
      family: 'Gourmand',
      notesTop: 'Tobacco',
      notesHeart: 'Vanilla',
      notesBase: 'Cacao, Dried Fruits',
    }),
  ];

  it('flags a near-copy of something already owned', () => {
    const list = [...owned, woodyBase('wish', { inWishlist: true })];
    const [t] = triageWishlist(list);
    expect(t.verdict).toBe('duplicate');
    expect(t.closest?.fragrance.id).toBe('owned-woody');
    expect(t.closest!.similarity.score).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });

  it('calls a genuinely different bottle new ground', () => {
    const list = [
      ...owned,
      makeFragrance({
        id: 'wish',
        family: 'Aquatic',
        notesTop: 'Sea Salt',
        notesBase: 'Ambergris',
        inWishlist: true,
      }),
    ];
    expect(triageWishlist(list)[0]).toMatchObject({ verdict: 'new-ground' });
  });

  it('refuses to judge a wishlist entry with nothing entered on it', () => {
    // "Nothing like it" and "you told me nothing about it" are different
    // findings, and only one of them is true here.
    const list = [...owned, makeFragrance({ id: 'wish', inWishlist: true })];
    const [t] = triageWishlist(list);
    expect(t.verdict).toBe('unknown');
    expect(t.closest).toBeNull();
  });

  it('treats anything as new ground when the shelf is empty', () => {
    const list = [makeFragrance({ id: 'wish', inWishlist: true })];
    expect(triageWishlist(list)[0].verdict).toBe('new-ground');
  });

  it('orders new ground first, then similar, then duplicates', () => {
    const list = [
      ...owned,
      woodyBase('dupe', { inWishlist: true }),
      makeFragrance({
        id: 'fresh',
        family: 'Aquatic',
        notesBase: 'Ambergris',
        inWishlist: true,
      }),
    ];
    expect(triageWishlist(list).map((t) => t.fragrance.id)).toEqual(['fresh', 'dupe']);
  });

  it('marks an entry that would open a family the shelf lacks', () => {
    const shelf = Array.from({ length: MIN_CLASSIFIED_FOR_GAPS }, (_, i) =>
      makeFragrance({ id: `w${i}`, family: 'Woody', notesBase: 'Cedar' }),
    );
    const list = [
      ...shelf,
      makeFragrance({ id: 'wish', family: 'Gourmand', notesBase: 'Cacao', inWishlist: true }),
    ];
    expect(triageWishlist(list)[0]).toMatchObject({ fillsGap: true });
  });

  it('does not claim a gap when the collection is too sparse to have one', () => {
    const list = [
      makeFragrance({ id: 'w', family: 'Woody', notesBase: 'Cedar' }),
      makeFragrance({ id: 'wish', family: 'Gourmand', notesBase: 'Cacao', inWishlist: true }),
    ];
    expect(triageWishlist(list)[0].fillsGap).toBe(false);
  });

  it('returns nothing for an empty wishlist', () => {
    expect(triageWishlist(owned)).toEqual([]);
  });
});
