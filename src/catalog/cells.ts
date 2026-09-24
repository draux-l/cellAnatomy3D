import { CELL_IDS, type CellId, type OrganelleRecord } from './types';

/**
 * The organelle rosters.
 *
 * **The catalog is intentionally empty.** The previous procedural models were removed when the
 * cell models were reset, and a record is *geometry-bearing* data: every record declares a
 * `geometry` source (a builder, or a mesh reference plus its fallback), a disassembly vector and a
 * placement. Shipping records whose geometry no longer exists would be data that renders nothing,
 * so the clean base ships no records at all.
 *
 * The *structure* is what survives: `types.ts` still declares the record model, `params.ts` still
 * resolves a record's per-cell data, and `integrity.ts` still gates a catalog. Adding an organelle
 * is a record here plus a geometry source — no change to any of those modules. The integrity gate's
 * roster rules live in `integrity.ts` and are exercised with injected records until real ones
 * return.
 *
 * Frozen on purpose: the disassembly vector must be identical in animal view, plant view and
 * comparison mode (spec: Same record, same vector, every view), so no layout code path may rewrite
 * a record. Freezing makes that a runtime fact instead of a convention.
 */

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);

    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }

  return value;
}

export { deepFreeze };

/** The catalog. Ordered inner → outer, which is the order the scene composes the cell in. */
export const ORGANELLE_RECORDS: readonly OrganelleRecord[] = deepFreeze<OrganelleRecord[]>([]);

const RECORDS_BY_ID = new Map(ORGANELLE_RECORDS.map((record) => [record.id, record]));

/** The record for an id, or undefined. The viewer resolves geometry through this, not by path. */
export function getRecord(id: string): OrganelleRecord | undefined {
  return RECORDS_BY_ID.get(id);
}

/** The ordered roster for one cell, inner → outer. */
export function rosterFor(cell: CellId): readonly OrganelleRecord[] {
  return ORGANELLE_RECORDS.filter((record) => record.cells.includes(cell));
}

/** Every cell id the catalog knows about, re-exported so consumers need one import. */
export { CELL_IDS };

export type { CellId, OrganelleRecord };
