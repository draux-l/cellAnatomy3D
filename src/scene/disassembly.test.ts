import { Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CellId, OrganelleRecord } from '../catalog/types';
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
 * vector"*, and the emphasis is on **record**: every expectation below is computed from the record
 * data, not from a literal copied into the test. The committed catalog is empty while the cell models
 * are reset, so a synthetic roster stands in — the transform is a pure function of the record and the
 * progress, which is exactly what keeps it testable without a model.
 */

function record(overrides: Partial<OrganelleRecord> & Pick<OrganelleRecord, 'id'>): OrganelleRecord {
  return {
    name: { es: overrides.id, en: overrides.id },
    func: { es: 'función', en: 'function' },
    size: { value: 1, unit: 'µm' },
    funFact: { es: 'dato', en: 'fact' },
    paletteRole: 'organelles',
    position: [0, 0, 0],
    geometry: {
      kind: 'procedural',
      builder: 'nucleus',
      params: { size: 0.3, detail: 1, count: 0 },
      seed: `${overrides.id}/v1`,
    },
    disassembly: { direction: [0, 0, 0], distance: 0 },
    cells: ['animal', 'plant'],
    pickable: true,
    ...overrides,
  };
}

const RECORDS: readonly OrganelleRecord[] = [
  record({
    id: 'nucleus',
    position: [-0.1, 0.14, 0.04],
    disassembly: { direction: [-0.5661, 0.7926, 0.2265], distance: 0.9 },
    perCell: { plant: { position: [-0.36, 0.52, 0.15] } },
  }),
  record({
    id: 'mitochondrion',
    position: [-0.52, -0.3, 0.26],
    disassembly: { direction: [-0.72, -0.38, 0.58], distance: 0.75 },
  }),
  // The envelope and the volume it encloses never separate: an explicit zero vector with zero
  // distance.
  record({ id: 'membrane' }),
  record({ id: 'cell-wall', cells: ['plant'] }),
];

function rosterFor(cell: CellId): readonly OrganelleRecord[] {
  return RECORDS.filter((entry) => entry.cells.includes(cell));
}

/** The position the record says an organelle starts from, in a cell. */
function startOf(id: string, cell: CellId): Vector3 {
  const entry = RECORDS.find((candidate) => candidate.id === id)!;

  return new Vector3(...positionForRecord(entry, cell));
}

/** The offset the record's own vector implies at a given progress, computed independently. */
function expectedOffset(id: string, progress: number): Vector3 {
  const entry = RECORDS.find((candidate) => candidate.id === id)!;
  const travel = (progress / DISASSEMBLY_MAX) * travelDistanceFor(entry);

  return new Vector3(...entry.disassembly.direction).multiplyScalar(travel);
}

describe('disassemblyOffset', () => {
  it('is a pure function of the record and the progress', () => {
    for (const entry of RECORDS) {
      const first = disassemblyOffset(entry, 57);
      const second = disassemblyOffset(entry, 57);

      expect(first).toEqual(second);
    }
  });

  it('travels exactly the record\'s own direction times the record\'s own distance at 100%', () => {
    for (const entry of RECORDS) {
      const offset = new Vector3(...disassemblyOffset(entry, DISASSEMBLY_MAX));
      const expected = expectedOffset(entry.id, DISASSEMBLY_MAX);

      // Component-wise this is exact, because both sides are the same record data.
      expect(offset.x).toBeCloseTo(expected.x, 12);
      expect(offset.y).toBeCloseTo(expected.y, 12);
      expect(offset.z).toBeCloseTo(expected.z, 12);
      if (travelDistanceFor(entry) > 0) {
        // The travel length matches the declared distance to the *authored* precision of the
        // direction. The component-wise checks above are exact; this one states the length.
        expect(offset.length() / travelDistanceFor(entry)).toBeCloseTo(1, 2);

        // And the travel is collinear with the record's direction at every progress, exactly.
        const half = new Vector3(...disassemblyOffset(entry, 50));

        if (half.lengthSq() > 0) {
          expect(half.normalize().angleTo(expected.normalize())).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('keeps a part that never separates exactly where it is', () => {
    const anchored = RECORDS.filter((entry) => entry.disassembly.distance === 0);

    expect(anchored.map((entry) => entry.id).sort()).toEqual(['cell-wall', 'membrane']);

    for (const entry of anchored) {
      for (const progress of [0, 25, 57, 100]) {
        expect(disassemblyOffset(entry, progress)).toEqual([0, 0, 0]);
      }
    }
  });

  it('scales monotonically with the progress', () => {
    for (const entry of RECORDS) {
      if (entry.disassembly.distance === 0) {
        continue;
      }

      const lengths = [0, 25, 50, 75, 100].map(
        (progress) => new Vector3(...disassemblyOffset(entry, progress)).length(),
      );

      for (let index = 1; index < lengths.length; index += 1) {
        expect(lengths[index]!, `${entry.id} at step ${index}`).toBeGreaterThan(lengths[index - 1]!);
      }
    }
  });

  it('rounds to whole percents, so the same value is the same arrangement', () => {
    for (const entry of RECORDS) {
      expect(disassemblyOffset(entry, 57.2)).toEqual(disassemblyOffset(entry, 57));
      expect(disassemblyOffset(entry, 56.6)).toEqual(disassemblyOffset(entry, 57));
    }
  });

  it('clamps outside the range instead of extrapolating', () => {
    for (const entry of RECORDS) {
      expect(disassemblyOffset(entry, -40)).toEqual(disassemblyOffset(entry, DISASSEMBLY_MIN));
      expect(disassemblyOffset(entry, 400)).toEqual(disassemblyOffset(entry, DISASSEMBLY_MAX));
    }
  });
});

describe('disassembledPosition', () => {
  it('puts every organelle on its record vector at 100%', () => {
    for (const cell of ['animal', 'plant'] as const) {
      for (const entry of rosterFor(cell)) {
        const atHundred = new Vector3(...disassembledPosition(entry, cell, 100));
        const expected = startOf(entry.id, cell).add(expectedOffset(entry.id, 100));

        expect(atHundred.x, entry.id).toBeCloseTo(expected.x, 12);
        expect(atHundred.y, entry.id).toBeCloseTo(expected.y, 12);
        expect(atHundred.z, entry.id).toBeCloseTo(expected.z, 12);
      }
    }
  });

  it('returns the exact 0% pose, so a round trip is lossless', () => {
    for (const cell of ['animal', 'plant'] as const) {
      for (const entry of rosterFor(cell)) {
        const assembled = disassembledPosition(entry, cell, 0);

        expect(assembled).toEqual([...positionForRecord(entry, cell)]);

        // 100 → 0 is a pure recomputation, so there is no accumulated drift to compare within a
        // tolerance: the two are the same three numbers.
        expect(disassembledPosition(entry, cell, 0)).toEqual(assembled);
      }
    }
  });

  it('uses the cell\'s own placement, not the record\'s base one', () => {
    const nucleus = RECORDS.find((entry) => entry.id === 'nucleus')!;
    const animal = new Vector3(...disassembledPosition(nucleus, 'animal', 0));
    const plant = new Vector3(...disassembledPosition(nucleus, 'plant', 0));

    expect(animal.toArray()).toEqual([...nucleus.position]);
    expect(plant.toArray()).toEqual([...nucleus.perCell!.plant!.position!]);
    expect(animal.equals(plant)).toBe(false);
  });

  it('moves outward from the centre, never through it', () => {
    for (const cell of ['animal', 'plant'] as const) {
      for (const entry of rosterFor(cell)) {
        if (entry.disassembly.distance === 0) {
          continue;
        }

        const start = startOf(entry.id, cell);
        const end = new Vector3(...disassembledPosition(entry, cell, 100));

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
