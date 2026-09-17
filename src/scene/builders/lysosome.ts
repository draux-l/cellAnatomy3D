import { IcosahedronGeometry } from 'three';
import {
  createBuild,
  createSeededNoise,
  displaceAlongNormals,
  meshPart,
  ORGANELLE_PARAM_DEFAULTS,
  smoothGeometry,
  type OrganelleBuild,
  type OrganelleParams,
} from './primitives';

/**
 * Lysosome.
 *
 * Skill technique verbatim: one small membrane-bound vesicle is already a sphere, so an
 * `IcosahedronGeometry` with a slight seeded noise displacement is both the correct shape and
 * the cheapest honest one. One draw call; there is no reason to subdivide.
 *
 * The polyhedron is welded before displacing: an unmerged icosahedron has per-face normals, and
 * displacing along those turns the vesicle into a faceted crystal that cracks along every edge
 * instead of a slightly irregular sphere.
 *
 * `size` is the vesicle radius.
 */

export type LysosomeParams = OrganelleParams;

export const LYSOSOME_PARAMS: LysosomeParams = {
  ...ORGANELLE_PARAM_DEFAULTS,
  size: 0.5,
  detail: 1,
  count: 0,
  seed: 'lysosome/v1',
};

/**
 * Subdivision per unit of `detail`; detail 1 buys detail 3 (320 triangles). The vesicle renders
 * as a close-up in the organelle fixture, and an unmerged/unsubdivided icosahedron shows its
 * polygon edges there. Still one draw call, still far under the 25 k budget.
 */
export const LYSOSOME_DETAIL_PER_PARAM = 3;
/** Peak displacement along the normal, as a fraction of the radius. "Slightly irregular." */
export const LYSOSOME_NOISE_AMPLITUDE = 0.09;

export function buildLysosome(
  overrides: Record<string, number | string | boolean> = {},
): OrganelleBuild {
  const params: LysosomeParams = {
    ...LYSOSOME_PARAMS,
    ...(overrides as Partial<LysosomeParams>),
  };
  const { size, detail, seed } = params;

  const body = smoothGeometry(
    new IcosahedronGeometry(size, Math.max(1, Math.round(LYSOSOME_DETAIL_PER_PARAM * detail))),
  );

  displaceAlongNormals(body, createSeededNoise(seed), {
    amplitude: size * LYSOSOME_NOISE_AMPLITUDE,
    frequency: 2.4 / size,
  });

  return createBuild(
    [meshPart({ name: 'lysosome', materialKey: 'lysosome', geometry: body })],
    { ...params },
    seed,
  );
}
