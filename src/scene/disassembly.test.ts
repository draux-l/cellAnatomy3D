import { Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { ORGANELLE_RECORDS, rosterFor } from '../catalog/cells';
import { positionForRecord } from '../catalog/params';
import { travelDistanceFor } from '../catalog/vectors';
import { DISASSEMBLY_MAX, DISASSEMBLY_MIN } from '../app/store';
import {
  DISASSEMBLY_SNAP_EPSILON,
  dampDisassembly,
  disassembledPosition,
  disassemblyOffset,
  disassemblyState,
} from './disassembly';

/**
 * The disassembly transform (task 4.10, design D13).
 *
 * The load-bearing assertion is stated in the task as *"each organelle sits along its record
 * vector"*, and the emphasis is on **record**: every expectation below is computed from the catalog
 * the app actually renders, not from a literal copied into the test. A hard-coded `0.75` here would
 * pass while the app moved organs somewhere else, which is exactly the failure the counter-measure
 * exists to prevent.
 */

/** The position the catalog says an organelle starts from, in a cell. */
function startOf(id: string, cell: 'animal' | 'plant'): Vector3 {
  const record = ORGANELLE_RECORDS.find((entry) => entry.id === id)!;

  return new Vector3(...positionForRecord(record, cell));
}

/** The offset the catalog's own vector implies at a given progress, computed independently. */
function expectedOffset(id: string, progress: number): Vector3 {
  const record = ORGANELLE_RECORDS.find((entry) => entry.id === id)!;
  const travel = (progress / DISASSEMBLY_MAX) * travelDistanceFor(record);

  return new Vector3(...record.disassembly.direction).multiplyScalar(travel);
}

describe('disassemblyOffset', () => {
  it('is a pure function of the record and the progress', () => {
    for (const record of ORGANELLE_RECORDS) {
      const first = disassemblyOffset(record, 57);
      const second = disassemblyOffset(record, 57);

      expect(first).toEqual(second);
    }
  });

  it('travels exactly the record\'s own direction times the record\'s own distance at 100%', () => {
    for (const record of ORGANELLE_RECORDS) {
      const offset = new Vector3(...disassemblyOffset(record, DISASSEMBLY_MAX));
      const expected = expectedOffset(record.id, DISASSEMBLY_MAX);

      // Component-wise this is exact, because both sides are the same catalog data.
      expect(offset.x).toBeCloseTo(expected.x, 12);
      expect(offset.y).toBeCloseTo(expected.y, 12);
      expect(offset.z).toBeCloseTo(expected.z, 12);
      if (travelDistanceFor(record) > 0) {
        // The travel length matches the declared distance to the *authored* precision of the
        // direction, which the catalog test pins at two decimals (the ER's rounds to 0.99815).
        // The component-wise checks above are exact; this one states the length, not the shape.
        expect(offset.length() / travelDistanceFor(record)).toBeCloseTo(1, 2);

        // And the travel is collinear with the record's direction at every progress, exactly.
        const half = new Vector3(...disassemblyOffset(record, 50));

        if (half.lengthSq() > 0) {
          expect(half.normalize().angleTo(expected.normalize())).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('keeps a part that never separates exactly where it is', () => {
    // The membrane and the wall declare a zero vector with zero distance: the outer envelope is
    // what the others leave behind.
    const anchored = ORGANELLE_RECORDS.filter((record) => record.disassembly.distance === 0);

    expect(anchored.map((record) => record.id).sort()).toEqual(['cell-wall', 'membrane']);

    for (const record of anchored) {
      for (const progress of [0, 25, 57, 100]) {
        expect(disassemblyOffset(record, progress)).toEqual([0, 0, 0]);
      }
    }
  });

  it('scales monotonically with the progress', () => {
    for (const record of ORGANELLE_RECORDS) {
      if (record.disassembly.distance === 0) {
        continue;
      }

      const lengths = [0, 25, 50, 75, 100].map(
        (progress) => new Vector3(...disassemblyOffset(record, progress)).length(),
      );

      for (let index = 1; index < lengths.length; index += 1) {
        expect(lengths[index]!, `${record.id} at step ${index}`).toBeGreaterThan(lengths[index - 1]!);
      }
    }
  });

  it('rounds to whole percents, so the same value is the same arrangement', () => {
    for (const record of ORGANELLE_RECORDS) {
      expect(disassemblyOffset(record, 57.2)).toEqual(disassemblyOffset(record, 57));
      expect(disassemblyOffset(record, 56.6)).toEqual(disassemblyOffset(record, 57));
    }
  });

  it('clamps outside the range instead of extrapolating', () => {
    for (const record of ORGANELLE_RECORDS) {
      expect(disassemblyOffset(record, -40)).toEqual(disassemblyOffset(record, DISASSEMBLY_MIN));
      expect(disassemblyOffset(record, 400)).toEqual(disassemblyOffset(record, DISASSEMBLY_MAX));
    }
  });
});

describe('disassembledPosition', () => {
  it('puts every organelle on its catalog vector at 100%', () => {
    for (const cell of ['animal', 'plant'] as const) {
      for (const record of rosterFor(cell)) {
        const atHundred = new Vector3(...disassembledPosition(record, cell, 100));
        const expected = startOf(record.id, cell).add(expectedOffset(record.id, 100));

        expect(atHundred.x, record.id).toBeCloseTo(expected.x, 12);
        expect(atHundred.y, record.id).toBeCloseTo(expected.y, 12);
        expect(atHundred.z, record.id).toBeCloseTo(expected.z, 12);
      }
    }
  });

  it('returns the exact 0% pose, so a round trip is lossless', () => {
    for (const cell of ['animal', 'plant'] as const) {
      for (const record of rosterFor(cell)) {
        const assembled = disassembledPosition(record, cell, 0);

        expect(assembled).toEqual([...positionForRecord(record, cell)]);

        // 100 → 0 is a pure recomputation, so there is no accumulated drift to compare within a
        // tolerance: the two are the same three numbers.
        expect(disassembledPosition(record, cell, 0)).toEqual(assembled);
      }
    }
  });

  it('uses the cell\'s own placement, not the record\'s base one', () => {
    const nucleus = ORGANELLE_RECORDS.find((record) => record.id === 'nucleus')!;
    const animal = new Vector3(...disassembledPosition(nucleus, 'animal', 0));
    const plant = new Vector3(...disassembledPosition(nucleus, 'plant', 0));

    expect(animal.toArray()).toEqual([...nucleus.position]);
    expect(plant.toArray()).toEqual([...nucleus.perCell!.plant!.position!]);
    expect(animal.equals(plant)).toBe(false);
  });

  it('moves outward from the centre, never through it', () => {
    for (const cell of ['animal', 'plant'] as const) {
      for (const record of rosterFor(cell)) {
        if (record.disassembly.distance === 0) {
          continue;
        }

        const start = startOf(record.id, cell);
        const end = new Vector3(...disassembledPosition(record, cell, 100));

        expect(end.length()).toBeGreaterThan(start.length() - 1e-9);
      }
    }
  });
});

describe('dampDisassembly', () => {
  beforeEach(() => {
    disassemblyState.current = DISASSEMBLY_MIN;
  });

  it('approaches the target without overshooting and lands exactly on it', () => {
    let current = 0;

    for (let step = 0; step < 600; step += 1) {
      current = dampDisassembly(current, 57, 1 / 60);
      expect(current).toBeLessThanOrEqual(57);
    }

    expect(current).toBe(57);
  });

  it('is frame-rate independent', () => {
    let atSixty = 0;
    let atTwenty = 0;

    for (let step = 0; step < 30; step += 1) {
      atSixty = dampDisassembly(atSixty, 100, 1 / 60);
    }

    for (let step = 0; step < 10; step += 1) {
      atTwenty = dampDisassembly(atTwenty, 100, 1 / 20);
    }

    expect(atSixty).toBeCloseTo(atTwenty, 3);
  });

  it('clamps an absurd delta instead of teleporting', () => {
    const next = dampDisassembly(0, 100, 1e6);

    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(100);
  });

  it('ignores a negative or non-finite delta', () => {
    expect(dampDisassembly(20, 100, -1)).toBe(20);
    expect(dampDisassembly(20, 100, Number.NaN)).toBe(20);
  });

  it('snaps inside the rounding threshold, which is what makes 0% exact', () => {
    // The rendered arrangement rounds the current to a whole percent, so a current within the snap
    // epsilon of zero *is* zero — the pose is the assembled pose, not a pose near it.
    const almost = dampDisassembly(DISASSEMBLY_SNAP_EPSILON - 1e-9, 0, 1 / 60);

    expect(almost).toBe(0);
  });
});
