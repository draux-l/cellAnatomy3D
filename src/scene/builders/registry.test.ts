import { describe, expect, it } from 'vitest';
import { ORGANELLE_RECORDS } from '../../catalog/cells';
import { baseGeometryParamsFor, builderIdFor, seedFor } from '../../catalog/params';
import { BUILDER_IDS as DECLARED_BUILDER_IDS } from '../../catalog/types';
import {
  BUILDER_REGISTRY,
  REGISTERED_BUILDER_IDS,
  getBuilder,
  isBuilderId,
} from './registry';
import { countPartTriangles, hashPart } from './primitives';

/**
 * The builder registry's own gate (tasks 3.1, 3.2).
 *
 * The registered list is asserted **exactly**, not loosely: growing it is how a milestone adds an
 * organelle, and that change should be visible in review rather than implied. M1b registered the
 * seven shared organelles and M1c / PR 4 registered the plant three, so the registry now covers the
 * whole declared vocabulary and the two lists must agree.
 */

const PER_ORGANELLE_TRIANGLE_BUDGET = 25_000;
const PER_CELL_DRAW_CALL_BUDGET = 150;

/** The full declared vocabulary — M1c is where the registry stopped being partial. */
const EXPECTED_BUILDER_IDS = [
  'cell-wall',
  'chloroplast',
  'cytoplasm',
  'endoplasmic-reticulum',
  'golgi',
  'lysosome',
  'membrane',
  'mitochondrion',
  'nucleus',
  'ribosome',
  'vacuole',
] as const;

describe('builder registry', () => {
  it('registers exactly the builders that have landed', () => {
    expect([...REGISTERED_BUILDER_IDS].sort()).toEqual([...EXPECTED_BUILDER_IDS]);
    expect(Object.keys(BUILDER_REGISTRY).sort()).toEqual([...REGISTERED_BUILDER_IDS].sort());
  });

  it('registers only ids the catalog declares', () => {
    for (const id of REGISTERED_BUILDER_IDS) {
      expect(DECLARED_BUILDER_IDS).toContain(id);
    }
  });

  it('resolves the whole declared vocabulary, with nothing left pending', () => {
    expect([...REGISTERED_BUILDER_IDS].sort()).toEqual([...DECLARED_BUILDER_IDS].sort());
  });

  it('exposes one builder function per registered id', () => {
    for (const id of REGISTERED_BUILDER_IDS) {
      expect(typeof BUILDER_REGISTRY[id]).toBe('function');
    }
  });

  it('builds every registered organelle inside its budgets', () => {
    for (const id of REGISTERED_BUILDER_IDS) {
      const build = getBuilder(id)();
      const counted = build.parts.reduce(
        (total, part) => total + countPartTriangles(part),
        0,
      );

      expect(build.triangles).toBe(counted);
      expect(build.drawCalls).toBe(build.parts.length);
      expect(build.triangles).toBeLessThanOrEqual(PER_ORGANELLE_TRIANGLE_BUDGET);
      expect(build.drawCalls).toBeLessThanOrEqual(PER_CELL_DRAW_CALL_BUDGET);
      expect(build.seed.length).toBeGreaterThan(0);
      expect(new Set(build.parts.map((part) => part.name)).size).toBe(build.parts.length);

      for (const part of build.parts) {
        expect(countPartTriangles(part)).toBeGreaterThan(0);
        expect(part.geometry.getAttribute('position').count).toBeGreaterThan(0);
      }

      build.dispose();
    }
  });

  it('rebuilds every registered organelle identically from its own defaults', () => {
    for (const id of REGISTERED_BUILDER_IDS) {
      const first = getBuilder(id)();
      const second = getBuilder(id)();

      expect(first.parts.map(hashPart)).toEqual(second.parts.map(hashPart));

      first.dispose();
      second.dispose();
    }
  });

  it('honours the catalog params: every built record stays inside its budgets', () => {
    // The record's `geometry.params` are what the real cell will pass, and they are not the
    // builder defaults (records are cell-scaled, defaults are showcase-scaled). This is the test
    // that proves a record's numbers are actually consumed.
    const built = ORGANELLE_RECORDS.filter((record) =>
      REGISTERED_BUILDER_IDS.includes(builderIdFor(record)),
    );

    expect(built.length).toBe(REGISTERED_BUILDER_IDS.length);

    for (const record of built) {
      const build = getBuilder(builderIdFor(record))(baseGeometryParamsFor(record));

      expect(build.seed).toBe(seedFor(record));
      expect(build.triangles).toBeGreaterThan(0);
      expect(build.triangles).toBeLessThanOrEqual(PER_ORGANELLE_TRIANGLE_BUDGET);
      expect(build.drawCalls).toBeLessThanOrEqual(PER_CELL_DRAW_CALL_BUDGET);

      build.dispose();
    }
  });

  it('names the registered builders when an id is unknown', () => {
    expect(() => getBuilder('photosystem')).toThrow(/No builder registered for "photosystem"/);
    expect(() => getBuilder('photosystem')).toThrow(/chloroplast/);
  });

  it('narrows ids with isBuilderId', () => {
    expect(isBuilderId('mitochondrion')).toBe(true);
    expect(isBuilderId('ribosome')).toBe(true);
    expect(isBuilderId('chloroplast')).toBe(true);
    expect(isBuilderId('cell-wall')).toBe(true);
    expect(isBuilderId('photosystem')).toBe(false);
    expect(isBuilderId('toString')).toBe(false);
  });
});
