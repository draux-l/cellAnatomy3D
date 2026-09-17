import {
  BufferAttribute,
  ExtrudeGeometry,
  Path,
  Shape,
  Vector2,
  Vector3,
  type BufferGeometry,
} from 'three';
import {
  createBuild,
  createSeededNoise,
  meshPart,
  ORGANELLE_PARAM_DEFAULTS,
  smoothGeometry,
  type OrganelleBuild,
  type OrganelleParams,
  type SeededNoise,
} from './primitives';
import { SILHOUETTE_CORNER_SEGMENTS_PER_DETAIL, roundedPolygonPoints } from './silhouette';

/**
 * The silhouette generator moved to `silhouette.ts` when the membrane needed the *same* outline.
 * It is re-exported here so every existing importer keeps working, and so this module stays the
 * wall's public surface.
 */
export { roundedPolygonPoints };

/**
 * Cell wall (plant).
 *
 * Skill technique verbatim: `ExtrudeGeometry` for the wall, `DoubleSide`, a rigid outer layer that
 * must **visibly sit outside the membrane**.
 *
 * **The angular silhouette is the point of this builder.** The reference is explicit that a plant
 * cell is a *rounded polygon*, not a sphere: the rigid cellulose wall imposes straight-ish sides
 * with rounded corners. A lathe or a displaced sphere can only ever produce a surface of
 * revolution, so the wall is built as a **rounded n-gon ring** — straight sides, arc corners —
 * extruded along the cell's depth axis.
 *
 * "Angular" is measured, not asserted: the outline's minimum radius (the flat sides) is exactly
 * the declared inradius, and its maximum is strictly larger, so the cross-section varies with
 * angle instead of being constant the way a circle's is. A test compares the two-side counts and
 * proves fewer sides means more variation, and `rounding: 0` gives the sharp polygon whose corners
 * reach the full circumradius. At eight sides with the default rounding the ratio is ~0.95.
 *
 * **Thickness.** The reference and the task both insist the wall is a thick band, not a thin skin.
 * The ring's radial extent *is* the wall's thickness, so the render shows a real band at the
 * silhouette instead of two coincident surfaces.
 *
 * **What `size` means here.** The record writes `size: 1.06` against a membrane of `size: 1`, and
 * the anatomy demands the wall sit *outside* the membrane. `size` is therefore read as the wall's
 * **inner** boundary — the offset the author wrote — and the wall's own thickness extends outward
 * from it. A test measures that inner boundary against the real membrane builder's outermost
 * vertex, so "visibly outside" is a number, not a claim.
 *
 * **Honest limitation.** The ring is open along the depth axis, because that is what makes the
 * band legible: a closed envelope renders as a translucent block with no discernible wall at all.
 * The cell's contents are seen through the bore, which is how a cross-section illustration reads
 * too. M1d will place the membrane inside that bore, and a plant membrane that is itself angular
 * is a composition decision this builder deliberately does not make.
 */

export interface CellWallParams extends OrganelleParams {
  /** Sides of the rounded polygon. The cell's silhouette is this shape. */
  sideCount: number;
  /** How much of each corner is rounded away, 0 (sharp) to 1 (fully round). */
  cornerRounding: number;
  /** Wall thickness, as a fraction of `size`. */
  thicknessRatio: number;
  /** Ring depth along the cell's depth axis, as a multiple of `size`. */
  depthRatio: number;
  /** Peak radial roughening, as a fraction of `size` — the wall's fibre texture. */
  noiseAmplitude: number;
}

export const CELL_WALL_PARAMS: CellWallParams = {
  ...ORGANELLE_PARAM_DEFAULTS,
  // Showcase default: the record's `size` is a *cell-scale* offset (1.06 against a membrane of 1),
  // and at that size the fixture's hero pose frames the wall so tightly that the band is off screen.
  // 0.8 is the largest scale at which the whole ring fits the pose; the composition uses 1.06.
  size: 0.8,
  detail: 1,
  count: 0,
  sideCount: 8,
  cornerRounding: 0.4,
  thicknessRatio: 0.09,
  depthRatio: 2,
  noiseAmplitude: 0.02,
  seed: 'cell-wall/v1',
};

/** Corner arc samples per unit of `detail`. Enough that a rounded corner is not a chamfer. */
export const CELL_WALL_CORNER_SEGMENTS_PER_DETAIL = SILHOUETTE_CORNER_SEGMENTS_PER_DETAIL;
/** Radial roughening frequency, in inverse scene units. Low enough to read as fibre, not noise. */
export const CELL_WALL_NOISE_FREQUENCY = 4.5;

/** The wall's cross-section: the outer rounded polygon with the inner one cut out of it. */
export function cellWallShape(
  innerInradius: number,
  outerInradius: number,
  params: Pick<CellWallParams, 'sideCount' | 'cornerRounding'>,
  cornerSegments: number,
): Shape {
  const toVectors = (points: [number, number][]): Vector2[] =>
    points.map(([x, y]) => new Vector2(x, y));
  const outer = roundedPolygonPoints(
    params.sideCount,
    outerInradius,
    params.cornerRounding,
    cornerSegments,
  );
  const inner = roundedPolygonPoints(
    params.sideCount,
    innerInradius,
    params.cornerRounding,
    cornerSegments,
  ).reverse();
  const shape = new Shape();

  shape.setFromPoints(toVectors(outer));
  shape.closePath();

  const hole = new Path();

  hole.setFromPoints(toVectors(inner));
  hole.closePath();
  shape.holes.push(hole);

  return shape;
}

/**
 * Displaces every vertex radially in the extrusion plane, leaving its depth alone.
 *
 * Radial, not normal-based, **on purpose**: `ExtrudeGeometry` is not indexed, so displacing along
 * per-face normals would tear the surface apart at every shared corner. A displacement that is a
 * function of position alone moves coincident vertices identically, so the wall stays watertight
 * while its faces gain the fibre texture the reference asks for. The depth coordinate is untouched,
 * which keeps the front and back faces of the band flat.
 */
export function roughenRadially(
  geometry: BufferGeometry,
  noise: SeededNoise,
  amplitude: number,
  frequency: number,
): BufferGeometry {
  const position = geometry.getAttribute('position');

  if (!(position instanceof BufferAttribute)) {
    throw new Error('roughenRadially requires a geometry with a position attribute');
  }

  const vertex = new Vector3();

  for (let i = 0; i < position.count; i += 1) {
    vertex.set(position.getX(i), position.getY(i), position.getZ(i));

    const scale =
      1 +
      amplitude *
        noise.noise3D(vertex.x * frequency, vertex.y * frequency, vertex.z * frequency);

    position.setXYZ(i, vertex.x * scale, vertex.y * scale, vertex.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

export function buildCellWall(
  overrides: Record<string, number | string | boolean> = {},
): OrganelleBuild {
  const params: CellWallParams = {
    ...CELL_WALL_PARAMS,
    ...(overrides as Partial<CellWallParams>),
  };
  const { size, detail, seed, thicknessRatio, depthRatio, noiseAmplitude } = params;

  const thickness = size * thicknessRatio;
  const depth = size * depthRatio;
  const cornerSegments = Math.max(2, Math.round(CELL_WALL_CORNER_SEGMENTS_PER_DETAIL * detail));
  const shape = cellWallShape(size, size + thickness, params, cornerSegments);
  const wall: BufferGeometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
    curveSegments: cornerSegments,
  });

  // Centre the band on the cell's depth origin so the wall wraps the cell evenly.
  wall.translate(0, 0, -depth / 2);
  roughenRadially(
    wall,
    createSeededNoise(`${seed}/texture`),
    noiseAmplitude,
    CELL_WALL_NOISE_FREQUENCY / size,
  );

  /*
   * Weld the extrusion and give it smooth normals.
   *
   * `ExtrudeGeometry` is non-indexed, so `computeVertexNormals` gives every triangle its **own**
   * normal — the whole band renders as a mosaic of flat facets, and the finer the corner arcs get,
   * the finer that mosaic gets. At the original six corner segments the seams read as a few broad
   * diagonal bands across the band's face; at fourteen they read as a visibly hatched surface. Both
   * are the same defect, and it is the *caps* that show it worst: `roughenRadially` makes the flat
   * annulus very slightly non-planar, so each of its triangles picks up a slightly different normal
   * and the shading steps from triangle to triangle.
   *
   * Welding first means coincident corner vertices share one normal, so the corner arcs shading as
   * curves is what the geometry actually is. `smoothGeometry` drops the UV attribute, which this
   * surface does not carry anything in — the wall is untextured.
   */
  const smoothed = smoothGeometry(wall);

  wall.dispose();

  return createBuild(
    [meshPart({ name: 'cell-wall', materialKey: 'cellWall', geometry: smoothed })],
    { ...params },
    seed,
  );
}
