import { LatheGeometry, Vector2, type BufferGeometry } from 'three';
import {
  createBuild,
  createSeededNoise,
  meshPart,
  ORGANELLE_PARAM_DEFAULTS,
  type OrganelleBuild,
  type OrganelleParams,
} from './primitives';

/**
 * Central vacuole (plant).
 *
 * Skill technique verbatim: a large translucent `LatheGeometry` body, `DoubleSide`, **no
 * `transmission`**. The vacuole is one of the two organelles that define a plant cell's bulk —
 * the other is the wall — and it is a single big organelle, so one draw call is the whole cost
 * model.
 *
 * **Anatomy note.** The reference shows a **large, rounded, smooth** body, and the task text is
 * explicit that it is large. Two consequences for the build:
 *
 * 1. The profile is nearly a spheroid with a gentle seeded waver, so the body reads as a smooth
 *    fluid sac rather than as a mathematical ball. It is deliberately *not* angular: the wall
 *    imposes the angular cell silhouette, and the vacuole is the soft volume inside it.
 * 2. The record's `size` (0.72 scene units, against a membrane at 1) is honoured through the
 *    parameter, so the vacuole fills most of the cell without touching the membrane.
 *
 * Translucency lives in `materials.ts` under the `vacuole` key: `transparent` + `opacity` with
 * `depthWrite` off, which is what keeps the organelles behind it legible. `transmission` is
 * banned — it forces an extra back-face pass and this is the largest single surface in the cell.
 */

export interface VacuoleParams extends OrganelleParams {
  /** Peak profile waver, as a fraction of the radius. */
  wobble: number;
  /** Flattening along the vertical axis. 1 is a sphere; the reference is very nearly one. */
  flatten: number;
}

export const VACUOLE_PARAMS: VacuoleParams = {
  ...ORGANELLE_PARAM_DEFAULTS,
  // Showcase default: the fixture frames one scene unit, so a large body fills it.
  size: 1,
  detail: 1,
  count: 0,
  wobble: 0.02,
  flatten: 0.95,
  seed: 'vacuole/v1',
};

/** Meridian samples per unit of `detail`, before the floor. */
export const VACUOLE_PROFILE_SEGMENTS_PER_DETAIL = 24;
/** Radial samples per unit of `detail`, before the floor. */
export const VACUOLE_RADIAL_SEGMENTS_PER_DETAIL = 48;

/**
 * The vacuole's meridian from south pole to north pole: a flattened spheroid with a gentle
 * seeded waver, so the body is smooth but not a perfect sphere.
 */
export function vacuoleProfile(
  radius: number,
  flatten: number,
  segments: number,
  wobble: number,
  seed: string,
): Vector2[] {
  const noise = createSeededNoise(`${seed}/profile`);
  const steps = Math.max(8, Math.round(segments));
  const points: Vector2[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const angle = -Math.PI / 2 + (i / steps) * Math.PI;
    const waver = 1 + wobble * noise.noise3D(0, i * 0.27, 0.5);

    points.push(
      new Vector2(
        Math.max(0, Math.cos(angle) * radius * waver),
        Math.sin(angle) * radius * flatten * waver,
      ),
    );
  }

  return points;
}

export function buildVacuole(
  overrides: Record<string, number | string | boolean> = {},
): OrganelleBuild {
  const params: VacuoleParams = {
    ...VACUOLE_PARAMS,
    ...(overrides as Partial<VacuoleParams>),
  };
  const { size, detail, seed, wobble, flatten } = params;

  const profileSegments = Math.max(12, Math.round(VACUOLE_PROFILE_SEGMENTS_PER_DETAIL * detail));
  const radialSegments = Math.max(16, Math.round(VACUOLE_RADIAL_SEGMENTS_PER_DETAIL * detail));

  const body: BufferGeometry = new LatheGeometry(
    vacuoleProfile(size, flatten, profileSegments, wobble, seed),
    radialSegments,
  );

  body.computeVertexNormals();

  return createBuild(
    [meshPart({ name: 'vacuole', materialKey: 'vacuole', geometry: body })],
    { ...params },
    seed,
  );
}
