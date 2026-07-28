import { makeEntry, makeFragrance } from '@/domain/fixtures';
import { DEFAULT_SETTINGS } from '@/domain/types';
import { buildExport, exportFilename, parseExport, serialiseExport } from './dataRights';

const DATA = {
  fragrances: [makeFragrance({ id: 'a', name: 'Aventus', price: 445, notes: 'A gift' })],
  sotd: [makeEntry({ id: 'e1', fragranceId: 'a', date: '2026-07-28', note: 'Wore it to the wedding' })],
  settings: { ...DEFAULT_SETTINGS, currency: 'GBP' },
};

describe('buildExport', () => {
  it('includes every bottle, every diary entry and the settings', () => {
    // The whole point of a data right is completeness — a "summary" export
    // would not satisfy it.
    const doc = buildExport(DATA, '2026-07-28T12:00:00.000Z');
    expect(doc.fragrances).toHaveLength(1);
    expect(doc.sotdEntries).toHaveLength(1);
    expect(doc.settings.currency).toBe('GBP');
    expect(doc.counts).toEqual({ fragrances: 1, sotdEntries: 1 });
  });

  it('preserves free-text the user wrote', () => {
    const doc = buildExport(DATA, '2026-07-28T12:00:00.000Z');
    expect(doc.fragrances[0].notes).toBe('A gift');
    expect(doc.sotdEntries[0].note).toBe('Wore it to the wedding');
  });

  it('stamps the app name and a version so a future importer can adapt', () => {
    const doc = buildExport(DATA, '2026-07-28T12:00:00.000Z');
    expect(doc.app).toBe('ScentKeep');
    expect(doc.version).toBe(1);
    expect(doc.exportedAt).toBe('2026-07-28T12:00:00.000Z');
  });

  it('exports an empty collection without failing', () => {
    const doc = buildExport({ fragrances: [], sotd: [], settings: DEFAULT_SETTINGS }, '2026-07-28T00:00:00.000Z');
    expect(doc.counts).toEqual({ fragrances: 0, sotdEntries: 0 });
  });
});

describe('exportFilename', () => {
  it('date-stamps the filename', () => {
    expect(exportFilename('2026-07-28T12:00:00.000Z')).toBe('scentkeep-export-2026-07-28.json');
  });
});

describe('round trip', () => {
  it('survives serialise -> parse with the data intact', () => {
    const doc = buildExport(DATA, '2026-07-28T12:00:00.000Z');
    const result = parseExport(serialiseExport(doc));
    expect(result.ok).toBe(true);
    expect(result.fragrances).toHaveLength(1);
    expect(result.fragrances?.[0].name).toBe('Aventus');
    expect(result.sotd?.[0].note).toBe('Wore it to the wedding');
  });
});

describe('parseExport rejects bad input', () => {
  it('rejects non-JSON', () => {
    expect(parseExport('not json at all')).toMatchObject({ ok: false });
  });

  it('rejects JSON that is not an object', () => {
    expect(parseExport('"a string"')).toMatchObject({ ok: false });
    expect(parseExport('null')).toMatchObject({ ok: false });
    expect(parseExport('42')).toMatchObject({ ok: false });
  });

  it('rejects a document from a different app', () => {
    expect(parseExport(JSON.stringify({ app: 'SomethingElse', fragrances: [], sotdEntries: [] }))).toMatchObject({
      ok: false,
    });
  });

  it('rejects a document missing its arrays', () => {
    expect(parseExport(JSON.stringify({ app: 'ScentKeep' }))).toMatchObject({ ok: false });
  });

  it('rejects bottles without an id or a name, rather than importing junk', () => {
    // Importing a malformed file must not be able to replace a real collection
    // with unusable rows.
    expect(
      parseExport(JSON.stringify({ app: 'ScentKeep', fragrances: [{ name: 'No id' }], sotdEntries: [] })),
    ).toMatchObject({ ok: false });
    expect(
      parseExport(JSON.stringify({ app: 'ScentKeep', fragrances: [{ id: 'x' }], sotdEntries: [] })),
    ).toMatchObject({ ok: false });
  });

  it('accepts a valid but empty export', () => {
    expect(parseExport(JSON.stringify({ app: 'ScentKeep', fragrances: [], sotdEntries: [] }))).toMatchObject({
      ok: true,
    });
  });
});
