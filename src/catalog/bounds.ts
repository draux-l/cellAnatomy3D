/**
 * Geometry measurement for the parts that need a box but cannot import three.js.
 *
 * ## Why this module exists at all
 *
 * `src/catalog/` and the shell must stay **three-free** — the size audit hard-fails if three.js lands
 * in the entry graph — but two consumers genuinely need an axis-aligned box:
 *
 * - the **anchor registry** (`scene/anchors.ts`) needs the top-centre of a part to attach a leader
 *   line to, and
 * - the tests that measure what the model file actually contains.
 *
 * So the box is computed in place from whatever `getAttribute('position')` hands back. The result is
 * numerically identical to `new Box3().setFromBufferAttribute(position)`, and `bounds.test.ts` pins it
 * against three's own `Box3`.
 *
 * ## What this module used to be, and why it is not that any more
 *
 * It was `vectors.ts`, and it carried the exploded view's *authoring aid*: a `suggestedDistance`
 * (1.5× a part's bounding radius) plus a `resolveDistance`/`travelDistanceFor` pair, so a record's
 * travel could be suggested from its geometry and then authored as a literal.
 *
 * All of that is gone, and deliberately. Where a part travels is now the **layout's** decision
 * (`catalog/separation.ts`), not a number authored per record: the product has two views of the same
 * control, and both derive their slots from `position` and `geometry.extent`. A per-record
 * displacement would have had to be kept in sync across both views by hand. `bounds.test.ts` still
 * scans for a stray displacement constant outside that one home.
 */

/** An axis-aligned extent, the same six numbers `Box3` carries. */
export interface Bounds3 {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * Position accessors this module needs.
 *
 * Declared here rather than in `types.ts` because it describes a three.js-shaped **input** —
 * `BufferGeometry.getAttribute` satisfies it structurally — and this is the one place `src/catalog/`
 * talks to geometry without importing three.
 */
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
    throw new Error('a bounding box needs a geometry with a non-empty position attribute');
  }

  return position;
}

/**
 * The bounding box of one geometry, computed in place (the `Box3.setFromBufferAttribute` result).
 *
 * Accepts one geometry at a time; a record whose build is a group is measured with `buildBounds`.
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
