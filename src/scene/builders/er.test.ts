import { describe, expect, it } from 'vitest';
import { countTriangles, hashGeometryPositions } from './primitives';
import {
  ENDOPLASMIC_RETICULUM_PARAMS,
  ER_EXTENT_RATIO,
  buildEndoplasmicReticulum,
  erLayerCurve,
  erLayerOffset,
} from './er';

const PER_ORGANELLE_TRIANGLE_BUDGET = 25_000;
const PER_CELL_DRAW_CALL_BUDGET = 150;

describe('erLayerCurve', () => {
  it('folds back and forth along the run axis', () => {
    const folds = 6;
    const curve = erLayerCurve(0, folds, 1, 'endoplasmic-reticulum/v1');
    const ys = curve.points.map((point) => point.y);
    let reversals = 0;

    for (let i = 2; i < ys.length; i += 1) {
      const previous = Math.sign(ys[i - 1]! - ys[i - 2]!);
      const current = Math.sign(ys[i]! - ys[i - 1]!);

      if (previous !== 0 && current !== 0 && previous !== current) {
        reversals += 1;
      }
    }

    // A serpentine: one reversal per fold boundary, which is what "folded" means here.
    expect(reversals).toBe(folds - 1);
    expect(Math.max(...ys)).toBeGreaterThan(ER_EXTENT_RATIO * 0.9);
    expect(Math.min(...ys)).toBeLessThan(-ER_EXTENT_RATIO * 0.9);
  });

  it('steps each successive fold aside, so the layer really is a folded sheet', () => {
    const curve = erLayerCurve(0, 6, 1, 'endoplasmic-reticulum/v1');
    // Every fold boundary advances the step axis: the layer is not six runs in one place.
    expect(curve.points[0]!.x).not.toBeCloseTo(curve.points[7]!.x, 3);
  });

  it('stacks the layers apart from one another along the stack axis', () => {
    expect(erLayerOffset(3, 6, 1)).toBeGreaterThan(erLayerOffset(0, 6, 1));
    expect(erLayerOffset(0, 6, 1)).toBeCloseTo(-erLayerOffset(5, 6, 1), 6);
    expect(erLayerOffset(0, 1, 1)).toBe(0);

    const low = erLayerCurve(0, 6, 1, 'endoplasmic-reticulum/v1');
    const high = erLayerCurve(3, 6, 1, 'endoplasmic-reticulum/v1');

    // Each layer's centreline stays in its own slab: flattening happens per layer, not per stack.
    expect(low.points.every((point) => point.z === 0)).toBe(true);
    expect(high.points.every((point) => point.z === 0)).toBe(true);
  });

  it('is deterministic per seed and layer', () => {
    const a = erLayerCurve(2, 6, 1, 'endoplasmic-reticulum/v1').getSpacedPoints(12);
    const b = erLayerCurve(2, 6, 1, 'endoplasmic-reticulum/v1').getSpacedPoints(12);
    const c = erLayerCurve(2, 6, 1, 'endoplasmic-reticulum/v2').getSpacedPoints(12);

    expect(a.map((point) => point.toArray())).toEqual(b.map((point) => point.toArray()));
    expect(a.map((point) => point.toArray())).not.toEqual(c.map((point) => point.toArray()));
  });
});

describe('buildEndoplasmicReticulum', () => {
  it('exposes the documented parameter defaults', () => {
    expect(ENDOPLASMIC_RETICULUM_PARAMS.seed).toBe('endoplasmic-reticulum/v1');
    expect(ENDOPLASMIC_RETICULUM_PARAMS.count).toBe(6);
    expect(ENDOPLASMIC_RETICULUM_PARAMS.branchCount).toBe(6);

    buildEndoplasmicReticulum().dispose();
  });

  it('merges the whole network into one draw call', () => {
    const build = buildEndoplasmicReticulum();
    const parts = build.parts;

    expect(parts).toHaveLength(1);
    expect(parts[0]!.name).toBe('er-network');
    expect(parts[0]!.materialKey).toBe('er');
    expect(build.drawCalls).toBe(1);

    build.dispose();
  });

  it('carries every layer in that one merged geometry', () => {
    const one = buildEndoplasmicReticulum({ count: 1, branchCount: 6, detail: 1 });
    const four = buildEndoplasmicReticulum({ count: 4, branchCount: 6, detail: 1 });

    expect(countTriangles(four.parts[0]!.geometry)).toBeCloseTo(
      4 * countTriangles(one.parts[0]!.geometry),
      6,
    );
    expect(four.drawCalls).toBe(one.drawCalls);

    one.dispose();
    four.dispose();
  });

  it('reads as a slab of stacked folded sheets, not a sparse web or a bundle of rods', () => {
    const one = buildEndoplasmicReticulum({ size: 0.75, count: 1 });
    const six = buildEndoplasmicReticulum({ size: 0.75, count: 6 });
    const depth = (build: ReturnType<typeof buildEndoplasmicReticulum>) => {
      const geometry = build.parts[0]!.geometry;

      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox!;

      return bounds.max.z - bounds.min.z;
    };

    // The stack grows along the stack axis: the layers are stacked, not coincident.
    expect(depth(six)).toBeGreaterThan(depth(one) * 3);
    expect(six.drawCalls).toBe(1);

    one.dispose();
    six.dispose();
  });

  it('is deterministic per seed and differs across seeds', () => {
    const first = buildEndoplasmicReticulum();
    const second = buildEndoplasmicReticulum();
    const other = buildEndoplasmicReticulum({ seed: 'endoplasmic-reticulum/v2' });

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
    const build = buildEndoplasmicReticulum();

    expect(build.triangles).toBeLessThanOrEqual(PER_ORGANELLE_TRIANGLE_BUDGET);
    expect(build.drawCalls).toBeLessThanOrEqual(PER_CELL_DRAW_CALL_BUDGET);

    build.dispose();
  });
});
