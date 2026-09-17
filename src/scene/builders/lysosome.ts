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
 * Subdivision per unit of `detail`; detail 1 buys detail 8 (1,620 triangles).
 *
 * Raised from 3 (320 triangles) after the composed cell was inspected: the vesicle rendered with a
 * visibly polygonal silhouette — about twenty straight chords around the outline at the fixture's
 * framing, each roughly 5 px of sag, which is the signature of an icosphere whose subdivision is too
 * low for the size it is drawn at. The seeded displacement only has as many vertices as the
 * subdivision gives it, so "a slightly irregular sphere" came out as a faceted crystal instead.
 *
 * This is a deliberate departure from the skill's line "no reason to subdivide". That line is about
 * *cost*, and cost was measured: this renderer is fill-rate bound, not geometry bound, so the extra
 * 1,300 triangles are free (raising it moved no timing), while 320 triangles is 162 vertices for a
 * body that fills the frame. The subdivision is chosen from the silhouette, not from the budget —
 * `20 × (detail + 1)²` faces gives ~45 chords round the outline at detail 8, which puts the sag
 * below a pixel at the isolated-organelle framing the app offers.
 */
export const LYSOSOME_DETAIL_PER_PARAM = 8;
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
