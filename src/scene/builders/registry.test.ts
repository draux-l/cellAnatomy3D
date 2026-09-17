import { describe, expect, it } from 'vitest';
import { BUILDER_IDS, BUILDER_REGISTRY, getBuilder, isBuilderId } from './registry';
import { countTriangles } from './mitochondrion';

const PER_ORGANELLE_TRIANGLE_BUDGET = 25_000;
const PER_CELL_DRAW_CALL_BUDGET = 150;

describe('builder registry', () => {
  it('registers exactly the M0 organelle', () => {
    // Intentionally exact: growing this list is how a milestone adds an organelle, and the
    // change should be visible in review rather than implied by a loose assertion.
    expect(BUILDER_IDS).toEqual(['mitochondrion']);
    expect(Object.keys(BUILDER_REGISTRY).sort()).toEqual([...BUILDER_IDS].sort());
  });

  it('exposes one builder per BuilderId', () => {
    for (const id of BUILDER_IDS) {
      expect(typeof BUILDER_REGISTRY[id]).toBe('function');
    }
  });

  it('builds every registered organelle inside its budgets', () => {
    for (const id of BUILDER_IDS) {
      const build = getBuilder(id)();
      const counted = build.parts.reduce((total, part) => total + countTriangles(part.geometry), 0);

      expect(build.triangles).toBe(counted);
      expect(build.drawCalls).toBe(build.parts.length);
      expect(build.triangles).toBeLessThanOrEqual(PER_ORGANELLE_TRIANGLE_BUDGET);
      expect(build.drawCalls).toBeLessThanOrEqual(PER_CELL_DRAW_CALL_BUDGET);
      expect(build.seed.length).toBeGreaterThan(0);

      build.dispose();
    }
  });

  it('names the registered builders when an id is unknown', () => {
    expect(() => getBuilder('nucleus')).toThrow(/No builder registered for "nucleus"/);
    expect(() => getBuilder('nucleus')).toThrow(/mitochondrion/);
  });

  it('narrows ids with isBuilderId', () => {
    expect(isBuilderId('mitochondrion')).toBe(true);
    expect(isBuilderId('chloroplast')).toBe(false);
    expect(isBuilderId('toString')).toBe(false);
  });
});
