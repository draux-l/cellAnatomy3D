import { Object3D, Vector3 } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import {
  anchorOffsetFor,
  anchorWorldPosition,
  clearOrganelleAnchors,
  registerOrganelleAnchor,
  registeredAnchorIds,
  unregisterOrganelleAnchor,
} from './anchors';
import { buildNucleus } from './builders/nucleus';
import { buildRibosome } from './builders/ribosome';

/**
 * The anchor registry (task 4.1: "each host exposes its anchor world position to the overlay").
 *
 * The annotation layer is PR 5b, so what has to be true *now* is the contract it will consume: the
 * offset is on the part, and the world position follows the organelle root — including under the
 * disassembly loop, which simply moves that root.
 */

afterEach(() => clearOrganelleAnchors());

describe('anchorOffsetFor', () => {
  it('sits at the top-centre of everything the build produced', () => {
    const build = buildNucleus({ size: 0.5, detail: 1, count: 0, poreCount: 0 });

    build.parts[0]!.geometry.computeBoundingBox();
    const envelope = build.parts[0]!.geometry.boundingBox!;
    const offset = anchorOffsetFor(build);

    expect(offset.x).toBeCloseTo((envelope.min.x + envelope.max.x) / 2, 5);
    expect(offset.z).toBeCloseTo((envelope.min.z + envelope.max.z) / 2, 5);
    // The envelope is the tallest part with the pores switched off, so the anchor sits on it.
    expect(offset.y).toBeGreaterThanOrEqual(envelope.max.y - 1e-5);

    build.dispose();
  });

  it('clears the whole build, not just the first part', () => {
    // The ribosome build is a single instanced cloud whose instances are not in the geometry's
    // bounds, so this asserts the offset is finite and inside the cloud rather than at a pole.
    const build = buildRibosome({ size: 0.03, count: 40, spread: 0.5 });
    const offset = anchorOffsetFor(build);

    expect(Number.isFinite(offset.x)).toBe(true);
    expect(offset.y).toBeGreaterThanOrEqual(0);

    build.dispose();
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
