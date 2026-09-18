import { CELL_IDS, type CellId } from '../catalog/types';
import { getRecord } from '../catalog/cells';
import {
  CELL_POSE,
  DISASSEMBLY_POSE,
  HERO_POSE,
  isolateCameraPose,
  yawPose,
  type CameraPose,
} from '../scene/interaction/cameraModel';

/**
 * The `?fixture=` route.
 *
 * The metric harness cannot compare animated WebGL pixels across machines, so a fixture freezes
 * everything that would otherwise drift: the camera pose, the clock, the hover/isolate state and
 * the disassembly value. Geometry is already seed-locked by the catalog, and the fourth control —
 * no floating labels — is carried by `showLabels`.
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
 * | `process` | a running process, optionally framed on one organelle |
 *
 * `isolate` and `disassembly` are the two the spec's verification scenarios name, and both are
 * only meaningful because the fixture bypasses the live damping/camera tweens: a screenshot has to
 * be a function of the URL, not of how long the page has been open.
 *
 * The `process` fixture is the M2 addition, and it is the first one whose clock is **optional**: a
 * screenshot needs the clock pinned (`&t=1.6`), while the light-rate measurement needs it running,
 * so `t` decides. Its parameters are:
 *
 * | Parameter | Effect |
 * |---|---|
 * | `id=<processId>` | which process runs (defaults to `nutrition`) |
 * | `focus=<organelleId>` | frames one organelle, which is how the cristae read at all |
 * | `light=<0…100>` | pins the transient light state, so `light=0` is the honesty scenario |
 * | `t=<seconds>` | pins the clock; absent means the animation actually runs |
 *
 * M1d-2 adds three URL controls used by the annotation and readout checks:
 *
 * | Parameter | Effect |
 * |---|---|
 * | `yaw=<degrees>` | rotates the camera pose about Y, so an orbit sweep is a set of URLs |
 * | `annotations=off` | mounts the viewer without the annotation layer, so its draw-call delta is measurable |
 * | `fps=off` | mounts the viewer without the FPS readout, so its effect on the render count is measurable |
 */

export type FixtureName = 'organelle' | 'cell' | 'hover' | 'isolate' | 'disassembly' | 'process';

export const FIXTURE_NAMES: readonly FixtureName[] = [
  'organelle',
  'cell',
  'hover',
  'isolate',
  'disassembly',
  'process',
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
  process: CELL_POSE,
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
  /** Camera azimuth offset in degrees, for the annotation orbit sweep. */
  yaw: number;
  /** False when `?annotations=off`: mount the viewer without the annotation layer. */
  showAnnotations: boolean;
  /** False when `?fps=off`: mount the viewer without the FPS readout. */
  showFps: boolean;
  /** Process the fixture runs, or null. */
  processId: string | null;
  /** Light percent the fixture pins, or null to leave the control where it is. */
  lightPercent: number | null;
  /**
   * Organelle the fixture frames, or null.
   *
   * A process fixture with a focus is the close-up the spec's verification needs: the whole point of
   * "respiration happens on the cristae" is only inspectable when the cristae fill the frame.
   */
  focusOrganelleId: string | null;
}

export interface ParseFixtureOptions {
  /** Fallback organelle id when the URL does not name one. */
  defaultOrganelleId?: string;
}

const COMPOSED_FIXTURES: readonly FixtureName[] = [
  'cell',
  'hover',
  'isolate',
  'disassembly',
  'process',
];

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

/** Degrees of azimuth, clamped to one turn. An unparseable value is treated as no rotation. */
function parseYaw(raw: string | null): number {
  if (raw === null) {
    return 0;
  }

  const parsed = Number.parseFloat(raw);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(180, Math.max(-180, parsed));
}

/** `off` disables; anything else, or absence, leaves the surface on. */
function parseToggle(raw: string | null): boolean {
  return raw !== 'off';
}

/**
 * The light percent a fixture pins, or null when the URL does not name one.
 *
 * Null and zero are different states on purpose: `?light=0` is the zero-light scenario the spec's
 * honesty requirement is about, while an absent parameter means "leave the control where it is".
 */
function parseLight(raw: string | null): number | null {
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
 * Whether a fixture mounts the annotation overlay.
 *
 * Every other composed fixture defaults to on (`?annotations=off` disables it), because its subject
 * is the cell and the labels are part of what it looks like. A **process** fixture is the opposite:
 * its subject is the animation inside one organelle, and the overlay would sit on top of the very
 * thing being inspected — so there it is opt-in (`?annotations=on`).
 */
function parseAnnotations(raw: string | null, name: FixtureName | null): boolean {
  if (name === 'process') {
    return raw === 'on';
  }

  return parseToggle(raw);
}

function cameraFor(
  name: FixtureName | null,
  organelleId: string,
  focusOrganelleId: string | null,
  yaw: number,
): CameraPose {
  if (name === null) {
    return yawPose(HERO_POSE, yaw);
  }

  if (name === 'isolate') {
    return yawPose(isolateCameraPose(positionOf(organelleId), extentOf(organelleId)), yaw);
  }

  if (name === 'process' && focusOrganelleId !== null) {
    return yawPose(
      isolateCameraPose(positionOf(focusOrganelleId), extentOf(focusOrganelleId)),
      yaw,
    );
  }

  return yawPose(FIXTURE_POSES[name], yaw);
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
  //
  // A process fixture uses `id` for the *process* (matches the plan's URL shape) and `focus` for the
  // organelle it frames, so `?fixture=process&id=nutrition&focus=chloroplast` reads the way the task
  // list writes it.
  const focusOrganelleId = name === 'process' ? params.get('focus') ?? params.get('organelle') : null;
  const organelleId =
    focusOrganelleId ??
    params.get('id') ??
    params.get('organelle') ??
    options.defaultOrganelleId ??
    DEFAULT_ORGANELLE_ID;

  const composed = name !== null && COMPOSED_FIXTURES.includes(name);
  const yaw = parseYaw(params.get('yaw'));
  // `tasks.md` writes the cell as `cell=`, `design.md` and the M1 fixtures write it as `view=`.
  const cellParam = params.get('view') ?? params.get('cell');

  return {
    name,
    organelleId,
    frozenTime: parseFrozenTime(params.get('t')),
    // A process fixture runs its clock unless the URL pins a time: the light-rate measurement needs
    // the animation actually advancing, while a screenshot needs it not to.
    freezeClock: name === 'process' ? params.has('t') : name !== null,
    showLabels: name === null,
    camera: cameraFor(name, organelleId, focusOrganelleId, yaw),
    cell: composed ? parseCell(cellParam) : null,
    hoveredId: name === 'hover' ? organelleId : null,
    selectedId: name === 'isolate' ? organelleId : null,
    disassemblyValue: name === 'disassembly' ? parseDisassembly(params.get('value')) ?? 0 : null,
    yaw,
    showAnnotations: parseAnnotations(params.get('annotations'), name),
    showFps: parseToggle(params.get('fps')),
    processId: name === 'process' ? params.get('id') ?? 'nutrition' : null,
    lightPercent: name === 'process' ? parseLight(params.get('light')) : null,
    focusOrganelleId,
  };
}
