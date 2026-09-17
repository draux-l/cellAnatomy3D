/**
 * The viewer's camera arithmetic, as plain numbers.
 *
 * Two consumers need the same poses and the same zoom limits: the live viewer (which tweens the
 * camera when an organelle is isolated) and the `?fixture=` route (which has to pin a
 * deterministic camera for a screenshot). Keeping the arithmetic here means the fixture and the
 * real app cannot frame the same organelle differently.
 *
 * **No three.js import.** The app shell resolves a fixture before the 3D chunk exists, so this
 * module has to be safe to pull into the entry graph — and it is plain trigonometry.
 */

import { positionForRecord } from '../../catalog/params';
import type { CellId, OrganelleRecord } from '../../catalog/types';

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

/** Frames one scene unit: the pose every isolated-organelle fixture has always used. */
export const HERO_POSE: CameraPose = {
  position: [1.35, 1.0, 2.9],
  target: [0, 0, 0],
  fov: 35,
};

/**
 * Frames a whole cell, wall included.
 *
 * A composed cell is bigger than any single organelle: the wall's rounded polygon reaches ~1.27
 * scene units radially, and its band extends ~1.12 along the depth axis. At the hero pose that
 * combination clips the top and bottom of the frame, so the composed views get their own pose
 * rather than reusing the organelle one — which also keeps every committed organelle baseline
 * byte-identical.
 */
export const CELL_POSE: CameraPose = {
  position: [2.0, 1.5, 4.6],
  target: [0, 0, 0],
  fov: 35,
};

/** Frames the cell at 100% disassembly, where parts travel up to ~1.6 units from the centre. */
export const DISASSEMBLY_POSE: CameraPose = {
  position: [2.4, 1.8, 5.5],
  target: [0, 0, 0],
  fov: 35,
};

/**
 * The zoom limits (spec: `Scroll zoom is clamped`).
 *
 * `minDistance` is what implements "never passes inside the cell": the wall's own outer surface
 * sits around 1.32 scene units from the centre once its thickness and roughening are counted, so
 * the near clamp is set where the camera can still frame the cell without entering it. The unit
 * test asserts the clamp against the wall **as built**, not against this comment.
 */
export const NAVIGATION_LIMITS = {
  minDistance: 1.8,
  maxDistance: 9,
} as const;

export function clampNavigationDistance(distance: number): number {
  if (!Number.isFinite(distance)) {
    return NAVIGATION_LIMITS.minDistance;
  }

  return Math.min(NAVIGATION_LIMITS.maxDistance, Math.max(NAVIGATION_LIMITS.minDistance, distance));
}

/** How many organelle radii sit between the camera and an isolated organelle. */
export const ISOLATE_DISTANCE_FACTOR = 4;
/** Flat allowance added to the isolate distance so a small organelle is not framed edge-to-edge. */
export const ISOLATE_DISTANCE_MARGIN = 0.6;

function unitOf([x, y, z]: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(x, y, z);

  if (length <= 1e-9) {
    return [0, 0, 1];
  }

  return [x / length, y / length, z / length];
}

/**
 * The deterministic isolated view of one organelle.
 *
 * The camera keeps the hero pose's viewing direction and simply moves along it until the organelle
 * fills a comfortable part of the frame, so isolating never swings the viewer to the far side of
 * the cell. `extent` is the organelle's own scene-unit size, which the catalog carries for every
 * record — no built geometry is needed, which is what lets the fixture route compute the same pose
 * in the shell.
 */
/** The damping rate of the isolate framing tween, in inverse seconds. */
export const FOCUS_DAMPING_PER_SECOND = 6;
/** Below this, the tween snaps to its destination so the final frame is exact. */
export const FOCUS_SNAP_EPSILON = 0.002;

/**
 * What the camera is looking at and how far away it is, without the orbit angle.
 *
 * Keeping the orbit angle out is deliberate: the tween adjusts the target and the distance while
 * the user's chosen viewing direction is preserved, so isolating never yanks the view around to
 * the other side of the cell.
 */
export interface FocusState {
  target: [number, number, number];
  distance: number;
}

/** The resting focus: the cell's centre, at the composed pose's distance. */
export function defaultFocus(): FocusState {
  return { target: [...CELL_POSE.target], distance: Math.hypot(...CELL_POSE.position) };
}

/**
 * The focus that frames one record, in one cell.
 *
 * The extent comes from the record's own parameters rather than from built geometry, which is what
 * lets the `?fixture=isolate` route compute the identical pose in the app shell before the 3D
 * chunk exists.
 */
export function focusForRecord(record: OrganelleRecord, cell: CellId): FocusState {
  const size = record.geometry.params.size;
  const extent = typeof size === 'number' && Number.isFinite(size) ? size : 0.3;

  return {
    target: positionForRecord(record, cell),
    distance: clampNavigationDistance(
      Math.max(0, extent) * ISOLATE_DISTANCE_FACTOR + ISOLATE_DISTANCE_MARGIN,
    ),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothToward(
  current: number,
  desired: number,
  alpha: number,
  epsilon: number,
  exact: number,
): number {
  const next = lerp(current, desired, alpha);

  return Math.abs(next - desired) < epsilon ? exact : next;
}

/**
 * One step of the framing tween.
 *
 * Exponential damping rather than a fixed fraction, so the motion is the same whether the machine
 * is at 60 or 20 fps, and a snap threshold, so the last frame is exactly the destination instead of
 * asymptotically close to it.
 */
export function approachFocus(
  current: FocusState,
  desired: FocusState,
  dtSeconds: number,
  rate = FOCUS_DAMPING_PER_SECOND,
): FocusState {
  const dt = Number.isFinite(dtSeconds) ? Math.max(0, Math.min(dtSeconds, 0.1)) : 0;
  const alpha = 1 - Math.exp(-rate * dt);

  return {
    target: [
      smoothToward(current.target[0], desired.target[0], alpha, FOCUS_SNAP_EPSILON, desired.target[0]),
      smoothToward(current.target[1], desired.target[1], alpha, FOCUS_SNAP_EPSILON, desired.target[1]),
      smoothToward(current.target[2], desired.target[2], alpha, FOCUS_SNAP_EPSILON, desired.target[2]),
    ],
    distance: smoothToward(
      current.distance,
      desired.distance,
      alpha,
      FOCUS_SNAP_EPSILON,
      desired.distance,
    ),
  };
}

/** True when the tween has arrived, so the loop can stop writing and let the user orbit freely. */
export function focusSettled(current: FocusState, desired: FocusState): boolean {
  return (
    Math.hypot(
      current.target[0] - desired.target[0],
      current.target[1] - desired.target[1],
      current.target[2] - desired.target[2],
    ) < FOCUS_SNAP_EPSILON && Math.abs(current.distance - desired.distance) < FOCUS_SNAP_EPSILON
  );
}

export function isolateCameraPose(
  position: readonly [number, number, number],
  extent: number,
  viewDirection: readonly [number, number, number] = HERO_POSE.position,
): CameraPose {
  const distance = clampNavigationDistance(
    Math.max(0, extent) * ISOLATE_DISTANCE_FACTOR + ISOLATE_DISTANCE_MARGIN,
  );
  const direction = unitOf(viewDirection);

  return {
    position: [
      position[0] + direction[0] * distance,
      position[1] + direction[1] * distance,
      position[2] + direction[2] * distance,
    ],
    target: [position[0], position[1], position[2]],
    fov: CELL_POSE.fov,
  };
}
