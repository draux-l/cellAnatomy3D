import { describe, expect, it } from 'vitest';
import { countBoundaryEdges, hashGeometryPositions } from './primitives';
import {
  LYSOSOME_NOISE_AMPLITUDE,
  LYSOSOME_PARAMS,
  buildLysosome,
} from './lysosome';

const PER_ORGANELLE_TRIANGLE_BUDGET = 25_000;
const PER_CELL_DRAW_CALL_BUDGET = 150;

describe('buildLysosome', () => {
  it('exposes the documented parameter defaults', () => {
    expect(LYSOSOME_PARAMS.seed).toBe('lysosome/v1');
    expect(LYSOSOME_PARAMS.size).toBe(0.5);

    const build = buildLysosome();

    expect(build.seed).toBe('lysosome/v1');

    build.dispose();
  });

  it('is one small vesicle in one draw call', () => {
    const build = buildLysosome();

    expect(build.parts).toHaveLength(1);
    expect(build.parts[0]!.kind).toBe('mesh');
    expect(build.parts[0]!.materialKey).toBe('lysosome');
    expect(build.drawCalls).toBe(1);

    build.dispose();
  });

  it('reads as a slightly irregular sphere, not a faceted gem', () => {
    const build = buildLysosome({ size: 0.5 });
    const geometry = build.parts[0]!.geometry;
    const position = geometry.getAttribute('position');
    const radii: number[] = [];

    for (let i = 0; i < position.count; i += 1) {
      radii.push(Math.hypot(position.getX(i), position.getY(i), position.getZ(i)));
    }

    const min = Math.min(...radii);
    const max = Math.max(...radii);

    // Displaced, but only slightly: the noise is a texture on a sphere, not a different shape.
    expect(max - min).toBeGreaterThan(0.5 * LYSOSOME_NOISE_AMPLITUDE);
    expect(max / min).toBeLessThan(1 + 3 * LYSOSOME_NOISE_AMPLITUDE);

    build.dispose();
  });

  it('is one closed shell after displacement, not a torn one', () => {
    const build = buildLysosome();
    const { boundary, nonManifold } = countBoundaryEdges(build.parts[0]!.geometry);

    // Duplicated vertices that survive the weld are torn open by the displacement and render as
    // cracks; a closed shell is the measurable version of "no cracks".
    expect(boundary).toBe(0);
    expect(nonManifold).toBe(0);

    build.dispose();
  });

  it('is deterministic per seed and differs across seeds', () => {
    const first = buildLysosome();
    const second = buildLysosome();
    const other = buildLysosome({ seed: 'lysosome/v2' });

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
    const build = buildLysosome();

    expect(build.triangles).toBeLessThanOrEqual(PER_ORGANELLE_TRIANGLE_BUDGET);
    expect(build.drawCalls).toBeLessThanOrEqual(PER_CELL_DRAW_CALL_BUDGET);

    build.dispose();
  });
});
