import type { Fragrance } from './types';

// ---------------------------------------------------------------------------
// Insurance documentation export.
//
// Why this exists: a standard homeowner's policy caps "contents" categories at
// roughly $1,000–$2,500. A serious fragrance collection passes that quietly,
// and at claim time the carrier asks for exactly what ScentKeep already holds —
// itemised descriptions, purchase dates, purchase prices, and photographs.
//
// The hard rule for this file: it reports PURCHASE PRICES the user entered. It
// does not appraise, does not estimate market value, and does not guess at
// anything it wasn't told. An export that inflated a collection's worth would
// be worse than useless in a claim — it would be a misrepresentation.
// ---------------------------------------------------------------------------

export interface InsuranceRow {
  name: string;
  house: string;
  type: string;
  concentration: string;
  sizeMl: string;
  purchaseDate: string;
  purchasePrice: string;
  currency: string;
  hasPhoto: string;
  notes: string;
}

export interface InsuranceReport {
  generatedAt: string;
  rows: InsuranceRow[];
  /** Items with a recorded purchase price. */
  documentedCount: number;
  /** Items with NO price — excluded from the total and reported separately. */
  undocumentedCount: number;
  /** Items carrying a photograph. */
  photographedCount: number;
  /** Sum of recorded purchase prices only. */
  documentedTotal: number;
  currency: string;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Builds the report from the owned collection. Wishlist rows are excluded —
 * you cannot insure what you have not bought.
 */
export function buildInsuranceReport(
  fragrances: Fragrance[],
  fallbackCurrency: string,
  generatedAt: string,
): InsuranceReport {
  const owned = fragrances.filter((f) => !f.inWishlist);

  const priced = owned.filter((f) => typeof f.price === 'number' && f.price !== null && f.price > 0);
  const documentedTotal = round2(priced.reduce((sum, f) => sum + (f.price ?? 0), 0));

  const currency =
    priced.length > 0 && priced.every((f) => f.currency === priced[0].currency)
      ? priced[0].currency
      : fallbackCurrency;

  const rows: InsuranceRow[] = owned
    .slice()
    .sort((a, b) => (b.price ?? 0) - (a.price ?? 0) || a.name.localeCompare(b.name))
    .map((f) => ({
      name: f.name,
      house: f.brand || '',
      type: f.type,
      concentration: f.concentration ?? '',
      sizeMl: f.sizeMl !== null ? String(f.sizeMl) : '',
      purchaseDate: f.purchaseDate ?? '',
      purchasePrice: f.price !== null ? f.price.toFixed(2) : '',
      currency: f.price !== null ? f.currency : '',
      hasPhoto: f.photoUrl ? 'yes' : 'no',
      notes: f.notes ?? '',
    }));

  return {
    generatedAt,
    rows,
    documentedCount: priced.length,
    undocumentedCount: owned.length - priced.length,
    photographedCount: owned.filter((f) => Boolean(f.photoUrl)).length,
    documentedTotal,
    currency,
  };
}

const CSV_HEADERS: (keyof InsuranceRow)[] = [
  'name',
  'house',
  'type',
  'concentration',
  'sizeMl',
  'purchaseDate',
  'purchasePrice',
  'currency',
  'hasPhoto',
  'notes',
];

const CSV_LABELS: Record<keyof InsuranceRow, string> = {
  name: 'Item',
  house: 'House',
  type: 'Type',
  concentration: 'Concentration',
  sizeMl: 'Size (ml)',
  purchaseDate: 'Purchase date',
  purchasePrice: 'Purchase price',
  currency: 'Currency',
  hasPhoto: 'Photo on file',
  notes: 'Notes',
};

/**
 * Escapes a CSV field. Fragrance names and user notes routinely contain
 * commas, quotes and newlines — unescaped, a single "Rose, Oud" would shift
 * every later column and corrupt the document an insurer reads.
 */
export function csvEscape(value: string): string {
  if (value === '') return '';
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(report: InsuranceReport): string {
  const lines: string[] = [];
  lines.push(CSV_HEADERS.map((h) => csvEscape(CSV_LABELS[h])).join(','));
  for (const row of report.rows) {
    lines.push(CSV_HEADERS.map((h) => csvEscape(row[h])).join(','));
  }
  // A trailing summary block, because the person opening this wants the total
  // without adding up a column themselves.
  lines.push('');
  lines.push(csvEscape('Documented items') + ',' + report.documentedCount);
  lines.push(csvEscape('Items without a recorded price') + ',' + report.undocumentedCount);
  lines.push(csvEscape('Items with a photograph') + ',' + report.photographedCount);
  lines.push(
    csvEscape('Total documented purchase price') +
      ',' +
      csvEscape(`${report.currency} ${report.documentedTotal.toFixed(2)}`),
  );
  lines.push(csvEscape('Generated') + ',' + csvEscape(report.generatedAt));
  return lines.join('\n');
}

export function insuranceFilename(generatedAt: string): string {
  return `scentkeep-collection-record-${generatedAt.slice(0, 10)}.csv`;
}

/**
 * The wording that accompanies the export. Deliberately conservative: it says
 * what the document IS (a record of what the owner entered) and what it is NOT
 * (an appraisal), so nobody presents it to an insurer as more than it is.
 */
export function disclaimer(report: InsuranceReport): string {
  const missing =
    report.undocumentedCount > 0
      ? ` ${report.undocumentedCount} item${report.undocumentedCount === 1 ? '' : 's'} had no purchase price recorded and ${report.undocumentedCount === 1 ? 'is' : 'are'} excluded from the total.`
      : '';
  return (
    'This is a record of the items and purchase prices entered by the collection owner. ' +
    'It is not a professional appraisal and does not state current market value.' +
    missing
  );
}
