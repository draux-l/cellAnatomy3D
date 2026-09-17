import { SphereGeometry, type BufferGeometry } from 'three';
import { applyPolygonSilhouette, usesPolygonSilhouette } from './membrane';
import {
  createBuild,
  createSeededNoise,
  displaceAlongNormals,
  meshPart,
  ORGANELLE_PARAM_DEFAULTS,
  type OrganelleBuild,
  type OrganelleParams,
} from './primitives';
import { SILHOUETTE_CORNER_SEGMENTS_PER_DETAIL } from './silhouette';

/**
 * Cytoplasm.
 *
 * The cell's interior volume: the cytosol the organelles sit in. Both user references label it
 * explicitly (`Citoplasma` / `cytoplasm`), and in the animal cell the blue interior fill **is** the
 * cytoplasm — it is what visually defines the cell as a cell rather than as a bag of parts on a dark
 * background.
 *
 * **Technique, per the skill's structure table:** "Cytosol volume plus visible streaming →
 * *Translucent inner shell* + GPU `Points` or instanced particles for the flow". This builder is the
 * **shell** half, which is the part that carries the colour and the volume. The streaming half is
 * particle motion and belongs to the processes milestone, not here.
 *
 * **It is a shell, not a solid, and it sits just inside the membrane.** A closed surface at
 * `size` 0.94 against the membrane's 1.0, so the membrane stays the boundary and the cytoplasm is
 * the fill inside it. In the plant cell it morphs onto the *same* rounded-octagon outline the wall
 * and the membrane are generated from (`silhouette.ts`), through the same `perCell.geometryParams`
 * mechanism the membrane uses — otherwise the plant cell would render a round fill inside an angular
 * boundary, which is exactly the "two unrelated shapes claiming to be the same cell" defect the
 * composition slice fixed for the membrane.
 *
 * **Why the shell is single-sided and cheap to draw.** `src/scene/materials.ts` renders every
 * boundary shell `FrontSide` on the standard shader path, because every one of them is a closed
 * surface (asserted in `builders/shell-closure.test.ts`) and `DoubleSide` on a transparent,
 * depth-write-free surface shades each covered pixel twice for no shape benefit — measured at ~35%
 * of the frame on the composed cells. This is the largest shell in the cell, so it is the surface
 * where that decision matters most.
 *
 * `size` is the cytosol radius in scene units.
 */

export interface CytoplasmParams extends OrganelleParams {
  /** Peak displacement along the normal, as a fraction of the radius. */
  noiseAmplitude: number;
  /**
   * Silhouette sides. `0` is the round animal fill; `>= 3` morphs onto a rounded polygon with this
   * many sides, sharing the wall's outline. The plant record overrides it per cell.
   */
  sides: number;
  /** Corner rounding for a polygonal silhouette, 0 (sharp) to 1 (fully round). */
  cornerRounding: number;
}

export const CYTOPLASM_PARAMS: CytoplasmParams = {
  ...ORGANELLE_PARAM_DEFAULTS,
  // Showcase default: one scene unit, the scale the `?fixture=organelle` pose frames.
  size: 1,
  seed: 'cytoplasm/v1',
  noiseAmplitude: 0.018,
  // Round: the animal cell's fill. The plant record overrides both per cell.
  sides: 0,
  cornerRounding: 0,
};

/**
 * Cross-section segments per unit of `detail`.
 *
 * The same figure as the membrane, for the same reason: this surface *is* the cell's interior
 * outline in every view, so it is a place a visible polygon edge would read as a modelling error.
 * 72 x 36 puts the chord sag well under a pixel at any framing this app offers.
 */
export const CYTOPLASM_SEGMENTS_PER_DETAIL = 72;
/** Noise frequency, in inverse scene units. Lower than the membrane's: this is a volume, not a skin. */
export const CYTOPLASM_NOISE_FREQUENCY = 1.3;

export function buildCytoplasm(
  overrides: Record<string, number | string | boolean> = {},
): OrganelleBuild {
  const params: CytoplasmParams = {
    ...CYTOPLASM_PARAMS,
    ...(overrides as Partial<CytoplasmParams>),
  };
  const { size, detail, seed, noiseAmplitude, sides, cornerRounding } = params;

  const widthSegments = Math.max(24, Math.round(CYTOPLASM_SEGMENTS_PER_DETAIL * detail));
  const heightSegments = Math.max(12, Math.round((CYTOPLASM_SEGMENTS_PER_DETAIL / 2) * detail));

  const body: BufferGeometry = new SphereGeometry(size, widthSegments, heightSegments);

  // Morph before displacing, exactly as the membrane does, so the noise follows the shape that
  // actually renders. The morph keeps the vertex count and topology, so the fill stays closed.
  applyPolygonSilhouette(body, {
    sides,
    inradius: size,
    cornerRounding,
    cornerSegments: Math.max(2, Math.round(SILHOUETTE_CORNER_SEGMENTS_PER_DETAIL * detail)),
  });

  displaceAlongNormals(body, createSeededNoise(seed), {
    amplitude: noiseAmplitude * size,
    frequency: CYTOPLASM_NOISE_FREQUENCY / size,
  });

  return createBuild(
    [meshPart({ name: 'cytoplasm', materialKey: 'cytoplasm', geometry: body })],
    { ...params },
    seed,
  );
}

export { usesPolygonSilhouette };
