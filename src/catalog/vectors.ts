import type { OrganelleRecord } from './types';

/**
 * The disassembly-vector authoring aid (task 3.12, design D13).
 *
 * D13 keeps the ratified **1.5× the record's own bounding radius** as the default travel for a
 * newly authored record, but demotes it from a *viewer constant* to a **formula over data the
 * catalog already owns**: this module computes the suggestion from the built geometry, and the
 * record's explicit `distance` is what renders.
 *
 * Two deliberate properties:
 *
 * 1. **No runtime three.js.** `src/catalog/` must stay out of the shell's entry graph — the size
 *    audit hard-fails if three.js lands there — so this module has **no three.js import at all**
 *    and computes the bounding box in place, from whatever `getAttribute('position')` hands back.
 *    The result is numerically identical to `new Box3().setFromBufferAttribute(position)`:
 *    `boundingRadius` is the same half-diagonal `Box3.getBoundingSphere()` reports, which is what
 *    "the record's own bounding radius" means. A unit test pins it against three's own `Box3` and
 *    a source scan asserts `src/catalog/` never gains a runtime three import.
 * 2. **The suggestion never renders.** `suggestedDistance` is an authoring aid; the viewer reads
 *    `record.disassembly.distance` (see `travelDistanceFor`). The spec is explicit that the vector
 *    is data and that no literal displacement value may live in viewer code, so the multiplier has
 *    exactly one home — `SUGGESTED_TRAVEL_MULTIPLIER` here — and a source scan asserts no other
 *    module declares a travel constant.
 */

/** The ratified default travel, as a multiple of the record's own bounding radius. */
export const SUGGESTED_TRAVEL_MULTIPLIER = 1.5;

/** An axis-aligned extent, the same six numbers `Box3` carries. */
export interface Bounds3 {
  min: [number, number, number];
  max: [number, number, number];
}

/** Position accessors this module needs. `BufferGeometry.getAttribute` satisfies it structurally. */
export interface PositionSource {
  getAttribute(name: string): {
    count: number;
    getX(index: number): number;
    getY(index: number): number;
    getZ(index: number): number;
  } | null | undefined;
}

function positionsOf(geometry: PositionSource): {
  count: number;
  getX(index: number): number;
  getY(index: number): number;
  getZ(index: number): number;
} {
  const position = geometry.getAttribute('position');

  if (!position || typeof position.count !== 'number' || position.count <= 0) {
    throw new Error('bounding radius needs a geometry with a non-empty position attribute');
  }

  return position;
}

/**
 * The bounding box of one geometry, computed in place (the `Box3.setFromBufferAttribute` result).
 *
 * Accepts a list because a record's built geometry is a whole `OrganelleBuild`, not one buffer:
 * the bounding radius that matters for travel is the one that contains every part.
 */
export function boundsOf(geometry: PositionSource): Bounds3 {
  const position = positionsOf(geometry);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const components = ['getX', 'getY', 'getZ'] as const;

  for (let index = 0; index < position.count; index += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = position[components[axis]!].call(position, index);

      if (value < min[axis]!) {
        min[axis] = value;
      }

      if (value > max[axis]!) {
        max[axis] = value;
      }
    }
  }

  return { min, max };
}

/** The union of several geometries' bounds — one record's whole build. */
export function buildBounds(geometries: readonly PositionSource[]): Bounds3 {
  if (geometries.length === 0) {
    throw new Error('buildBounds needs at least one geometry');
  }

  const bounds = geometries.map(boundsOf);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const box of bounds) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, box.min[axis]!);
      max[axis] = Math.max(max[axis]!, box.max[axis]!);
    }
  }

  return { min, max };
}

/**
 * The bounding radius of a record's built geometry: half the box diagonal, exactly the radius
 * `Box3.getBoundingSphere()` derives from the same box.
 */
export function boundingRadius(geometries: readonly PositionSource[]): number {
  const { min, max } = buildBounds(geometries);

  return 0.5 * Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
}

/** The suggested travel for a new record: 1.5× its own bounding radius. An aid, not a rule. */
export function suggestedDistance(geometries: readonly PositionSource[]): number {
  return SUGGESTED_TRAVEL_MULTIPLIER * boundingRadius(geometries);
}

/**
 * The authoring decision: an explicit distance always wins over the suggestion.
 *
 * The catalog's integrity gate owns the *validity* of a declared distance (present, finite, not
 * negative); this only refuses a negative one loudly so a mis-wired caller cannot slip through.
 */
export function resolveDistance(
  geometries: readonly PositionSource[],
  explicitDistance?: number,
): number {
  if (explicitDistance === undefined) {
    return suggestedDistance(geometries);
  }

  if (!Number.isFinite(explicitDistance) || explicitDistance < 0) {
    throw new Error(`disassembly distance must be zero or a positive number, got ${explicitDistance}`);
  }

  return explicitDistance;
}

/**
 * What actually moves the organelle: the record's own declared distance.
 *
 * This is the only function the viewer is meant to consume. The suggestion exists to help an
 * author *fill in* that field; it never overrides it, so the same record yields the same travel in
 * animal view, plant view and comparison mode (spec: Same record, same vector, every view).
 */
export function travelDistanceFor(record: OrganelleRecord): number {
  return record.disassembly.distance;
}
