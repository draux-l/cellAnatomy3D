import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CELL_IDS, ORGANELLE_RECORDS } from '../src/catalog/cells';
import type { CellId } from '../src/catalog/types';
import {
  CELL_SCREENSHOT_VIEWS,
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
 * and that the gate fails loudly when a demanded screenshot is absent. The committed catalog is
 * empty while the cell models are reset, so the enumeration cases run against **synthetic** records.
 */

/** A record-like value: the gate only needs an id and its roster membership. */
interface RosterRecord {
  id: string;
  cells: readonly CellId[];
}

const SYNTHETIC: readonly RosterRecord[] = [
  { id: 'nucleus', cells: ['animal', 'plant'] },
  { id: 'mitochondrion', cells: ['animal', 'plant'] },
  { id: 'chloroplast', cells: ['plant'] },
];

const COMMITTED = screenshotRequirements();
const SYNTHETIC_REQUIREMENTS = screenshotRequirements(SYNTHETIC, CELL_IDS);

describe('per-organelle screenshot coverage — the enumeration', () => {
  it('demands a screenshot for every organelle in every cell it belongs to', () => {
    const demanded = new Set(SYNTHETIC_REQUIREMENTS.map((requirement) => requirement.organelleId));

    // Two shared records (both cells) plus one plant-only record.
    expect(SYNTHETIC_REQUIREMENTS).toHaveLength(2 + 2 + 1);
    expect(demanded.size).toBe(SYNTHETIC.length);

    for (const id of ['nucleus', 'mitochondrion']) {
      const cells = SYNTHETIC_REQUIREMENTS.filter((r) => r.organelleId === id).map((r) => r.cell);

      expect(cells).toEqual(['animal', 'plant']);
    }

    const plantOnly = SYNTHETIC_REQUIREMENTS.filter((r) => r.organelleId === 'chloroplast').map(
      (r) => r.cell,
    );

    expect(plantOnly).toEqual(['plant']);
  });

  it('writes the documented path shape', () => {
    for (const requirement of SYNTHETIC_REQUIREMENTS) {
      expect(requirement.path).toBe(
        `${SCREENSHOT_ROOT}/${CELL_SCREENSHOT_VIEWS[requirement.cell]}/${requirement.organelleId}.png`,
      );
    }
  });

  it('dedupes the paths while keeping the per-cell pairs', () => {
    const paths = screenshotPaths(SYNTHETIC_REQUIREMENTS);

    expect(SYNTHETIC_REQUIREMENTS.length).toBeGreaterThan(paths.length);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toHaveLength(SYNTHETIC.length);
  });

  it('demands nothing for the empty committed catalog', () => {
    expect(ORGANELLE_RECORDS).toEqual([]);
    expect(COMMITTED).toEqual([]);
  });
});

describe('per-organelle screenshot coverage — the gate', () => {
  it('passes for the empty committed catalog', () => {
    expect(findMissingScreenshots()).toEqual([]);
    expect(() => assertScreenshotCoverage()).not.toThrow();
  });

  it('fails naming the organelle and the path when one screenshot is absent', () => {
    const target = SYNTHETIC_REQUIREMENTS.find(
      (requirement) => requirement.organelleId === 'chloroplast',
    )!;
    const exists = (relativePath: string): boolean => relativePath !== target.path;
    const missing = findMissingScreenshots(exists, SYNTHETIC_REQUIREMENTS);

    expect(missing).toEqual([target]);
    expect(() => assertScreenshotCoverage(exists, SYNTHETIC_REQUIREMENTS)).toThrow(
      /Per-organelle screenshot coverage failed/,
    );
    expect(() => assertScreenshotCoverage(exists, SYNTHETIC_REQUIREMENTS)).toThrow(/chloroplast/);
    expect(formatMissingScreenshots(missing)).toContain(target.path);
  });

  it('fails naming every organelle when the whole view is gone', () => {
    const issues = findMissingScreenshots(() => false, [
      SYNTHETIC_REQUIREMENTS[0]!,
      SYNTHETIC_REQUIREMENTS[SYNTHETIC_REQUIREMENTS.length - 1]!,
    ]);

    expect(issues).toHaveLength(2);
    expect(formatMissingScreenshots(issues).split('\n')).toHaveLength(2);
  });

  it('scans the tree it thinks it is scanning', () => {
    // Guards the gate itself: a bad root would make the assertions above pass vacuously.
    expect(CELL_IDS).toEqual(['animal', 'plant']);
    expect(existsSync('artifacts/screens')).toBe(true);
  });
});
