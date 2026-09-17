import { SphereGeometry, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { hashGeometryPositions } from './primitives';
import { MEMBRANE_PARAMS, MEMBRANE_SEGMENTS_PER_DETAIL, buildMembrane } from './membrane';

const PER_ORGANELLE_TRIANGLE_BUDGET = 25_000;
const PER_CELL_DRAW_CALL_BUDGET = 150;

/** The furthest any vertex sits from the shell's centre. */
function outerRadius(geometry: BufferGeometry): number {
  const position = geometry.getAttribute('position');
  let worst = 0;

  for (let i = 0; i < position.count; i += 1) {
    worst = Math.max(worst, Math.hypot(position.getX(i), position.getY(i), position.getZ(i)));
  }

  return worst;
}

describe('buildMembrane', () => {
  it('exposes the documented parameter defaults', () => {
    expect(MEMBRANE_PARAMS.seed).toBe('membrane/v1');
    expect(MEMBRANE_PARAMS.size).toBe(1);
    expect(MEMBRANE_PARAMS.noiseAmplitude).toBeCloseTo(0.035, 6);

    const build = buildMembrane();

    expect(build.seed).toBe('membrane/v1');
    expect(build.params.noiseAmplitude).toBeCloseTo(0.035, 6);

    build.dispose();
  });

  it('is one closed shell in one draw call', () => {
    const build = buildMembrane();

    expect(build.parts).toHaveLength(1);
    expect(build.parts[0]!.kind).toBe('mesh');
    expect(build.parts[0]!.materialKey).toBe('membrane');
    expect(build.drawCalls).toBe(1);

    build.dispose();
  });

  it('is a shell of the requested radius', () => {
    const build = buildMembrane({ size: 1.5 });

    expect(outerRadius(build.parts[0]!.geometry)).toBeGreaterThan(1.5);
    expect(outerRadius(build.parts[0]!.geometry)).toBeLessThan(1.5 * 1.08);

    build.dispose();
  });

  it('is broken out of a perfect sphere by the seeded noise, at the same vertex count', () => {
    const undecorated = new SphereGeometry(
      1,
      MEMBRANE_SEGMENTS_PER_DETAIL,
      MEMBRANE_SEGMENTS_PER_DETAIL / 2,
    );
    const build = buildMembrane();
    const shell = build.parts[0]!.geometry;

    expect(hashGeometryPositions(shell)).not.toBe(hashGeometryPositions(undecorated));
    expect(shell.getAttribute('position').count).toBe(undecorated.getAttribute('position').count);

    undecorated.dispose();
    build.dispose();
  });

  it('displaces further when the noise amplitude grows', () => {
    const gentle = buildMembrane({ noiseAmplitude: 0.01 });
    const rough = buildMembrane({ noiseAmplitude: 0.12 });

    expect(outerRadius(rough.parts[0]!.geometry)).toBeGreaterThan(
      outerRadius(gentle.parts[0]!.geometry),
    );

    gentle.dispose();
    rough.dispose();
  });

  it('is deterministic per seed and differs across seeds', () => {
    const first = buildMembrane();
    const second = buildMembrane();
    const other = buildMembrane({ seed: 'membrane/v2' });

    expect(hashGeometryPositions(first.parts[0]!.geometry)).toBe(
      hashGeometryPositions(second.parts[0]!.geometry),
    );
    expect(hashGeometryPositions(first.parts[0]!.geometry)).not.toBe(
      hashGeometryPositions(other.parts[0]!.geometry),
    );

    first.dispose();
    second.dispose();
    other.dispose();
  });

  it('stays inside the per-organelle triangle and per-cell draw-call budgets', () => {
    const build = buildMembrane({ detail: 2 });

    expect(build.triangles).toBeLessThanOrEqual(PER_ORGANELLE_TRIANGLE_BUDGET);
    expect(build.drawCalls).toBeLessThanOrEqual(PER_CELL_DRAW_CALL_BUDGET);

    build.dispose();
  });
});
