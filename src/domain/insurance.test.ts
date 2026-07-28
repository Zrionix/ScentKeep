import { makeFragrance } from './fixtures';
import { buildInsuranceReport, csvEscape, disclaimer, insuranceFilename, toCsv } from './insurance';

const AT = '2026-07-28T12:00:00.000Z';

describe('buildInsuranceReport', () => {
  it('itemises the owned collection and totals only recorded prices', () => {
    const report = buildInsuranceReport(
      [
        makeFragrance({ id: 'a', name: 'Aventus', brand: 'Creed', price: 445, sizeMl: 100 }),
        makeFragrance({ id: 'b', name: 'Layton', brand: 'PdM', price: 355 }),
        makeFragrance({ id: 'c', name: 'Unpriced', price: null }),
      ],
      'USD',
      AT,
    );
    expect(report.rows).toHaveLength(3);
    expect(report.documentedCount).toBe(2);
    expect(report.undocumentedCount).toBe(1);
    expect(report.documentedTotal).toBe(800);
  });

  it('excludes the wishlist — you cannot insure what you have not bought', () => {
    const report = buildInsuranceReport(
      [
        makeFragrance({ id: 'a', price: 100 }),
        makeFragrance({ id: 'want', price: 900, inWishlist: true }),
      ],
      'USD',
      AT,
    );
    expect(report.rows).toHaveLength(1);
    expect(report.documentedTotal).toBe(100);
  });

  it('sorts most valuable first, which is the order a claim is argued in', () => {
    const report = buildInsuranceReport(
      [
        makeFragrance({ id: 'a', name: 'Cheap', price: 50 }),
        makeFragrance({ id: 'b', name: 'Dear', price: 500 }),
        makeFragrance({ id: 'c', name: 'Middling', price: 200 }),
      ],
      'USD',
      AT,
    );
    expect(report.rows.map((r) => r.name)).toEqual(['Dear', 'Middling', 'Cheap']);
  });

  it('counts photographed items, which carriers ask for', () => {
    const report = buildInsuranceReport(
      [
        makeFragrance({ id: 'a', photoUrl: 'file://a.jpg' }),
        makeFragrance({ id: 'b', photoUrl: null }),
      ],
      'USD',
      AT,
    );
    expect(report.photographedCount).toBe(1);
  });

  it('falls back to the settings currency when items disagree', () => {
    const report = buildInsuranceReport(
      [
        makeFragrance({ id: 'a', price: 100, currency: 'USD' }),
        makeFragrance({ id: 'b', price: 100, currency: 'EUR' }),
      ],
      'GBP',
      AT,
    );
    expect(report.currency).toBe('GBP');
  });

  it('handles an empty collection', () => {
    const report = buildInsuranceReport([], 'USD', AT);
    expect(report.rows).toEqual([]);
    expect(report.documentedTotal).toBe(0);
  });
});

describe('csvEscape', () => {
  // A fragrance called "Rose, Oud" would otherwise shift every later column
  // and corrupt the document the insurer opens.
  it('quotes fields containing a comma', () => {
    expect(csvEscape('Rose, Oud')).toBe('"Rose, Oud"');
  });

  it('doubles embedded quotes', () => {
    expect(csvEscape('The "Good" One')).toBe('"The ""Good"" One"');
  });

  it('quotes fields containing newlines', () => {
    expect(csvEscape('line one\nline two')).toBe('"line one\nline two"');
  });

  it('leaves ordinary values alone', () => {
    expect(csvEscape('Aventus')).toBe('Aventus');
    expect(csvEscape('')).toBe('');
  });
});

describe('toCsv', () => {
  it('emits a header row and one row per item', () => {
    const report = buildInsuranceReport(
      [makeFragrance({ id: 'a', name: 'Aventus', brand: 'Creed', price: 445 })],
      'USD',
      AT,
    );
    const lines = toCsv(report).split('\n');
    expect(lines[0]).toContain('Item');
    expect(lines[0]).toContain('Purchase price');
    expect(lines[1]).toContain('Aventus');
    expect(lines[1]).toContain('445.00');
  });

  it('survives names and notes full of punctuation', () => {
    const report = buildInsuranceReport(
      [makeFragrance({ id: 'a', name: 'Rose, Oud & "Smoke"', notes: 'Bought in Paris,\nduty free', price: 300 })],
      'USD',
      AT,
    );
    const csv = toCsv(report);
    // The data row must still have the item in a single quoted field.
    expect(csv).toContain('"Rose, Oud & ""Smoke"""');
    expect(csv).toContain('"Bought in Paris,\nduty free"');
  });

  it('appends a summary the reader does not have to add up themselves', () => {
    const report = buildInsuranceReport(
      [makeFragrance({ id: 'a', price: 100 }), makeFragrance({ id: 'b', price: null })],
      'USD',
      AT,
    );
    const csv = toCsv(report);
    expect(csv).toContain('Total documented purchase price');
    expect(csv).toContain('USD 100.00');
    expect(csv).toContain('Items without a recorded price,1');
  });
});

describe('disclaimer', () => {
  it('states plainly that this is not an appraisal', () => {
    // Overstating what this document is would be a misrepresentation to an
    // insurer, which is a far worse outcome than an unimpressive total.
    const text = disclaimer(buildInsuranceReport([makeFragrance({ id: 'a', price: 100 })], 'USD', AT));
    expect(text).toContain('not a professional appraisal');
    expect(text).toContain('does not state current market value');
  });

  it('says how many items were left out of the total', () => {
    const report = buildInsuranceReport(
      [makeFragrance({ id: 'a', price: 100 }), makeFragrance({ id: 'b', price: null })],
      'USD',
      AT,
    );
    expect(disclaimer(report)).toContain('1 item had no purchase price');
  });

  it('says nothing about omissions when there are none', () => {
    const report = buildInsuranceReport([makeFragrance({ id: 'a', price: 100 })], 'USD', AT);
    expect(disclaimer(report)).not.toContain('excluded');
  });
});

describe('insuranceFilename', () => {
  it('date-stamps the file', () => {
    expect(insuranceFilename(AT)).toBe('scentkeep-collection-record-2026-07-28.csv');
  });
});
