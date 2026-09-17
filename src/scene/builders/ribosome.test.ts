import { describe, expect, it } from 'vitest';
import { hashPart } from './primitives';
import { RIBOSOME_PARAMS, buildRibosome } from './ribosome';

const PER_ORGANELLE_TRIANGLE_BUDGET = 25_000;
const PER_CELL_DRAW_CALL_BUDGET = 150;

describe('buildRibosome', () => {
  it('exposes the documented parameter defaults', () => {
    expect(RIBOSOME_PARAMS.seed).toBe('ribosome/v1');
    expect(RIBOSOME_PARAMS.count).toBe(220);
    expect(RIBOSOME_PARAMS.size).toBeCloseTo(0.03, 6);

    const build = buildRibosome();

    expect(build.params.count).toBe(220);

    build.dispose();
  });

  it('draws every granule in exactly one instanced draw call', () => {
    const build = buildRibosome();

    expect(build.parts).toHaveLength(1);
    expect(build.drawCalls).toBe(1);

    const granule = build.parts[0]!;

    expect(granule.kind).toBe('instanced');
    expect(granule.materialKey).toBe('granule');

    if (granule.kind === 'instanced') {
      expect(granule.instanceCount).toBe(220);
      expect(granule.matrices.length).toBe(220 * 16);
    }

    build.dispose();
  });

  it('counts triangles per instance, not per geometry', () => {
    const build = buildRibosome({ count: 100, detail: 0 });

    // IcosahedronGeometry detail 0 = 20 triangles; 100 granules = 2000, not 20.
    expect(build.triangles).toBe(2000);
    expect(build.triangles).toBeLessThanOrEqual(PER_ORGANELLE_TRIANGLE_BUDGET);

    build.dispose();
  });

  it('scatters every granule inside the cytosol ball it was given', () => {
    const spread = 0.55;
    const build = buildRibosome({ count: 220, spread });
    const part = build.parts[0]!;

    if (part.kind !== 'instanced') {
      throw new Error('expected an instanced granule part');
    }

    for (let index = 0; index < part.instanceCount; index += 1) {
      const offset = index * 16;
      const distance = Math.hypot(
        part.matrices[offset + 12]!,
        part.matrices[offset + 13]!,
        part.matrices[offset + 14]!,
      );

      expect(distance).toBeLessThanOrEqual(spread);
    }

    build.dispose();
  });

  it('spreads the cloud rather than stacking it at the origin', () => {
    const build = buildRibosome({ count: 220, spread: 0.55 });
    const part = build.parts[0]!;

    if (part.kind !== 'instanced') {
      throw new Error('expected an instanced granule part');
    }

    const distances = Array.from({ length: part.instanceCount }, (_, index) =>
      Math.hypot(
        part.matrices[index * 16 + 12]!,
        part.matrices[index * 16 + 13]!,
        part.matrices[index * 16 + 14]!,
      ),
    );

    expect(Math.max(...distances)).toBeGreaterThan(0.45);

    build.dispose();
  });

  it('rebuilds identical positions and transforms from one seed', () => {
    const first = buildRibosome();
    const second = buildRibosome();

    expect(first.parts.map(hashPart)).toEqual(second.parts.map(hashPart));

    first.dispose();
    second.dispose();
  });

  it('rebuilds a different cloud from a different seed', () => {
    const first = buildRibosome();
    const second = buildRibosome({ seed: 'ribosome/v2' });

    expect(first.parts.map(hashPart)).not.toEqual(second.parts.map(hashPart));

    first.dispose();
    second.dispose();
  });

  it('supports an empty cloud without crashing', () => {
    const build = buildRibosome({ count: 0 });
    const part = build.parts[0]!;

    expect(part.kind).toBe('instanced');

    if (part.kind === 'instanced') {
      expect(part.instanceCount).toBe(0);
      expect(part.matrices.length).toBe(0);
    }

    expect(build.triangles).toBe(0);
    expect(build.drawCalls).toBeLessThanOrEqual(PER_CELL_DRAW_CALL_BUDGET);

    build.dispose();
  });
});
