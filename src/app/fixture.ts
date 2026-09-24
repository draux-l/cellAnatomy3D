import { CELL_IDS, type CellId } from '../catalog/types';
import {
  CELL_POSE,
  HERO_POSE,
  yawPose,
  type CameraPose,
} from '../scene/interaction/cameraModel';

/**
 * The `?fixture=` route.
 *
 * The metric harness cannot compare animated WebGL pixels across machines, so a fixture freezes
 * everything that would otherwise drift: the camera pose, the disassembly value and the two
 * measurement surfaces. Geometry is seed-locked by the catalog, and the third control — no floating
 * labels — is carried by `showAnnotations`.
 *
 * | Fixture | What it pins |
 * |---|---|
 * | `cell` | one composed cell, idle, at a named camera pose |
 *
 * M1d's `organelle`, `hover`, `isolate`, `disassembly` and `process` fixtures were removed with the
 * features they pinned: the isolated-organelle stage and the processes no longer exist, and the
 * hover/isolate/disassembly fixtures had no catalog roster to point at. The `cell` fixture keeps the
 * URL controls the surviving checks use:
 *
 * | Parameter | Effect |
 * |---|---|
 * | `view=<animal\|plant>` | which cell to render (also accepted as `cell=`) |
 * | `value=<0…100>` | pins the disassembly target **and** damped value |
 * | `yaw=<degrees>` | rotates the camera pose about Y, so an orbit sweep is a set of URLs |
 * | `annotations=off` | mounts the viewer without the annotation layer |
 * | `fps=off` | mounts the viewer without the FPS readout |
 */

export type FixtureName = 'cell';

export const FIXTURE_NAMES: readonly FixtureName[] = ['cell'];

/** The composer's default camera pose, re-exported so consumers need one import. */
export { CELL_POSE, HERO_POSE, type CameraPose };

/** Named poses. */
export const FIXTURE_POSES = {
  cell: CELL_POSE,
} satisfies Record<FixtureName, CameraPose>;

export interface FixtureConfig {
  /** Active fixture, or null when the real app should run. */
  name: FixtureName | null;
  camera: CameraPose;
  /** Which cell a composed fixture renders, or null under no fixture. */
  cell: CellId | null;
  /** Disassembly percentage the fixture pins (target *and* damped value), or null. */
  disassemblyValue: number | null;
  /** Camera azimuth offset in degrees, for the annotation orbit sweep. */
  yaw: number;
  /** False when `?annotations=off`: mount the viewer without the annotation layer. */
  showAnnotations: boolean;
  /** False when `?fps=off`: mount the viewer without the FPS readout. */
  showFps: boolean;
}

function isFixtureName(value: string | null): value is FixtureName {
  return value !== null && (FIXTURE_NAMES as readonly string[]).includes(value);
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
 * Reads a query string into a fixture config. An unknown `fixture` value is ignored, so a typo
 * renders the real app instead of a half-frozen one.
 */
export function parseFixture(search: string): FixtureConfig {
  const params = new URLSearchParams(search);
  const rawName = params.get('fixture');
  const name = isFixtureName(rawName) ? rawName : null;
  const yaw = parseYaw(params.get('yaw'));
  // `tasks.md` writes the cell as `cell=`, the fixtures write it as `view=`.
  const cellParam = params.get('view') ?? params.get('cell');

  return {
    name,
    camera: name === null ? yawPose(HERO_POSE, yaw) : yawPose(FIXTURE_POSES[name], yaw),
    cell: name === null ? null : parseCell(cellParam),
    disassemblyValue: name === 'cell' ? parseDisassembly(params.get('value')) ?? 0 : null,
    yaw,
    showAnnotations: parseToggle(params.get('annotations')),
    showFps: parseToggle(params.get('fps')),
  };
}
