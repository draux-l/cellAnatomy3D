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
 * Design D3 makes the record the single source of truth for geometry. This module is the *only*
 * place the per-cell merge happens, so `CellGroup` and the tests cannot disagree about what a
 * record builds in a given cell.
 *
 * The merge is deliberately a plain spread:
 *
 * - `paramsForRecord` — `{ ...base, ...perCellParams.geometryParams }`. The base is the record's
 *   own parameters; a cell override wins per key and never replaces the set.
 * - `positionForRecord` — the override when present, else the record's own `position`.
 *
 * **`kind` branches here.** A procedural record resolves its own `geometry.params`. A mesh record
 * draws a model and has no builder parameters at all — and, since the 2026-09 rebuild removed the
 * procedural builders, no fallback either. The fallback branches below therefore resolve to nothing
 * for a record without one, which is every shipped record; they stay because the model still
 * permits a fallback and a future record may declare one.
 *
 * Both return fresh values, so a caller cannot mutate the frozen catalog by accident.
 *
 * **Nothing in `src/catalog/` may import three.js** — this file is data in, data out.
 */

/** The base builder parameters one record owns, before per-cell merging. */
function baseParams(record: OrganelleRecord): GeometryParams {
  if (isMeshGeometry(record.geometry)) {
    return { ...record.geometry.fallback?.params };
  }

  return { ...record.geometry.params };
}

/** The per-cell parameter deviation that applies to whichever geometry path is in play. */
function perCellParams(record: OrganelleRecord, cell: CellId): GeometryParams | undefined {
  if (isMeshGeometry(record.geometry)) {
    return record.geometry.fallback?.perCell?.[cell]?.geometryParams;
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

/**
 * The scene-unit extent of one record: how big the part is, as the viewer needs it.
 *
 * A procedural record reads its own `size` parameter. A mesh record reads the measured
 * `geometry.extent`, because there is no builder parameter to read. The default is the same 0.3 the
 * procedural path falls back to, so a record that forgot to declare an extent frames like a small
 * organelle instead of throwing.
 */
export function extentFor(record: OrganelleRecord): number {
  if (isMeshGeometry(record.geometry)) {
    return record.geometry.extent;
  }

  const size = record.geometry.params.size;

  return typeof size === 'number' && Number.isFinite(size) ? size : 0.3;
}

/**
 * True when a record composes differently in this cell than in its own base data.
 *
 * Either the record's own `perCell` (a placement) or — for a mesh record — its **fallback's**
 * per-cell deviation (a shape parameter, which a mesh record cannot carry on `perCell`).
 */
export function hasPerCellOverride(record: OrganelleRecord, cell: CellId): boolean {
  if (record.perCell?.[cell] !== undefined) {
    return true;
  }

  return isMeshGeometry(record.geometry) && record.geometry.fallback?.perCell?.[cell] !== undefined;
}

/**
 * The record's **own** base parameters, before any per-cell merge.
 *
 * A procedural record owns `geometry.params`; a mesh record owns its fallback's parameters, and an
 * empty object when it declares no fallback. The shell-side fixture framing (`app/fixture.ts`) reads
 * this without a cell, so it must not depend on per-cell resolution.
 */
export function baseGeometryParamsFor(record: OrganelleRecord): GeometryParams {
  return isMeshGeometry(record.geometry)
    ? { ...record.geometry.fallback?.params }
    : record.geometry.params;
}

/**
 * Which builder builds this record when there is no model to draw, or `undefined` when the record
 * declares no fallback — which is every shipped mesh record, because no procedural builder ships.
 */
export function builderIdFor(record: OrganelleRecord): BuilderId | undefined {
  return isMeshGeometry(record.geometry) ? record.geometry.fallback?.builder : record.geometry.builder;
}

/** The deterministic identity of whichever geometry path builds this record, if any. */
export function seedFor(record: OrganelleRecord): string | undefined {
  return isMeshGeometry(record.geometry) ? record.geometry.fallback?.seed : record.geometry.seed;
}
