import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_THRESHOLDS, type MetricsThresholds } from './metrics';

/**
 * Committed baselines: the numbers the harness compares a fresh render against.
 *
 * A deliberate visual change updates this file **and** its screenshot in the same commit, so
 * the regression stays review-visible (design D10).
 */

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const BASELINES_PATH = fileURLToPath(new URL('./baselines.json', import.meta.url));

export interface FixtureBaseline {
  /** Screenshot path, relative to the repository root. */
  screenshot: string;
  coverage: number;
  occupiedAreaPx: number;
  /** Mean colour of the subject region, as hex. */
  regionColor: string;
  measuredAt: string;
  measuredWith: string;
  notes?: string;
}

/**
 * One step of the annotation layout matrix (task 4.19, design D17).
 *
 * The spec's layout invariants are asserted directly against each step's live layout; this record
 * is the **review-visible snapshot** of what those steps produced, so a change in annotation layout
 * shows up as a diff in the same commit that caused it.
 */
export interface AnnotationMatrixStep {
  cell: 'animal' | 'plant';
  yaw: number;
  disassembly: number;
  annotations: number;
  /** The smallest gap measured between two boxes in one column, in CSS px. */
  minGapPx: number | null;
  crossings: number;
  overlaps: number;
  offScreen: number;
  /** Smallest distance from an anchor to its own column's box edge, in CSS px. */
  elbowClearancePx: number;
  measuredAt: string;
}

export interface BaselinesFile {
  version: number;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  thresholds: MetricsThresholds;
  fixtures: Record<string, FixtureBaseline>;
  /** The annotation fixture matrix, re-recorded with `UPDATE_BASELINES=1`. */
  annotationMatrix?: AnnotationMatrixStep[];
}

export function baselineKey(fixture: string, subjectId: string): string {
  return `${fixture}:${subjectId}`;
}

export function loadBaselines(): BaselinesFile {
  const parsed = JSON.parse(readFileSync(BASELINES_PATH, 'utf8')) as BaselinesFile;

  return {
    version: parsed.version,
    viewport: parsed.viewport,
    thresholds: { ...DEFAULT_THRESHOLDS, ...parsed.thresholds },
    fixtures: parsed.fixtures,
    // Carried through, not rebuilt: a load that dropped it would silently delete the matrix on the
    // next write.
    ...(parsed.annotationMatrix ? { annotationMatrix: parsed.annotationMatrix } : {}),
  };
}

export function writeBaselines(file: BaselinesFile): void {
  writeFileSync(BASELINES_PATH, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
}

export function screenshotAbsolutePath(baseline: FixtureBaseline): string {
  return fileURLToPath(new URL(`../${baseline.screenshot}`, import.meta.url));
}

export function writeScreenshot(baseline: FixtureBaseline, buffer: Buffer): void {
  const target = screenshotAbsolutePath(baseline);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buffer);
}
