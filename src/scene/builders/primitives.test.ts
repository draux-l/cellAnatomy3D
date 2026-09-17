import { describe, expect, it } from 'vitest';
import {
  BoxGeometry,
  IcosahedronGeometry,
  Matrix4,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import {
  ORGANELLE_PARAM_DEFAULTS,
  buildInstanceMatrices,
  countPartTriangles,
  createBuild,
  createSeededNoise,
  displaceAlongNormals,
  hashFloats,
  hashGeometryPositions,
  hashPart,
  instancedPart,
  mergeGeometryList,
  meshPart,
  resolveOrganelleParams,
  samplePointsInSphere,
  sampleSurfacePoints,
  writeInstanceMatrix,
} from './primitives';

const SEED = 'mitochondrion/v1';

function sampleSequence(seed: string, count: number): number[] {
  const noise = createSeededNoise(seed);
  return Array.from({ length: count }, (_, i) => noise.noise3D(i * 0.37, i * 0.11, i * 0.73));
}

function displacedSphere(seed: string) {
  const noise = createSeededNoise(seed);
  const geometry = new SphereGeometry(1, 24, 16);
  return displaceAlongNormals(geometry, noise, { amplitude: 0.08, frequency: 1.75 });
}

describe('createSeededNoise', () => {
  it('produces an identical sequence for the same seed', () => {
    expect(sampleSequence(SEED, 64)).toEqual(sampleSequence(SEED, 64));
  });

  it('produces a different sequence for a different seed', () => {
    expect(sampleSequence(SEED, 64)).not.toEqual(sampleSequence('mitochondrion/v2', 64));
  });

  it('keeps simplex noise inside its documented range', () => {
    for (const value of sampleSequence(SEED, 512)) {
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('exposes a seeded uniform random in [0, 1)', () => {
    const sequence = () => {
      const noise = createSeededNoise(SEED);
      return Array.from({ length: 16 }, () => noise.random());
    };

    const a = sequence();
    const b = sequence();

    expect(a).toEqual(b);
    expect(new Set(a).size).toBeGreaterThan(1);

    for (const value of a) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('hashGeometryPositions', () => {
  it('is stable for an unchanged geometry', () => {
    const geometry = new SphereGeometry(1, 8, 6);
    expect(hashGeometryPositions(geometry)).toBe(hashGeometryPositions(geometry.clone()));
    geometry.dispose();
  });

  it('rejects a geometry without position data', () => {
    expect(() => hashGeometryPositions(new IcosahedronGeometry(1, 0).deleteAttribute('position'))).toThrow(
      /position attribute/,
    );
  });
});

describe('displaceAlongNormals', () => {
  it('rebuilds identical geometry from the same seed', () => {
    const first = displacedSphere(SEED);
    const second = displacedSphere(SEED);

    expect(first.getAttribute('position').count).toBe(second.getAttribute('position').count);
    expect(hashGeometryPositions(first)).toBe(hashGeometryPositions(second));

    first.dispose();
    second.dispose();
  });

  it('rebuilds different geometry from a different seed', () => {
    const first = displacedSphere(SEED);
    const second = displacedSphere('mitochondrion/v2');

    expect(first.getAttribute('position').count).toBe(second.getAttribute('position').count);
    expect(hashGeometryPositions(first)).not.toBe(hashGeometryPositions(second));

    first.dispose();
    second.dispose();
  });

  it('actually moves vertices when the amplitude is non-zero', () => {
    const geometry = new SphereGeometry(1, 12, 8);
    const before = hashGeometryPositions(geometry);
    displaceAlongNormals(geometry, createSeededNoise(SEED), { amplitude: 0.1 });

    expect(hashGeometryPositions(geometry)).not.toBe(before);
    geometry.dispose();
  });
});

describe('resolveOrganelleParams', () => {
  it('fills every default and lets overrides win', () => {
    expect(resolveOrganelleParams()).toEqual(ORGANELLE_PARAM_DEFAULTS);

    const resolved = resolveOrganelleParams({ seed: 'nucleus/v3', size: 2.5, cristaeCount: 9 });
    expect(resolved.seed).toBe('nucleus/v3');
    expect(resolved.size).toBe(2.5);
    expect(resolved.cristaeCount).toBe(9);
    expect(resolved.detail).toBe(ORGANELLE_PARAM_DEFAULTS.detail);
  });
});

describe('samplePointsInSphere', () => {
  it('places exactly the requested number of points inside the radius', () => {
    const points = samplePointsInSphere(createSeededNoise(SEED), 220, 0.55);

    expect(points).toHaveLength(220);

    for (const point of points) {
      expect(point.length()).toBeLessThanOrEqual(0.55);
    }
  });

  it('is deterministic per seed and differs across seeds', () => {
    const a = samplePointsInSphere(createSeededNoise(SEED), 40, 1).map((p) => p.toArray());
    const b = samplePointsInSphere(createSeededNoise(SEED), 40, 1).map((p) => p.toArray());
    const c = samplePointsInSphere(createSeededNoise('ribosome/v2'), 40, 1).map((p) =>
      p.toArray(),
    );

    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('uses the volume rather than the surface', () => {
    const points = samplePointsInSphere(createSeededNoise(SEED), 400, 1);
    const inner = points.filter((point) => point.length() < 0.5).length;

    expect(inner).toBeGreaterThan(20);
  });
});

describe('sampleSurfacePoints', () => {
  // A fine torus, so "on the surface" can be asserted tightly: a coarse one is faceted and the
  // samples legitimately sit inside the ideal surface by the chord sag.
  const geometry = new TorusGeometry(0.2, 0.05, 48, 96);

  it('places every sample on the surface, with an outward normal', () => {
    const samples = sampleSurfacePoints(geometry, 32, createSeededNoise(SEED));

    expect(samples).toHaveLength(32);

    for (const sample of samples) {
      // A torus of radius 0.2 and tube 0.05: every surface point sits 0.05 from the ring.
      const ringDistance = Math.hypot(
        Math.hypot(sample.position.x, sample.position.y) - 0.2,
        sample.position.z,
      );

      expect(ringDistance).toBeCloseTo(0.05, 3);
      expect(sample.normal.length()).toBeCloseTo(1, 4);
    }
  });

  it('samples the same points from the same seed', () => {
    const a = sampleSurfacePoints(geometry, 16, createSeededNoise(SEED)).map((s) =>
      s.position.toArray(),
    );
    const b = sampleSurfacePoints(geometry, 16, createSeededNoise(SEED)).map((s) =>
      s.position.toArray(),
    );

    expect(a).toEqual(b);
  });
});

describe('mergeGeometryList', () => {
  it('merges a stack into one buffer with the summed triangle count', () => {
    const boxes = [new BoxGeometry(1, 1, 1), new BoxGeometry(1, 1, 1), new BoxGeometry(1, 1, 1)];
    const merged = mergeGeometryList(boxes);

    expect(merged.getAttribute('position').count).toBe(
      boxes.reduce((total, box) => total + box.getAttribute('position').count, 0),
    );
    expect(merged).not.toBe(boxes[0]);

    merged.dispose();
    for (const box of boxes) {
      box.dispose();
    }
  });

  it('returns the single geometry unchanged rather than copying it', () => {
    const only = new SphereGeometry(1, 8, 6);

    expect(mergeGeometryList([only])).toBe(only);

    only.dispose();
  });

  it('refuses an empty list and an incompatible attribute set', () => {
    expect(() => mergeGeometryList([])).toThrow(/at least one geometry/);
    expect(() =>
      mergeGeometryList([new SphereGeometry(1, 8, 6), new BoxGeometry(1, 1, 1).deleteAttribute('uv')]),
    ).toThrow(/incompatible/);
  });
});

describe('instance parts', () => {
  it('counts triangles per instance, not per geometry', () => {
    const geometry = new IcosahedronGeometry(0.1, 0);
    const plain = meshPart({ name: 'granule', materialKey: 'granule', geometry });
    const repeated = instancedPart({
      name: 'granules',
      materialKey: 'granule',
      geometry,
      instanceCount: 20,
      matrices: new Float32Array(20 * 16),
    });

    expect(countPartTriangles(plain)).toBe(20);
    expect(countPartTriangles(repeated)).toBe(400);
  });

  it('writes a matrix into the buffer in the layout the host reads back', () => {
    const matrix = new Matrix4().makeTranslation(1, 2, 3);
    const matrices = new Float32Array(16);

    writeInstanceMatrix(matrices, 0, matrix);

    const readBack = new Matrix4().fromArray(matrices, 0);

    expect(readBack.elements[12]).toBeCloseTo(1, 6);
    expect(readBack.elements[13]).toBeCloseTo(2, 6);
    expect(readBack.elements[14]).toBeCloseTo(3, 6);
    expect(hashFloats(matrices)).toBe(hashFloats(matrix.toArray()));
  });

  it('gives every instance a distinct transform, deterministically', () => {
    const positions = [new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(-1, 0.5, 0.2)];
    const a = buildInstanceMatrices(createSeededNoise(SEED), positions, { scaleJitter: 0.3 });
    const b = buildInstanceMatrices(createSeededNoise(SEED), positions, { scaleJitter: 0.3 });

    expect(hashFloats(a)).toBe(hashFloats(b));
    expect(a.length).toBe(16 * positions.length);
    expect(a.slice(0, 16)).not.toEqual(a.slice(16, 32));
  });

  it('hashes geometry and instances into one part identity', () => {
    const geometry = new IcosahedronGeometry(0.1, 0);
    const first = instancedPart({
      name: 'granules',
      materialKey: 'granule',
      geometry,
      instanceCount: 2,
      matrices: buildInstanceMatrices(createSeededNoise(SEED), [new Vector3(), new Vector3(1, 0, 0)]),
    });
    const second = instancedPart({
      name: 'granules',
      materialKey: 'granule',
      geometry,
      instanceCount: 2,
      matrices: buildInstanceMatrices(createSeededNoise('ribosome/v2'), [new Vector3(), new Vector3(1, 0, 0)]),
    });

    expect(hashPart(first)).not.toBe(hashPart(second));
  });
});

describe('createBuild', () => {
  it('sums part triangles, counts parts as draw calls, and disposes every geometry', () => {
    const geometry: BufferGeometry = new SphereGeometry(1, 8, 6);
    const build = createBuild([meshPart({ name: 'shell', materialKey: 'membrane', geometry })], { size: 1 }, SEED);

    expect(build.drawCalls).toBe(1);
    expect(build.triangles).toBe(80);
    expect(build.seed).toBe(SEED);

    let disposed = 0;
    geometry.addEventListener('dispose', () => {
      disposed += 1;
    });

    build.dispose();

    expect(disposed).toBe(1);
  });
});
