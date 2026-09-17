import {
  CatmullRomCurve3,
  ExtrudeGeometry,
  LatheGeometry,
  Shape,
  Vector2,
  Vector3,
  type BufferGeometry,
} from 'three';
import {
  createSeededNoise,
  createBuild,
  meshPart,
  ORGANELLE_PARAM_DEFAULTS,
  type OrganelleBuild,
  type OrganelleParams,
  type OrganellePart,
} from './primitives';

/**
 * Mitochondrion.
 *
 * Technique comes from the project skill's decision table verbatim: a `LatheGeometry`
 * capsule for the smooth outer membrane, and `ExtrudeGeometry` with `extrudePath` for each
 * crista, because cristae are folds of the inner membrane and must be **real surfaces** —
 * a textured or noise-bumped shell could not be isolated and animated by the respiration
 * process in M2.
 *
 * **Cristae correction (task 3.5).** The M0 cristae were neat, evenly spaced, coplanar plates:
 * every fold spanned the same full chord in the same plane with the same wave, which reads as a
 * radiator and teaches the wrong shape. Four properties were wrong and all four are fixed here:
 *
 * 1. **Orientation.** Each fold is now rotated about the long axis by its own seeded angle, so
 *    the folds are no longer coplanar.
 * 2. **Extent.** Each fold starts at the inner membrane and stops at its own seeded depth
 *    (0.06–0.50 of the radius) instead of spanning the full diameter, so the "comb" of equal
 *    chords is gone.
 * 3. **Profile.** Each fold undulates in two directions — laterally within the cross-section
 *    and along the axis — with its own frequency, phase and amplitude, tapered to zero at the
 *    wall so the attachment stays clean.
 * 4. **Spacing.** Axial positions carry a seeded jitter of up to ±35% of the fold pitch.
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

/** Control points in each fold's centreline. */
export const CRISTA_SURFACE_SAMPLES = 8;
/** Fraction of the straight body over which folds are distributed. */
export const CRISTA_SPREAD = 0.82;
/** How far along the radius a fold's attached end reaches; it meets the inner membrane. */
export const CRISTA_WALL_REACH = 0.9;
/** Shortest and longest free reach of a fold, as a fraction of the radius. */
export const CRISTA_FREE_MIN = 0.24;
export const CRISTA_FREE_MAX = 0.46;
/** Per-fold width spread, as a fraction of `CRISTA_WIDTH_RATIO`. No two folds are the same width. */
export const CRISTA_WIDTH_JITTER = 0.28;
/** Fold width across the cross-section, as a fraction of the radius. */
export const CRISTA_WIDTH_RATIO = 0.34;
/** Fold sheet thickness, as a fraction of the radius. */
export const CRISTA_THICKNESS_RATIO = 0.05;
/** Peak lateral (cross-section) undulation of a fold centreline, before per-fold jitter. */
export const CRISTA_LATERAL_WOBBLE_RATIO = 0.14;
/** Peak axial undulation of a fold centreline, before per-fold jitter. */
export const CRISTA_AXIAL_WOBBLE_RATIO = 0.1;
/** Peak axial position jitter, as a fraction of one fold pitch. */
export const CRISTA_AXIAL_JITTER = 0.7;

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
 * The centre line of one crista, expressed in the capsule's own frame and already rotated
 * about the long axis.
 *
 * The fold leaves the inner membrane at `CRISTA_WALL_REACH` of the radius in its own seeded
 * direction, crosses the interior, and stops at its own seeded free reach on the far side. Its
 * undulation is tapered to zero at both ends, so the wall attachment stays clean and the
 * snake lives in the middle of the fold — which is where the reference shows it.
 */
export function cristaPath(
  index: number,
  cristaeCount: number,
  straightHalfLength: number,
  radius: number,
  seed: string,
): CatmullRomCurve3 {
  // A per-fold stream, so inserting or removing a fold does not re-roll the others.
  const noise = createSeededNoise(`${seed}/crista-${index}`);
  const span = straightHalfLength * CRISTA_SPREAD;
  const pitch = cristaeCount > 1 ? (2 * span) / cristaeCount : 0;
  const baseY = cristaeCount > 1 ? -span + ((index + 0.5) / cristaeCount) * 2 * span : 0;

  const centreY = baseY + (noise.random() - 0.5) * pitch * CRISTA_AXIAL_JITTER;
  const turn = noise.random() * Math.PI * 2;
  const wallReach = radius * CRISTA_WALL_REACH;
  const freeReach =
    radius * (CRISTA_FREE_MIN + noise.random() * (CRISTA_FREE_MAX - CRISTA_FREE_MIN));

  const lateralAmplitude =
    radius * CRISTA_LATERAL_WOBBLE_RATIO * (0.6 + noise.random() * 0.7);
  const lateralFrequency = 1.2 + noise.random() * 1.8;
  const lateralPhase = noise.random() * Math.PI * 2;

  const axialAmplitude = radius * CRISTA_AXIAL_WOBBLE_RATIO * (0.6 + noise.random() * 0.4);
  const axialFrequency = 1.1 + noise.random() * 1.3;
  const axialPhase = noise.random() * Math.PI * 2;

  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const points: Vector3[] = [];

  for (let i = 0; i <= CRISTA_SURFACE_SAMPLES; i += 1) {
    const u = i / CRISTA_SURFACE_SAMPLES;
    // Zero at both ends, maximal mid-fold: the fold meets the wall without a lateral step.
    const taper = Math.sin(Math.PI * u);
    const x = -wallReach + u * (wallReach + freeReach);
    const z = taper * lateralAmplitude * Math.sin(lateralPhase + lateralFrequency * Math.PI * u);
    const y = centreY + taper * axialAmplitude * Math.sin(axialPhase + axialFrequency * Math.PI * u);

    // Rotating here rather than on the mesh keeps the radius bound the tests check.
    points.push(new Vector3(x * cos + z * sin, y, -x * sin + z * cos));
  }

  return new CatmullRomCurve3(points, false, 'centripetal', 0.5);
}

/** Segments per capped end of a fold's cross-section. */
export const CRISTA_CAP_SEGMENTS = 4;

/**
 * A fold's cross-section: a rounded bar, swept along a curve.
 *
 * The shape's x maps to the Frenet normal and its y to the binormal, so for a mostly-radial path
 * this yields a vertical sheet of width `widthRatio * radius * widthScale` and thickness
 * `thicknessRatio * radius`.
 *
 * The ends are rounded rather than square on purpose: a rectangle's end cap is a flat cut, and a
 * dozen flat cuts read as tabs stacked in a housing — which is the M0 problem in a new costume.
 * A rounded cap reads as the free edge of a fold.
 *
 * `widthScale` is per-fold: identical widths were also part of what made the M0 folds look
 * stamped from one plate.
 */
export function cristaShape(radius: number, widthScale = 1): Shape {
  const halfWidth = (radius * CRISTA_WIDTH_RATIO * widthScale) / 2;
  const halfThickness = (radius * CRISTA_THICKNESS_RATIO) / 2;
  const capRadius = Math.min(halfThickness, halfWidth * 0.5);
  const straightHalf = Math.max(0, halfWidth - capRadius);
  const steps = Math.max(2, Math.round(CRISTA_CAP_SEGMENTS));
  const shape = new Shape();
  const outline: [number, number][] = [];

  // Right cap, bottom to top, then the left cap, top to bottom: one counter-clockwise loop.
  for (let i = 0; i <= steps; i += 1) {
    const angle = -Math.PI / 2 + (i / steps) * Math.PI;

    outline.push([
      straightHalf + capRadius * Math.cos(angle),
      capRadius * Math.sin(angle),
    ]);
  }

  for (let i = 0; i <= steps; i += 1) {
    const angle = Math.PI / 2 + (i / steps) * Math.PI;

    outline.push([
      -straightHalf + capRadius * Math.cos(angle),
      capRadius * Math.sin(angle),
    ]);
  }

  shape.moveTo(outline[0]![0], outline[0]![1]);

  for (const [x, y] of outline.slice(1)) {
    shape.lineTo(x, y);
  }

  shape.closePath();

  return shape;
}

/** One fold's width multiplier, from its own seeded stream: 1 ± `CRISTA_WIDTH_JITTER`. */
export function cristaWidthScale(index: number, seed: string): number {
  const noise = createSeededNoise(`${seed}/crista-${index}/width`);

  return 1 + (noise.random() * 2 - 1) * CRISTA_WIDTH_JITTER;
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

  const shell: BufferGeometry = new LatheGeometry(
    capsuleProfile(totalLength, radius, capSegments),
    radialSegments,
  );

  shell.computeVertexNormals();
  parts.push(meshPart({ name: 'outer-membrane', materialKey: 'outerMembrane', geometry: shell }));

  // Enough steps that the swept fold edge reads as a curve, not a staircase.
  const pathSteps = Math.max(8, Math.round(40 * detail));

  for (let i = 0; i < cristaeCount; i += 1) {
    const path = cristaPath(i, cristaeCount, straightHalfLength, radius, seed);
    const crista = new ExtrudeGeometry(cristaShape(radius, cristaWidthScale(i, seed)), {
      extrudePath: path,
      steps: pathSteps,
      bevelEnabled: false,
    });

    crista.computeVertexNormals();
    parts.push(meshPart({ name: `crista-${i}`, materialKey: 'innerMembrane', geometry: crista }));
  }

  return createBuild(parts, { ...params, cristaeCount }, seed);
}
