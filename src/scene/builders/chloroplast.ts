import {
  Euler,
  LatheGeometry,
  Matrix4,
  Quaternion,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
} from 'three';
import {
  createBuild,
  createSeededNoise,
  instancedPart,
  mergeGeometryList,
  meshPart,
  ORGANELLE_PARAM_DEFAULTS,
  writeInstanceMatrix,
  type OrganelleBuild,
  type OrganelleParams,
  type OrganellePart,
} from './primitives';

/**
 * Chloroplast.
 *
 * Skill technique verbatim: a capsule/oval shell (`LatheGeometry`) plus flattened `TorusGeometry`
 * discs stacked into grana, with the **stack** instanced rather than every thylakoid membrane.
 *
 * **Anatomy note.** The teaching object here is the granum: a small pile of 4–6 disc-shaped
 * thylakoids. The reference shows the chloroplast as an **oval** (not a long capsule like the
 * mitochondrion) with grana carried inside the stroma. Three things carry that reading:
 *
 * 1. The shell is an ellipsoid about 2.2:1, so the silhouette is an oval and not a rod.
 * 2. Each granum is a real stack: `discsPerStack` flattened tori merged into **one** geometry,
 *    offset along the stack axis, and the whole stack is then instanced `granaStacks` times.
 *    A single draw call covers every granum in the organelle (skill: instance above ~20 repeats).
 * 3. The stacks are tilted a little off the long axis and scattered through the stroma with
 *    seeded jitter, because a row of perfectly parallel piles reads as a stamped pattern.
 *
 * **Honest limitations.** A chloroplast is a *bean* (a curved oval); this is the straight oval the
 * skill's capsule technique produces, so the bend is not modelled. The grana discs are also
 * exaggerated relative to a real chloroplast (a granum is a few percent of the organelle width),
 * because the fixture renders the whole organelle and a faithful ratio would be sub-pixel — the
 * same legibility trade the ribosome granules make. `granaStacks` is honoured exactly; the disc
 * count is per-stack and uniform, so the reference's 4–6 disc variation is approximated by the
 * per-instance scale jitter rather than by building several distinct stack geometries.
 *
 * Built along +Y, like the mitochondrion, so the long axis lands on screen horizontal.
 */

export interface ChloroplastParams extends OrganelleParams {
  /** Number of grana stacks carried in the stroma. */
  granaStacks: number;
  /** Discs (thylakoids) in each stack. */
  discsPerStack: number;
}

export const CHLOROPLAST_PARAMS: ChloroplastParams = {
  ...ORGANELLE_PARAM_DEFAULTS,
  // Showcase default: the fixture frames one scene unit, so the organelle reads as a close-up.
  // (The record is cell-scaled at `size: 0.42`; the fixture always renders builder defaults.)
  size: 1,
  detail: 1,
  count: 0,
  granaStacks: 5,
  discsPerStack: 5,
  seed: 'chloroplast/v1',
};

/** Total length along the long axis, per unit of `size`. An oval, not a rod. */
export const CHLOROPLAST_LENGTH_PER_SIZE = 2.4;
/** Shell radius (the short axis), per unit of `size`. */
export const CHLOROPLAST_RADIUS_PER_SIZE = 0.55;
/** Peak profile waver, as a fraction of the shell radius: a membrane, not a mathematical egg. */
export const CHLOROPLAST_PROFILE_WOBBLE = 0.03;

/**
 * Granum disc radius (the torus ring radius), as a fraction of the shell radius.
 *
 * Sized by packing, not by eye. Five near-cubic piles of this size only sit along the organelle
 * without merging if the derived axial limit below gives them a gap; at 0.2 they interpenetrated
 * by ~15%, which renders as one lumpy mass instead of five countable grana.
 */
export const GRANA_DISC_RADIUS_RATIO = 0.165;
/**
 * Disc tube radius, as a fraction of the disc radius.
 *
 * Deliberately near-degenerate: this is the difference between a granum and a spring. With a thin
 * tube a flattened torus is a *ring*, and a pile of rings renders as a coil. At 0.85 the hole
 * shrinks to ~8% of the outer radius, so the torus reads as a solid thylakoid plate and the pile
 * reads as a stack of discs — which is the organelle's entire teaching object.
 */
export const GRANA_DISC_TUBE_RATIO = 0.85;
/** Squash along the stack axis: at 0.3 a plate is roughly 3.6× wider than it is thick. */
export const GRANA_DISC_FLATTEN = 0.3;
/**
 * Pitch between two discs in a stack, as a multiple of one disc's flattened thickness.
 *
 * Chosen so a five-disc granum comes out roughly cubic — as tall as it is wide. Real grana are a
 * dense pile about one diameter tall, and the 50% gap between discs is what makes the pile
 * countable as separate discs, which is the whole point of the organelle's teaching object.
 */
export const GRANA_STACK_PITCH_RATIO = 1.5;
/**
 * Sideways stagger of a pile, as a fraction of the free depth.
 *
 * Small on purpose. A granum is nearly cubic, so its bounding-box corner reaches the disc radius
 * on every axis at once; the deeper the stagger, the less length is left before the corner
 * crosses the shell. Measured: a 0.72 stagger compressed the whole row by ~20% and let adjacent
 * piles touch. 0.25 gives enough diagonal separation without spending the length budget.
 */
export const GRANA_ROW_OFFSET = 0.4;
/** Fraction of the derived axial limit the row uses. At 1 the row is as long as the shell allows. */
export const GRANA_LENGTH_SPREAD = 1;
/** Sideways jitter of a pile inside its row, as a fraction of the free depth. */
export const GRANA_ROW_JITTER = 0.1;
/** Peak tilt of a stack axis away from the model X axis, in radians. */
export const GRANA_STACK_TILT = 0.28;
/**
 * Peak yaw of a stack about the vertical, in radians.
 *
 * **Not** a full turn. A stack whose axis swings onto the view axis is seen face-on, and a
 * face-on pile is one big plate that hides every disc behind it. A small yaw keeps every granum
 * close to edge-on, which is the only angle at which the discs are countable.
 */
export const GRANA_STACK_YAW = 0.45;
/**
 * Roll that stands a stack up on the model X axis.
 *
 * This is a legibility decision, not a stylistic one. The viewer's group rotation maps model X to
 * screen vertical and model Y to screen horizontal, so a stack built along Y renders as rings
 * seen end-on — a coil. Standing the piles up along X gives the textbook granum: discs stacked
 * vertically, countable at a glance.
 */
export const GRANA_STACK_STAND_UP = -Math.PI / 2;
/** Per-instance scale jitter, so no two grana piles are the same size. */
export const GRANA_SCALE_JITTER = 0.18;
/** Radial segments of one disc's ring, and per side of its tube — the simplify gate applies. */
export const GRANA_DISC_RING_SEGMENTS = 14;
export const GRANA_DISC_TUBE_SEGMENTS = 6;

/**
 * The shell's meridian from south pole to north pole: a seeded-wavered ellipsoid.
 *
 * Points run pole to pole so the revolved surface faces outward, and `x` stays non-negative.
 */
export function chloroplastProfile(
  radius: number,
  totalLength: number,
  segments: number,
  seed: string,
): Vector2[] {
  const noise = createSeededNoise(`${seed}/profile`);
  const steps = Math.max(8, Math.round(segments));
  const half = totalLength / 2;
  const points: Vector2[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const angle = -Math.PI / 2 + (i / steps) * Math.PI;
    const waver = 1 + CHLOROPLAST_PROFILE_WOBBLE * noise.noise3D(0, i * 0.29, 0.5);

    points.push(
      new Vector2(Math.max(0, Math.cos(angle) * radius * waver), Math.sin(angle) * half * waver),
    );
  }

  return points;
}

/** One thylakoid disc: a flattened torus, rotated so its axis lies on the local Y. */
export function granaDiscGeometry(discRadius: number, detail: number): BufferGeometry {
  const tube = discRadius * GRANA_DISC_TUBE_RATIO;
  const disc: BufferGeometry = new TorusGeometry(
    discRadius,
    tube,
    Math.max(4, Math.round(GRANA_DISC_TUBE_SEGMENTS * detail)),
    Math.max(8, Math.round(GRANA_DISC_RING_SEGMENTS * detail)),
  );

  // A torus is built in the XY plane with its axis on Z; turn the axis onto Y, then squash
  // along it. Squashing after the rotation keeps the flatten exactly on the stack axis.
  disc.rotateX(Math.PI / 2);
  disc.scale(1, GRANA_DISC_FLATTEN, 1);

  return disc;
}

/** One disc's flattened thickness, in scene units. */
export function granaDiscThickness(discRadius: number): number {
  return 2 * discRadius * GRANA_DISC_TUBE_RATIO * GRANA_DISC_FLATTEN;
}

/** The centre-to-centre pitch between two discs in a stack. */
export function granaStackPitch(discRadius: number): number {
  return granaDiscThickness(discRadius) * GRANA_STACK_PITCH_RATIO;
}

/** Total height of one stack along its own axis. */
export function granaStackHeight(discRadius: number, discs: number): number {
  const count = Math.max(1, Math.round(discs));

  return (count - 1) * granaStackPitch(discRadius) + granaDiscThickness(discRadius);
}

/**
 * One granum: `discs` flattened tori merged into a single geometry, centred on the origin with
 * the stack axis on Y. Instancing this one geometry is what keeps every granum in the organelle
 * inside **one** draw call.
 */
export function granaStackGeometry(
  discRadius: number,
  discs: number,
  detail: number,
): BufferGeometry {
  const count = Math.max(1, Math.round(discs));

  if (count === 1) {
    return granaDiscGeometry(discRadius, detail);
  }

  const pitch = granaStackPitch(discRadius);
  const geometries: BufferGeometry[] = [];

  for (let index = 0; index < count; index += 1) {
    const disc = granaDiscGeometry(discRadius, detail);

    disc.translate(0, (index - (count - 1) / 2) * pitch, 0);
    geometries.push(disc);
  }

  const merged = mergeGeometryList(geometries);

  for (const geometry of geometries) {
    if (geometry !== merged) {
      geometry.dispose();
    }
  }

  return merged;
}

export interface GranaPlacement {
  position: Vector3;
  /** Rotation standing the stack up on model X, tilted by its own seeded angles. */
  tilt: Euler;
  /** Uniform scale of this stack, 1 ± `GRANA_SCALE_JITTER`. */
  scale: number;
}

/**
 * Pulls a stack's centre toward the origin until its **whole** transformed bounding box sits
 * inside the shell's ellipsoid. Returns the fitted centre.
 *
 * Per-axis limits are not enough: each of a box's eight corners combines its three axes at once,
 * so a corner can leave an ellipsoid even when every coordinate is individually in range. This
 * solves the exact condition instead. Writing the ellipsoid as `f(p) = Σ (pᵢ/aᵢ)² ≤ 1`, a corner
 * at centre `s·c + o` gives a quadratic in the pull-back factor `s`; the largest root that keeps
 * every corner inside is the answer. The result is a hard geometric guarantee, not a margin.
 */
export function fitInsideEllipsoid(
  position: Vector3,
  tilt: Euler,
  scale: number,
  localHalfExtents: Vector3,
  semiAxes: Vector3,
): Vector3 {
  const rotation = new Matrix4().makeRotationFromEuler(tilt);
  const corners: Vector3[] = [];

  for (const x of [-localHalfExtents.x, localHalfExtents.x]) {
    for (const y of [-localHalfExtents.y, localHalfExtents.y]) {
      for (const z of [-localHalfExtents.z, localHalfExtents.z]) {
        corners.push(new Vector3(x, y, z).multiplyScalar(scale).applyMatrix4(rotation));
      }
    }
  }

  const a = semiAxes;
  let factor = 1;

  for (const corner of corners) {
    const quadratic =
      (position.x / a.x) ** 2 +
      (position.y / a.y) ** 2 +
      (position.z / a.z) ** 2;
    const linear =
      2 *
      ((position.x * corner.x) / a.x ** 2 +
        (position.y * corner.y) / a.y ** 2 +
        (position.z * corner.z) / a.z ** 2);
    const constant =
      (corner.x / a.x) ** 2 + (corner.y / a.y) ** 2 + (corner.z / a.z) ** 2;

    if (constant > 1) {
      // The stack itself is bigger than the shell; unsolvable, and the caller's parameters are
      // wrong rather than the placement. Leaving the centre put keeps the failure visible.
      continue;
    }

    if (quadratic <= 0) {
      continue;
    }

    const discriminant = Math.max(0, linear ** 2 - 4 * quadratic * (constant - 1));
    const root = (-linear + Math.sqrt(discriminant)) / (2 * quadratic);

    factor = Math.min(factor, Math.max(0, root));
  }

  return position.clone().multiplyScalar(Math.min(1, factor));
}

/**
 * Where each granum sits and how it leans.
 *
 * Each stack stands along the model's X axis — screen vertical — and the piles are laid out in a
 * **staggered two-row** pattern along the organelle's length. That is a packing decision, not a
 * decorative one: five vertical piles whose discs are a third of the shell's width only fit
 * without merging if the rows interleave. Free scattering was measured interpenetrating by ~35%
 * of a stack width, which renders as one lumpy mass instead of five countable grana.
 *
 * The seeded jitter keeps the rows from reading as a printed lattice, and every candidate is
 * finally passed through `fitInsideEllipsoid`, which pulls a pile toward the origin until its
 * real bounding box is inside the shell — so the containment guarantee is geometric rather than
 * a margin. The "stays inside the shell" and "does not interpenetrate" assertions in the test
 * suite re-measure both from the built instance matrices.
 */
export function granaStackPlacements(
  count: number,
  shellRadius: number,
  halfLength: number,
  discRadius: number,
  discs: number,
  seed: string,
): GranaPlacement[] {
  const stacks = Math.max(0, Math.round(count));

  if (stacks === 0) {
    return [];
  }

  const noise = createSeededNoise(`${seed}/grana-placement`);
  // The stack's own bounding box, before any rotation: the disc's outer radius across, half the
  // pile's height along its axis. The worst scale is used for the layout limits so the jitter
  // cannot push a row out of its measured slot.
  const outerRadius = discRadius * (1 + GRANA_DISC_TUBE_RATIO);
  const worstRadius = outerRadius * (1 + GRANA_SCALE_JITTER);
  const halfHeight = granaStackHeight(discRadius, discs) / 2;
  const localHalfExtents = new Vector3(outerRadius, halfHeight, outerRadius);
  // Fit against the *thinnest* shell the profile waver can produce, so a stack cannot poke
  // through a locally dipped wall even though its corners are inside the nominal ellipsoid.
  const semiAxes = new Vector3(shellRadius, halfLength, shellRadius).multiplyScalar(
    1 - CHLOROPLAST_PROFILE_WOBBLE,
  );
  const columns = stacks;
  const depthLimit = Math.max(0, shellRadius - worstRadius);
  // The furthest a pile centre may sit along the length, solved from the shell's own ellipsoid
  // for a pile whose bounding-box corner reaches `worstExtent` on every axis (a granum is nearly
  // cubic, so a rotation does not make any one axis cheaper). Deriving it here is what keeps the
  // row long enough for five piles to sit end to end without merging.
  const worstExtent =
    Math.max(localHalfExtents.x, localHalfExtents.y, localHalfExtents.z) *
    (1 + GRANA_SCALE_JITTER);
  const axialLimit = Math.max(
    0,
    semiAxes.y *
      Math.sqrt(
        Math.max(
          0,
          1 - (worstExtent / semiAxes.x) ** 2 - (worstExtent / semiAxes.z) ** 2,
        ),
      ) -
      worstExtent,
  );
  const placements: GranaPlacement[] = [];

  for (let index = 0; index < stacks; index += 1) {
    // Uniform slots along the length with the depth alternating every slot: adjacent piles are
    // separated diagonally, which is what keeps them from merging while still filling the stroma.
    const slot = (index + 0.5) / columns;
    const row = index % 2;
    const along = (slot - 0.5) * 2 * axialLimit * GRANA_LENGTH_SPREAD;
    const depth =
      (row === 0 ? -1 : 1) * depthLimit * GRANA_ROW_OFFSET +
      (noise.random() * 2 - 1) * depthLimit * GRANA_ROW_JITTER;
    const height = (noise.random() * 2 - 1) * depthLimit * GRANA_ROW_JITTER;
    const scale = 1 - GRANA_SCALE_JITTER + noise.random() * GRANA_SCALE_JITTER * 2;
    const tilt = new Euler(
      (noise.random() * 2 - 1) * GRANA_STACK_TILT,
      (noise.random() * 2 - 1) * GRANA_STACK_YAW,
      GRANA_STACK_STAND_UP + (noise.random() * 2 - 1) * GRANA_STACK_TILT,
    );
    const candidate = new Vector3(height, along, depth);

    placements.push({
      position: fitInsideEllipsoid(candidate, tilt, scale, localHalfExtents, semiAxes),
      tilt,
      scale,
    });
  }

  return placements;
}

export function buildChloroplast(
  overrides: Record<string, number | string | boolean> = {},
): OrganelleBuild {
  const params: ChloroplastParams = {
    ...CHLOROPLAST_PARAMS,
    ...(overrides as Partial<ChloroplastParams>),
  };
  const { size, detail, seed } = params;
  const stacks = Math.max(0, Math.round(params.granaStacks));
  const discs = Math.max(1, Math.round(params.discsPerStack));

  const totalLength = CHLOROPLAST_LENGTH_PER_SIZE * size;
  const radius = CHLOROPLAST_RADIUS_PER_SIZE * size;
  const halfLength = totalLength / 2;
  const profileSegments = Math.max(12, Math.round(24 * detail));
  const radialSegments = Math.max(16, Math.round(48 * detail));

  const parts: OrganellePart[] = [];

  const shell: BufferGeometry = new LatheGeometry(
    chloroplastProfile(radius, totalLength, profileSegments, seed),
    radialSegments,
  );

  shell.computeVertexNormals();
  parts.push(meshPart({ name: 'chloroplast-envelope', materialKey: 'chloroplast', geometry: shell }));

  if (stacks > 0) {
    const discRadius = radius * GRANA_DISC_RADIUS_RATIO;
    const placements = granaStackPlacements(
      stacks,
      radius,
      halfLength,
      discRadius,
      discs,
      seed,
    );
    const matrices = new Float32Array(placements.length * 16);
    const matrix = new Matrix4();
    const quaternion = new Quaternion();
    const scale = new Vector3(1, 1, 1);

    placements.forEach((placement, index) => {
      quaternion.setFromEuler(placement.tilt);
      scale.setScalar(placement.scale);
      matrix.compose(placement.position, quaternion, scale);
      writeInstanceMatrix(matrices, index, matrix);
    });

    parts.push(
      instancedPart({
        name: 'grana-stacks',
        materialKey: 'grana',
        geometry: granaStackGeometry(discRadius, discs, detail),
        instanceCount: placements.length,
        matrices,
      }),
    );
  }

  return createBuild(parts, { ...params, granaStacks: stacks, discsPerStack: discs }, seed);
}
