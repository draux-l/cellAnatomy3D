import { BufferAttribute, SphereGeometry, type BufferGeometry } from 'three';
import {
  createBuild,
  createSeededNoise,
  displaceAlongNormals,
  meshPart,
  ORGANELLE_PARAM_DEFAULTS,
  type OrganelleBuild,
  type OrganelleParams,
} from './primitives';
import { SILHOUETTE_CORNER_SEGMENTS_PER_DETAIL, polygonRadiusAt, roundedPolygonPoints } from './silhouette';

/**
 * Cell membrane.
 *
 * Skill technique verbatim: `SphereGeometry` with its vertices displaced along their normals by
 * seeded 3D noise. A single closed shell is the honest shape — the lipid bilayer is ~7 nm thick,
 * so drawing it as two shells would be a scale lie — and the noise only breaks the perfect sphere,
 * so the silhouette stays legible.
 *
 * **The silhouette is a parameter, and its default is the animal cell's round membrane.** The
 * plant cell's outline is a rounded polygon imposed by the rigid wall, so a sphere inside that
 * wall renders as two unrelated shapes with wide corner gaps. `sides >= 3` morphs the sphere's
 * cross-sections onto the *same* outline the wall is generated from (`silhouette.ts`), which is
 * why the two shapes cannot drift apart: `sides: 0` means "round", and nothing else changes. The
 * catalog drives the choice through the record's `perCell.geometryParams`, never a viewer
 * constant — the animal record declares nothing and therefore keeps the sphere.
 *
 * The morph keeps the sphere's vertex count and topology, so the shell stays closed and the
 * triangle budget is identical in both cells.
 *
 * The translucent, double-sided, `transmission`-free look lives in `materials.ts` under the
 * `membrane` key; a shell this large must never pay for the extra back-face pass.
 */

export interface MembraneParams extends OrganelleParams {
  /** Peak displacement along the normal, as a fraction of the radius. */
  noiseAmplitude: number;
  /**
   * Silhouette sides. `0` (the default) is the round animal membrane; `>= 3` morphs the shell
   * onto a rounded polygon with this many sides, sharing the wall's outline generator.
   */
  sides: number;
  /** Corner rounding for a polygonal silhouette, 0 (sharp) to 1 (fully round). */
  cornerRounding: number;
}

export const MEMBRANE_PARAMS: MembraneParams = {
  ...ORGANELLE_PARAM_DEFAULTS,
  // Showcase default: one scene unit, the scale the `?fixture=organelle` pose frames.
  size: 1,
  seed: 'membrane/v1',
  noiseAmplitude: 0.035,
  // Round: the animal cell's silhouette. The plant record overrides both per cell.
  sides: 0,
  cornerRounding: 0,
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

export interface SilhouetteMorphOptions {
  sides: number;
  /** The flat-side distance the morph preserves; the round shell's own radius. */
  inradius: number;
  cornerRounding: number;
  cornerSegments: number;
}

/** True when the requested silhouette is the round default and no morph is needed. */
export function usesPolygonSilhouette(sides: number): boolean {
  return Number.isFinite(sides) && Math.round(sides) >= 3;
}

/**
 * Morphs a round shell's cross-sections onto a rounded polygon, in place.
 *
 * Every vertex keeps its depth; only its radial position in the XY plane changes, scaled by
 * `polygonRadiusAt(outline, φ) / inradius`. On a flat side that factor is exactly 1, so the flats
 * do not move; toward a corner it is larger, which pushes the surface out until it matches the
 * wall's corner. The result is a polygon body with the sphere's round caps, which is what a
 * cross-section of a turgid plant cell looks like.
 *
 * The morph must run **before** the noise displacement, so the displacement follows the normals
 * of the shape that actually renders.
 */
export function applyPolygonSilhouette(
  geometry: BufferGeometry,
  options: SilhouetteMorphOptions,
): BufferGeometry {
  const { sides, inradius, cornerRounding, cornerSegments } = options;

  if (!usesPolygonSilhouette(sides)) {
    return geometry;
  }

  const outline = roundedPolygonPoints(sides, inradius, cornerRounding, cornerSegments);
  const position = geometry.getAttribute('position');

  if (!(position instanceof BufferAttribute)) {
    throw new Error('applyPolygonSilhouette requires a geometry with a position attribute');
  }

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const radius = Math.hypot(x, y);

    // The poles sit on the axis: their azimuth is undefined and their radius is zero, so there is
    // nothing to scale and moving them would open the cap.
    if (radius <= 1e-9) {
      continue;
    }

    const target = polygonRadiusAt(outline, Math.atan2(y, x));

    if (!Number.isFinite(target) || target <= 0) {
      continue;
    }

    const scale = target / inradius;

    position.setXYZ(index, x * scale, y * scale, position.getZ(index));
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

export function buildMembrane(
  overrides: Record<string, number | string | boolean> = {},
): OrganelleBuild {
  const params: MembraneParams = {
    ...MEMBRANE_PARAMS,
    ...(overrides as Partial<MembraneParams>),
  };
  const { size, detail, seed, noiseAmplitude, sides, cornerRounding } = params;

  const widthSegments = Math.max(24, Math.round(MEMBRANE_SEGMENTS_PER_DETAIL * detail));
  const heightSegments = Math.max(12, Math.round((MEMBRANE_SEGMENTS_PER_DETAIL / 2) * detail));

  const shell = new SphereGeometry(size, widthSegments, heightSegments);

  applyPolygonSilhouette(shell, {
    sides,
    inradius: size,
    cornerRounding,
    cornerSegments: Math.max(2, Math.round(SILHOUETTE_CORNER_SEGMENTS_PER_DETAIL * detail)),
  });

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
