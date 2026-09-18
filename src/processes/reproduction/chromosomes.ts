import { bandProgress, clamp01, mix, smoothstep } from '../curve';
import { MITOSIS_BANDS } from './stages';

/**
 * Where the chromatids are, at any progress (task 6.2).
 *
 * This module is the **enforcement of the cited biology**, and it is pure numbers on purpose. The
 * spec's requirement is structural — *"the chromosomes shown aligned at the equator separate into
 * two groups moving to opposite poles; the render does not show chromatids separating before
 * metaphase"* — so it is checked as a structural assertion over these functions rather than by
 * looking at a screenshot. The animation writes exactly what these functions return, and
 * `chromosomes.test.ts` asserts the properties directly (and over the whole domain, not at samples).
 *
 * The three facts the keyframes enforce:
 *
 * 1. **Condensation.** Through prophase the chromatids are short threads that condense into bodies;
 *    they stay condensed from metaphase onward.
 * 2. **Alignment.** By the middle of the metaphase band the chromatids lie on the cell's equator
 *    plane — a row in that plane — and they were already travelling there from late prophase.
 * 3. **Separation, and only after metaphase.** The sister pair holds a fixed resting gap for every
 *    progress below `MITOSIS_BANDS.anaphase.start`, and parts *only* inside the anaphase band. That
 *    is a property of the curve, not of a callback: there is no event that could fire on a rewind,
 *    because nothing here has state.
 *
 * Nothing here imports three.js, so the copy that explains these phases to a user can live in the
 * shell beside them.
 */

/**
 * Chromosomes per nucleus in this model. A legibility count, not a species count.
 *
 * Four rather than six, and the reduction was made after inspecting the first committed frames.
 * Human cells have 46 chromosomes; any small number here is schematic, so the only question the
 * count answers is *how many bodies can be told apart at the framing this app offers*. At the
 * cell-scale close-up six rods spaced across the equator merged into one magenta bar — which teaches
 * the opposite of "the chromosomes align along the equator" — while four read as four.
 */
export const CHROMOSOME_COUNT = 4;
export const CHROMATIDS_PER_CHROMOSOME = 2;
export const CHROMATID_COUNT = CHROMOSOME_COUNT * CHROMATIDS_PER_CHROMOSOME;

/**
 * The gap between the two sister chromatids before they separate, in scene units.
 *
 * Not zero, and deliberately: two coincident meshes z-fight, and a chromosome that flickers between
 * frames reads as a rendering fault rather than as one body. 0.024 against a cell radius of 1 is
 * about a third of the chromatid's own width, so the pair reads as one condensed chromosome while
 * the separation metric below can still tell "not yet separated" apart from "separated".
 */
export const SISTER_REST_GAP = 0.024;

/** How far each daughter's chromatids travel from the equator, in scene units. */
export const POLE_DISTANCE = 0.6;

/** Half the width of the metaphase plate's row, in scene units. */
export const PLATE_ROW_HALF_WIDTH = 0.26;
/**
 * Half the depth of the metaphase plate, in scene units.
 *
 * Tight on purpose: the plate is a *row* in the spec's own words ("align along the cell's equator"),
 * and depth spread turns a row into a scatter as soon as the camera is off-axis.
 */
export const PLATE_DEPTH_HALF = 0.08;

/**
 * How far the prophase scatter reaches inside the nuclear envelope, as a fraction of its radius.
 *
 * Below 1 on purpose: the spec's prophase is the stage *before* the envelope breaks down, so a
 * chromosome poking out of the nucleus would be teaching an event that has not happened yet.
 */
export const PROPHASE_CLUSTER_RADIUS_RATIO = 0.62;

/**
 * The chromatid's own size, in scene units.
 *
 * Sized against the framing the committed close-up uses, not against the cell: at the cell scale a
 * chromatid is only a few pixels, and the first inspected pass read as a smudge rather than as a
 * body. Length and radius are roughly 4:1 — a rod, not a bead — so a spaced row of them is
 * countable.
 */
export const CHROMATID_LENGTH = 0.16;
export const CHROMATID_RADIUS = 0.038;

/** How far a chromatid is condensed at the very start of prophase, as a fraction of its final size. */
export const PROPHASE_THREAD_SCALE = 0.42;

/**
 * Anaphase's own separation ramp, as a fraction of the sequence.
 *
 * The sisters must be fully parted well before the band ends, because the *last* of anaphase is
 * where the two daughter groups are seen travelling — a ramp that ran to the band's end would spend
 * the phase's most legible moment still moving the sisters apart rather than carrying them to the
 * poles.
 */
export const ANAPHASE_SEPARATION_SPAN = 0.14;

/** How far the two groups draw in toward their own pole by the end of telophase. */
export const TELOPHASE_CONDENSE_FRACTION = 0.85;

/**
 * The separation at which the daughters count as two groups rather than one, in scene units.
 *
 * Half the pole distance: at that point the two centroids are far enough apart that a viewer sees
 * two bodies, and the reading is stable against the resting gap (`SISTER_REST_GAP` is an order of
 * magnitude below it).
 */
export const GROUPS_SEPARATED_DISTANCE = POLE_DISTANCE * 0.5;

export interface ChromosomeSpace {
  /** The nuclear envelope's centre, in the process object's own (cell) space. */
  readonly centre: { x: number; y: number; z: number };
  /** The nuclear envelope's radius, read from the built geometry. */
  readonly radius: number;
}

export interface ChromatidPlacement {
  x: number;
  y: number;
  z: number;
  /** Uniform scale: the condensation state of the chromatid. */
  scale: number;
  /** Rotation about Z of the chromatid's long axis, in radians. */
  yaw: number;
}

/** Which chromosome a chromatid belongs to. Two consecutive indices are one pair. */
export function chromosomeIndexOf(chromatid: number): number {
  return Math.floor(chromatid / CHROMATIDS_PER_CHROMOSOME);
}

/** Which daughter a chromatid belongs to: `+1` or `-1`. */
export function chromatidSide(chromatid: number): number {
  return chromatid % CHROMATIDS_PER_CHROMOSOME === 0 ? 1 : -1;
}

/**
 * The deterministic scatter of one chromosome inside the prophase nucleus.
 *
 * Deterministic by construction — a golden-angle spiral, not `Math.random()` — because the same
 * phase has to look identical on every load, in every cell and inside every fixture (spec:
 * `Deterministic Scene Reconstruction`).
 */
function prophaseScatter(chromosome: number, radius: number): { x: number; y: number; z: number } {
  const golden = 2.399963229728653;
  const angle = chromosome * golden;
  const ring = radius * (0.42 + 0.58 * ((chromosome % 3) / 2));

  return {
    x: Math.cos(angle) * ring * 0.7,
    y: Math.sin(angle) * ring * 0.45,
    z: Math.sin(angle * 1.7) * ring * 0.55,
  };
}

/** The x position of one chromosome on the metaphase plate: a row across the equator. */
function plateRowOffset(chromosome: number): number {
  const span = (CHROMOSOME_COUNT - 1) / 2;

  return ((chromosome - span) / span) * PLATE_ROW_HALF_WIDTH;
}

/** The z position of one chromosome on the plate: the plate has depth as well as a row. */
function plateDepthOffset(chromosome: number): number {
  const span = (CHROMOSOME_COUNT - 1) / 2;
  const step = span === 0 ? 0 : (chromosome - span) / span;

  return step * PLATE_DEPTH_HALF;
}

/**
 * How far the sisters have parted, as `[0, 1]`.
 *
 * Identically zero for every progress below the anaphase band. Exported because the two daughter
 * nuclei that form at telophase have to sit on the groups they enclose, and deriving their placement
 * from this same curve is what stops the envelope and the chromosomes from drifting apart.
 */
export function separationAmount(progress: number): number {
  return bandProgress(
    MITOSIS_BANDS.anaphase.start,
    MITOSIS_BANDS.anaphase.start + ANAPHASE_SEPARATION_SPAN,
    progress,
  );
}

/** The distance of one daughter's chromatids from the equator, in scene units, at `progress`. */
export function daughterOffset(progress: number): number {
  const separation = separationAmount(progress);

  return SISTER_REST_GAP / 2 + separation * (POLE_DISTANCE - SISTER_REST_GAP / 2);
}

/**
 * Every chromatid's placement at one progress value.
 *
 * The order is stable: chromatids `2i` and `2i + 1` are the two sisters of chromosome `i`, and the
 * structural assertions rely on that.
 */
export function chromatidPlacements(
  progress: number,
  space: ChromosomeSpace,
): ChromatidPlacement[] {
  const value = clamp01(progress);
  const clusterRadius = Math.max(0, space.radius) * PROPHASE_CLUSTER_RADIUS_RATIO;

  // 1. Congression to the plate: the chromosomes are on the equator by the middle of metaphase,
  //    having set off from the nucleus in late prophase.
  const alignment = smoothstep(0.1, 0.3, value);

  // 2. Separation: identically zero for every progress before the anaphase band opens.
  const separation = separationAmount(value);

  // 3. Condensation, complete by the end of prophase and held from then on.
  const condensation = mix(PROPHASE_THREAD_SCALE, 1, smoothstep(0, MITOSIS_BANDS.prophase.end, value));

  // 4. The daughters draw in toward their own pole through telophase — the two nuclei condensing.
  const poleCondense = smoothstep(MITOSIS_BANDS.telophase.start, MITOSIS_BANDS.telophase.end, value);
  const lateralShrink = 1 - TELOPHASE_CONDENSE_FRACTION * poleCondense;

  const half = SISTER_REST_GAP / 2 + separation * (POLE_DISTANCE - SISTER_REST_GAP / 2);
  const placements: ChromatidPlacement[] = [];

  for (let index = 0; index < CHROMATID_COUNT; index += 1) {
    const chromosome = chromosomeIndexOf(index);
    const side = chromatidSide(index);
    const scatter = prophaseScatter(chromosome, clusterRadius);
    const plateX = plateRowOffset(chromosome);
    const plateZ = plateDepthOffset(chromosome);

    // The chromosome's own centre: in the nucleus at prophase, on the equator at metaphase.
    const centreX = mix(space.centre.x + scatter.x, plateX, alignment);
    const centreY = mix(space.centre.y + scatter.y, 0, alignment);
    const centreZ = mix(space.centre.z + scatter.z, plateZ, alignment);

    placements.push({
      x: centreX * lateralShrink,
      y: centreY + side * half,
      z: centreZ * lateralShrink,
      scale: condensation,
      // The chromatid's long axis lies in the plate. A small, side-dependent tilt is what makes a
      // separating pair read as two bodies travelling apart rather than as one body stretching.
      yaw: -Math.PI / 2 + chromosome * 0.11 + side * 0.22 * separation,
    });
  }

  return placements;
}

export interface ChromosomeStats {
  /** Mean distance between the two sisters of each chromosome, in scene units. */
  sisterSeparation: number;
  /** Distance between the two daughters' centroids, in scene units. */
  groupDistance: number;
  /** 1 while the daughters are still one body, 2 once they are separate. */
  groups: number;
  /** Largest distance from any chromatid to its own daughter's centroid. */
  groupSpread: number;
}

/**
 * The structural readout of one frame's placements.
 *
 * It is computed from the same array the render writes, so it cannot claim something the frame does
 * not show — and it is what the browser-side assertion reads through the process mirror, which makes
 * "no separation before metaphase" a measured fact in the real app and not only a unit test.
 */
export function chromosomeStats(placements: readonly ChromatidPlacement[]): ChromosomeStats {
  const centroidOf = (side: number) => {
    let count = 0;
    let x = 0;
    let y = 0;
    let z = 0;

    for (const [index, placement] of placements.entries()) {
      if (chromatidSide(index) !== side) {
        continue;
      }

      count += 1;
      x += placement.x;
      y += placement.y;
      z += placement.z;
    }

    return count === 0
      ? { x: 0, y: 0, z: 0 }
      : { x: x / count, y: y / count, z: z / count };
  };

  const positive = centroidOf(1);
  const negative = centroidOf(-1);
  const groupDistance = Math.hypot(
    positive.x - negative.x,
    positive.y - negative.y,
    positive.z - negative.z,
  );

  let separationSum = 0;
  let pairs = 0;

  for (let chromosome = 0; chromosome < CHROMOSOME_COUNT; chromosome += 1) {
    const first = placements[chromosome * CHROMATIDS_PER_CHROMOSOME];
    const second = placements[chromosome * CHROMATIDS_PER_CHROMOSOME + 1];

    if (!first || !second) {
      continue;
    }

    separationSum += Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);
    pairs += 1;
  }

  let groupSpread = 0;

  for (const [index, placement] of placements.entries()) {
    const centre = chromatidSide(index) === 1 ? positive : negative;

    groupSpread = Math.max(
      groupSpread,
      Math.hypot(placement.x - centre.x, placement.y - centre.y, placement.z - centre.z),
    );
  }

  return {
    sisterSeparation: pairs === 0 ? 0 : separationSum / pairs,
    groupDistance,
    groups: groupDistance > GROUPS_SEPARATED_DISTANCE ? 2 : 1,
    groupSpread,
  };
}
