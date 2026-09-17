import { describe, expect, it } from 'vitest';
import { hashGeometryPositions, hashPart } from './primitives';
import {
  GOLGI_PARAMS,
  buildGolgi,
  cisternaShape,
  cisternaStackOffset,
  cisternaShape as shapeFor,
} from './golgi';

const PER_ORGANELLE_TRIANGLE_BUDGET = 25_000;
const PER_CELL_DRAW_CALL_BUDGET = 150;

function shapeWidth(shape: ReturnType<typeof cisternaShape>): number {
  const points = shape.getPoints(64);
  const xs = points.map((point) => point.x);

  return Math.max(...xs) - Math.min(...xs);
}

function shapeDepth(shape: ReturnType<typeof cisternaShape>): number {
  const points = shape.getPoints(64);
  const ys = points.map((point) => point.y);

  return Math.max(...ys) - Math.min(...ys);
}

describe('cisternaShape — the cis → trans progression', () => {
  it('widens the ribbon from the cis face to the trans face', () => {
    const cis = shapeFor(0, 1, 16, 'golgi/v1');
    const trans = shapeFor(1, 1, 16, 'golgi/v1');

    expect(shapeWidth(trans)).toBeGreaterThan(shapeWidth(cis));
    expect(shapeDepth(trans)).toBeGreaterThan(shapeDepth(cis));
  });

  it('makes every cross-section wavy rather than a cut disc', () => {
    const shape = shapeFor(0.5, 1, 24, 'golgi/v1');
    const points = shape.getPoints(48);
    const ys = points.map((point) => point.y);
    const wobble = Math.max(...ys) - Math.min(...ys);

    // A flat ribbon would have a single-topped distance profile; the wobble shows as variety.
    expect(wobble).toBeGreaterThan(0);
    expect(new Set(ys.map((y) => y.toFixed(4))).size).toBeGreaterThan(8);
  });

  it('is deterministic per progression and seed', () => {
    const a = shapeFor(0.4, 1, 12, 'golgi/v1').getPoints(32);
    const b = shapeFor(0.4, 1, 12, 'golgi/v1').getPoints(32);
    const c = shapeFor(0.4, 1, 12, 'golgi/v2').getPoints(32);

    expect(a.map((point) => point.toArray())).toEqual(b.map((point) => point.toArray()));
    expect(a.map((point) => point.toArray())).not.toEqual(c.map((point) => point.toArray()));
  });
});

describe('cisternaStackOffset', () => {
  it('stacks the cisternae symmetrically from the cis face to the trans face', () => {
    expect(cisternaStackOffset(0, 6, 1)).toBeLessThan(0);
    expect(cisternaStackOffset(5, 6, 1)).toBeGreaterThan(0);
    expect(cisternaStackOffset(0, 6, 1)).toBeCloseTo(-cisternaStackOffset(5, 6, 1), 6);
    expect(cisternaStackOffset(0, 1, 1)).toBe(0);
  });
});

describe('buildGolgi', () => {
  it('exposes the documented parameter defaults', () => {
    expect(GOLGI_PARAMS.seed).toBe('golgi/v1');
    expect(GOLGI_PARAMS.cisternaeCount).toBe(6);

    const build = buildGolgi();

    expect(build.params.cisternaeCount).toBe(6);

    build.dispose();
  });

  it('merges the cisternae and instances the vesicles: two draw calls total', () => {
    const build = buildGolgi();
    const names = build.parts.map((part) => part.name);

    expect(names).toEqual(['cisternae', 'golgi-vesicles']);
    expect(build.parts[0]!.kind).toBe('mesh');
    expect(build.parts[1]!.kind).toBe('instanced');
    expect(build.drawCalls).toBe(2);

    build.dispose();
  });

  it('draws every vesicle in the one instanced call', () => {
    const build = buildGolgi({ vesicleCount: 14 });
    const vesicles = build.parts[1]!;

    if (vesicles.kind !== 'instanced') {
      throw new Error('expected an instanced vesicle part');
    }

    expect(vesicles.instanceCount).toBe(14);
    expect(vesicles.matrices.length).toBe(14 * 16);
    expect(build.parts.filter((part) => part.materialKey === 'vesicle')).toHaveLength(1);

    build.dispose();
  });

  it('buds the vesicles off the trans face', () => {
    const build = buildGolgi({ size: 1, cisternaeCount: 6, vesicleCount: 14 });
    const stack = build.parts[0]!.geometry;
    const vesicles = build.parts[1]!;

    stack.computeBoundingBox();
    const bounds = stack.boundingBox!;
    const transFace = cisternaStackOffset(5, 6, 1);
    const cisFace = cisternaStackOffset(0, 6, 1);

    if (vesicles.kind !== 'instanced') {
      throw new Error('expected an instanced vesicle part');
    }

    const ys = Array.from(
      { length: vesicles.instanceCount },
      (_, index) => vesicles.matrices[index * 16 + 13]!,
    );

    expect(Math.min(...ys)).toBeGreaterThan(cisFace);
    expect(Math.max(...ys)).toBeLessThanOrEqual(bounds.max.y + 1e-6);
    // The cluster sits about the trans half, not about the middle of the stack.
    expect(ys.reduce((total, y) => total + y, 0) / ys.length).toBeGreaterThan((transFace + cisFace) / 2);

    build.dispose();
  });

  it('supports a vesicle-free stack without crashing', () => {
    const build = buildGolgi({ vesicleCount: 0 });

    expect(build.parts).toHaveLength(1);
    expect(build.drawCalls).toBe(1);

    build.dispose();
  });

  it('is deterministic per seed and differs across seeds', () => {
    const first = buildGolgi();
    const second = buildGolgi();
    const other = buildGolgi({ seed: 'golgi/v2' });

    expect(first.parts.map(hashPart)).toEqual(second.parts.map(hashPart));
    expect(hashGeometryPositions(first.parts[0]!.geometry)).not.toBe(
      hashGeometryPositions(other.parts[0]!.geometry),
    );

    first.dispose();
    second.dispose();
    other.dispose();
  });

  it('stays inside the per-organelle triangle and per-cell draw-call budgets', () => {
    const build = buildGolgi();

    expect(build.triangles).toBeLessThanOrEqual(PER_ORGANELLE_TRIANGLE_BUDGET);
    expect(build.drawCalls).toBeLessThanOrEqual(PER_CELL_DRAW_CALL_BUDGET);

    build.dispose();
  });
});
