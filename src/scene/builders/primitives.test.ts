import { describe, expect, it } from 'vitest';
import { IcosahedronGeometry, SphereGeometry } from 'three';
import {
  ORGANELLE_PARAM_DEFAULTS,
  createSeededNoise,
  displaceAlongNormals,
  hashGeometryPositions,
  resolveOrganelleParams,
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
