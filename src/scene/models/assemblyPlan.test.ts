import { BoxGeometry, Mesh, Object3D, PropertyBinding, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { MODEL_MANIFEST } from '../../catalog/models';
import {
  applyCellFrame,
  partitionRecordMeshes,
  planRecordAssembly,
  shiftBounds,
} from './assemblyPlan';

/**
 * The mesh-path assembly arithmetic (tasks 13.1/13.2).
 *
 * Pure over hand-built `Object3D` graphs: no GLB, no WebGL context, no meshopt decoder. The
 * GLB-specific facts (sha256, node names) belong to `verify/model-audit.mjs`; what is asserted here
 * is that a mesh resolves to the right record and that a record's union geometry lands where the
 * rest of the scene expects it.
 *
 * The graph is named the way `GLTFLoader` names it — sanitised, with a `_1`/`_2` suffix on repeats —
 * rather than the way the manifest writes it, because that difference is the whole reason
 * `manifestLookup.ts` exists. A test that used raw manifest names would pass while the real loader
 * resolved nothing.
 */

const ANIMAL_FRAME = MODEL_MANIFEST.animal.frame;

/** The loader's naming, reproduced: sanitise, then de-duplicate with `_1`, `_2`, …. */
function createLoaderNamer(): (rawName: string) => string {
  const used = new Map<string, number>();

  return (rawName: string): string => {
    const sanitized = PropertyBinding.sanitizeNodeName(rawName);
    const seen = used.get(sanitized);

    if (seen === undefined) {
      used.set(sanitized, 0);

      return sanitized;
    }

    const next = seen + 1;

    used.set(sanitized, next);

    return `${sanitized}_${next}`;
  };
}

/** A root whose mesh node names match the manifest's, run through the loader's own naming. */
function modelGraph(nodeNames: readonly string[]): Object3D {
  const root = new Object3D();
  const nameFor = createLoaderNamer();

  for (const nodeName of nodeNames) {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1));

    mesh.name = nameFor(nodeName);
    root.add(mesh);
  }

  return root;
}

describe('applyCellFrame', () => {
  it('maps the source centre onto the scene origin', () => {
    const root = modelGraph(['probe']);
    const mesh = root.children[0]!;

    // A mesh sitting on the model's own centre must land on the origin after normalisation.
    mesh.position.set(ANIMAL_FRAME.center[0], ANIMAL_FRAME.center[1], ANIMAL_FRAME.center[2]);
    applyCellFrame(root, ANIMAL_FRAME);
    mesh.updateWorldMatrix(true, false);

    const world = new Vector3().setFromMatrixPosition(mesh.matrixWorld);

    expect(world.length()).toBeCloseTo(0, 6);
  });

  it('scales the model into scene units', () => {
    const root = modelGraph(['probe']);
    const mesh = root.children[0]!;

    applyCellFrame(root, ANIMAL_FRAME);
    mesh.updateWorldMatrix(true, false);

    const worldScale = new Vector3().setFromMatrixScale(mesh.matrixWorld);

    expect(worldScale.x).toBeCloseTo(ANIMAL_FRAME.scale, 9);
    expect(worldScale.y).toBeCloseTo(ANIMAL_FRAME.scale, 9);
    expect(worldScale.z).toBeCloseTo(ANIMAL_FRAME.scale, 9);
  });
});

describe('partitionRecordMeshes', () => {
  it('groups the repeated chromatin meshes under the one nucleus record', () => {
    const root = modelGraph([
      'Nulo__Material.027_0',
      'Nulo__Material.027_0',
      'Nulo__Material.027_0',
      'Nulo__Material.027_0',
    ]);

    applyCellFrame(root, ANIMAL_FRAME);
    const plans = partitionRecordMeshes(root, 'animal', MODEL_MANIFEST);
    const nucleus = plans.get('nucleus');

    expect(nucleus?.meshes).toHaveLength(4);
    expect(nucleus?.meshes.map((entry) => entry.materialKey)).toEqual([
      'chromatin',
      'chromatin',
      'chromatin',
      'chromatin',
    ]);
  });

  it('resolves the mitochondrion to ONE record holding BOTH of its meshes', () => {
    const root = modelGraph(['Nulo__Material.007_0', 'Nulo__Material.008_0']);

    applyCellFrame(root, ANIMAL_FRAME);
    const plans = partitionRecordMeshes(root, 'animal', MODEL_MANIFEST);
    const mitochondrion = plans.get('mitochondrion');

    // Design D29: one organelle, two shells, one record — which is what lets disassembly move them
    // as one unit and the anchor sit on the union of both.
    expect(mitochondrion?.meshes.map((entry) => entry.materialKey).sort()).toEqual([
      'innerMembrane',
      'outerMembrane',
    ]);
    expect(plans.size).toBe(1);
  });

  it('gives a record a union box that contains every one of its meshes', () => {
    const root = modelGraph(['Nulo__Material.007_0', 'Nulo__Material.008_0']);
    const [inner, outer] = root.children as [Mesh, Mesh];

    inner.position.x = -2;
    outer.position.x = 2;
    applyCellFrame(root, ANIMAL_FRAME);

    const plan = partitionRecordMeshes(root, 'animal', MODEL_MANIFEST).get('mitochondrion')!;

    // Two unit boxes centred two source units either side of the origin: the union spans 5 source
    // units, so it contains both meshes rather than only the first one the traversal met.
    expect(plan.bounds.max[0] - plan.bounds.min[0]).toBeCloseTo(5 * ANIMAL_FRAME.scale, 9);
    // Their midpoint is the source origin, which normalisation maps onto `-scale · frameCentre`.
    expect(plan.center[0]).toBeCloseTo(-ANIMAL_FRAME.scale * ANIMAL_FRAME.center[0], 9);
  });

  it('leaves an omitted or unmapped mesh without a record', () => {
    // `Nulo__Material.003_0` is debris (omit); `Nulo__Material.013_0` is the filament network
    // (unmapped). Neither may produce a record, and no label may be invented for them (D26).
    const root = modelGraph(['Nulo__Material.003_0', 'Nulo__Material.013_0']);

    applyCellFrame(root, ANIMAL_FRAME);
    const plans = partitionRecordMeshes(root, 'animal', MODEL_MANIFEST);

    expect(plans.size).toBe(0);
  });

  it('maps every animal row the manifest calls mapped', () => {
    const nodeNames = MODEL_MANIFEST.animal.meshes.map((row) => row.node);
    const root = modelGraph(nodeNames);

    applyCellFrame(root, ANIMAL_FRAME);
    const plans = partitionRecordMeshes(root, 'animal', MODEL_MANIFEST);
    const meshCount = [...plans.values()].reduce((total, plan) => total + plan.meshes.length, 0);
    const mappedRows = MODEL_MANIFEST.animal.meshes.filter((row) => row.policy === 'map').length;

    // The real animal model resolves 16 mapped meshes across 7 records; every one of them lands.
    expect(meshCount).toBe(mappedRows);
    expect(plans.size).toBe(7);
  });
});

describe('planRecordAssembly', () => {
  it('recentres the union on the record placement and anchors on the box top', () => {
    const root = modelGraph(['Nulo__Material.007_0', 'Nulo__Material.008_0']);

    applyCellFrame(root, ANIMAL_FRAME);

    const plan = partitionRecordMeshes(root, 'animal', MODEL_MANIFEST).get('mitochondrion')!;
    const target: [number, number, number] = [0.4, -0.2, 0.1];
    const assembly = planRecordAssembly(plan, target);

    // recentre = target − model centre, so target + recentre + (modelCentre − target) = target.
    expect(assembly.recentre[0]).toBeCloseTo(target[0] - plan.center[0], 9);
    expect(assembly.recentre[1]).toBeCloseTo(target[1] - plan.center[1], 9);
    expect(assembly.localBounds.min[0]).toBeCloseTo(plan.bounds.min[0] - plan.center[0], 9);
    expect(assembly.localBounds.max[1]).toBeCloseTo(plan.bounds.max[1] - plan.center[1], 9);
    // The anchor is the top-centre of the recentred box: directly above the root's origin.
    expect(assembly.anchorOffset.x).toBeCloseTo(0, 9);
    expect(assembly.anchorOffset.z).toBeCloseTo(0, 9);
    expect(assembly.anchorOffset.y).toBeCloseTo(plan.bounds.max[1] - plan.center[1], 9);
  });
});

describe('shiftBounds', () => {
  it('translates both corners', () => {
    const shifted = shiftBounds({ min: [0, 0, 0], max: [1, 2, 3] }, [1, -1, 2]);

    expect(shifted.min).toEqual([1, -1, 2]);
    expect(shifted.max).toEqual([2, 1, 5]);
  });
});
