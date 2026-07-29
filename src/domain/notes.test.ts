import { makeFragrance } from './fixtures';
import { hasNotes, noteFrequency, noteKey, notesOf, splitNotes, TIER_WEIGHT } from './notes';

describe('noteKey', () => {
  it('folds case and diacritics', () => {
    expect(noteKey('Fève Tonka')).toBe('feve tonka');
    expect(noteKey('BERGAMOT')).toBe('bergamot');
  });

  it('collapses runs of whitespace', () => {
    expect(noteKey('  Dried   Fruits  ')).toBe('dried fruit');
  });

  it('strips a plural so Woods matches Wood', () => {
    expect(noteKey('Woods')).toBe(noteKey('Wood'));
    expect(noteKey('Spices')).toBe(noteKey('Spice'));
  });

  it('leaves words that merely end in s alone', () => {
    // The whole point of the -is/-us/-ss/-os guard. Getting this wrong turns
    // Iris into Iri and quietly matches it against nothing.
    expect(noteKey('Iris')).toBe('iris');
    expect(noteKey('Citrus')).toBe('citrus');
    expect(noteKey('Oakmoss')).toBe('oakmoss');
    expect(noteKey('Calamus')).toBe('calamus');
  });

  it('leaves short words alone', () => {
    expect(noteKey('Oats')).toBe('oats');
  });
});

describe('splitNotes', () => {
  it('handles the punctuation people actually type', () => {
    expect(splitNotes('Bergamot, Pepper')).toEqual(['Bergamot', 'Pepper']);
    expect(splitNotes('vanilla; cacao')).toEqual(['vanilla', 'cacao']);
    expect(splitNotes('Dried Fruits / Woods')).toEqual(['Dried Fruits', 'Woods']);
    expect(splitNotes('Rose & Oud')).toEqual(['Rose', 'Oud']);
    expect(splitNotes('Amber + Musk')).toEqual(['Amber', 'Musk']);
  });

  it('does not split a note that merely contains an ampersand-free word', () => {
    expect(splitNotes('Black Pepper')).toEqual(['Black Pepper']);
  });

  it('returns nothing for empty input', () => {
    expect(splitNotes(null)).toEqual([]);
    expect(splitNotes('')).toEqual([]);
    expect(splitNotes('  ,  ; ')).toEqual([]);
  });

  it('drops absurdly long entries rather than treating prose as a note', () => {
    expect(splitNotes('x'.repeat(61))).toEqual([]);
  });
});

describe('notesOf', () => {
  const f = makeFragrance({
    id: 'a',
    notesTop: 'Bergamot, Pepper',
    notesHeart: 'Lavender',
    notesBase: 'Ambroxan, Cedar',
  });

  it('weights base heaviest and top lightest', () => {
    const byKey = new Map(notesOf(f).map((n) => [n.key, n]));
    expect(byKey.get('cedar')!.weight).toBe(TIER_WEIGHT.base);
    expect(byKey.get('lavender')!.weight).toBe(TIER_WEIGHT.heart);
    expect(byKey.get('bergamot')!.weight).toBe(TIER_WEIGHT.top);
  });

  it('keeps a note that spans two tiers at its heaviest, once', () => {
    const spanning = makeFragrance({
      id: 'b',
      notesTop: 'Vanilla',
      notesHeart: 'Vanilla',
      notesBase: 'Vanilla',
    });
    const notes = notesOf(spanning);
    expect(notes).toHaveLength(1);
    expect(notes[0].weight).toBe(TIER_WEIGHT.base);
  });

  it('preserves the spelling the user typed for display', () => {
    const typed = makeFragrance({ id: 'c', notesBase: 'Fève Tonka' });
    expect(notesOf(typed)[0]).toMatchObject({ key: 'feve tonka', label: 'Fève Tonka' });
  });

  it('reports no notes for a bare bottle', () => {
    expect(hasNotes(makeFragrance({ id: 'd' }))).toBe(false);
    expect(hasNotes(f)).toBe(true);
  });
});

describe('noteFrequency', () => {
  it('counts each note once per bottle, most common first', () => {
    const list = [
      makeFragrance({ id: '1', notesBase: 'Cedar, Musk' }),
      makeFragrance({ id: '2', notesBase: 'Cedar' }),
      makeFragrance({ id: '3', notesTop: 'Cedar', notesBase: 'Cedar' }),
    ];
    expect(noteFrequency(list)).toEqual([
      { label: 'Cedar', count: 3 },
      { label: 'Musk', count: 1 },
    ]);
  });
});
