/**
 * The shared cell silhouette: a rounded regular polygon.
 *
 * A plant cell is not a sphere. Its rigid cellulose wall imposes straight-ish sides with rounded
 * corners, and that outline is the single most important shape difference between the animal and
 * the plant cell. Two builders need the *same* outline — the wall (which generates it) and the
 * membrane (which must sit inside it) — so the generator lives here, in one place, rather than
 * being duplicated with the risk that the two silently drift apart.
 *
 * The module is pure geometry maths: no meshes, no materials, no renderer.
 */

/** Corner arc samples per unit of `detail`, before the floor. */
export const SILHOUETTE_CORNER_SEGMENTS_PER_DETAIL = 6;

/**
 * The outline of a regular `sides`-gon with rounded corners, as a closed point loop.
 *
 * `inradius` is the distance from the centre to a flat side — the number that decides how far the
 * outline's flats sit from the cell's centre. The polygon is generated corner by corner: each
 * vertex is replaced by a quadratic arc through it whose endpoints are pulled `rounding` of the
 * way along the two adjacent sides, so the straight runs between corners stay straight.
 *
 * A quadratic Bézier does not pass through the vertex: it is tangent-inside it. That is why a
 * rounded corner's radius is strictly below the sharp polygon's circumradius, which is exactly
 * what the tests pin.
 */
export function roundedPolygonPoints(
  sides: number,
  inradius: number,
  rounding: number,
  cornerSegments: number,
): [number, number][] {
  const n = Math.max(3, Math.round(sides));
  const circumradius = inradius / Math.cos(Math.PI / n);
  const sideLength = 2 * circumradius * Math.sin(Math.PI / n);
  const cut = (sideLength / 2) * Math.min(1, Math.max(0, rounding));
  const segments = Math.max(1, Math.round(cornerSegments));
  const at = (k: number): [number, number] => {
    const angle = (k / n) * Math.PI * 2;

    return [Math.cos(angle) * circumradius, Math.sin(angle) * circumradius];
  };
  const points: [number, number][] = [];

  for (let k = 0; k < n; k += 1) {
    const vertex = at(k);
    const previous = at(k - 1);
    const next = at(k + 1);
    const toPrevious = Math.hypot(previous[0] - vertex[0], previous[1] - vertex[1]) || 1;
    const toNext = Math.hypot(next[0] - vertex[0], next[1] - vertex[1]) || 1;
    const start: [number, number] = [
      vertex[0] + ((previous[0] - vertex[0]) / toPrevious) * cut,
      vertex[1] + ((previous[1] - vertex[1]) / toPrevious) * cut,
    ];
    const end: [number, number] = [
      vertex[0] + ((next[0] - vertex[0]) / toNext) * cut,
      vertex[1] + ((next[1] - vertex[1]) / toNext) * cut,
    ];

    for (let step = 0; step <= segments; step += 1) {
      const t = step / segments;
      const inverse = 1 - t;

      points.push([
        inverse * inverse * start[0] + 2 * inverse * t * vertex[0] + t * t * end[0],
        inverse * inverse * start[1] + 2 * inverse * t * vertex[1] + t * t * end[1],
      ]);
    }
  }

  return points;
}

/**
 * How far the closed outline extends from the origin at one azimuth.
 *
 * A ray from the origin along `(cos angle, sin angle)` crosses a convex outline exactly once, so
 * the result is the outline's radius in that direction: the flat-side inradius where the ray
 * meets a side's normal, and the larger corner radius where it points at a corner. Scaling a
 * round cross-section by `radius(φ) / inradius` is what turns a sphere into the polygon body
 * without changing its vertex count or its topology.
 *
 * `Infinity` means the ray missed the loop entirely, which can only happen for an outline that
 * does not contain the origin.
 */
export function polygonRadiusAt(
  points: readonly [number, number][],
  angle: number,
): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let nearest = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length; index += 1) {
    const [ax, ay] = points[index]!;
    const [bx, by] = points[(index + 1) % points.length]!;
    const ex = bx - ax;
    const ey = by - ay;
    const determinant = dx * ey - dy * ex;

    if (Math.abs(determinant) < 1e-12) {
      continue;
    }

    const rayDistance = (ax * ey - ex * ay) / determinant;
    const segmentParam = (dy * ax - dx * ay) / determinant;

    if (rayDistance > 0 && segmentParam >= -1e-9 && segmentParam <= 1 + 1e-9) {
      nearest = Math.min(nearest, rayDistance);
    }
  }

  return nearest;
}
