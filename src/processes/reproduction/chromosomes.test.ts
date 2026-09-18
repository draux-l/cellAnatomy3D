import { describe, expect, it } from 'vitest';
import {
  ANAPHASE_SEPARATION_SPAN,
  CHROMATID_COUNT,
  CHROMATID_LENGTH,
  CHROMOSOME_COUNT,
  GROUPS_SEPARATED_DISTANCE,
  PLATE_ROW_HALF_WIDTH,
  POLE_DISTANCE,
  PROPHASE_THREAD_SCALE,
  SISTER_REST_GAP,
  chromatidPlacements,
  chromatidSide,
  chromosomeIndexOf,
  chromosomeStats,
  daughterOffset,
  type ChromatidPlacement,
} from './chromosomes';
import { MITOSIS_BANDS } from './stages';

/**
 * The chromosome keyframes (task 6.2, spec: `Chromosome Behavior Matches Each Phase`).
 *
 * This is the structural assertion the spec asks for, and it is deliberately **not** a screenshot
 * review. The spec's biological facts are statements about where the chromosomes are:
 *
 * | fact | asserted here as |
 * |---|---|
 * | they condense in the nucleus through prophase | every chromatid stays inside the envelope, and is smaller than its condensed size |
 * | they align along the equator in metaphase | every chromosome's pair midpoint lies on the equator plane by mid-metaphase |
 * | the sisters separate **only after** metaphase | the sister distance is exactly the resting gap for every progress below the anaphase band, with no exception |
 * | two nuclei form at telophase | two daughter groups, well separated, each condensed |
 *
 * The sweeps run over the whole domain rather than at samples, because "no separation before
 * metaphase" is a claim about *every* frame, and a single mis-positioned keyframe is exactly the
 * defect such a claim is meant to catch.
 */

/** The animal cell's nucleus, as the catalog builds it. */
const SPACE = { centre: { x: -0.1, y: 0.14, z: 0.04 }, radius: 0.36 };

function at(progress: number): ChromatidPlacement[] {
  return chromatidPlacements(progress, SPACE);
}

/** The midpoint of one chromosome's sister pair. */
function midpoint(placements: readonly ChromatidPlacement[], chromosome: number): ChromatidPlacement {
  const first = placements[chromosome * 2]!;
  const second = placements[chromosome * 2 + 1]!;

  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    z: (first.z + second.z) / 2,
    scale: first.scale,
    yaw: first.yaw,
  };
}

describe('the chromatid set', () => {
  it('has two sisters for every chromosome, and the pairing is stable', () => {
    const placements = at(0.3);

    expect(placements).toHaveLength(CHROMATID_COUNT);
    expect(CHROMOSOME_COUNT * 2).toBe(CHROMATID_COUNT);

    for (let index = 0; index < CHROMATID_COUNT; index += 1) {
      expect(chromatidSide(index)).toBe(index % 2 === 0 ? 1 : -1);
      expect(chromosomeIndexOf(index)).toBe(Math.floor(index / 2));
    }
  });

  it('is a pure function of progress, so a rewind renders the frame it describes', () => {
    // The spec's `Scrub backwards` scenario in its strongest form: the same progress reached from
    // either direction is the same frame, because nothing in the keyframes accumulates.
    const forward = at(0.9);
    at(0.1);
    at(0.45);
    const rewound = at(0.9);

    expect(rewound).toEqual(forward);
  });
});

describe('prophase — condensed inside the nucleus', () => {
  it('keeps every chromatid inside the nuclear envelope, at a fraction of its condensed size', () => {
    for (const progress of [0, 0.04, 0.08, 0.14]) {
      for (const placement of at(progress)) {
        const distance = Math.hypot(
          placement.x - SPACE.centre.x,
          placement.y - SPACE.centre.y,
          placement.z - SPACE.centre.z,
        );

        // The chromatid's own half-length has to fit as well, or it pokes through the envelope.
        expect(distance + (CHROMATID_LENGTH * placement.scale) / 2).toBeLessThanOrEqual(SPACE.radius);
        expect(placement.scale).toBeLessThan(1);
        expect(placement.scale).toBeGreaterThanOrEqual(PROPHASE_THREAD_SCALE - 1e-9);
      }
    }
  });

  it('has condensed the chromosomes by the end of the band', () => {
    expect(at(MITOSIS_BANDS.prophase.end)[0]!.scale).toBeCloseTo(1, 9);
    expect(at(0)[0]!.scale).toBeCloseTo(PROPHASE_THREAD_SCALE, 9);
  });
});

describe('metaphase — aligned on the equator', () => {
  it('puts every chromosome\'s pair midpoint on the equator plane by mid-metaphase', () => {
    for (const progress of [0.3, 0.34, 0.37]) {
      for (let chromosome = 0; chromosome < CHROMOSOME_COUNT; chromosome += 1) {
        const centre = midpoint(at(progress), chromosome);

        // The equator is the plane y = 0. This is the spec's "align along the cell's equator".
        expect(Math.abs(centre.y)).toBeLessThan(1e-9);
      }
    }
  });

  it('spreads the aligned chromosomes across the plate rather than stacking them', () => {
    const placements = at(0.34);
    const xs = Array.from({ length: CHROMOSOME_COUNT }, (_, index) => midpoint(placements, index).x);

    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(PLATE_ROW_HALF_WIDTH);
  });
});

describe('anaphase — separation, and only after metaphase', () => {
  it('never separates a sister pair for any progress before the anaphase band opens', () => {
    // Swept, not sampled: the requirement is about every frame before metaphase ends.
    for (let step = 0; step <= 380; step += 1) {
      const progress = step / 1000;
      const stats = chromosomeStats(at(progress));

      expect(stats.sisterSeparation, `sisters separated at progress ${progress}`).toBeCloseTo(
        SISTER_REST_GAP,
        9,
      );
      expect(stats.groups, `two groups at progress ${progress}`).toBe(1);
      expect(stats.groupDistance).toBeCloseTo(SISTER_REST_GAP, 9);
    }
  });

  it('parts the sisters inside anaphase, and only grows the distance', () => {
    let previous = chromosomeStats(at(0)).sisterSeparation;

    for (let step = 0; step <= 200; step += 1) {
      const stats = chromosomeStats(at(step / 200));

      expect(stats.sisterSeparation).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = stats.sisterSeparation;
    }

    const opened = chromosomeStats(at(MITOSIS_BANDS.anaphase.start)).sisterSeparation;
    const mid = chromosomeStats(at(MITOSIS_BANDS.anaphase.start + ANAPHASE_SEPARATION_SPAN)).sisterSeparation;

    expect(opened).toBeCloseTo(SISTER_REST_GAP, 9);
    expect(mid).toBeCloseTo(POLE_DISTANCE * 2, 9);
    expect(mid).toBeGreaterThan(GROUPS_SEPARATED_DISTANCE);
  });

  it('carries the two groups to opposite poles', () => {
    for (const progress of [0.5, 0.56, MITOSIS_BANDS.telophase.start]) {
      const placements = at(progress);
      const north = placements.filter((_, index) => chromatidSide(index) === 1);
      const south = placements.filter((_, index) => chromatidSide(index) === -1);

      expect(Math.min(...north.map((placement) => placement.y))).toBeGreaterThan(0);
      expect(Math.max(...south.map((placement) => placement.y))).toBeLessThan(0);

      const stats = chromosomeStats(placements);

      expect(stats.groups).toBe(2);
      expect(stats.groupDistance).toBeGreaterThan(GROUPS_SEPARATED_DISTANCE);
    }
  });
});

describe('telophase — two condensed groups', () => {
  it('leaves two separated, condensed groups where the two nuclei form', () => {
    for (const progress of [0.72, MITOSIS_BANDS.telophase.end - 1e-6, 0.9, 1]) {
      const stats = chromosomeStats(at(progress));

      expect(stats.groups, `one group at progress ${progress}`).toBe(2);
      expect(stats.sisterSeparation).toBeGreaterThan(POLE_DISTANCE * 2 - 1e-9);
      expect(stats.groupDistance).toBeGreaterThan(POLE_DISTANCE);
      // "Condensed": neither group is a loose cloud around its pole.
      expect(stats.groupSpread).toBeLessThan(0.25);
    }
  });

  it('places the two daughter nuclei on the groups they enclose', () => {
    expect(daughterOffset(0)).toBeCloseTo(SISTER_REST_GAP / 2, 9);
    expect(daughterOffset(MITOSIS_BANDS.telophase.start)).toBeCloseTo(POLE_DISTANCE, 9);
    expect(daughterOffset(1)).toBeCloseTo(POLE_DISTANCE, 9);
  });
});
