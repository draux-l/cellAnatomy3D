import { Object3D } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PICK_LAYER,
  choosePick,
  choosePickFromObjects,
  clearPickTargets,
  isOuterEnvelope,
  isPickIndexReady,
  pickTargetIds,
  registerPickTarget,
  setPickIndexReady,
  unregisterPickTarget,
} from './pickingModel';

/**
 * The pick rule, the envelope definition and the target registry — everything the raycast needs
 * decided before a renderer exists.
 *
 * The bounding-box arithmetic that used to live here is gone: the controller now raycasts the model's
 * real triangles (`pickBvh.ts`), so there is no proxy transform left to test. What remains is the
 * priority rule, which is unchanged and still the load-bearing part.
 */

afterEach(() => {
  clearPickTargets();
});

describe('choosePick', () => {
  it('returns null when the ray crossed nothing', () => {
    expect(choosePick([])).toBeNull();
  });

  it('the nearest inner organelle wins over a nearer envelope', () => {
    // The membrane is at 1, the cytoplasm at 2, the mitochondrion at 3: the mitochondrion is the
    // answer, because the two envelopes are surfaces the user looks through.
    expect(
      choosePick([
        { organelleId: 'membrane', envelope: true, distance: 1 },
        { organelleId: 'cytoplasm', envelope: true, distance: 2 },
        { organelleId: 'mitochondrion', envelope: false, distance: 3 },
      ]),
    ).toBe('mitochondrion');
  });

  it('an envelope is picked only when nothing inside was crossed', () => {
    expect(
      choosePick([
        { organelleId: 'membrane', envelope: true, distance: 1 },
        { organelleId: 'cytoplasm', envelope: true, distance: 2 },
      ]),
    ).toBe('membrane');
  });

  it('picks the nearest of several inner organelles', () => {
    expect(
      choosePick([
        { organelleId: 'golgi', envelope: false, distance: 5 },
        { organelleId: 'nucleus', envelope: false, distance: 2 },
      ]),
    ).toBe('nucleus');
  });
});

describe('isOuterEnvelope', () => {
  it('is true for a part at the origin that never separates', () => {
    expect(isOuterEnvelope({ position: [0, 0, 0], disassembly: { direction: [0, 0, 0], distance: 0 } })).toBe(true);
  });

  it('is false for a part that sits off-origin, even if it never separates', () => {
    expect(
      isOuterEnvelope({ position: [0.1, 0, 0], disassembly: { direction: [0, 0, 0], distance: 0 } }),
    ).toBe(false);
  });

  it('is false for a part at the origin that does separate', () => {
    expect(
      isOuterEnvelope({ position: [0, 0, 0], disassembly: { direction: [1, 0, 0], distance: 0.5 } }),
    ).toBe(false);
  });
});

describe('the pick target registry', () => {
  it('maps a hit object back to its record, and keeps the record ids unique', () => {
    const mitosis = new Object3D();
    const secondMitosis = new Object3D();
    const nucleus = new Object3D();

    registerPickTarget({ object: mitosis, organelleId: 'mitochondrion', envelope: false });
    registerPickTarget({ object: secondMitosis, organelleId: 'mitochondrion', envelope: false });
    registerPickTarget({ object: nucleus, organelleId: 'nucleus', envelope: false });

    expect(
      choosePickFromObjects([
        { object: nucleus, distance: 3 },
        { object: secondMitosis, distance: 1 },
      ]),
    ).toBe('mitochondrion');

    // One record, several meshes: the id appears once.
    expect(pickTargetIds().sort()).toEqual(['mitochondrion', 'nucleus']);
  });

  it('forgets an object when it is unregistered', () => {
    const mesh = new Object3D();

    registerPickTarget({ object: mesh, organelleId: 'golgi', envelope: false });
    unregisterPickTarget(mesh);

    expect(choosePickFromObjects([{ object: mesh, distance: 1 }])).toBeNull();
  });

  it('ignores a hit on an object it does not know', () => {
    expect(choosePickFromObjects([{ object: new Object3D(), distance: 0.5 }])).toBeNull();
  });
});

describe('the pick index readiness gate', () => {
  it('starts unarmed and follows the builder', () => {
    clearPickTargets();
    expect(isPickIndexReady()).toBe(false);

    setPickIndexReady(true);
    expect(isPickIndexReady()).toBe(true);

    clearPickTargets();
    expect(isPickIndexReady()).toBe(false);
  });

  it('declares a pick layer that is not the render layer', () => {
    // The camera renders layer 0; the pick ray is pointed at this layer so its subjects are explicit.
    expect(PICK_LAYER).toBe(1);
  });
});
