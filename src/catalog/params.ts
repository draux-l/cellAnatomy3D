import {
  isMeshGeometry,
  type BuilderId,
  type CellId,
  type GeometryParams,
  type OrganelleRecord,
} from './types';

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
 * - `paramsForRecord` — `{ ...base, ...perCellParams.geometryParams }`. The base is the record's
 *   own parameters; a cell override wins per key and never replaces the set.
 * - `positionForRecord` — the override when present, else the record's own `position`.
 *
 * **`kind` branches here (task 11.3).** A procedural record resolves its own `geometry.params`. A
 * mesh record has no builder parameters of its own — it draws a model — but its **fallback** does,
 * so the fallback's parameters (and its per-cell deviations) are what this resolves. That is what
 * keeps a failed load byte-identical to the procedural path. `perCell.*.geometryParams` is rejected
 * on a mesh record by the integrity gate, so a mesh record's per-cell shape deviation can only live
 * on the fallback.
 *
 * Both return fresh values, so a caller cannot mutate the frozen catalog by accident.
 *
 * **Nothing in `src/catalog/` may import three.js** — this file is data in, data out.
 */

/** The base builder parameters one record owns, before per-cell merging. */
function baseParams(record: OrganelleRecord): GeometryParams {
  if (isMeshGeometry(record.geometry)) {
    return { ...record.geometry.fallback.params };
  }

  return { ...record.geometry.params };
}

/** The per-cell parameter deviation that applies to whichever geometry path is in play. */
function perCellParams(record: OrganelleRecord, cell: CellId): GeometryParams | undefined {
  if (isMeshGeometry(record.geometry)) {
    return record.geometry.fallback.perCell?.[cell]?.geometryParams;
  }

  return record.perCell?.[cell]?.geometryParams;
}

/** The builder parameters one record uses in one cell. */
export function paramsForRecord(record: OrganelleRecord, cell: CellId): GeometryParams {
  const base = baseParams(record);
  const overrides = perCellParams(record, cell);

  return overrides ? { ...base, ...overrides } : base;
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

/**
 * The record's **own** base parameters, before any per-cell merge.
 *
 * A procedural record owns `geometry.params`; a mesh record owns its fallback's parameters. The
 * shell-side fixture framing (`app/fixture.ts`) reads this without a cell, so it must not depend on
 * per-cell resolution.
 */
export function baseGeometryParamsFor(record: OrganelleRecord): GeometryParams {
  return isMeshGeometry(record.geometry) ? record.geometry.fallback.params : record.geometry.params;
}

/**
 * Which builder builds this record when there is no model to draw.
 *
 * For a procedural record that is `geometry.builder`; for a mesh record it is the fallback builder
 * (design D27). The viewer and the Node-side process mounts both resolve geometry through this.
 */
export function builderIdFor(record: OrganelleRecord): BuilderId {
  return isMeshGeometry(record.geometry) ? record.geometry.fallback.builder : record.geometry.builder;
}

/** The deterministic identity of whichever geometry path builds this record. */
export function seedFor(record: OrganelleRecord): string {
  return isMeshGeometry(record.geometry) ? record.geometry.fallback.seed : record.geometry.seed;
}
