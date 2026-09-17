import { CELL_IDS, type CellId } from '../catalog/types';
import { getRecord } from '../catalog/cells';
import {
  CELL_POSE,
  DISASSEMBLY_POSE,
  HERO_POSE,
  isolateCameraPose,
  type CameraPose,
} from '../scene/interaction/cameraModel';

/**
 * The `?fixture=` route.
 *
 * The metric harness cannot compare animated WebGL pixels across machines, so a fixture freezes
 * everything that would otherwise drift: the camera pose, the clock, the hover/isolate state and
 * the disassembly value. Geometry is already seed-locked by the catalog, and the fourth control —
 * no floating labels — is carried by `showLabels`, which the annotation layer reads.
 *
 * M1d added three composed-cell fixtures on top of the M0 organelle one:
 *
 * | Fixture | What it pins |
 * |---|---|
 * | `organelle` | one builder's defaults, in the hero pose (unchanged since M0) |
 * | `cell` | one composed cell, idle |
 * | `hover` | the composed cell with `hoveredId` set directly |
 * | `isolate` | the composed cell with one organelle isolated and the camera framed on it |
 * | `disassembly` | the composed cell with target **and** damped value frozen at N |
 *
 * `isolate` and `disassembly` are the two the spec's verification scenarios name, and both are
 * only meaningful because the fixture bypasses the live damping/camera tweens: a screenshot has to
 * be a function of the URL, not of how long the page has been open.
 */

export type FixtureName = 'organelle' | 'cell' | 'hover' | 'isolate' | 'disassembly';

export const FIXTURE_NAMES: readonly FixtureName[] = [
  'organelle',
  'cell',
  'hover',
  'isolate',
  'disassembly',
];

/** The composer's default camera pose, re-exported so consumers need one import. */
export { CELL_POSE, DISASSEMBLY_POSE, HERO_POSE, type CameraPose };

/** Named poses. `isolate` is overridden per organelle from the catalog. */
export const FIXTURE_POSES = {
  organelle: HERO_POSE,
  cell: CELL_POSE,
  hover: CELL_POSE,
  isolate: CELL_POSE,
  disassembly: DISASSEMBLY_POSE,
} satisfies Record<FixtureName, CameraPose>;

/** The only organelle the M0 fixture could render. Kept as the fallback for every fixture. */
export const DEFAULT_ORGANELLE_ID = 'mitochondrion';

/** The four disassembly steps the spec's fixtures use. Any integer step is accepted. */
export const DISASSEMBLY_FIXTURE_STEPS = [0, 25, 57, 100] as const;

export interface FixtureConfig {
  /** Active fixture, or null when the real app should run. */
  name: FixtureName | null;
  organelleId: string;
  /** Seconds the clock is pinned at. Always 0 for the static fixtures. */
  frozenTime: number;
  freezeClock: boolean;
  /** False under a fixture so nothing floats between two runs. */
  showLabels: boolean;
  camera: CameraPose;
  /** Which cell a composed fixture renders, or null under the organelle fixture. */
  cell: CellId | null;
  /** Organelle the fixture highlights, or null. */
  hoveredId: string | null;
  /** Organelle the fixture isolates, or null. */
  selectedId: string | null;
  /** Disassembly percentage the fixture pins (target *and* damped value), or null. */
  disassemblyValue: number | null;
}

export interface ParseFixtureOptions {
  /** Fallback organelle id when the URL does not name one. */
  defaultOrganelleId?: string;
}

const COMPOSED_FIXTURES: readonly FixtureName[] = ['cell', 'hover', 'isolate', 'disassembly'];

function isFixtureName(value: string | null): value is FixtureName {
  return value !== null && (FIXTURE_NAMES as readonly string[]).includes(value);
}

function parseFrozenTime(raw: string | null): number {
  if (raw === null) {
    return 0;
  }

  const parsed = Number.parseFloat(raw);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseCell(raw: string | null): CellId {
  return (CELL_IDS as readonly string[]).includes(raw ?? '') ? (raw as CellId) : 'animal';
}

/** The disassembly step a fixture pins: an integer in [0, 100], or null when absent. */
function parseDisassembly(raw: string | null): number | null {
  if (raw === null) {
    return null;
  }

  const parsed = Number.parseFloat(raw);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(100, Math.max(0, Math.round(parsed)));
}

/**
 * The catalog carries the scene-unit extent of every record, so the isolated fixture can frame an
 * organelle without building any geometry — which matters, because this module runs in the shell.
 */
function extentOf(organelleId: string): number {
  const size = getRecord(organelleId)?.geometry.params.size;

  return typeof size === 'number' && Number.isFinite(size) ? size : 0.3;
}

function positionOf(organelleId: string): [number, number, number] {
  const position = getRecord(organelleId)?.position;

  return position ? [...position] : [0, 0, 0];
}

function cameraFor(
  name: FixtureName | null,
  organelleId: string,
): CameraPose {
  if (name === null) {
    return HERO_POSE;
  }

  if (name === 'isolate') {
    return isolateCameraPose(positionOf(organelleId), extentOf(organelleId));
  }

  return FIXTURE_POSES[name];
}

/**
 * Reads a query string into a fixture config. An unknown `fixture` value is ignored, so a typo
 * renders the real app instead of a half-frozen one.
 */
export function parseFixture(search: string, options: ParseFixtureOptions = {}): FixtureConfig {
  const params = new URLSearchParams(search);
  const rawName = params.get('fixture');
  const name = isFixtureName(rawName) ? rawName : null;

  // tasks.md writes `?fixture=organelle&id=…`; design.md writes `&organelle=…`.
  // Accept both so neither artifact's example is wrong.
  const organelleId =
    params.get('id') ?? params.get('organelle') ?? options.defaultOrganelleId ?? DEFAULT_ORGANELLE_ID;

  const composed = name !== null && COMPOSED_FIXTURES.includes(name);

  return {
    name,
    organelleId,
    frozenTime: parseFrozenTime(params.get('t')),
    freezeClock: name !== null,
    showLabels: name === null,
    camera: cameraFor(name, organelleId),
    cell: composed ? parseCell(params.get('view')) : null,
    hoveredId: name === 'hover' ? organelleId : null,
    selectedId: name === 'isolate' ? organelleId : null,
    disassemblyValue: name === 'disassembly' ? parseDisassembly(params.get('value')) ?? 0 : null,
  };
}
