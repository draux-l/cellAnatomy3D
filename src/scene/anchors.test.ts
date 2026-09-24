import { BoxGeometry, Object3D, Vector3 } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import {
  anchorOffsetFor,
  anchorWorldPosition,
  clearOrganelleAnchors,
  registerOrganelleAnchor,
  registeredAnchorIds,
  unregisterOrganelleAnchor,
} from './anchors';

/**
 * The anchor registry (task 4.1: "each host exposes its anchor world position to the overlay").
 *
 * The offset is computed from the parts the host built, and the world position follows the organelle
 * root — including under the disassembly loop, which simply moves that root.
 */

afterEach(() => clearOrganelleAnchors());

describe('anchorOffsetFor', () => {
  it('sits at the top-centre of the geometry it is given', () => {
    const geometry = new BoxGeometry(2, 4, 6);
    const offset = anchorOffsetFor([geometry]);

    expect(offset.x).toBeCloseTo(0, 5);
    expect(offset.y).toBeCloseTo(2, 5);
    expect(offset.z).toBeCloseTo(0, 5);

    geometry.dispose();
  });

  it('clears every part in the set, not just the first', () => {
    const near = new BoxGeometry(1, 1, 1);
    const tall = new BoxGeometry(1, 1, 1);

    tall.translate(0, 5, 0);

    const offset = anchorOffsetFor([near, tall]);

    // The anchor sits on the tallest part, so the leader line clears the whole organelle.
    expect(offset.y).toBeCloseTo(5.5, 5);

    near.dispose();
    tall.dispose();
  });
});

describe('anchor registry', () => {
  it('tracks registrations and forgets them on unmount', () => {
    const object = new Object3D();

    expect(registeredAnchorIds()).toEqual([]);

    registerOrganelleAnchor('mitochondrion', object, new Vector3(0, 1, 0));
    expect(registeredAnchorIds()).toEqual(['mitochondrion']);

    unregisterOrganelleAnchor('mitochondrion');
    expect(registeredAnchorIds()).toEqual([]);
    expect(anchorWorldPosition('mitochondrion')).toBeNull();
  });

  it('returns the anchor in world space through the organelle transform', () => {
    const root = new Object3D();

    root.position.set(1, 0, -2);
    registerOrganelleAnchor('nucleus', root, new Vector3(0, 0.5, 0));

    const world = anchorWorldPosition('nucleus');

    expect(world?.toArray()).toEqual([1, 0.5, -2]);
  });

  it('follows the root when the disassembly loop moves it', () => {
    // This is the whole point: the annotation layer never re-anchors, it just reads this.
    const root = new Object3D();

    root.position.set(0, 0, 0);
    registerOrganelleAnchor('golgi', root, new Vector3(0, 0.2, 0));

    const before = anchorWorldPosition('golgi')!.clone();

    root.position.set(0.6, 0.3, -0.6);
    const after = anchorWorldPosition('golgi')!;

    expect(after.x - before.x).toBeCloseTo(0.6, 6);
    expect(after.y - before.y).toBeCloseTo(0.3, 6);
  });

  it('copies the offset, so a caller cannot rewrite the registration', () => {
    const root = new Object3D();
    const offset = new Vector3(0, 1, 0);

    registerOrganelleAnchor('lysosome', root, offset);
    offset.set(9, 9, 9);

    expect(anchorWorldPosition('lysosome')?.toArray()).toEqual([0, 1, 0]);
  });

  it('reuses the target vector so a per-frame consumer allocates nothing', () => {
    const root = new Object3D();

    registerOrganelleAnchor('er', root, new Vector3(0, 0, 0));

    const target = new Vector3();
    const result = anchorWorldPosition('er', target);

    expect(result).toBe(target);
  });
});
