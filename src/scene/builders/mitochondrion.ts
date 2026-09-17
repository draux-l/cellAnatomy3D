import {
  CatmullRomCurve3,
  ExtrudeGeometry,
  LatheGeometry,
  Shape,
  Vector2,
  Vector3,
} from 'three';
import {
  createBuild,
  createSeededNoise,
  meshPart,
  ORGANELLE_PARAM_DEFAULTS,
  type OrganelleBuild,
  type OrganelleParams,
  type OrganellePart,
} from './primitives';

/**
 * Mitochondrion — the M0 organelle.
 *
 * Technique comes from the project skill's decision table verbatim: a `LatheGeometry`
 * capsule for the smooth outer membrane, and `ExtrudeGeometry` with `extrudePath` for each
 * crista, because cristae are folds of the inner membrane and must be **real surfaces** —
 * a textured or noise-bumped shell could not be isolated and animated by the respiration
 * process in M2.
 *
 * Built along +Y; the viewer rotates the group so the long axis lies on X.
 */

export interface MitochondrionParams extends OrganelleParams {
  /** Number of inner-membrane folds. Structure-specific, per the parameter convention. */
  cristaeCount: number;
}

export const MITOCHONDRION_PARAMS: MitochondrionParams = {
  ...ORGANELLE_PARAM_DEFAULTS,
  seed: 'mitochondrion/v1',
  cristaeCount: 12,
};

/**
 * Total length along the long axis, per unit of `size`.
 * Kept at ~2.6 : 1 over the radius so the organelle reads as an elongated capsule rather
 * than a blob — and so the straight body (not the caps) is where the cristae live.
 */
export const MITOCHONDRION_LENGTH_PER_SIZE = 2.5;
/** Capsule radius, per unit of `size`. */
export const MITOCHONDRION_RADIUS_PER_SIZE = 0.48;

export const CRISTA_SURFACE_SAMPLES = 5;
/** Fraction of the straight body that the crista stack spans. */
export const CRISTA_SPREAD = 0.86;
/** Fraction of the capsule radius the cristae reach across at their widest. */
export const CRISTA_INNER_RADIUS = 0.72;
/** Crista sheet height, as a fraction of the capsule radius. */
export const CRISTA_HEIGHT_RATIO = 0.5;
/** Crista sheet thickness, as a fraction of the capsule radius. */
export const CRISTA_THICKNESS_RATIO = 0.04;

/**
 * Capsule silhouette for `LatheGeometry`.
 *
 * Points run from the south pole to the north pole so the revolved surface faces outward;
 * the straight body is the jump between the two equator points.
 */
export function capsuleProfile(totalLength: number, radius: number, capSegments: number): Vector2[] {
  const segments = Math.max(4, Math.round(capSegments));
  const half = Math.max(0, (totalLength - 2 * radius) / 2);
  const points: Vector2[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * (Math.PI / 2);
    points.push(new Vector2(Math.sin(angle) * radius, -half - Math.cos(angle) * radius));
  }

  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * (Math.PI / 2);
    points.push(new Vector2(Math.cos(angle) * radius, half + Math.sin(angle) * radius));
  }

  return points;
}

/**
 * The centre line of one crista: a wavy fold reaching across the interior, its ends bowing
 * toward whichever pole it sits nearer. Seeded, so the same record always folds the same way.
 */
export function cristaPath(
  index: number,
  cristaeCount: number,
  straightHalfLength: number,
  radius: number,
  seed: string,
): CatmullRomCurve3 {
  const noise = createSeededNoise(seed);
  const innerRadius = radius * CRISTA_INNER_RADIUS;
  const span = straightHalfLength * CRISTA_SPREAD;
  const centreY = cristaeCount > 1 ? -span + ((index + 0.5) / cristaeCount) * 2 * span : 0;
  const bowDirection = centreY >= 0 ? 1 : -1;
  const points: Vector3[] = [];

  for (let i = 0; i <= CRISTA_SURFACE_SAMPLES; i += 1) {
    const u = i / CRISTA_SURFACE_SAMPLES;
    const x = -innerRadius + u * 2 * innerRadius;
    const wobble = noise.noise3D(index * 1.37 + u * 2.2, u * 1.1, index * 0.41) * radius * 0.12;
    const bow = (Math.abs(u - 0.5) * 2) ** 2 * radius * 0.2 * bowDirection;

    points.push(new Vector3(x, centreY + wobble + bow, 0));
  }

  return new CatmullRomCurve3(points, false, 'centripetal', 0.5);
}

/**
 * A thin rectangle swept along a curve. The shape's x maps to the Frenet normal and its y
 * to the binormal, so for a mostly-X path this yields a vertical sheet of height
 * `heightRatio * radius` and thickness `thicknessRatio * radius`.
 */
export function cristaShape(radius: number): Shape {
  const halfHeight = (radius * CRISTA_HEIGHT_RATIO) / 2;
  const halfThickness = (radius * CRISTA_THICKNESS_RATIO) / 2;
  const shape = new Shape();

  shape.moveTo(-halfHeight, -halfThickness);
  shape.lineTo(halfHeight, -halfThickness);
  shape.lineTo(halfHeight, halfThickness);
  shape.lineTo(-halfHeight, halfThickness);
  shape.closePath();

  return shape;
}

export function buildMitochondrion(
  overrides: Record<string, number | string | boolean> = {},
): OrganelleBuild {
  const params: MitochondrionParams = {
    ...MITOCHONDRION_PARAMS,
    ...(overrides as Partial<MitochondrionParams>),
  };
  const { size, detail, seed } = params;
  const cristaeCount = Math.max(0, Math.round(params.cristaeCount));

  const totalLength = MITOCHONDRION_LENGTH_PER_SIZE * size;
  const radius = MITOCHONDRION_RADIUS_PER_SIZE * size;
  const straightHalfLength = Math.max(0, (totalLength - 2 * radius) / 2);
  const capSegments = Math.max(4, Math.round(8 * detail));
  const radialSegments = Math.max(12, Math.round(48 * detail));

  const parts: OrganellePart[] = [];

  const shell = new LatheGeometry(capsuleProfile(totalLength, radius, capSegments), radialSegments);
  shell.computeVertexNormals();
  parts.push(meshPart({ name: 'outer-membrane', materialKey: 'outerMembrane', geometry: shell }));

  const shape = cristaShape(radius);
  // Enough steps that the swept fold edge reads as a curve, not a staircase.
  const pathSteps = Math.max(6, Math.round(24 * detail));

  for (let i = 0; i < cristaeCount; i += 1) {
    const path = cristaPath(i, cristaeCount, straightHalfLength, radius, seed);
    const crista = new ExtrudeGeometry(shape, {
      extrudePath: path,
      steps: pathSteps,
      bevelEnabled: false,
    });
    crista.computeVertexNormals();
    parts.push(meshPart({ name: `crista-${i}`, materialKey: 'innerMembrane', geometry: crista }));
  }

  return createBuild(parts, { ...params, cristaeCount }, seed);
}
