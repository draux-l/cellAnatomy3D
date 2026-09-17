import type { CellId, OrganelleRecord } from './types';

/**
 * The one resolution rule for a record's per-cell data.
 *
 * Design D3 makes the record the single source of truth for geometry, and the composition slice
 * added `perCell` for the two facts that genuinely differ between the animal and the plant cell
 * (a silhouette parameter and a placement). This module is the *only* place that merge happens,
 * so `CellGroup` and the tests cannot disagree about what a record builds in a given cell.
 *
 * The merge is deliberately a plain spread:
 *
 * - `paramsForRecord` — `{ ...geometry.params, ...perCellParams.geometryParams }`. The base is
 *   the record's own parameters; a cell override wins per key and never replaces the set.
 * - `positionForRecord` — the override when present, else the record's own `position`.
 *
 * Both return fresh values, so a caller cannot mutate the frozen catalog by accident.
 *
 * **Nothing in `src/catalog/` may import three.js** — this file is data in, data out.
 */

/** The builder parameters one record uses in one cell. */
export function paramsForRecord(
  record: OrganelleRecord,
  cell: CellId,
): Record<string, number | string | boolean> {
  const base = record.geometry.params;
  const overrides = record.perCell?.[cell]?.geometryParams;

  return overrides ? { ...base, ...overrides } : { ...base };
}

/** Where one record's root sits in one cell, in scene units. */
export function positionForRecord(
  record: OrganelleRecord,
  cell: CellId,
): [number, number, number] {
  const override = record.perCell?.[cell]?.position;

  return override ? [override[0], override[1], override[2]] : [...record.position];
}

/** True when a record composes differently in this cell than in its own base data. */
export function hasPerCellOverride(record: OrganelleRecord, cell: CellId): boolean {
  return record.perCell?.[cell] !== undefined;
}
