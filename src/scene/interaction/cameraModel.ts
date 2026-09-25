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

import { extentFor, positionForRecord } from '../../catalog/params';
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
 * The whole-cell view: the model framed the way a plain glTF viewer presents the file.
 *
 * ## Why this is derived rather than picked
 *
 * A minimal standalone viewer — the same GLB, its own scene, no app furniture — frames the model by
 * keeping the **membrane's half-diagonal** inside the vertical field of view with a small margin,
 * aimed down a near-frontal direction with a slight upward tilt. That rule is what this pose
 * reproduces, so both numbers come from the model instead of from taste:
 *
 * - `direction` is the plain viewer's own front, `[0.22, 0.28, 0.93]` normalised — near-frontal,
 *   ~13° of azimuth and ~16° of elevation. The hero pose's ~25° of azimuth is what read as a view
 *   "from the side and below".
 * - `distance` is `membraneHalfDiagonal / tan(fov / 2) × 1.06` — the membrane record's own committed
 *   `extent` (2.002279 scene units, `catalog/cells.ts`) over `tan(17.5°)`, with the plain viewer's
 *   6 % margin. That is **6.7314 scene units**, and it is also the distance the isolate tween rests
 *   at, so "back to the whole cell" returns to this exact framing.
 *
 * ## What it replaces
 *
 * Two poses, and both were genuinely wrong for a whole cell:
 *
 * - The **composed fixture** used `[2.0, 1.5, 4.6]` — 5.24 scene units, at which the silhouette filled
 *   ~67 % of the frame height against this pose's 52 %. Tight, though not clipping.
 * - The **real app** used the hero pose (3.35 scene units), which is *inside* the membrane: the plain
 *   viewer renders the cell's interior from there, with the silhouette running off the bottom edge.
 *
 * Neither was the whole story — the model was also being mounted with a per-record offset, fixed in
 * `scene/MeshCellGroup.tsx` — so this pose is one of two changes, not the only one. What this pose
 * is measured against is the plain viewer: at the composed pose the app's silhouette and the plain
 * viewer's agree to within a pixel, and the app's default view matches the proposed pose.
 *
 * `cameraModel.test.ts` re-derives the distance from the membrane record, so this constant cannot
 * drift away from the model it frames. The numbers are scene units; the model's own units are ~247×
 * larger and are never mixed in here.
 */
export const CELL_POSE: CameraPose = {
  position: [1.4871, 1.8927, 6.2864],
  target: [0, 0, 0],
  fov: 35,
};

/**
 * Frames the cell at 100% disassembly, where parts travel up to ~1.6 units from the centre.
 *
 * The same viewing direction as {@link CELL_POSE}, backed off proportionally: a wider subject needs
 * a wider frame, and keeping the direction means raising the control never swings the view. The
 * distance (8 scene units) stays inside the far navigation clamp, so the pose can never sit outside
 * where the user is allowed to orbit.
 */
export const DISASSEMBLY_POSE: CameraPose = {
  position: [1.7674, 2.2494, 7.4711],
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

/**
 * The same pose seen from a rotated azimuth, in degrees about the world Y axis.
 *
 * The annotation matrix (task 4.19) needs an **orbit** sweep whose every step is a function of the
 * URL, so the camera has to be pinnable at a named yaw rather than driven by a drag. Rotating the
 * pose position about Y keeps the target and the distance, which is exactly what an orbit is, so a
 * yawed fixture and a dragged orbit frame the same cell the same way.
 */
export function yawPose(pose: CameraPose, yawDegrees: number): CameraPose {
  if (!Number.isFinite(yawDegrees) || yawDegrees === 0) {
    return { position: [...pose.position], target: [...pose.target], fov: pose.fov };
  }

  const radians = (yawDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const [x, y, z] = pose.position;

  return {
    position: [x * cos + z * sin, y, -x * sin + z * cos],
    target: [...pose.target],
    fov: pose.fov,
  };
}

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
/**
 * The ceiling on the isolate distance, in scene units.
 *
 * A record's extent is a half-diagonal, and this model's own parts are large: the endoplasmic
 * reticulum, the ribosome clouds and the mitochondrial envelopes each report an extent above 1.2
 * because their meshes are spread across the cell. At the factor above that asks for a distance past
 * the far navigation clamp, which framed the organelle from outside the cell. The ceiling keeps the
 * isolated view inside the cell while still backing off in proportion for the small parts.
 */
export const ISOLATE_DISTANCE_CEILING = 3.2;

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
 * The extent comes from the record's own data — a procedural record's `size` parameter, a mesh
 * record's measured `geometry.extent` — rather than from built geometry, which is what lets the
 * `?fixture=` route compute the identical pose in the app shell before the 3D chunk exists.
 */
export function isolateDistanceFor(extent: number): number {
  return clampNavigationDistance(
    Math.min(
      ISOLATE_DISTANCE_CEILING,
      Math.max(0, extent) * ISOLATE_DISTANCE_FACTOR + ISOLATE_DISTANCE_MARGIN,
    ),
  );
}

export function focusForRecord(record: OrganelleRecord, cell: CellId): FocusState {
  const extent = extentFor(record);

  return {
    target: positionForRecord(record, cell),
    distance: isolateDistanceFor(extent),
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
  const distance = isolateDistanceFor(extent);
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
