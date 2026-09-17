import { SphereGeometry } from 'three';
import {
  createBuild,
  createSeededNoise,
  displaceAlongNormals,
  meshPart,
  ORGANELLE_PARAM_DEFAULTS,
  type OrganelleBuild,
  type OrganelleParams,
} from './primitives';

/**
 * Cell membrane.
 *
 * Skill technique verbatim: `SphereGeometry` with its vertices displaced along their normals by
 * seeded 3D noise. A single closed shell is the honest shape — the lipid bilayer is ~7 nm thick,
 * so drawing it as two shells would be a scale lie — and the noise only breaks the perfect sphere,
 * so the silhouette stays legible.
 *
 * The translucent, double-sided, `transmission`-free look lives in `materials.ts` under the
 * `membrane` key; a shell this large must never pay for the extra back-face pass.
 */

export interface MembraneParams extends OrganelleParams {
  /** Peak displacement along the normal, as a fraction of the radius. */
  noiseAmplitude: number;
}

export const MEMBRANE_PARAMS: MembraneParams = {
  ...ORGANELLE_PARAM_DEFAULTS,
  // Showcase default: one scene unit, the scale the `?fixture=organelle` pose frames.
  size: 1,
  seed: 'membrane/v1',
  noiseAmplitude: 0.035,
};

/**
 * Silhouette segments per unit of `detail`, before the segment floor.
 *
 * High on purpose: the membrane's silhouette *is* the cell's outline in every view, so it is the
 * one surface where a visible polygon edge would read as a modelling error. 72 × 36 is ~5 k
 * triangles for a hard-edged circle at hero zoom; the simplify gate does not apply.
 */
export const MEMBRANE_SEGMENTS_PER_DETAIL = 72;
/** Noise frequency, in inverse scene units. Fine enough to read as a membrane, not as a blob. */
export const MEMBRANE_NOISE_FREQUENCY = 1.9;

export function buildMembrane(
  overrides: Record<string, number | string | boolean> = {},
): OrganelleBuild {
  const params: MembraneParams = {
    ...MEMBRANE_PARAMS,
    ...(overrides as Partial<MembraneParams>),
  };
  const { size, detail, seed, noiseAmplitude } = params;

  const widthSegments = Math.max(24, Math.round(MEMBRANE_SEGMENTS_PER_DETAIL * detail));
  const heightSegments = Math.max(12, Math.round((MEMBRANE_SEGMENTS_PER_DETAIL / 2) * detail));

  const shell = new SphereGeometry(size, widthSegments, heightSegments);

  displaceAlongNormals(shell, createSeededNoise(seed), {
    amplitude: noiseAmplitude * size,
    frequency: MEMBRANE_NOISE_FREQUENCY / size,
  });

  return createBuild(
    [meshPart({ name: 'membrane', materialKey: 'membrane', geometry: shell })],
    { ...params },
    seed,
  );
}
