import { Vector3, type BufferGeometry } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { hashGeometryPositions } from './primitives';
import { buildMembrane } from './membrane';
import {
  CELL_WALL_CORNER_SEGMENTS_PER_DETAIL,
  CELL_WALL_PARAMS,
  buildCellWall,
  cellWallShape,
  roundedPolygonPoints,
} from './cell-wall';

const PER_ORGANELLE_TRIANGLE_BUDGET = 25_000;
/** The showcase scale the fixture renders; the record's cell-scale offset is 1.06. */
const DEFAULT_SIZE = CELL_WALL_PARAMS.size;
const RECORD_SIZE = 1.06;
const RECORD_THICKNESS = 0.09;
const WORST_SCALE = 1 + CELL_WALL_PARAMS.noiseAmplitude;
/** The membrane's own record parameters: `{ size: 1, detail: 1, count: 0, noiseAmplitude: 0.035 }`. */
const MEMBRANE_RECORD = { size: 1, detail: 1, count: 0, noiseAmplitude: 0.035 };

/** Distance from the depth axis for every vertex, in the extrusion plane. */
function radii(geometry: BufferGeometry): number[] {
  const position = geometry.getAttribute('position');
  const vertex = new Vector3();
  const found: number[] = [];

  for (let i = 0; i < position.count; i += 1) {
    vertex.set(position.getX(i), position.getY(i), position.getZ(i));
    found.push(Math.hypot(vertex.x, vertex.y));
  }

  return found;
}

function maxRadius(geometry: BufferGeometry): number {
  return Math.max(...radii(geometry));
}

/** Exact distance from the origin to a segment, so the straight runs are measured, not guessed. */
function segmentDistance(
  [x1, y1]: [number, number],
  [x2, y2]: [number, number],
): number {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const lengthSquared = vx * vx + vy * vy;
  const t =
    lengthSquared > 0
      ? Math.max(0, Math.min(1, -(x1 * vx + y1 * vy) / lengthSquared))
      : 0;

  return Math.hypot(x1 + vx * t, y1 + vy * t);
}

/**
 * The outline's closest approach to the centre.
 *
 * The inradius of a rounded polygon lives on the **flat run**, not on a corner sample, and
 * `Path.getPoints` only returns the sampled corner points — so a naive `min(points)` misses it by
 * a wide margin. This walks the closed loop instead.
 */
function outlineInradius(points: readonly [number, number][]): number {
  let closest = Number.POSITIVE_INFINITY;

  for (let i = 0; i < points.length; i += 1) {
    closest = Math.min(closest, segmentDistance(points[i]!, points[(i + 1) % points.length]!));
  }

  return closest;
}

function outlineCircumradius(points: readonly [number, number][]): number {
  return Math.max(...points.map(([x, y]) => Math.hypot(x, y)));
}

describe('roundedPolygonPoints', () => {
  const INNER = 1;
  const SIDES = 8;

  it('produces one rounded corner per side', () => {
    const segments = 4;
    const points = roundedPolygonPoints(SIDES, INNER, 0.4, segments);

    expect(points).toHaveLength(SIDES * (segments + 1));
  });

  it('reaches the inradius on the flat sides and pulls the corners inside the circumradius', () => {
    const points = roundedPolygonPoints(SIDES, INNER, 0.4, 8);
    const circumradius = INNER / Math.cos(Math.PI / SIDES);

    expect(outlineInradius(points)).toBeCloseTo(INNER, 9);
    // A quadratic corner arc does not pass through the vertex: it is tangent-inside it.
    expect(outlineCircumradius(points)).toBeGreaterThan(INNER);
    expect(outlineCircumradius(points)).toBeLessThan(circumradius);
  });

  it('is angular, and measurably more angular with fewer sides', () => {
    // The outline's min-to-max radius ratio says "polygon, not circle": 1 for a circle, and
    // strictly below 1 — by more — as the side count drops with the rounding held constant.
    const ratio = (sides: number): number => {
      const points = roundedPolygonPoints(sides, 1, 0.4, 8);

      return outlineInradius(points) / outlineCircumradius(points);
    };

    expect(ratio(8)).toBeLessThan(1);
    expect(ratio(4)).toBeLessThan(ratio(8));
    expect(ratio(8)).toBeLessThan(0.96);
    expect(ratio(4)).toBeLessThan(0.85);
  });

  it('degenerates to a sharp polygon when nothing is rounded', () => {
    const points = roundedPolygonPoints(SIDES, INNER, 0, 4);
    const circumradius = INNER / Math.cos(Math.PI / SIDES);

    // With no rounding the outline *is* the sharp polygon: flat sides at the inradius, vertices
    // at the full circumradius.
    expect(outlineInradius(points)).toBeCloseTo(INNER, 9);
    expect(outlineCircumradius(points)).toBeCloseTo(circumradius, 6);
  });
});

describe('cellWallShape', () => {
  it('cuts a hole out of the outer polygon', () => {
    const shape = cellWallShape(1, 1.1, CELL_WALL_PARAMS, 4);
    const sides = CELL_WALL_PARAMS.sideCount;
    const circumradius = (inradius: number): number => inradius / Math.cos(Math.PI / sides);
    const outer = shape.getPoints().map((point): [number, number] => [point.x, point.y]);
    const inner = shape.holes[0]!
      .getPoints()
      .map((point): [number, number] => [point.x, point.y]);

    expect(shape.holes).toHaveLength(1);
    // The outer face's flat sides sit on 1.1; its corners are inside the 1.1 circumradius.
    expect(outlineInradius(outer)).toBeCloseTo(1.1, 6);
    expect(outlineCircumradius(outer)).toBeGreaterThan(1.1);
    expect(outlineCircumradius(outer)).toBeLessThan(circumradius(1.1));
    // The hole is cut at 1, so the band between them is the wall's thickness.
    expect(outlineInradius(inner)).toBeCloseTo(1, 6);
    expect(outlineCircumradius(inner)).toBeGreaterThan(1);
    expect(outlineCircumradius(inner)).toBeLessThan(circumradius(1));
  });
});

describe('buildCellWall', () => {
  it('exposes the documented parameter defaults', () => {
    expect(CELL_WALL_PARAMS.seed).toBe('cell-wall/v1');
    expect(CELL_WALL_PARAMS.sideCount).toBe(8);
    // The showcase default is a framing scale; the catalog's cell-scale offset is separate.
    expect(CELL_WALL_PARAMS.size).toBeLessThan(RECORD_SIZE);

    const build = buildCellWall();

    expect(build.seed).toBe('cell-wall/v1');
    expect(build.drawCalls).toBe(1);

    build.dispose();
  });

  it('is a thick band, not a thin skin', () => {
    const build = buildCellWall();
    const found = radii(build.parts[0]!.geometry);
    const thickness = DEFAULT_SIZE * RECORD_THICKNESS;

    // The inner face sits on the declared offset, the outer face a full thickness beyond it.
    expect(Math.min(...found)).toBeCloseTo(DEFAULT_SIZE, 1);
    expect(Math.max(...found)).toBeGreaterThan(DEFAULT_SIZE + thickness * 0.8);

    build.dispose();
  });

  it('sits visibly outside the real membrane', () => {
    // Measured against the membrane builder at its own record parameters, not against an
    // assumption: every membrane vertex must clear the wall's inner boundary.
    const membrane = buildMembrane(MEMBRANE_RECORD);
    const membraneReach = maxRadius(membrane.parts[0]!.geometry);
    const wall = buildCellWall({ size: RECORD_SIZE, thicknessRatio: RECORD_THICKNESS });

    expect(membraneReach).toBeLessThan(RECORD_SIZE);
    expect(membraneReach - 1).toBeGreaterThan(0);
    expect(RECORD_SIZE - membraneReach).toBeGreaterThan(0);

    wall.dispose();
    membrane.dispose();
  });

  it('centres the band on the depth origin and honours depthRatio', () => {
    const build = buildCellWall({ size: RECORD_SIZE, depthRatio: 2 });
    const geometry = build.parts[0]!.geometry;

    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;

    expect(box.max.z).toBeCloseTo(RECORD_SIZE, 5);
    expect(box.min.z).toBeCloseTo(-RECORD_SIZE, 5);

    build.dispose();
  });

  it('roughens the wall without tearing the ring apart', () => {
    const smooth = buildCellWall({ noiseAmplitude: 0 });
    const rough = buildCellWall();
    const smoothRadii = radii(smooth.parts[0]!.geometry);
    const roughRadii = radii(rough.parts[0]!.geometry);
    const spread = (values: number[]): number => Math.max(...values) - Math.min(...values);
    const sides = CELL_WALL_PARAMS.sideCount;
    // The band's own radial extent: the flat-side offset out to the corner of the outer polygon.
    const innerFace = DEFAULT_SIZE * (1 - CELL_WALL_PARAMS.noiseAmplitude);
    const outerCorner =
      (DEFAULT_SIZE * (1 + RECORD_THICKNESS) * WORST_SCALE) / Math.cos(Math.PI / sides);

    // The texture moves the surface, but never enough to invert the band's radial ordering.
    expect(spread(roughRadii)).toBeGreaterThan(spread(smoothRadii));
    expect(Math.min(...roughRadii)).toBeGreaterThan(innerFace);
    expect(Math.max(...roughRadii)).toBeLessThan(outerCorner + 1e-6);

    smooth.dispose();
    rough.dispose();
  });

  it('scales the wall with size', () => {
    const small = buildCellWall({ size: 0.53 });
    const large = buildCellWall({ size: 1.06 });

    expect(maxRadius(small.parts[0]!.geometry)).toBeCloseTo(maxRadius(large.parts[0]!.geometry) / 2, 4);
    expect(small.parts[0]!.geometry.getAttribute('position').count).toBe(
      large.parts[0]!.geometry.getAttribute('position').count,
    );

    small.dispose();
    large.dispose();
  });

  it('stays inside the triangle budget at every detail supported by the corner samples', () => {
    const build = buildCellWall({
      detail: 2,
      cornerRounding: 1,
      sideCount: 16,
    });

    expect(build.triangles).toBeLessThanOrEqual(PER_ORGANELLE_TRIANGLE_BUDGET);

    build.dispose();
  });

  it('rebuilds identical geometry from the same seed and different geometry from another', () => {
    const first = buildCellWall();
    const second = buildCellWall();
    const other = buildCellWall({ seed: 'cell-wall/v2' });

    expect(first.parts.map((part) => hashGeometryPositions(part.geometry))).toEqual(
      second.parts.map((part) => hashGeometryPositions(part.geometry)),
    );
    expect(first.parts.map((part) => hashGeometryPositions(part.geometry))).not.toEqual(
      other.parts.map((part) => hashGeometryPositions(part.geometry)),
    );

    first.dispose();
    second.dispose();
    other.dispose();
  });

  it('disposes the geometry it created', () => {
    const build = buildCellWall();
    const spy = vi.spyOn(build.parts[0]!.geometry, 'dispose');

    build.dispose();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('keeps the corner sample count tied to detail', () => {
    expect(CELL_WALL_CORNER_SEGMENTS_PER_DETAIL).toBeGreaterThan(1);

    const coarse = buildCellWall({ detail: 1 });
    const fine = buildCellWall({ detail: 2 });

    expect(fine.parts[0]!.geometry.getAttribute('position').count).toBeGreaterThan(
      coarse.parts[0]!.geometry.getAttribute('position').count,
    );

    coarse.dispose();
    fine.dispose();
  });
});
