import { beforeEach, describe, expect, it } from 'vitest';
import { DISASSEMBLY_MAX, DISASSEMBLY_MIN } from '../app/store';
import { positionForRecord } from '../catalog/params';
import type { OrganelleRecord } from '../catalog/types';
import {
  DISASSEMBLY_SNAP_EPSILON,
  dampDisassembly,
  disassemblyState,
  scatterPosition,
} from './disassembly';

/**
 * The scatter transform.
 *
 * The load-bearing assertion is that a part travels a **straight line** from where the model file
 * puts it to the slot the running layout chose, and that 0 % is the file unmodified. Every
 * expectation below is computed from the record and the slot, never from a literal copied in.
 *
 * The transform does not know which layout it is serving, and that is the point: the layout's whole
 * job is to produce the slot. `catalog/separation.test.ts` owns the geometry; this owns the motion.
 */

function record(overrides: Partial<OrganelleRecord> & Pick<OrganelleRecord, 'id'>): OrganelleRecord {
  return {
    name: { es: overrides.id, en: overrides.id },
    paletteRole: 'organelles',
    position: [0, 0, 0],
    geometry: {
      kind: 'procedural',
      builder: 'nucleus',
      params: { size: 0.3, detail: 1, count: 0 },
      seed: `${overrides.id}/v1`,
    },
    separates: true,
    cells: ['animal', 'plant'],
    pickable: true,
    ...overrides,
  };
}

const RECORDS: readonly OrganelleRecord[] = [
  record({ id: 'nucleus', position: [-0.1, 0.14, 0.04] }),
  record({ id: 'mitochondrion', position: [-0.52, -0.3, 0.26] }),
  record({ id: 'membrane', position: [0, 0, 0], separates: false }),
];

const SLOT: readonly [number, number, number] = [3, -1.5, 2];
const SAFE_SLOT: readonly [number, number, number] = [1, 1, 0];

function recordById(id: string): OrganelleRecord {
  return RECORDS.find((candidate) => candidate.id === id)!;
}

describe('scatterPosition', () => {
  it('is a pure function of the record, the progress and the slot', () => {
    const entry = recordById('nucleus');

    expect(scatterPosition(entry, 'animal', 57, SLOT)).toEqual(scatterPosition(entry, 'animal', 57, SLOT));
  });

  it('leaves a part exactly where the file put it at 0 %', () => {
    for (const entry of RECORDS) {
      // The slot is deliberately non-trivial: at zero progress it must not matter at all.
      expect(scatterPosition(entry, 'animal', DISASSEMBLY_MIN, SLOT)).toEqual([
        ...positionForRecord(entry, 'animal'),
      ]);
    }
  });

  it('lands exactly on the slot at 100 %', () => {
    for (const entry of RECORDS) {
      const [x, y, z] = scatterPosition(entry, 'animal', DISASSEMBLY_MAX, SLOT);

      expect(x).toBeCloseTo(SLOT[0], 12);
      expect(y).toBeCloseTo(SLOT[1], 12);
      expect(z).toBeCloseTo(SLOT[2], 12);
    }
  });

  it('travels a straight line, not a curve', () => {
    const entry = recordById('mitochondrion');
    const start = positionForRecord(entry, 'animal');
    const middle = scatterPosition(entry, 'animal', 50, SAFE_SLOT);

    for (let axis = 0; axis < 3; axis += 1) {
      expect(middle[axis], `axis ${axis}`).toBeCloseTo((start[axis]! + SAFE_SLOT[axis]!) / 2, 12);
    }
  });

  it('rounds to whole percents, so the same value is the same arrangement', () => {
    const entry = recordById('nucleus');

    expect(scatterPosition(entry, 'animal', 57.2, SLOT)).toEqual(
      scatterPosition(entry, 'animal', 57, SLOT),
    );
    expect(scatterPosition(entry, 'animal', 56.6, SLOT)).toEqual(
      scatterPosition(entry, 'animal', 57, SLOT),
    );
  });

  it('clamps outside the range instead of extrapolating', () => {
    const entry = recordById('nucleus');

    expect(scatterPosition(entry, 'animal', -40, SLOT)).toEqual(
      scatterPosition(entry, 'animal', DISASSEMBLY_MIN, SLOT),
    );
    expect(scatterPosition(entry, 'animal', 400, SLOT)).toEqual(
      scatterPosition(entry, 'animal', DISASSEMBLY_MAX, SLOT),
    );
  });

  it('reverses losslessly: 100 % then 0 % is the file pose again', () => {
    for (const entry of RECORDS) {
      scatterPosition(entry, 'animal', DISASSEMBLY_MAX, SLOT);

      expect(scatterPosition(entry, 'animal', DISASSEMBLY_MIN, SLOT)).toEqual([
        ...positionForRecord(entry, 'animal'),
      ]);
    }
  });

  it('uses the cell own placement, not the record base one', () => {
    const nucleus = record({
      id: 'nucleus',
      position: [-0.1, 0.14, 0.04],
      perCell: { plant: { position: [-0.36, 0.52, 0.15] } },
    });

    expect(scatterPosition(nucleus, 'animal', DISASSEMBLY_MIN, SLOT)).toEqual([-0.1, 0.14, 0.04]);
    expect(scatterPosition(nucleus, 'plant', DISASSEMBLY_MIN, SLOT)).toEqual([-0.36, 0.52, 0.15]);
  });

  it('moves a part outward at every progress above zero', () => {
    for (const entry of RECORDS) {
      if (!entry.separates) {
        continue;
      }

      const start = Math.hypot(...positionForRecord(entry, 'animal'));
      const [x, y, z] = scatterPosition(entry, 'animal', DISASSEMBLY_MAX, SAFE_SLOT);

      expect(Math.hypot(x, y, z)).toBeGreaterThan(start);
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

  it('snaps inside the rounding threshold, which is what makes 0 % exact', () => {
    // The rendered arrangement rounds the current to a whole percent, so a current within the snap
    // epsilon of zero *is* zero — the pose is the assembled pose, not a pose near it.
    const almost = dampDisassembly(DISASSEMBLY_SNAP_EPSILON - 1e-9, 0, 1 / 60);

    expect(almost).toBe(0);
  });
});
