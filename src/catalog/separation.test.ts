import { describe, expect, it } from 'vitest';
import { ORGANELLE_RECORDS, getRecord } from './cells';
import { extentFor, positionForRecord } from './params';
import {
  SCATTER_LAYOUTS,
  SEPARATION_SEQUENCE,
  SLOT_CLEARANCE,
  STAGGER_WINDOW,
  isSeparable,
  membraneExtentOf,
  orderedSeparation,
  orderedSlotFor,
  ringAngleFor,
  scatterSlotFor,
  separableRecords,
  separationProgress,
  separationRank,
} from './separation';
import type { CellId, OrganelleRecord } from './types';

/**
 * The exploded-view gate: the order, the two layouts and the stagger.
 *
 * Three things are checked, and each one is a way the arrangement can quietly go wrong:
 *
 * 1. **The sequence and the separable set are the same set.** Rank comes from the sequence, travel
 *    from the record; if one changes without the other, a part would keep a stale step.
 * 2. **Both layouts are actually layouts.** The `ordered` ring is evenly spaced and starts at the
 *    top; the `real` layout puts every part on its own ray. Neither is checked against authored
 *    numbers, because neither is authored any more — the numbers are derived, and these are the
 *    properties that make the derivation right.
 * 3. **The one invariant the view rests on**, in **every** layout: a slot clears the membrane by the
 *    part's own radius. That is what "the part ends up outside the cell" actually means.
 */

const CELL: CellId = 'animal';

/** The three records the exploded view must leave exactly where the model file put them. */
const FIXED_IDS = ['membrane', 'cytoplasm', 'cytoskeleton'] as const;

function recordOrThrow(id: string): OrganelleRecord {
  const record = getRecord(id);

  if (!record) {
    throw new Error(`the catalog has no record "${id}"`);
  }

  return record;
}

const MEMBRANE_EXTENT = membraneExtentOf(CELL);
const SEPARABLE = ORGANELLE_RECORDS.filter(isSeparable);

function magnitude(vector: readonly [number, number, number]): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

/** The slot one part travels to, in one layout, at its own rank. */
function slotOf(
  record: OrganelleRecord,
  layout: (typeof SCATTER_LAYOUTS)[number],
): [number, number, number] {
  const ordered = orderedSeparation(CELL);
  const rank = ordered.findIndex((candidate) => candidate.id === record.id);

  return scatterSlotFor(record, CELL, layout, rank, ordered.length, MEMBRANE_EXTENT);
}

describe('the sequence and the separable set are one thing', () => {
  it('ranks exactly the records that declare travel', () => {
    expect([...SEPARABLE.map((record) => record.id)].sort()).toEqual([...SEPARATION_SEQUENCE].sort());
  });

  it('names every rank once', () => {
    expect(new Set(SEPARATION_SEQUENCE).size).toBe(SEPARATION_SEQUENCE.length);
  });

  it('keeps the envelope and the scaffold out of the sequence', () => {
    for (const id of FIXED_IDS) {
      expect(SEPARATION_SEQUENCE).not.toContain(id);
      expect(separationRank(recordOrThrow(id))).toBeUndefined();
    }
  });

  it('separates eleven parts and holds three still', () => {
    expect(SEPARABLE.length).toBe(11);
    expect(separationProgress(100, 0, SEPARABLE.length)).toBeCloseTo(1, 9);
  });

  it('agrees with the cell roster, not just the whole catalog', () => {
    expect(separableRecords(CELL).map((record) => record.id)).toEqual(
      SEPARABLE.map((record) => record.id),
    );
  });

  it('orders the roster by the authored sequence, not by catalog order', () => {
    expect(orderedSeparation(CELL).map((record) => record.id)).toEqual([...SEPARATION_SEQUENCE]);
  });

  it('ranks a subset roster from its own first step to its own last', () => {
    // The bug this pins: a rank that is an index into the full sequence would leave a two-part cell
    // starting at step 5 and finishing at step 9 — the first part would wait and the last would
    // never leave. A subset must start at 0 and end at count − 1.
    const subset = orderedSeparation(CELL).slice(4, 6);

    expect(subset.map((record) => record.id)).toEqual(['nuclear-envelope', 'nucleus']);
    expect(separationProgress(100, 0, subset.length)).toBe(1);
    expect(separationProgress(100, subset.length - 1, subset.length)).toBe(1);
    expect(separationProgress(0, subset.length - 1, subset.length)).toBe(0);
  });

  it('reads the cell radius from the membrane record', () => {
    expect(MEMBRANE_EXTENT).toBeCloseTo(2.002279, 6);
    expect(membraneExtentOf('plant')).toBe(0);
  });
});

describe('the fixed records declare no travel at all', () => {
  it('leaves `separates: false` on the membrane, the cytoplasm and the cytoskeleton', () => {
    for (const id of FIXED_IDS) {
      expect(recordOrThrow(id).separates).toBe(false);
    }
  });

  it('declares `separates: true` on all eleven others', () => {
    for (const record of SEPARABLE) {
      expect(record.separates, record.id).toBe(true);
    }
  });
});

describe('the ordered layout is a ring', () => {
  it('spaces the slots evenly around the circle', () => {
    const ordered = orderedSeparation(CELL);
    const count = ordered.length;
    const step = (Math.PI * 2) / count;
    const angles = ordered.map((record) => {
      const [x, y] = slotOf(record, 'ordered');

      return Math.atan2(y, x);
    });

    expect(count).toBe(11);

    for (let index = 1; index < count; index += 1) {
      // Consecutive slots in exit order are one step apart, modulo the −π/π wrap of atan2.
      const raw = angles[index - 1]! - angles[index]!;
      const wrapped = Math.atan2(Math.sin(raw), Math.cos(raw));

      expect(
        Math.abs(Math.abs(wrapped) - step),
        `slot ${index} is off the even spacing`,
      ).toBeLessThan(1e-9);
    }
  });

  it('gives every slot a radius that grows with the part it holds', () => {
    for (const record of SEPARABLE) {
      expect(magnitude(slotOf(record, 'ordered')), record.id).toBeCloseTo(
        MEMBRANE_EXTENT + SLOT_CLEARANCE + extentFor(record),
        9,
      );
    }
  });

  it('starts the ring at the top and walks clockwise', () => {
    expect(ringAngleFor(0, 4)).toBeCloseTo(Math.PI / 2, 9);
    expect(ringAngleFor(1, 4)).toBeCloseTo(0, 9);
    expect(ringAngleFor(2, 4)).toBeCloseTo(-Math.PI / 2, 9);
    expect(ringAngleFor(3, 4)).toBeCloseTo(-Math.PI, 9);
  });

  it('puts the ring in the plane of the default view, not on the ground', () => {
    // A ring in the ground plane collapses into a flattened line from the composed pose and piles its
    // parts on top of each other; the plane is the reason the arrangement reads as a circle.
    for (const record of SEPARABLE) {
      expect(slotOf(record, 'ordered')[2], record.id).toBeCloseTo(0, 9);
    }
  });

  it('is what the helper returns at the record own rank', () => {
    // The rank has to be the record's own — the ring is handed out in exit order, so a part's slot
    // depends on which step it leaves at, not on the order this test happens to call things in.
    const ordered = orderedSeparation(CELL);
    const rank = ordered.findIndex((candidate) => candidate.id === 'nucleus');

    expect(rank).toBeGreaterThan(0);
    expect(orderedSlotFor(recordOrThrow('nucleus'), rank, ordered.length, MEMBRANE_EXTENT)).toEqual(
      slotOf(recordOrThrow('nucleus'), 'ordered'),
    );
  });
});

describe('the real layout keeps every part on its own ray', () => {
  it('sends each part along the ray it genuinely occupies', () => {
    for (const record of SEPARABLE) {
      const slot = slotOf(record, 'real');
      const position = positionForRecord(record, CELL);
      const slotLength = magnitude(slot);
      const positionLength = magnitude(position);
      const dot =
        (slot[0] * position[0] + slot[1] * position[1] + slot[2] * position[2]) /
        (slotLength * positionLength);

      // Collinear and pointing the same way: the slot is on the part's own ray, farther out.
      expect(dot, record.id).toBeCloseTo(1, 9);
      expect(slotLength, record.id).toBeGreaterThan(positionLength);
    }
  });

  it('gives every slot a radius that grows with the part it holds', () => {
    for (const record of SEPARABLE) {
      expect(magnitude(slotOf(record, 'real')), record.id).toBeCloseTo(
        MEMBRANE_EXTENT + SLOT_CLEARANCE + extentFor(record),
        9,
      );
    }
  });

  it('stacks the co-located parts on a shared ray instead of scattering them', () => {
    // Ribosomes really sit inside the reticulum, and the nucleus, its envelope and the nucleolus are
    // nested. Stacking them is the honest picture of where they are — this pins that the layout does
    // not quietly invent a different angle for them.
    const ribosome = slotOf(recordOrThrow('ribosome'), 'real');
    const reticulum = slotOf(recordOrThrow('endoplasmic-reticulum'), 'real');
    const ribosomeUnit = [
      ribosome[0] / magnitude(ribosome),
      ribosome[1] / magnitude(ribosome),
      ribosome[2] / magnitude(ribosome),
    ];
    const reticulumUnit = [
      reticulum[0] / magnitude(reticulum),
      reticulum[1] / magnitude(reticulum),
      reticulum[2] / magnitude(reticulum),
    ];
    const dot =
      ribosomeUnit[0]! * reticulumUnit[0]! +
      ribosomeUnit[1]! * reticulumUnit[1]! +
      ribosomeUnit[2]! * reticulumUnit[2]!;

    expect(Math.acos(Math.min(1, dot))).toBeLessThan(0.02);
  });
});

describe('the two layouts are genuinely different views', () => {
  it('offers both, in a fixed order', () => {
    expect(SCATTER_LAYOUTS).toEqual(['ordered', 'real']);
  });

  it('sends at least one part somewhere else in each view', () => {
    // A toggle that changed nothing would be a lie in the UI.
    const moved = SEPARABLE.filter((record) => {
      const ordered = slotOf(record, 'ordered');
      const real = slotOf(record, 'real');

      return Math.hypot(ordered[0] - real[0], ordered[1] - real[1], ordered[2] - real[2]) > 0.5;
    });

    expect(moved.length).toBeGreaterThan(SEPARABLE.length / 2);
  });
});

describe('every slot clears the membrane by the part\'s own radius, in both layouts', () => {
  for (const layout of SCATTER_LAYOUTS) {
    it(`holds in the ${layout} layout`, () => {
      for (const record of SEPARABLE) {
        const clearance = magnitude(slotOf(record, layout)) - extentFor(record);

        expect(clearance, `${record.id} in ${layout}`).toBeGreaterThanOrEqual(MEMBRANE_EXTENT);
      }
    });
  }
});

describe('the nucleus group opens in nesting order', () => {
  it('puts the envelope, then the nucleus, then the nucleolus', () => {
    const envelope = separationRank(recordOrThrow('nuclear-envelope'));
    const nucleus = separationRank(recordOrThrow('nucleus'));
    const nucleolus = separationRank(recordOrThrow('nucleolus'));

    expect(envelope!).toBeLessThan(nucleus!);
    expect(nucleus!).toBeLessThan(nucleolus!);
  });
});

describe('the stagger emits the parts one order at a time', () => {
  const count = SEPARATION_SEQUENCE.length;

  it('keeps the window inside the control it shares', () => {
    expect(STAGGER_WINDOW).toBeGreaterThan(0);
    expect(STAGGER_WINDOW).toBeLessThanOrEqual(1);
  });

  it('starts home at 0 % and ends fully out at 100 %, at every rank', () => {
    for (let rank = 0; rank < count; rank += 1) {
      expect(separationProgress(0, rank, count)).toBe(0);
      expect(separationProgress(100, rank, count)).toBeCloseTo(1, 9);
    }
  });

  it('never lets a later rank run ahead of an earlier one', () => {
    for (let percent = 0; percent <= 100; percent += 1) {
      for (let rank = 1; rank < count; rank += 1) {
        expect(separationProgress(percent, rank - 1, count)).toBeGreaterThanOrEqual(
          separationProgress(percent, rank, count),
        );
      }
    }
  });

  it('finishes the first part before the last one has moved', () => {
    const firstPartDoneAt = (1 - STAGGER_WINDOW) * 100;
    const lastPartStartsAt = STAGGER_WINDOW * 100;

    expect(firstPartDoneAt).toBeLessThan(lastPartStartsAt);
    expect(separationProgress(firstPartDoneAt, 0, count)).toBe(1);
    expect(separationProgress(firstPartDoneAt, count - 1, count)).toBe(0);
  });

  it('is monotonic in the control value at every rank', () => {
    for (let rank = 0; rank < count; rank += 1) {
      for (let percent = 1; percent <= 100; percent += 1) {
        expect(separationProgress(percent, rank, count)).toBeGreaterThanOrEqual(
          separationProgress(percent - 1, rank, count),
        );
      }
    }
  });

  it('defines the degenerate shapes instead of going dead', () => {
    expect(separationProgress(0, 0, 1)).toBe(0);
    expect(separationProgress(100, 0, 1)).toBe(1);
    expect(separationProgress(0, 2, 3, 1)).toBe(0);
    expect(separationProgress(100, 0, 3, 1)).toBe(1);
    expect(separationProgress(Number.NaN, 0, 3, 1)).toBe(0);
  });
});
