import type { Fragrance, Settings, SotdEntry } from '@/domain/types';

// ---------------------------------------------------------------------------
// Data export and erasure (brief §5: "wire a data-export + delete-my-data path").
//
// The export is deliberately a plain, complete JSON document rather than a
// summary: the point of a data right is that the user gets EVERYTHING, in a form
// they can read and re-import elsewhere. Building it is a pure function so the
// completeness can actually be tested.
// ---------------------------------------------------------------------------

export const EXPORT_VERSION = 1;

export interface ExportDocument {
  app: 'ScentKeep';
  version: number;
  exportedAt: string;
  counts: { fragrances: number; sotdEntries: number };
  fragrances: Fragrance[];
  sotdEntries: SotdEntry[];
  settings: Settings;
}

export function buildExport(
  data: { fragrances: Fragrance[]; sotd: SotdEntry[]; settings: Settings },
  exportedAt: string,
): ExportDocument {
  return {
    app: 'ScentKeep',
    version: EXPORT_VERSION,
    exportedAt,
    counts: { fragrances: data.fragrances.length, sotdEntries: data.sotd.length },
    fragrances: data.fragrances,
    sotdEntries: data.sotd,
    settings: data.settings,
  };
}

export function serialiseExport(doc: ExportDocument): string {
  return JSON.stringify(doc, null, 2);
}

/** Filename for the share sheet. Date-stamped so repeated exports don't collide. */
export function exportFilename(exportedAt: string): string {
  const date = exportedAt.slice(0, 10);
  return `scentkeep-export-${date}.json`;
}

export interface ImportResult {
  ok: boolean;
  fragrances?: Fragrance[];
  sotd?: SotdEntry[];
  error?: string;
}

/**
 * Parses an export back. Validates shape before returning anything, so a
 * corrupt or hostile file can't overwrite a real collection with garbage.
 */
export function parseExport(raw: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'That file is not a ScentKeep export.' };
  }

  const doc = parsed as Partial<ExportDocument>;
  if (doc.app !== 'ScentKeep') return { ok: false, error: 'That file is not a ScentKeep export.' };
  if (!Array.isArray(doc.fragrances) || !Array.isArray(doc.sotdEntries)) {
    return { ok: false, error: 'That export is missing its collection data.' };
  }
  // Every bottle needs at minimum an id and a name to be usable.
  if (doc.fragrances.some((f) => typeof f?.id !== 'string' || typeof f?.name !== 'string')) {
    return { ok: false, error: 'That export contains bottles in an unreadable format.' };
  }

  return { ok: true, fragrances: doc.fragrances, sotd: doc.sotdEntries };
}
