import { CatmullRomCurve3, TubeGeometry, Vector3, type BufferGeometry } from 'three';
import {
  createBuild,
  createSeededNoise,
  mergeGeometryList,
  meshPart,
  ORGANELLE_PARAM_DEFAULTS,
  type OrganelleBuild,
  type OrganelleParams,
} from './primitives';

/**
 * Endoplasmic reticulum.
 *
 * Skill technique verbatim: `TubeGeometry` along `CatmullRomCurve3` branches — the ER is a
 * spline network, not a blobby solid.
 *
 * **Anatomy note.** The skill's wording is "connected tubule/cisterna network"; the reference
 * shows the readable structure as **folded, stacked sheets clustered near the nucleus**, not a
 * sparse tubular web. Those reconcile without changing the technique, because a cisterna *is* a
 * flattened tubule: each layer here is a serpentine run that folds back on itself, and the
 * layers are stacked with their own undulation. The result reads as stacked folded ribbons while
 * being built entirely from `TubeGeometry` curves.
 *
 * **Layer geometry, and why it is built this way.** Two earlier cuts failed inspection and both
 * failed for anatomy reasons, not for implementation reasons:
 *
 * 1. The serpentines lay in the XZ plane with the layers stacked along Y. The group's own
 *    rotation maps model Y to a screen-horizontal axis and model Z to screen depth, so the fold
 *    steps were hidden behind the runs — it rendered as a bundle of straight parallel rods. A
 *    fold whose step is invisible is not a fold.
 * 2. With the folds visible the layers still interpenetrated (the depth waver matched the layer
 *    pitch) and every cisterna was round in cross-section. It rendered as a ball of string.
 *
 * A cisterna is a *flattened* sheet, so each layer's tube is now squashed along the stack axis
 * before it is offset. That is the one place a round tube is not the right shape, and it is worth
 * the one extra operation: after flattening, each layer is a lamella and the stack reads as
 * stacked folded sheets rather than as tubing.
 *
 * Every layer is merged into one geometry, so the whole network costs **one draw call**
 * (skill: merge static geometry — the ER never animates branch by branch).
 *
 * `count` is the number of stacked layers, `branchCount` the number of folds in each layer.
 */

export interface EndoplasmicReticulumParams extends OrganelleParams {
  /** Folds (back-and-forth runs) in each cisterna layer. */
  branchCount: number;
  /** Half-width of one flattened tubule (a cisterna lamella), as a fraction of `size`. */
  tubeRatio: number;
}

export const ENDOPLASMIC_RETICULUM_PARAMS: EndoplasmicReticulumParams = {
  ...ORGANELLE_PARAM_DEFAULTS,
  size: 0.75,
  detail: 1,
  count: 6,
  branchCount: 6,
  tubeRatio: 0.075,
  seed: 'endoplasmic-reticulum/v1',
};

/** Half-length of one run, as a fraction of `size`. */
export const ER_EXTENT_RATIO = 0.82;
/** Layer pitch along the stack axis (model Z), as a fraction of `size`. */
export const ER_LAYER_PITCH_RATIO = 0.13;
/** Squash applied to each layer along the stack axis. This is what makes a tube a lamella. */
export const ER_LAYER_FLATTEN = 0.24;
/** Peak in-plane waver of one layer, as a fraction of `size`. */
export const ER_PLANE_WAVER_RATIO = 0.05;
/** Peak tilt of one layer about the stack axis, in radians, so the stack is not printed. */
export const ER_LAYER_TILT = 0.32;

/**
 * One layer's centreline: a serpentine that runs out along Y, steps along X, and runs back,
 * with its own seeded waver and tilt. It lies in the model's XY plane so a rendered fold is
 * actually visible. Pure, so the fold count and the tilt are unit-testable.
 */
export function erLayerCurve(
  layer: number,
  folds: number,
  size: number,
  seed: string,
): CatmullRomCurve3 {
  const noise = createSeededNoise(`${seed}/layer-${layer}`);
  const extent = size * ER_EXTENT_RATIO;
  const pitch = (1.5 * size) / Math.max(1, folds);
  const phase = noise.random() * Math.PI * 2;
  const phase2 = noise.random() * Math.PI * 2;
  const turn = (noise.random() * 2 - 1) * ER_LAYER_TILT;
  const samples = 6;
  const points: Vector3[] = [];

  for (let fold = 0; fold < folds; fold += 1) {
    const direction = fold % 2 === 0 ? -1 : 1;

    for (let step = 0; step <= samples; step += 1) {
      const t = step / samples;
      const along = direction * (1 - 2 * t);
      const y = along * extent + size * ER_PLANE_WAVER_RATIO * Math.sin(3.1 * t * Math.PI + phase2);
      const x =
        (fold - (folds - 1) / 2) * pitch +
        size * ER_PLANE_WAVER_RATIO * Math.sin(2.4 * t * Math.PI + phase);

      points.push(new Vector3(x, y, 0));
    }
  }

  // A small roll about the stack axis, applied in-plane so the layer stays in its own slab.
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);

  for (const point of points) {
    const x = point.x * cos - point.y * sin;
    const y = point.x * sin + point.y * cos;

    point.set(x, y, 0);
  }

  return new CatmullRomCurve3(points, false, 'centripetal', 0.5);
}

/** Where one layer sits along the stack axis. */
export function erLayerOffset(layer: number, layers: number, size: number): number {
  return (layer - (layers - 1) / 2) * size * ER_LAYER_PITCH_RATIO;
}

export function buildEndoplasmicReticulum(
  overrides: Record<string, number | string | boolean> = {},
): OrganelleBuild {
  const params: EndoplasmicReticulumParams = {
    ...ENDOPLASMIC_RETICULUM_PARAMS,
    ...(overrides as Partial<EndoplasmicReticulumParams>),
  };
  const { size, detail, seed, tubeRatio } = params;
  const layers = Math.max(1, Math.round(params.count));
  const folds = Math.max(1, Math.round(params.branchCount));
  const radialSegments = Math.max(4, Math.round(8 * detail));
  const layerGeometries: BufferGeometry[] = [];

  for (let layer = 0; layer < layers; layer += 1) {
    const curve = erLayerCurve(layer, folds, size, seed);
    const tubularSegments = Math.max(16, Math.round(curve.points.length * 2 * detail));
    const lamella = new TubeGeometry(
      curve,
      tubularSegments,
      size * tubeRatio,
      radialSegments,
      false,
    );

    // Flatten first, then place: the squash must not compress the stack spacing.
    lamella.scale(1, 1, ER_LAYER_FLATTEN);
    lamella.translate(0, 0, erLayerOffset(layer, layers, size));
    layerGeometries.push(lamella);
  }

  const network = mergeGeometryList(layerGeometries);

  // The merge copied the vertices, so the per-layer buffers are dead weight from here on.
  for (const geometry of layerGeometries) {
    if (geometry !== network) {
      geometry.dispose();
    }
  }

  return createBuild(
    [meshPart({ name: 'er-network', materialKey: 'er', geometry: network })],
    { ...params, count: layers, branchCount: folds },
    seed,
  );
}
