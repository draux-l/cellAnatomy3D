import { Euler, Matrix4, Vector3, type BufferGeometry } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  CHLOROPLAST_LENGTH_PER_SIZE,
  CHLOROPLAST_PARAMS,
  CHLOROPLAST_PROFILE_WOBBLE,
  CHLOROPLAST_RADIUS_PER_SIZE,
  GRANA_DISC_RADIUS_RATIO,
  GRANA_DISC_TUBE_RATIO,
  GRANA_SCALE_JITTER,
  GRANA_STACK_STAND_UP,
  buildChloroplast,
  chloroplastProfile,
  fitInsideEllipsoid,
  granaDiscGeometry,
  granaDiscThickness,
  granaStackGeometry,
  granaStackHeight,
  granaStackPitch,
  granaStackPlacements,
} from './chloroplast';
import { countTriangles, hashGeometryPositions } from './primitives';

const PER_ORGANELLE_TRIANGLE_BUDGET = 25_000;
const PER_CELL_DRAW_CALL_BUDGET = 150;
const SIZE = 1;
const RADIUS = CHLOROPLAST_RADIUS_PER_SIZE * SIZE;
const HALF_LENGTH = (CHLOROPLAST_LENGTH_PER_SIZE * SIZE) / 2;

const INSTANCE_MATRIX = new Matrix4();

/** True when `point` lies inside the shell's nominal ellipsoid (semi-axes R, half-length, R). */
function insideEllipsoid(point: Vector3, tolerance = 1e-6): boolean {
  const value =
    (point.x / RADIUS) ** 2 + (point.y / HALF_LENGTH) ** 2 + (point.z / RADIUS) ** 2;

  return value <= 1 + tolerance;
}

/** Every corner of the instance's transformed bounding box, so the check is the real extent. */
function instanceCorners(geometry: BufferGeometry): Vector3[] {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const corners: Vector3[] = [];

  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        corners.push(new Vector3(x, y, z).applyMatrix4(INSTANCE_MATRIX));
      }
    }
  }

  return corners;
}

/** The eight corners of a rotated box placed at `position`, in the shell's frame. */
function boxCorners(extents: Vector3, tilt: Euler, position: Vector3): Vector3[] {
  const rotation = new Matrix4().makeRotationFromEuler(tilt);
  const corners: Vector3[] = [];

  for (const x of [-extents.x, extents.x]) {
    for (const y of [-extents.y, extents.y]) {
      for (const z of [-extents.z, extents.z]) {
        corners.push(new Vector3(x, y, z).applyMatrix4(rotation).add(position));
      }
    }
  }

  return corners;
}

describe('chloroplastProfile', () => {
  it('spans the requested length with both poles on the axis', () => {
    const profile = chloroplastProfile(RADIUS, 2 * HALF_LENGTH, 12, 'chloroplast/v1');
    const ys = profile.map((point) => point.y);

    // The seeded waver keeps both poles inside the documented wobble band.
    expect(Math.min(...ys)).toBeGreaterThan(-HALF_LENGTH * (1 + CHLOROPLAST_PROFILE_WOBBLE));
    expect(Math.min(...ys)).toBeLessThan(-HALF_LENGTH * (1 - CHLOROPLAST_PROFILE_WOBBLE));
    expect(Math.max(...ys)).toBeGreaterThan(HALF_LENGTH * (1 - CHLOROPLAST_PROFILE_WOBBLE));
    expect(Math.max(...ys)).toBeLessThan(HALF_LENGTH * (1 + CHLOROPLAST_PROFILE_WOBBLE));
    expect(profile[0]?.x).toBeCloseTo(0);
    expect(profile.at(-1)?.x).toBeCloseTo(0);
  });

  it('reaches the full radius at the equator and never goes negative', () => {
    const profile = chloroplastProfile(RADIUS, 2 * HALF_LENGTH, 24, 'chloroplast/v1');
    const widest = Math.max(...profile.map((point) => point.x));

    expect(widest).toBeGreaterThan(RADIUS * 0.97);
    expect(widest).toBeLessThan(RADIUS * 1.05);
    expect(profile.every((point) => point.x >= 0)).toBe(true);
  });

  it('reads as an oval, not a rod or a ball', () => {
    const ratio = CHLOROPLAST_LENGTH_PER_SIZE / (2 * CHLOROPLAST_RADIUS_PER_SIZE);

    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.6);
  });
});

describe('grana discs and stacks', () => {
  it('flattens the disc along its own axis', () => {
    const discRadius = RADIUS * GRANA_DISC_RADIUS_RATIO;
    const disc = granaDiscGeometry(discRadius, 1);

    disc.computeBoundingBox();
    const box = disc.boundingBox!;
    const across = box.max.x - box.min.x;
    const along = box.max.y - box.min.y;

    // The axis of the disc is Y after the rotation, and it is much thinner than it is wide.
    expect(along).toBeLessThan(across * 0.5);
    expect(across).toBeCloseTo(2 * discRadius * (1 + GRANA_DISC_TUBE_RATIO), 6);
    // `granaDiscThickness` is the nominal tube extent; the tube is a polygon, so the built
    // disc is a little thinner than the formula. The formula stays a true upper bound.
    expect(along).toBeGreaterThan(granaDiscThickness(discRadius) * 0.8);
    expect(along).toBeLessThanOrEqual(granaDiscThickness(discRadius));
    disc.dispose();
  });

  it('adds exactly one disc of triangles per disc in the stack', () => {
    const discRadius = RADIUS * GRANA_DISC_RADIUS_RATIO;
    const one = granaDiscGeometry(discRadius, 1);
    const stack = granaStackGeometry(discRadius, 5, 1);

    expect(countTriangles(stack)).toBe(countTriangles(one) * 5);
    one.dispose();
    stack.dispose();
  });

  it('grows the stack along its axis with the disc count', () => {
    const discRadius = RADIUS * GRANA_DISC_RADIUS_RATIO;
    const one = granaDiscGeometry(discRadius, 1);
    const three = granaStackGeometry(discRadius, 3, 1);
    const six = granaStackGeometry(discRadius, 6, 1);

    one.computeBoundingBox();
    three.computeBoundingBox();
    six.computeBoundingBox();

    const singleExtent = one.boundingBox!.max.y - one.boundingBox!.min.y;
    const pitch = granaStackPitch(discRadius);

    // A stack is discs at a fixed pitch: the measured height is exactly (n − 1)·pitch + one disc.
    expect(three.boundingBox!.max.y - three.boundingBox!.min.y).toBeCloseTo(
      2 * pitch + singleExtent,
      6,
    );
    expect(six.boundingBox!.max.y - six.boundingBox!.min.y).toBeCloseTo(
      5 * pitch + singleExtent,
      6,
    );
    expect(six.boundingBox!.max.y - six.boundingBox!.min.y).toBeGreaterThan(
      three.boundingBox!.max.y - three.boundingBox!.min.y,
    );

    // A granum is a roughly cubic pile: about as tall as it is wide, not a column.
    const outerDiameter = 2 * discRadius * (1 + GRANA_DISC_TUBE_RATIO);
    const granumHeight = granaStackHeight(discRadius, 5);

    expect(granumHeight).toBeGreaterThan(outerDiameter * 0.8);
    expect(granumHeight).toBeLessThan(outerDiameter * 1.2);
    expect(granaDiscThickness(discRadius)).toBeLessThan(discRadius);

    one.dispose();
    three.dispose();
    six.dispose();
  });

  it('scatters the requested number of stacks deterministically', () => {
    const discRadius = RADIUS * GRANA_DISC_RADIUS_RATIO;
    const first = granaStackPlacements(5, RADIUS, HALF_LENGTH, discRadius, 5, 'chloroplast/v1');
    const second = granaStackPlacements(5, RADIUS, HALF_LENGTH, discRadius, 5, 'chloroplast/v1');
    const other = granaStackPlacements(5, RADIUS, HALF_LENGTH, discRadius, 5, 'chloroplast/v2');

    expect(first).toHaveLength(5);
    expect(first.map((placement) => placement.position.toArray())).toEqual(
      second.map((placement) => placement.position.toArray()),
    );
    expect(first.map((placement) => placement.position.toArray())).not.toEqual(
      other.map((placement) => placement.position.toArray()),
    );
    expect(granaStackPlacements(0, RADIUS, HALF_LENGTH, discRadius, 5, 'chloroplast/v1')).toEqual([]);
  });

  it('spreads the piles along the long axis rather than clustering them', () => {
    const discRadius = RADIUS * GRANA_DISC_RADIUS_RATIO;
    const placements = granaStackPlacements(5, RADIUS, HALF_LENGTH, discRadius, 5, 'chloroplast/v1');
    const ys = placements.map((placement) => placement.position.y);

    expect(new Set(ys.map((y) => y.toFixed(4))).size).toBe(ys.length);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(HALF_LENGTH * 0.6);

    // Two staggered rows in depth, so the piles interleave rather than stack in one plane.
    const depths = placements.map((placement) => placement.position.z);

    expect(Math.max(...depths)).toBeGreaterThan(0);
    expect(Math.min(...depths)).toBeLessThan(0);
  });

  it('keeps the piles from merging into one lump', () => {
    // A cluster of interpenetrating stacks renders as a single mass, which defeats the whole
    // point of showing grana. Measured from the built matrices and each pile's own scale, so the
    // check is "these two discs do not share a volume", not "these two centres are far apart".
    const build = buildChloroplast();
    const grana = build.parts[1];

    if (grana?.kind !== 'instanced') {
      throw new Error('expected the grana stacks to be one instanced part');
    }

    grana.geometry.computeBoundingBox();

    const discs = Array.from({ length: grana.instanceCount }, (_, index) => {
      INSTANCE_MATRIX.fromArray(grana.matrices, index * 16);

      const scale = new Vector3().setFromMatrixScale(INSTANCE_MATRIX).x;
      const box = grana.geometry.boundingBox!;
      const radius = Math.max(Math.abs(box.min.x), Math.abs(box.max.x)) * scale;

      return {
        centre: new Vector3().setFromMatrixPosition(INSTANCE_MATRIX),
        radius,
      };
    });

    for (let a = 0; a < discs.length; a += 1) {
      for (let b = a + 1; b < discs.length; b += 1) {
        const distance = discs[a]!.centre.distanceTo(discs[b]!.centre);
        const touch = discs[a]!.radius + discs[b]!.radius;

        // Round organic plates may touch at the rim; they may not share a third of themselves.
        expect(
          distance,
          `grana ${a} and ${b} are ${distance.toFixed(3)} apart, touching at ${touch.toFixed(3)}`,
        ).toBeGreaterThanOrEqual(touch * 0.95);
      }
    }

    build.dispose();
  });

  it('pulls a stack that would leave the shell back inside it', () => {
    const discRadius = RADIUS * GRANA_DISC_RADIUS_RATIO;
    const outerRadius = discRadius * (1 + GRANA_DISC_TUBE_RATIO);
    const halfHeight = granaStackHeight(discRadius, 5) / 2;
    const extents = new Vector3(outerRadius, halfHeight, outerRadius);
    const axes = new Vector3(RADIUS, HALF_LENGTH, RADIUS);
    const tilt = new Euler(0, 0, GRANA_STACK_STAND_UP);

    // A stack parked at the far end of the long axis pokes out of the shell's end.
    const outside = new Vector3(0, HALF_LENGTH, 0);
    const fitted = fitInsideEllipsoid(outside, tilt, 1, extents, axes);

    expect(fitted.y).toBeLessThan(outside.y);

    for (const corner of boxCorners(extents, tilt, fitted)) {
      expect(insideEllipsoid(corner)).toBe(true);
    }

    // A stack already inside is left exactly where it was placed.
    const inside = new Vector3(0, HALF_LENGTH * 0.2, 0);

    expect(fitInsideEllipsoid(inside, tilt, 1, extents, axes).toArray()).toEqual(inside.toArray());
  });
});

describe('buildChloroplast', () => {
  it('exposes the documented parameter defaults', () => {
    expect(CHLOROPLAST_PARAMS.seed).toBe('chloroplast/v1');
    expect(CHLOROPLAST_PARAMS.granaStacks).toBe(5);
    expect(CHLOROPLAST_PARAMS.discsPerStack).toBe(5);

    const build = buildChloroplast();

    expect(build.seed).toBe('chloroplast/v1');
    expect(build.params.granaStacks).toBe(5);

    build.dispose();
  });

  it('builds an oval shell plus one instanced grana part', () => {
    const build = buildChloroplast();
    const [shell, grana] = build.parts;

    expect(build.parts).toHaveLength(2);
    expect(shell?.kind).toBe('mesh');
    expect(shell?.name).toBe('chloroplast-envelope');
    expect(grana?.kind).toBe('instanced');

    if (grana?.kind !== 'instanced') {
      throw new Error('expected the grana stacks to be one instanced part');
    }

    expect(grana.instanceCount).toBe(CHLOROPLAST_PARAMS.granaStacks);
    // The skill's InstancedMesh gate, verified in the draw-call report: every granum in the
    // organelle is one draw call, not one per stack.
    expect(build.drawCalls).toBe(2);
    expect(grana.matrices).toHaveLength(CHLOROPLAST_PARAMS.granaStacks * 16);

    build.dispose();
  });

  it('honours the record parameters it is given', () => {
    const build = buildChloroplast({ granaStacks: 3, discsPerStack: 4, size: 0.42 });
    const grana = build.parts[1];

    expect(build.params.granaStacks).toBe(3);
    expect(build.params.discsPerStack).toBe(4);
    expect(grana?.kind === 'instanced' ? grana.instanceCount : 0).toBe(3);

    build.dispose();
  });

  it('builds no grana part when the stack count is zero', () => {
    const build = buildChloroplast({ granaStacks: 0 });

    expect(build.parts).toHaveLength(1);
    expect(build.drawCalls).toBe(1);

    build.dispose();
  });

  it('scales the shell with size without changing the tessellation', () => {
    const small = buildChloroplast({ size: 1 });
    const large = buildChloroplast({ size: 2 });
    const smallShell = small.parts[0]!;
    const largeShell = large.parts[0]!;

    largeShell.geometry.computeBoundingBox();
    const bounds = largeShell.geometry.boundingBox!;
    const nominal = CHLOROPLAST_LENGTH_PER_SIZE * 2;

    // The profile waver is bounded, so the real length sits inside the documented band.
    expect(bounds.max.y - bounds.min.y).toBeGreaterThan(nominal * (1 - CHLOROPLAST_PROFILE_WOBBLE));
    expect(bounds.max.y - bounds.min.y).toBeLessThan(nominal * (1 + CHLOROPLAST_PROFILE_WOBBLE));
    expect(smallShell.geometry.getAttribute('position').count).toBe(
      largeShell.geometry.getAttribute('position').count,
    );

    small.dispose();
    large.dispose();
  });

  it('keeps every granum upright and edge-on enough to count its discs', () => {
    // The stand-up decision, measured: a stack's axis (its local Y) must stay close to the
    // screen-vertical model X axis. A stack that swings onto the view axis hides its own discs.
    const build = buildChloroplast();
    const grana = build.parts[1];

    if (grana?.kind !== 'instanced') {
      throw new Error('expected the grana stacks to be one instanced part');
    }

    for (let index = 0; index < grana.instanceCount; index += 1) {
      INSTANCE_MATRIX.fromArray(grana.matrices, index * 16);

      const axis = new Vector3(0, 1, 0)
        .transformDirection(INSTANCE_MATRIX)
        .normalize();

      expect(Math.abs(axis.x), `granum ${index} axis ${axis.toArray()}`).toBeGreaterThan(0.8);
    }

    build.dispose();
  });

  it('keeps every granum inside the shell', () => {
    const build = buildChloroplast();
    const grana = build.parts[1];

    if (grana?.kind !== 'instanced') {
      throw new Error('expected the grana stacks to be one instanced part');
    }

    for (let index = 0; index < grana.instanceCount; index += 1) {
      INSTANCE_MATRIX.fromArray(grana.matrices, index * 16);

      const scale = new Vector3().setFromMatrixScale(INSTANCE_MATRIX);

      for (const corner of instanceCorners(grana.geometry)) {
        expect(insideEllipsoid(corner), `granum ${index} corner ${corner.toArray()}`).toBe(true);
      }

      // The jitter is bounded, so the bound used to place the stacks is the real one.
      expect(scale.x).toBeGreaterThanOrEqual(1 - GRANA_SCALE_JITTER);
      expect(scale.x).toBeLessThanOrEqual(1 + GRANA_SCALE_JITTER);
    }

    build.dispose();
  });

  it('stays inside the per-organelle triangle and per-cell draw-call budgets', () => {
    const build = buildChloroplast();

    expect(build.triangles).toBeLessThanOrEqual(PER_ORGANELLE_TRIANGLE_BUDGET);
    expect(build.drawCalls).toBeLessThanOrEqual(PER_CELL_DRAW_CALL_BUDGET);

    build.dispose();
  });

  it('stays inside the catalog record parameters', () => {
    // The record ships `{ size: 0.42, detail: 1, count: 0, granaStacks: 5 }`.
    const build = buildChloroplast({ size: 0.42, detail: 1, count: 0, granaStacks: 5 });

    expect(build.triangles).toBeLessThanOrEqual(PER_ORGANELLE_TRIANGLE_BUDGET);
    expect(build.drawCalls).toBe(2);

    build.dispose();
  });

  it('rebuilds identical geometry from the same seed and different geometry from another', () => {
    const first = buildChloroplast();
    const second = buildChloroplast();
    const other = buildChloroplast({ seed: 'chloroplast/v2' });

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

  it('disposes every geometry it created', () => {
    const build = buildChloroplast({ granaStacks: 3 });
    const spies = build.parts.map((part) => vi.spyOn(part.geometry, 'dispose'));

    build.dispose();

    for (const spy of spies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });
});
