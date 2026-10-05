import {
  Box3,
  BoxGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Vector3,
  type BufferGeometry,
} from 'three';
import { describe, expect, it } from 'vitest';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { attachMount, buildModel, releaseMount } from './MeshCellGroup';
import { clearOrganelleAnchors } from './anchors';

/**
 * The mount's one hard contract: **0 % disassembly is the file unmodified.**
 *
 * Every inspection mechanism stands on it. The disassembly loop moves a record's `host`; the anchor
 * registry reads it; the pick box is derived from it. All three are correct only if the host starts
 * where the file put the part — so the mount may compose the model into per-record hosts, but it may
 * not move a single mesh in world space while doing it.
 *
 * That contract is invisible in review and was **silently violated**: `Object3D.attach` derives its
 * world-preserving offset from `object.parent.matrixWorld`, so calling it against a mesh that is
 * already its own child is a no-op. The mount attached once with the host still at the origin and
 * then again after moving the host to the part's centre — the second call did nothing, so the host's
 * move translated the part instead of pivoting around it. Every mapped record drifted by
 * `frame.scale × its own box centre` (the Golgi by ≈0.78 scene units, which is what pushed it out of
 * frame); the unmapped meshes, never reparented, stayed put, and the model visibly came apart.
 *
 * A synthetic graph with authored names is enough: the manifest is the real one, so the partition,
 * the material collection and the frame arithmetic are all the shipping ones.
 */

/** One mesh per manifest row shape the mount must handle, at a distinct authored transform. */
interface SyntheticMesh {
  name: string;
  position: [number, number, number];
}

const SYNTHETIC_MESHES: readonly SyntheticMesh[] = [
  { name: 'Nulo__Material.013_0', position: [4, 0, 0] },
  { name: 'Nulo__Material.003_0', position: [-4, 1, 0] },
  { name: 'Nulo__Material.010_0', position: [0, 3, 0] },
  { name: 'Nulo__Material.009_0', position: [1, 3, 1] },
  { name: 'Nulo__Material.001_0', position: [-1, 3, -1] },
  // The four chromatin bodies share one authored name: occurrence is the only key.
  { name: 'Nulo__Material.027_0', position: [2, 2, 0] },
  { name: 'Nulo__Material.027_0', position: [-2, 2, 0] },
  { name: 'Nulo__Material.027_0', position: [0, 2, 2] },
  { name: 'Nulo__Material.027_0', position: [0, 2, -2] },
  { name: 'Nulo__Material.025_0', position: [3, -2, 0] },
  { name: 'Nulo__Material.1_0', position: [0, -3, 0] },
  { name: 'Nulo__Material_0', position: [0, 0, 0] },
  { name: 'Nulo__Material.006_0', position: [3, 0, 3] },
  { name: 'Nulo__Material.007_0', position: [-3, 0, 3] },
  { name: 'Nulo__Material.008_0', position: [-3, 0, -3] },
  { name: 'Nulo__Material.026_0', position: [0, 0, -4] },
  { name: 'Nulo__Material.005_0', position: [2, 1, -2] },
  { name: 'Nulo__Material.018_0', position: [1, -1, 2] },
  { name: 'Nulo__Material.018_0', position: [-1, -1, 2] },
  { name: 'Nulo__Material.018_0', position: [0, -1, -2] },
  { name: 'citoplasma_remesh_Material.004_0', position: [0, 0, 0] },
];

/**
 * A model root with a non-identity transform, so the frame is composed with something and a lost
 * transform cannot hide behind an identity.
 */
function syntheticRoot(): { root: Group; meshes: Mesh[] } {
  const root = new Group();

  root.name = 'Synthetic_model';
  root.position.set(7, -11, 5);
  root.rotation.set(0.4, -0.7, 0.2);
  root.scale.setScalar(1.3);

  const node = new Group();

  node.name = 'Nulo_';
  node.position.set(-5.1, -19.7, 120.9);
  root.add(node);

  const geometry = new BoxGeometry(2, 2, 2);
  /*
   * The real model has one node that draws **four** anatomical parts — two rods, each a cluster of
   * bodies, and two single vesicles — and the split separates them by proximity. A single box cannot
   * express that, so this fixture is six boxes: two tight pairs (each pair inside the split radius, so
   * each collapses to one group of two bodies) and two lone boxes, well apart from everything.
   *
   * Measured in the geometry's own units, where the split's 0.06 scene-unit radius is ~14.8 of them.
   */
  const twoBodyPair = (offset: number): BufferGeometry[] => [
    new BoxGeometry(1.5, 1.5, 1.5).translate(offset, 0, 0),
    new BoxGeometry(1.5, 1.5, 1.5).translate(offset + 2, 0, 0),
  ];
  const fourParts = mergeGeometries([
    ...twoBodyPair(0),
    ...twoBodyPair(40),
    new BoxGeometry(1.5, 1.5, 1.5).translate(0, 40, 0),
    new BoxGeometry(1.5, 1.5, 1.5).translate(0, 0, 40),
  ])!;
  const material = new MeshBasicMaterial();
  const meshes: Mesh[] = [];

  for (const [index, spec] of SYNTHETIC_MESHES.entries()) {
    const mesh = new Mesh(spec.name === 'Nulo__Material.025_0' ? fourParts : geometry, material);

    mesh.name = spec.name;
    mesh.position.set(...spec.position);
    mesh.rotation.set(index * 0.07, index * 0.11, index * 0.03);
    mesh.scale.setScalar(1 + index * 0.01);
    meshes.push(mesh);
    // Siblings under one node, in order, so the loader's `_1`, `_2` dedup order is reproduced.
    (index % 2 === 0 ? node : root).add(mesh);
  }

  root.updateMatrixWorld(true);

  return { root, meshes };
}

/**
 * Every mesh's transform expressed in the model's **own** space.
 *
 * The mount is *supposed* to add the frame (a uniform scale plus the centring translation), so a
 * world-space comparison would fail for the wrong reason. Factoring the frame out leaves exactly the
 * thing the mount must not touch: the matrix the file gave each mesh.
 */
function modelSpaceMatrices(reference: Object3D, meshes: readonly Mesh[]): Matrix4[] {
  reference.updateWorldMatrix(true, true);

  const inverse = new Matrix4().copy(reference.matrixWorld).invert();

  return meshes.map((mesh) => {
    mesh.updateWorldMatrix(true, false);

    return new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
  });
}

function maxDelta(a: Matrix4, b: Matrix4): number {
  let max = 0;

  for (let index = 0; index < 16; index += 1) {
    max = Math.max(max, Math.abs(a.elements[index]! - b.elements[index]!));
  }

  return max;
}

/** The world position of an `Object3D`, after refreshing its chain. */
function worldPosition(object: Object3D): Vector3 {
  object.updateWorldMatrix(true, false);

  return new Vector3().setFromMatrixPosition(object.matrixWorld);
}

describe('the model mount', () => {
  it('leaves every mesh at the exact transform the file gave it, frame aside', () => {
    const { root, meshes } = syntheticRoot();
    const before = modelSpaceMatrices(root, meshes);

    buildModel('animal', root);
    // The **same** reference in both calls: the model root, whose own matrix the mount must not
    // touch either. Comparing against the frame group instead would fold `root`'s transform into the
    // expected value and hide exactly the drift this test is for.
    const after = modelSpaceMatrices(root, meshes);

    for (let index = 0; index < meshes.length; index += 1) {
      const delta = maxDelta(before[index]!, after[index]!);

      expect(
        delta,
        `${meshes[index]!.name} moved ${delta.toFixed(6)} inside the model — the mount is not world-preserving`,
      ).toBeLessThan(1e-9);
    }
  });

  it('still reparents each mapped mesh into its record host', () => {
    const { root, meshes } = syntheticRoot();
    const built = buildModel('animal', root);
    const byRecord = new Map(built.records.map((record) => [record.recordId, record.host]));
    const parentOf = (name: string) => meshes.find((mesh) => mesh.name === name)!.parent;

    // The verified map assigns all 21 meshes to 14 records, so the mount publishes 14 hosts.
    expect(built.records).toHaveLength(14);

    // The mechanism the disassembly loop drives: a mapped mesh must live under its record's host,
    // or there is nothing for the loop to move.
    expect(parentOf('Nulo__Material_0')).toBe(byRecord.get('membrane'));
    expect(parentOf('Nulo__Material.006_0')).toBe(byRecord.get('golgi'));
    expect(parentOf('Nulo__Material.007_0')).toBe(byRecord.get('mitochondrion'));
    expect(parentOf('Nulo__Material.008_0')).toBe(byRecord.get('mitochondrion'));
    expect(parentOf('Nulo__Material.013_0')).toBe(byRecord.get('cytoskeleton'));
    expect(parentOf('Nulo__Material.003_0')).toBe(byRecord.get('nuclear-envelope'));
    expect(parentOf('Nulo__Material.026_0')).toBe(byRecord.get('smooth-endoplasmic-reticulum'));
    expect(parentOf('Nulo__Material.005_0')).toBe(byRecord.get('endoplasmic-reticulum'));

    // The nucleus is one record in two meshes ([2] + [3]): both move as one unit.
    expect(parentOf('Nulo__Material.010_0')).toBe(byRecord.get('nucleus'));
    expect(parentOf('Nulo__Material.009_0')).toBe(byRecord.get('nucleus'));
    expect(parentOf('Nulo__Material.010_0')).toBe(parentOf('Nulo__Material.009_0'));

    // The mitochondrion is the other pair.
    expect(parentOf('Nulo__Material.007_0')).toBe(parentOf('Nulo__Material.008_0'));

    // The four repeat-named bodies share one host; so do the three ribosome clouds.
    const nucleolus = byRecord.get('nucleolus');
    expect(meshes.filter((mesh) => mesh.parent === nucleolus)).toHaveLength(4);
    const ribosome = byRecord.get('ribosome');
    expect(meshes.filter((mesh) => mesh.parent === ribosome)).toHaveLength(3);

    // Every visible mesh is mapped: none is left behind under the model's own node. The split's
    // source is hidden on purpose, and it is the one mesh that legitimately sits outside a host.
    expect(meshes.some((mesh) => mesh.visible && mesh.parent?.name === 'Nulo_')).toBe(false);
  });

  it('divides one node into the parts it draws, without moving a thing', () => {
    /*
     * The split's contract, in one test: a node that draws several anatomical parts becomes one mesh
     * per part, each under its own record's host, sharing the source attributes — and the parts are
     * exactly where the original was, with every triangle accounted for.
     */
    const { root, meshes } = syntheticRoot();
    const source = meshes.find((mesh) => mesh.name === 'Nulo__Material.025_0')!;
    const built = buildModel('animal', root);
    // Measured **after** the mount, so the model's frame is applied on both sides of the comparison.
    const reference = worldPosition(source);
    const hosts = new Map(built.records.map((record) => [record.recordId, record.host]));

    const partsOf = (recordId: string): Mesh[] =>
      (hosts.get(recordId)?.children.filter((child) => (child as Mesh).isMesh) as Mesh[]) ?? [];

    const centrioles = partsOf('centriole');
    const lysosomes = partsOf('lysosome');

    // Four groups come out of the fixture — two pairs of bodies and two lone boxes — and the manifest
    // sends the first two to the centrioles, leaving the remainder to the lysosomes.
    expect(centrioles).toHaveLength(2);
    expect(lysosomes).toHaveLength(2);

    // Each part is its own geometry, sharing the source's attributes: the split costs indices, and
    // nothing else — and no part moved, because each inherits the source mesh's own transform.
    for (const part of [...centrioles, ...lysosomes]) {
      expect(part.geometry.getAttribute('position')).toBe(
        centrioles[0]!.geometry.getAttribute('position'),
      );
      expect(worldPosition(part).distanceTo(reference)).toBeLessThan(1e-9);
    }

    // Every triangle landed in exactly one part. Six boxes of 12 triangles, three corners each.
    const corners = [...centrioles, ...lysosomes].reduce(
      (total, part) => total + part.geometry.getIndex()!.count,
      0,
    );

    expect(corners).toBe(216);
  });

  it('keeps every mesh under its host across a mount/unmount/mount effect cycle', () => {
    /*
     * The development-only trap this pins, and the reason the exploded view "did nothing" while the
     * model still rendered perfectly.
     *
     * React StrictMode runs an effect, its cleanup, and the effect again on mount. The cleanup used
     * to re-attach every mesh to the node it came from — and that node is not the host, so the call
     * **detached the mesh from its host**. The second run only re-registered the anchors, so the
     * hosts stayed empty: the model kept rendering (its meshes were back where the file put them),
     * and the disassembly loop moved empty groups.
     *
     * `buildModel` runs on a per-mount clone, so there is nothing outside the mount to restore and
     * `releaseMount` must not touch the graph.
     */
    const { root, meshes } = syntheticRoot();
    const built = buildModel('animal', root);
    const byRecord = new Map(built.records.map((record) => [record.recordId, record.host]));

    attachMount(built);
    releaseMount(built);
    attachMount(built);

    for (const mesh of meshes) {
      // The split hides the mesh it divided; its parts carry the geometry from there.
      if (!mesh.visible) {
        continue;
      }

      expect(
        built.records.some((record) => record.host === mesh.parent),
        `${mesh.name} is not under a host after the effect cycle`,
      ).toBe(true);
    }

    expect(meshes.find((mesh) => mesh.name === 'Nulo__Material.006_0')?.parent).toBe(
      byRecord.get('golgi'),
    );

    clearOrganelleAnchors();
  });

  it('puts each host on the centre of the part it pivots', () => {
    const { root } = syntheticRoot();
    const built = buildModel('animal', root);

    built.frameGroup.updateWorldMatrix(true, true);

    let checked = 0;

    for (const record of built.records) {
      // Read the host's own children: a split's parts are meshes this fixture never built.
      const owned = record.host.children.filter((child) => (child as Mesh).isMesh) as Mesh[];

      expect(owned.length, `${record.recordId} has no meshes under its host`).toBeGreaterThan(0);

      const box = new Box3();

      for (const mesh of owned) {
        mesh.updateWorldMatrix(true, false);
        box.union(new Box3().setFromObject(mesh));
      }

      // The pivot is the part's own centre, not the cell's: that is what makes the disassembly
      // offset mean "away from this part" rather than "away from the origin".
      const distance = worldPosition(record.host).distanceTo(box.getCenter(new Vector3()));

      expect(distance, `${record.recordId}'s host is ${distance} from its own centre`).toBeLessThan(
        1e-6,
      );
      checked += 1;
    }

    expect(checked).toBe(built.records.length);
    expect(checked).toBeGreaterThan(5);
  });

  it('publishes each record bounds in frame units so the collider and the anchor agree', () => {
    const { root } = syntheticRoot();
    const built = buildModel('animal', root);

    for (const record of built.records) {
      const { min, max } = record.bounds;

      expect(max[0] - min[0]).toBeGreaterThan(0);
      expect(max[1] - min[1]).toBeGreaterThan(0);
      expect(max[2] - min[2]).toBeGreaterThan(0);
    }
  });
});
