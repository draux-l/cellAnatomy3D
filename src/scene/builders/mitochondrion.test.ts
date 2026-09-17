import type { BufferGeometry } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { countTriangles, hashGeometryPositions } from './primitives';
import {
  CRISTA_AXIAL_WOBBLE_RATIO,
  CRISTA_FREE_MAX,
  CRISTA_LATERAL_WOBBLE_RATIO,
  CRISTA_SURFACE_SAMPLES,
  CRISTA_THICKNESS_RATIO,
  CRISTA_WALL_REACH,
  CRISTA_WIDTH_JITTER,
  CRISTA_WIDTH_RATIO,
  MITOCHONDRION_LENGTH_PER_SIZE,
  MITOCHONDRION_PARAMS,
  MITOCHONDRION_RADIUS_PER_SIZE,
  buildMitochondrion,
  capsuleProfile,
  cristaPath,
  cristaShape,
  cristaWidthScale,
} from './mitochondrion';

const PER_ORGANELLE_TRIANGLE_BUDGET = 25_000;
const PER_CELL_DRAW_CALL_BUDGET = 150;
const SIZE = MITOCHONDRION_LENGTH_PER_SIZE;
const RADIUS = MITOCHONDRION_RADIUS_PER_SIZE;
/** Half-length of the straight body (the caps are half-spheres of `RADIUS`). */
const STRAIGHT_HALF = (SIZE - 2 * RADIUS) / 2;

/** Every vertex of every part must sit inside the capsule implicit surface. */
function expectInsideCapsule(geometry: BufferGeometry) {
  const position = geometry.getAttribute('position');
  const length = MITOCHONDRION_LENGTH_PER_SIZE;
  const radius = MITOCHONDRION_RADIUS_PER_SIZE;
  const straightHalf = (length - 2 * radius) / 2;
  let worst = 0;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const excess = Math.max(Math.abs(y) - straightHalf, 0);
    const distance = Math.sqrt(x * x + z * z + excess * excess);

    worst = Math.max(worst, distance);
  }

  expect(worst).toBeLessThanOrEqual(radius + 1e-5);
}

describe('capsuleProfile', () => {
  it('spans exactly the requested length with both poles on the axis', () => {
    const profile = capsuleProfile(SIZE, RADIUS, 6);
    const ys = profile.map((point) => point.y);

    expect(Math.min(...ys)).toBeCloseTo(-SIZE / 2);
    expect(Math.max(...ys)).toBeCloseTo(SIZE / 2);
    expect(profile[0]?.x).toBeCloseTo(0);
    expect(profile.at(-1)?.x).toBeCloseTo(0);
  });

  it('orders points from the south pole to the north pole', () => {
    const profile = capsuleProfile(SIZE, RADIUS, 6);

    for (let i = 1; i < profile.length; i += 1) {
      expect(profile[i]!.y).toBeGreaterThan(profile[i - 1]!.y);
    }
  });

  it('reaches the full radius on the straight body', () => {
    const profile = capsuleProfile(SIZE, RADIUS, 6);
    const widest = Math.max(...profile.map((point) => point.x));

    expect(widest).toBeCloseTo(RADIUS);
  });

  it('reads as an elongated capsule, not a sphere', () => {
    expect(SIZE / (2 * RADIUS)).toBeGreaterThan(2);
  });
});

describe('cristaPath — the M0 radiator correction (task 3.5)', () => {
  const SEED = MITOCHONDRION_PARAMS.seed;

  it('stays inside the interior radius', () => {
    const path = cristaPath(0, 12, STRAIGHT_HALF, RADIUS, SEED);

    for (const point of path.getSpacedPoints(CRISTA_SURFACE_SAMPLES * 3)) {
      expect(Math.hypot(point.x, point.z)).toBeLessThanOrEqual(RADIUS * CRISTA_WALL_REACH + 1e-6);
    }
  });

  it('starts at the inner membrane and stops short of the far side', () => {
    const path = cristaPath(4, 12, STRAIGHT_HALF, RADIUS, SEED);
    const start = path.getPoint(0);
    const end = path.getPoint(1);

    // Attached to the wall: the fold begins at the wall reach.
    expect(Math.hypot(start.x, start.z)).toBeGreaterThan(RADIUS * 0.8);
    // A fold, not a septum: it ends inside the interior, short of the far side.
    expect(Math.hypot(end.x, end.z)).toBeLessThan(RADIUS * (CRISTA_FREE_MAX + 0.15));
  });

  it('is not coplanar: each fold points its own way about the long axis', () => {
    // The M0 signature was every fold running along the same diameter in the same plane. The
    // correction rotates each fold about the long axis by its own seeded angle, so the fold
    // directions have to cover a wide arc rather than all pointing the same way.
    const angles = Array.from({ length: 12 }, (_, index) => {
      const path = cristaPath(index, 12, STRAIGHT_HALF, RADIUS, SEED);
      const start = path.getPoint(0);
      const end = path.getPoint(1);

      return Math.atan2(end.z - start.z, end.x - start.x);
    });

    const spread = Math.max(...angles) - Math.min(...angles);

    expect(spread).toBeGreaterThan(Math.PI * 0.6);
  });

  it('gives no two folds the same profile', () => {
    const profiles = Array.from({ length: 12 }, (_, index) =>
      cristaPath(index, 12, STRAIGHT_HALF, RADIUS, SEED)
        .getSpacedPoints(CRISTA_SURFACE_SAMPLES)
        .map((point) => point.toArray()),
    );

    for (let a = 0; a < profiles.length; a += 1) {
      for (let b = a + 1; b < profiles.length; b += 1) {
        expect(profiles[a]).not.toEqual(profiles[b]);
      }
    }
  });

  it('spreads the folds along the long axis', () => {
    const first = cristaPath(0, 12, STRAIGHT_HALF, RADIUS, SEED);
    const last = cristaPath(11, 12, STRAIGHT_HALF, RADIUS, SEED);

    expect(last.getPoint(0).y).toBeGreaterThan(first.getPoint(0).y);
  });

  it('is deterministic per seed and differs across seeds', () => {
    const a = cristaPath(3, 12, STRAIGHT_HALF, RADIUS, SEED).getSpacedPoints(8);
    const b = cristaPath(3, 12, STRAIGHT_HALF, RADIUS, SEED).getSpacedPoints(8);
    const c = cristaPath(3, 12, STRAIGHT_HALF, RADIUS, 'mitochondrion/v2').getSpacedPoints(8);

    expect(a.map((point) => point.toArray())).toEqual(b.map((point) => point.toArray()));
    expect(a.map((point) => point.toArray())).not.toEqual(c.map((point) => point.toArray()));
  });

  it('keeps the undulation budget small enough to stay inside the wall', () => {
    // The lateral waver plus the widest fold half-width is what could reach the membrane.
    const worstHalfWidth = (CRISTA_WIDTH_RATIO * (1 + CRISTA_WIDTH_JITTER)) / 2;
    const worstLateral = CRISTA_LATERAL_WOBBLE_RATIO * 1.3;

    expect(Math.hypot(CRISTA_WALL_REACH, worstHalfWidth + worstLateral)).toBeLessThan(1);
    expect(CRISTA_AXIAL_WOBBLE_RATIO).toBeLessThan(0.2);
  });

  it('gives every fold its own width, not one stamped plate repeated', () => {
    const scales = Array.from({ length: 12 }, (_, index) => cristaWidthScale(index, SEED));

    for (const scale of scales) {
      expect(scale).toBeGreaterThan(1 - CRISTA_WIDTH_JITTER);
      expect(scale).toBeLessThan(1 + CRISTA_WIDTH_JITTER);
    }

    expect(new Set(scales.map((scale) => scale.toFixed(4))).size).toBe(scales.length);
  });
});

describe('cristaShape', () => {
  it('builds a closed thin rectangle', () => {
    const shape = cristaShape(RADIUS);
    const points = shape.getPoints(8);
    const width = Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x));
    const thickness =
      Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y));

    expect(width).toBeCloseTo(RADIUS * CRISTA_WIDTH_RATIO, 6);
    expect(thickness).toBeCloseTo(RADIUS * CRISTA_THICKNESS_RATIO, 6);
    // A fold, not a block: the sheet is an order of magnitude thinner than it is wide.
    expect(thickness).toBeLessThan(width * 0.2);
  });
});

describe('countTriangles', () => {
  it('counts indexed and non-indexed geometry', () => {
    const build = buildMitochondrion();
    const shell = build.parts[0]!;

    expect(countTriangles(shell.geometry)).toBeGreaterThan(0);
    expect(build.triangles).toBe(
      build.parts.reduce((total, part) => total + countTriangles(part.geometry), 0),
    );

    build.dispose();
  });
});

describe('buildMitochondrion', () => {
  it('exposes the documented parameter defaults', () => {
    expect(MITOCHONDRION_PARAMS.seed).toBe('mitochondrion/v1');
    expect(MITOCHONDRION_PARAMS.cristaeCount).toBe(12);
    expect(MITOCHONDRION_PARAMS.size).toBe(1);

    const build = buildMitochondrion();
    expect(build.seed).toBe('mitochondrion/v1');
    expect(build.params.cristaeCount).toBe(12);

    build.dispose();
  });

  it('builds one shell plus one part per crista', () => {
    const build = buildMitochondrion({ cristaeCount: 7 });
    const names = build.parts.map((part) => part.name);

    expect(build.parts).toHaveLength(8);
    expect(names[0]).toBe('outer-membrane');
    expect(new Set(names).size).toBe(names.length);
    expect(build.parts.filter((part) => part.materialKey === 'innerMembrane')).toHaveLength(7);
    expect(build.drawCalls).toBe(8);

    build.dispose();
  });

  it('respects a zero-cristae override', () => {
    const build = buildMitochondrion({ cristaeCount: 0 });

    expect(build.parts).toHaveLength(1);
    build.dispose();
  });

  it('stays inside the per-organelle triangle and per-cell draw-call budgets', () => {
    const build = buildMitochondrion();

    expect(build.triangles).toBeLessThanOrEqual(PER_ORGANELLE_TRIANGLE_BUDGET);
    expect(build.drawCalls).toBeLessThanOrEqual(PER_CELL_DRAW_CALL_BUDGET);

    build.dispose();
  });

  it('keeps every crista inside the outer membrane', () => {
    const build = buildMitochondrion();

    for (const part of build.parts) {
      expectInsideCapsule(part.geometry);
    }

    build.dispose();
  });

  it('rebuilds identical geometry from the same seed', () => {
    const first = buildMitochondrion();
    const second = buildMitochondrion();

    expect(first.parts.map((part) => hashGeometryPositions(part.geometry))).toEqual(
      second.parts.map((part) => hashGeometryPositions(part.geometry)),
    );

    first.dispose();
    second.dispose();
  });

  it('rebuilds different geometry from a different seed', () => {
    const first = buildMitochondrion();
    const second = buildMitochondrion({ seed: 'mitochondrion/v2' });

    expect(first.parts.map((part) => hashGeometryPositions(part.geometry))).not.toEqual(
      second.parts.map((part) => hashGeometryPositions(part.geometry)),
    );

    first.dispose();
    second.dispose();
  });

  it('scales the shell with size', () => {
    const small = buildMitochondrion({ size: 1 });
    const large = buildMitochondrion({ size: 2 });
    const smallShell = small.parts[0]!;
    const largeShell = large.parts[0]!;

    largeShell.geometry.computeBoundingBox();
    const bounds = largeShell.geometry.boundingBox!;

    expect(bounds.max.y - bounds.min.y).toBeCloseTo(2 * SIZE, 4);
    expect(smallShell.geometry.getAttribute('position').count).toBe(
      largeShell.geometry.getAttribute('position').count,
    );

    small.dispose();
    large.dispose();
  });

  it('disposes every geometry it created', () => {
    const build = buildMitochondrion({ cristaeCount: 3 });
    const spies = build.parts.map((part) => vi.spyOn(part.geometry, 'dispose'));

    build.dispose();

    for (const spy of spies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });
});
