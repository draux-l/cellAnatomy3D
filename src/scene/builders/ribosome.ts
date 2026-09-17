import { IcosahedronGeometry } from 'three';
import {
  buildInstanceMatrices,
  createBuild,
  createSeededNoise,
  instancedPart,
  ORGANELLE_PARAM_DEFAULTS,
  samplePointsInSphere,
  type OrganelleBuild,
  type OrganelleParams,
} from './primitives';

/**
 * Ribosomes.
 *
 * Skill technique verbatim, and non-negotiable: an `InstancedMesh` of a low-detail
 * `IcosahedronGeometry`. There are hundreds of them; as individual meshes they would alone blow
 * the per-cell draw-call budget. **One draw call for all of them.**
 *
 * Placement is cytosolic, so it uses seeded rejection sampling inside the cell's bounds rather
 * than `Math.random()` — the same record must look identical in animal view, plant view,
 * comparison mode and inside any animation.
 *
 * `spread` is a scene-unit cloud radius and is deliberately independent of `size`, which is the
 * granule radius: a builder whose cloud scale was derived from its granule scale would place
 * 25 nm dots in a 25 nm cluster. Authoring consequence: `|record.position| + spread` must stay
 * inside the membrane, which is why the default is 0.55 against a unit-radius cell.
 */

export interface RibosomeParams extends OrganelleParams {
  /** Radius of the cytosol ball the granules are scattered through, in scene units. */
  spread: number;
}

export const RIBOSOME_PARAMS: RibosomeParams = {
  ...ORGANELLE_PARAM_DEFAULTS,
  size: 0.03,
  detail: 0,
  count: 220,
  spread: 0.55,
  seed: 'ribosome/v1',
};

/** Per-instance scale spread. Keeps the cloud from reading as a lattice of identical dots. */
export const RIBOSOME_SCALE_JITTER = 0.3;

export function buildRibosome(
  overrides: Record<string, number | string | boolean> = {},
): OrganelleBuild {
  const params: RibosomeParams = {
    ...RIBOSOME_PARAMS,
    ...(overrides as Partial<RibosomeParams>),
  };
  const { size, detail, seed, spread } = params;
  const count = Math.max(0, Math.round(params.count));

  // Flat shading on a 20-triangle granule is the documented simplification: at the size a
  // ribosome renders, extra subdivision is vertices nobody can see.
  const granule = new IcosahedronGeometry(size, Math.max(0, Math.min(1, Math.round(detail))));
  const noise = createSeededNoise(seed);
  const positions = count > 0 ? samplePointsInSphere(noise, count, spread) : [];
  const matrices = buildInstanceMatrices(noise, positions, {
    scale: 1,
    scaleJitter: RIBOSOME_SCALE_JITTER,
    orient: true,
  });

  return createBuild(
    [
      instancedPart({
        name: 'ribosomes',
        materialKey: 'granule',
        geometry: granule,
        instanceCount: positions.length,
        matrices,
      }),
    ],
    { ...params, count },
    seed,
  );
}
