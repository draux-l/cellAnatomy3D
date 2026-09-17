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
