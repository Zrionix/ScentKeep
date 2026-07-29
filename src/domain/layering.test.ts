import { makeFragrance } from './fixtures';
import {
  CONTRAST_CEILING,
  judgePair,
  layeringPairs,
  layersWith,
  roleOf,
  SUGGEST_THRESHOLD,
} from './layering';

const amber = (over = {}) =>
  makeFragrance({
    id: 'amber',
    name: 'Amber One',
    family: 'Amber',
    notesHeart: 'Vanilla',
    notesBase: 'Labdanum, Benzoin',
    sillage: 3,
    ...over,
  });

const citrus = (over = {}) =>
  makeFragrance({
    id: 'citrus',
    name: 'Citrus One',
    family: 'Citrus',
    notesTop: 'Bergamot, Lemon',
    notesHeart: 'Neroli',
    notesBase: 'Vanilla',
    sillage: 2,
    ...over,
  });

describe('roleOf', () => {
  it('reads heavy families as anchors and bright ones as lifts', () => {
    expect(roleOf(makeFragrance({ id: 'a', family: 'Gourmand' }))).toBe('anchor');
    expect(roleOf(makeFragrance({ id: 'b', family: 'Aquatic' }))).toBe('lift');
  });

  it('is case-insensitive about the family', () => {
    expect(roleOf(makeFragrance({ id: 'a', family: 'woody' }))).toBe('anchor');
  });

  it('declines to place an unknown or missing family', () => {
    expect(roleOf(makeFragrance({ id: 'a', family: 'Smoky' }))).toBe('either');
    expect(roleOf(makeFragrance({ id: 'b' }))).toBe('either');
  });
});

describe('judgePair', () => {
  it('does not pair a bottle with itself', () => {
    const f = amber();
    expect(judgePair(f, f)).toBeNull();
  });

  it('says nothing when neither bottle has notes or a family', () => {
    const a = makeFragrance({ id: 'a', name: 'A' });
    const b = makeFragrance({ id: 'b', name: 'B' });
    expect(judgePair(a, b)).toBeNull();
  });

  it('always explains itself', () => {
    const pair = judgePair(amber(), citrus());
    expect(pair).not.toBeNull();
    expect(pair!.reasons.length).toBeGreaterThan(0);
    expect(pair!.reasons.every((r) => r.trim().length > 0)).toBe(true);
  });

  it('prefers an anchor under a lift over the other way round', () => {
    const forward = judgePair(amber(), citrus())!;
    const reverse = judgePair(citrus(), amber())!;
    expect(forward.score).toBeGreaterThan(reverse.score);
    expect(forward.anchor.id).toBe('amber');
    expect(forward.lift.id).toBe('citrus');
  });

  it('names the bridging note in its reasoning', () => {
    const pair = judgePair(amber(), citrus())!;
    expect(pair.bridge).toContain('Vanilla');
    expect(pair.reasons.join(' ')).toContain('Vanilla');
  });

  it('ignores a shared opening as a bridge — it is gone in fifteen minutes', () => {
    const a = makeFragrance({ id: 'a', name: 'A', family: 'Amber', notesTop: 'Bergamot' });
    const b = makeFragrance({ id: 'b', name: 'B', family: 'Citrus', notesTop: 'Bergamot' });
    expect(judgePair(a, b)!.bridge).toEqual([]);
  });

  it('marks down two bottles that are nearly the same scent', () => {
    const twin = amber({ id: 'amber-2', name: 'Amber Two' });
    const pair = judgePair(amber(), twin)!;
    expect(pair.score).toBeLessThan(SUGGEST_THRESHOLD);
    expect(pair.reasons.join(' ')).toMatch(/adds little/i);
  });

  it('warns when both bottles project hard', () => {
    const pair = judgePair(amber({ sillage: 5 }), citrus({ sillage: 5 }))!;
    expect(pair.reasons.join(' ')).toMatch(/project hard/i);
  });

  it('scores a loud pair below the same pair worn quietly', () => {
    const loud = judgePair(amber({ sillage: 5 }), citrus({ sillage: 5 }))!;
    const calm = judgePair(amber({ sillage: 3 }), citrus({ sillage: 2 }))!;
    expect(loud.score).toBeLessThan(calm.score);
  });

  it('treats the contrast ceiling as the point where a pairing stops adding', () => {
    // Guards the constant itself: raising it above the duplicate range would
    // start recommending a bottle be layered with its own twin.
    expect(CONTRAST_CEILING).toBeLessThan(1);
    expect(CONTRAST_CEILING).toBeGreaterThan(0);
  });
});

describe('layeringPairs', () => {
  const shelf = [
    amber(),
    citrus(),
    makeFragrance({
      id: 'aquatic',
      name: 'Aquatic One',
      family: 'Aquatic',
      notesTop: 'Sea Salt',
      notesBase: 'Ambergris, Benzoin',
      sillage: 2,
    }),
  ];

  it('returns each unordered pair once, in its better orientation', () => {
    const pairs = layeringPairs(shelf, { minScore: 0 });
    const seen = pairs.map((p) => [p.anchor.id, p.lift.id].sort().join('|'));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('ranks best first', () => {
    const pairs = layeringPairs(shelf, { minScore: 0 });
    const scores = pairs.map((p) => p.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('honours the limit', () => {
    expect(layeringPairs(shelf, { minScore: 0, limit: 1 })).toHaveLength(1);
  });

  it('ignores wishlist bottles — you cannot layer what you do not own', () => {
    const withWish = [amber(), citrus({ id: 'wish', name: 'Wish', inWishlist: true })];
    expect(layeringPairs(withWish, { minScore: 0 })).toEqual([]);
  });

  it('returns nothing for a shelf too small to pair', () => {
    expect(layeringPairs([amber()])).toEqual([]);
    expect(layeringPairs([])).toEqual([]);
  });

  it('returns nothing rather than a weak suggestion', () => {
    const twins = [amber(), amber({ id: 'amber-2', name: 'Amber Two' })];
    expect(layeringPairs(twins)).toEqual([]);
  });
});

describe('layersWith', () => {
  const shelf = [amber(), citrus()];

  it('finds partners for one bottle', () => {
    const pairs = layersWith(amber(), shelf, { minScore: 0 });
    expect(pairs).toHaveLength(1);
    expect([pairs[0].anchor.id, pairs[0].lift.id]).toContain('citrus');
  });

  it('never pairs the target with itself', () => {
    const pairs = layersWith(amber(), shelf, { minScore: 0 });
    expect(pairs.every((p) => p.anchor.id !== p.lift.id)).toBe(true);
  });

  it('skips wishlist candidates', () => {
    const pairs = layersWith(amber(), [citrus({ inWishlist: true })], { minScore: 0 });
    expect(pairs).toEqual([]);
  });
});
