import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CELL_IDS, ORGANELLE_RECORDS, rosterFor } from '../src/catalog/cells';
import type { CellId } from '../src/catalog/types';
import { REPO_ROOT } from './baselines';

/**
 * The per-organelle screenshot coverage gate (task 3.11, spec: Per-Organelle Screenshot Coverage).
 *
 * *"Every organelle in both cells SHALL have a committed, inspected screenshot, and CI SHALL fail
 * when a catalog organelle has none."*
 *
 * The enumeration is deliberately **catalog records × cells**, not a hand-written list, so adding
 * an organelle to `catalog/cells.ts` immediately demands its screenshot. The M1b metric spec used
 * an explicit list and said so; now that every declared builder is registered, the list can be
 * derived and this gate is what keeps it honest.
 *
 * The failure is a plain `Error` naming the record and the exact path, so the build log tells the
 * author what to do — record one with `UPDATE_BASELINES=1 npm run test:e2e`.
 */

export const SCREENSHOT_ROOT = 'artifacts/screens';

/**
 * Which rendered view supplies the committed screenshot for an organelle in each cell.
 *
 * Today the only render surface is the `organelle` fixture, and it is deliberately
 * **view-independent**: a record builds the same seed-locked geometry in every cell, so one
 * inspected PNG per record covers both rosters. Mapping a cell to its view here is what makes the
 * enumeration future-proof — when M1d adds composed cell views, pointing a cell at its own view
 * makes this gate demand those screenshots immediately, with no other change.
 */
export const CELL_SCREENSHOT_VIEWS: Record<CellId, string> = {
  animal: 'organelle',
  plant: 'organelle',
};

export interface ScreenshotRequirement {
  /** The cell whose roster demands this organelle. */
  cell: CellId;
  organelleId: string;
  /** The view directory the screenshot lives in. */
  view: string;
  /** Repository-relative path, as the spec writes it: `artifacts/screens/{view}/{id}.png`. */
  path: string;
}

/** The subject list the organelle fixture renders, derived from the catalog so it cannot drift. */
export const ORGANELLE_FIXTURE_SUBJECTS: readonly string[] = ORGANELLE_RECORDS.map(
  (record) => record.id,
);

/**
 * Every screenshot the catalog demands: one per (cell, organelle) pair.
 *
 * Pairs repeat a path when the cells share a record and the view is the same; `screenshotPaths`
 * dedupes, while the pair list is what proves *both* rosters were enumerated.
 */
export function screenshotRequirements(
  records: readonly { id: string; cells: readonly CellId[] }[] = ORGANELLE_RECORDS,
  cells: readonly CellId[] = CELL_IDS,
): ScreenshotRequirement[] {
  const requirements: ScreenshotRequirement[] = [];

  for (const cell of cells) {
    const roster = records === ORGANELLE_RECORDS ? rosterFor(cell) : records.filter((record) => record.cells.includes(cell));

    for (const record of roster) {
      const view = CELL_SCREENSHOT_VIEWS[cell];

      requirements.push({
        cell,
        organelleId: record.id,
        view,
        path: `${SCREENSHOT_ROOT}/${view}/${record.id}.png`,
      });
    }
  }

  return requirements;
}

/** The distinct screenshot files the catalog demands, in requirement order. */
export function screenshotPaths(
  requirements: readonly ScreenshotRequirement[] = screenshotRequirements(),
): string[] {
  return [...new Set(requirements.map((requirement) => requirement.path))];
}

/** True when the path exists in this checkout. Injected so the gate itself stays unit-testable. */
export function screenshotExists(relativePath: string): boolean {
  return existsSync(join(REPO_ROOT, relativePath));
}

/**
 * The requirements with no committed screenshot.
 *
 * `exists` is injected rather than read directly so a test can remove one file's answer and watch
 * the gate fail without touching the working tree.
 */
export function findMissingScreenshots(
  exists: (relativePath: string) => boolean = screenshotExists,
  requirements: readonly ScreenshotRequirement[] = screenshotRequirements(),
): ScreenshotRequirement[] {
  return requirements.filter((requirement) => !exists(requirement.path));
}

/** One line per missing screenshot: the organelle, its cell, and the path CI looked for. */
export function formatMissingScreenshots(
  missing: readonly ScreenshotRequirement[],
): string {
  return missing
    .map(
      (requirement) =>
        `- ${requirement.organelleId} (${requirement.cell}): ${requirement.path} is missing`,
    )
    .join('\n');
}

/**
 * The gate. Throws naming every missing organelle, so CI cannot go green while a catalog record has
 * no inspected screenshot.
 */
export function assertScreenshotCoverage(
  exists: (relativePath: string) => boolean = screenshotExists,
  requirements: readonly ScreenshotRequirement[] = screenshotRequirements(),
): void {
  const missing = findMissingScreenshots(exists, requirements);

  if (missing.length > 0) {
    throw new Error(
      `Per-organelle screenshot coverage failed: ${missing.length} organelle(s) have no committed ` +
        `screenshot. Record them with UPDATE_BASELINES=1 npm run test:e2e:\n${formatMissingScreenshots(missing)}`,
    );
  }
}
