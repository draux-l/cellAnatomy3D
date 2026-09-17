import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CELL_IDS, ORGANELLE_RECORDS, rosterFor } from '../src/catalog/cells';
import { REGISTERED_BUILDER_IDS } from '../src/scene/builders/registry';
import {
  CELL_SCREENSHOT_VIEWS,
  ORGANELLE_FIXTURE_SUBJECTS,
  SCREENSHOT_ROOT,
  assertScreenshotCoverage,
  findMissingScreenshots,
  formatMissingScreenshots,
  screenshotPaths,
  screenshotRequirements,
} from './screenshot-coverage';

/**
 * The coverage gate's own gate (task 3.11).
 *
 * Two things are asserted and they are different: that the **enumeration** really covers both
 * rosters (a bad path or a short roster would make the real-filesystem assertion pass vacuously),
 * and that the **committed checkout satisfies it**.
 */

const COMMITTED = screenshotRequirements();

describe('per-organelle screenshot coverage — the enumeration', () => {
  it('demands a screenshot for every organelle in both cells', () => {
    const plant = rosterFor('plant').map((record) => record.id);
    const animal = rosterFor('animal').map((record) => record.id);
    const demanded = new Set(COMMITTED.map((requirement) => requirement.organelleId));

    // The plant roster is the whole catalog; the animal roster is the shared subset.
    expect(COMMITTED).toHaveLength(plant.length + animal.length);
    expect(demanded.size).toBe(ORGANELLE_RECORDS.length);

    for (const id of plant) {
      expect(demanded.has(id), `plant roster organelle "${id}" is not demanded`).toBe(true);
    }

    // The plant-only three are demanded, and by the plant roster only.
    for (const id of ['cell-wall', 'chloroplast', 'vacuole']) {
      const cells = COMMITTED.filter((requirement) => requirement.organelleId === id).map(
        (requirement) => requirement.cell,
      );

      expect(cells).toEqual(['plant']);
    }
  });

  it('writes the documented path shape', () => {
    for (const requirement of COMMITTED) {
      expect(requirement.path).toBe(
        `${SCREENSHOT_ROOT}/${CELL_SCREENSHOT_VIEWS[requirement.cell]}/${requirement.organelleId}.png`,
      );
    }
  });

  it('covers every registered builder, so no organelle can ship unrendered', () => {
    const subjects = new Set(ORGANELLE_FIXTURE_SUBJECTS);

    expect([...REGISTERED_BUILDER_IDS].sort()).toEqual([...subjects].sort());
  });

  it('dedupes the paths while keeping the per-cell pairs', () => {
    const paths = screenshotPaths(COMMITTED);

    expect(COMMITTED.length).toBeGreaterThan(paths.length);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toHaveLength(ORGANELLE_RECORDS.length);
  });
});

describe('per-organelle screenshot coverage — the committed checkout', () => {
  it('passes for every catalog organelle', () => {
    expect(findMissingScreenshots()).toEqual([]);
    expect(() => assertScreenshotCoverage()).not.toThrow();
  });

  it('fails naming the organelle and the path when one screenshot is removed', () => {
    const target = COMMITTED.find((requirement) => requirement.organelleId === 'chloroplast')!;
    const exists = (relativePath: string): boolean => relativePath !== target.path;
    const missing = findMissingScreenshots(exists);

    expect(missing).toEqual([target]);
    expect(() => assertScreenshotCoverage(exists)).toThrow(/Per-organelle screenshot coverage failed/);
    expect(() => assertScreenshotCoverage(exists)).toThrow(/chloroplast/);
    expect(formatMissingScreenshots(missing)).toContain(target.path);
  });

  it('fails naming every organelle when the whole view is gone', () => {
    const issues = findMissingScreenshots(() => false, [
      COMMITTED[0]!,
      COMMITTED[COMMITTED.length - 1]!,
    ]);

    expect(issues).toHaveLength(2);
    expect(formatMissingScreenshots(issues).split('\n')).toHaveLength(2);
  });

  it('scans the tree it thinks it is scanning', () => {
    // Guards the gate itself: a bad root would make the real assertion above pass vacuously.
    expect(CELL_IDS).toEqual(['animal', 'plant']);
    expect(ORGANELLE_RECORDS.length).toBeGreaterThan(1);
    expect(existsSync('artifacts/screens')).toBe(true);
  });
});
