import { InstancedMesh, Matrix4, Mesh, Object3D, type BufferGeometry } from 'three';
import { rosterFor } from '../catalog/cells';
import type { CellId } from '../catalog/types';
import { builderIdFor, paramsForRecord, positionForRecord } from '../catalog/params';
import { getRecord } from '../catalog/cells';
import { getBuilder } from '../scene/builders/registry';
import type { OrganelleBuild, OrganellePart } from '../scene/builders/primitives';

/**
 * Test support: mounts a builder's parts as named meshes, the way `PartMesh` does.
 *
 * The process animations are placed by **reading the built structure**, so a test that wants to
 * exercise them needs a scene graph that carries the same names and the same instance matrices the
 * viewer produces. This builds exactly that, in Node, with no renderer — which is what lets the
 * light invariant, the grana placement and the disposal behaviour be asserted as unit tests instead
 * of only through a browser.
 *
 * It is named `partMount`, not `testSomething`, because the important thing about it is *what it
 * builds*; nothing in the application imports it (the app renders real `PartMesh` components), so it
 * never reaches the shipped bundle.
 */

export interface MountedOrganelle {
  root: Object3D;
  build: OrganelleBuild;
  /** The mounted meshes by part name, for a test that wants to inspect one. */
  parts: Map<string, Object3D>;
  dispose: () => void;
}

const MATRIX = new Matrix4();

function mountPart(part: OrganellePart): Object3D {
  if (part.kind === 'instanced') {
    const mesh = new InstancedMesh(part.geometry, undefined, part.instanceCount);

    for (let index = 0; index < part.instanceCount; index += 1) {
      MATRIX.fromArray(part.matrices, index * 16);
      mesh.setMatrixAt(index, MATRIX);
    }

    mesh.name = part.name;

    return mesh;
  }

  const mesh = new Mesh(part.geometry as BufferGeometry);
  mesh.name = part.name;

  return mesh;
}

/**
 * Builds one catalog record and mounts it under a root at the record's cell placement.
 *
 * The placement matters: `rootLocalMatrixOf` resolves a part's transform through the root's world
 * matrix, so a test that placed the root at the origin would not catch a bug in that resolution.
 */
export function mountOrganelle(organelleId: string, cell: CellId = 'animal'): MountedOrganelle {
  const record = getRecord(organelleId);

  if (!record) {
    throw new Error(`mountOrganelle: no catalog record "${organelleId}"`);
  }

  const build = getBuilder(builderIdFor(record))(paramsForRecord(record, cell));
  const root = new Object3D();
  const parts = new Map<string, Object3D>();
  const [x, y, z] = positionForRecord(record, cell);

  root.name = `cell:${cell}/${organelleId}`;
  // Placed where the viewer places it. A root left at the origin would not catch a bug in the
  // root-local resolution the process modules depend on.
  root.position.set(x, y, z);

  for (const part of build.parts) {
    const mesh = mountPart(part);
    parts.set(part.name, mesh);
    root.add(mesh);
  }

  root.updateMatrixWorld(true);

  return {
    root,
    build,
    parts,
    dispose: () => build.dispose(),
  };
}

export interface MountedCell {
  /** The cell group every organelle root is a child of — the shape `CellGroup.tsx` produces. */
  group: Object3D;
  /** Each record's root object, by organelle id. */
  roots: Map<string, Object3D>;
  dispose: () => void;
}

/**
 * Builds one whole cell's roster and mounts it under a cell group, in Node.
 *
 * The whole-cell processes (M3's mitosis) animate across several organelles at once — chromatids
 * leave the nucleus, the furrow closes the membrane, the plate spans the cytosol — so a test that
 * wants to exercise one needs the same multi-organelle graph the viewer composes, with the same
 * placements and the same per-cell parameter resolution. `mountOrganelle` is the single-organelle
 * half of the same idea; this is the other half.
 *
 * Like `partMount`, nothing in the application imports this: it never reaches the shipped bundle.
 */
export function mountCell(cell: CellId = 'animal'): MountedCell {
  const group = new Object3D();
  const roots = new Map<string, Object3D>();
  const builds: OrganelleBuild[] = [];

  group.name = `cell:${cell}`;

  for (const record of rosterFor(cell)) {
    const build = getBuilder(builderIdFor(record))(paramsForRecord(record, cell));
    const root = new Object3D();
    const [x, y, z] = positionForRecord(record, cell);

    root.name = record.id;
    root.position.set(x, y, z);

    for (const part of build.parts) {
      root.add(mountPart(part));
    }

    group.add(root);
    roots.set(record.id, root);
    builds.push(build);
  }

  group.updateMatrixWorld(true);

  return {
    group,
    roots,
    dispose: () => {
      for (const build of builds) {
        build.dispose();
      }
    },
  };
}
