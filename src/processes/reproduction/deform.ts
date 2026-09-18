import { BufferAttribute, type BufferGeometry } from 'three';

/**
 * The equatorial pinch: the animal cell's cleavage furrow, as a vertex write (task 6.4).
 *
 * Animal cytokinesis pinches the cell inward with a contractile ring, and the pinching has to be
 * *visible on the cell's own boundary* — a decorative ring drawn in front of an unchanged sphere
 * would not be the mechanism the spec asks a viewer to contrast against the plant cell's plate.
 * So the process borrows the boundary shells' geometry for the duration of the sequence, writes a
 * pinched pose into it, and restores the rest pose when it is disposed. That borrow-and-restore is
 * stated rather than hidden: `deform.test.ts` asserts the restore is exact, and the exit path in
 * `reproduction.spec.ts` asserts the base viewer comes back.
 *
 * **Why a vertex write is the honest technique here, when the skill forbids CPU mesh deformation.**
 * The skill's ban is about *continuous, parameter-driven* motion (cyclosis, molecule flow, the light
 * response), which must be GPU-side or it becomes a per-frame CPU cost forever. This is the other
 * paradigm: a scripted, scrubbable, reversible keyframe — the category the skill assigns to GSAP
 * timelines. It is a few thousand vertices, rewritten only when the pinch value actually changes
 * (the caller guards on a delta), and it stops entirely outside the cytokinesis band.
 *
 * The pinch is a function of the vertex's own local `y`, which is the cell's equatorial axis: the
 * model's equator plane is `y = 0`, so the furrow is a horizontal waist across the cell and the
 * chromosomes' spindle axis (`chromosomes.ts`) is the same axis. That is what makes the two
 * mechanisms comparable side by side rather than two unrelated animations.
 */

export interface RestPose {
  readonly geometry: BufferGeometry;
  /** The geometry's own vertex positions as the builder produced them. */
  readonly positions: Float32Array;
}

/** Deepest narrowing at the equator, as a fraction of the resting radius. 0.45 ⇒ 45% narrower. */
export const PINCH_DEPTH = 0.45;
/** How far from the equator the pinch reaches, in scene units. */
export const PINCH_SIGMA = 0.3;
/**
 * The daughter lobes bulge as the waist closes: a cell that only ever got thinner at the equator
 * would read as a sphere being squashed. Measured against the whole cell radius of 1.
 */
export const BULGE_DEPTH = 0.06;
export const BULGE_CENTRE = 0.62;
export const BULGE_SIGMA = 0.24;

export interface PinchOptions {
  pinchDepth: number;
  pinchSigma: number;
  bulgeDepth: number;
  bulgeCentre: number;
  bulgeSigma: number;
}

export const DEFAULT_PINCH: PinchOptions = {
  pinchDepth: PINCH_DEPTH,
  pinchSigma: PINCH_SIGMA,
  bulgeDepth: BULGE_DEPTH,
  bulgeCentre: BULGE_CENTRE,
  bulgeSigma: BULGE_SIGMA,
};

/**
 * The radial scale one vertex takes at `height`, for a pinch of `amount` in `[0, 1]`.
 *
 * Exported because it is the *shape* of the mechanism, and a unit test can assert its three
 * defining properties without a renderer: it is 1 at `amount = 0`, it is smallest at the equator,
 * and at full depth the equator is `1 - pinchDepth` of the resting radius.
 */
export function pinchFactor(
  height: number,
  amount: number,
  options: PinchOptions = DEFAULT_PINCH,
): number {
  if (!(amount > 0)) {
    return 1;
  }

  // Clamped rather than trusted: an amount above 1 would invert the waist and fold the surface
  // through itself, which reads as a corrupt mesh rather than as an animation error.
  const depth = Math.min(1, amount);
  const waist = Math.exp(-((height / options.pinchSigma) ** 2));
  const bulge = Math.exp(-(((Math.abs(height) - options.bulgeCentre) / options.bulgeSigma) ** 2));

  return 1 - options.pinchDepth * depth * waist + options.bulgeDepth * depth * bulge;
}

/** Captures a geometry's rest pose so it can be restored exactly. */
export function captureRestPose(geometry: BufferGeometry): RestPose {
  const attribute = geometry.getAttribute('position');

  if (!(attribute instanceof BufferAttribute)) {
    throw new Error('captureRestPose needs a geometry with a position attribute');
  }

  return { geometry, positions: Float32Array.from(attribute.array as ArrayLike<number>) };
}

/** Writes the resting positions back and refreshes the derived state. */
export function restoreRestPose(rest: RestPose): void {
  const attribute = rest.geometry.getAttribute('position');

  if (!(attribute instanceof BufferAttribute)) {
    return;
  }

  attribute.array.set(rest.positions);
  attribute.needsUpdate = true;
  rest.geometry.computeVertexNormals();
  rest.geometry.computeBoundingSphere();
}

/**
 * The cell's radial half-extent on its equatorial band, from a captured rest pose.
 *
 * The cell plate has to reach the boundary the cell actually has, and the plant cell's boundary is a
 * rounded polygon whose corners reach further than its flats. Measuring the band rather than trusting
 * a builder constant is what lets the plate meet the wall in both cells without a second copy of the
 * number — the same reason the disassembly travel distance is computed from built geometry.
 */
export function equatorialRadius(rest: RestPose, band = 0.12): number {
  let radius = 0;

  for (let index = 0; index < rest.positions.length; index += 3) {
    const y = rest.positions[index + 1] ?? 0;

    if (Math.abs(y) > band) {
      continue;
    }

    const x = rest.positions[index] ?? 0;
    const z = rest.positions[index + 2] ?? 0;

    radius = Math.max(radius, Math.hypot(x, z));
  }

  return radius;
}

/**
 * Writes the pinched pose for `amount` in `[0, 1]`.
 *
 * Only `x` and `z` are scaled, so every vertex keeps its height: the cell narrows at the waist
 * instead of stretching along its axis, which is what a cleavage furrow does. `amount <= 0` means
 * "no furrow" and is handled by restoring the rest pose, so a caller that scrubs back out of the
 * cytokinesis band cannot leave a half-closed waist behind.
 */
export function writeEquatorialPinch(
  rest: RestPose,
  amount: number,
  options: PinchOptions = DEFAULT_PINCH,
): void {
  const attribute = rest.geometry.getAttribute('position');

  if (!(attribute instanceof BufferAttribute)) {
    return;
  }

  if (amount <= 0) {
    restoreRestPose(rest);

    return;
  }

  const source = rest.positions;

  for (let index = 0; index < attribute.count; index += 1) {
    const offset = index * 3;
    const x = source[offset] ?? 0;
    const y = source[offset + 1] ?? 0;
    const z = source[offset + 2] ?? 0;
    const factor = pinchFactor(y, amount, options);

    attribute.setXYZ(index, x * factor, y, z * factor);
  }

  attribute.needsUpdate = true;
  rest.geometry.computeVertexNormals();
  // The shells' bounding spheres drive culling, and a pinched cell is a different size.
  rest.geometry.computeBoundingSphere();
}
