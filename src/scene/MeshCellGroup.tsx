import { useEffect, useLayoutEffect, useMemo } from 'react';
import { Box3, Group, Matrix4, Vector3, type Material, type Mesh, type Object3D } from 'three';
import { useAppStore } from '../app/store';
import { getRecord } from '../catalog/cells';
import { MODEL_MANIFEST, modelFor } from '../catalog/models';
import type { CellId } from '../catalog/types';
import type { Bounds3 } from '../catalog/vectors';
import { registerOrganelleAnchor, unregisterOrganelleAnchor } from './anchors';
import { isOuterEnvelope, PickVolume } from './interaction/Picking';
import { applyEmphasis, emphasisFor, prepareEmphasis } from './highlight';
import { partitionRecordMeshes } from './models/partitionModel';
import type { LoadedCellModel } from './models/useCellModel';

/**
 * The loaded model, mounted **as authored**, plus the two things the viewer adds.
 *
 * ## The mount
 *
 * The model's own scene graph is mounted under one group carrying the manifest's single uniform
 * frame (scale + the translation that centres the cell) and one host group per record. Nothing else
 * is touched: no mesh is re-centred, re-scaled or recoloured, and the model's own materials are the
 * ones that render. The previous integration's fatal design error — re-centring each record's meshes
 * onto placements authored for the old procedural cell, with palette recipes replacing the model's
 * materials — is structurally impossible here: this file has no code path that writes a mesh
 * transform or a material colour.
 *
 * ## What is added
 *
 * 1. **A host group per record**, so "the organelle" is one `Object3D` the existing mechanisms
 *    already act on: the disassembly loop writes its `position`, the anchor registry reads its
 *    `matrixWorld`. The record's meshes are reparented into it with three's world-preserving
 *    `attach()`, so their world transforms are unchanged — which is why 0% disassembly is the file
 *    unmodified. The mitochondrion is one record holding two meshes, so its cristae and outer
 *    membranes move as one unit by construction.
 * 2. **An anchor and a hit volume per record.** The anchor is the top-centre of the record's mesh
 *    bounds. The hit volume is a box, not a raycast against 808,443 triangles (design D7), and it is
 *    placed from the record's bounds **converted into scene units** — a box built from the model's own
 *    ~600-unit space would swallow the whole cell and make every click resolve to one organelle.
 *
 * **The hosts are built imperatively, in one `useMemo`, and that order is load-bearing.** Building
 * them as JSX and attaching in a child effect is wrong here: React mounts children before parents, so
 * each host's effect would run while the meshes were still directly under the frame group — after its
 * scale — and the `attach()` would then use the host's pre-mount identity matrix, dropping the meshes
 * to model units. Attaching inside the same pass that creates the host keeps world matrices and
 * attachment consistent, so the measured bounds are the numbers that render.
 *
 * The frame group ends at the origin. Each host's position is written by the disassembly loop from
 * progress 0, and the model root's own authored offset (the cell is not centred on its origin in the
 * file) stays inside the frame group as one translation.
 *
 * ## Emphasis
 *
 * Hover and isolate are the existing `highlight.ts` rule written to the record's own material
 * instances. No two records share a material — the integrity gate enforces the manifest's key
 * ownership — so "highlight the mitochondrion" cannot light up the Golgi.
 */

interface BuiltRecord {
  recordId: string;
  host: Group;
  /** The record's mesh bounds in the host's own local space — frame units, host-relative. */
  bounds: Bounds3;
  envelope: boolean;
}

interface BuiltModel {
  frameGroup: Group;
  records: BuiltRecord[];
  materialsByRecord: Map<string, Material[]>;
  /** Where each mesh came from, so unmounting restores the cached model graph. */
  origins: Map<Mesh, Object3D | null>;
}

/** The top-centre of a box: where a leader line can leave the part without crossing it. */
function anchorOffsetFor(bounds: Bounds3): Vector3 {
  return new Vector3(
    (bounds.min[0] + bounds.max[0]) / 2,
    bounds.max[1],
    (bounds.min[2] + bounds.max[2]) / 2,
  );
}


/** Shifts a bounds by a displacement, returning a fresh box. */
function shiftBounds(bounds: Bounds3, offset: Vector3): Bounds3 {
  return {
    min: [bounds.min[0] + offset.x, bounds.min[1] + offset.y, bounds.min[2] + offset.z],
    max: [bounds.max[0] + offset.x, bounds.max[1] + offset.y, bounds.max[2] + offset.z],
  };
}

function buildModel(cell: CellId, root: Object3D): BuiltModel {
  const frame = modelFor(cell)?.frame;

  if (!frame) {
    throw new Error(`MeshCellGroup needs a manifest frame for the ${cell} cell`);
  }

  /**
   * The mount, in one pass. The order is load-bearing.
   *
   * `frameGroup` carries the model's single frame (uniform scale + the translation that centres the
   * cell). `inner` holds the model root and its own authored offset; every host is created under the
   * frame **before** any matrix is refreshed, and the single refresh happens with the whole tree in
   * place.
   *
   * `updateWorldMatrix` recomputes ancestors first, so a refresh taken before the hosts exist leaves
   * them identity — and `attach` then stores each mesh's local transform in the *model's* units
   * instead of the frame's. That is the whole reason a stale-measurement pick proxy came out ~250x
   * too large and swallowed every click.
   *
   * **A host stays inside the frame group, and its position is the part's centre in the frame's own
   * units.** Nothing divides by the frame's scale anywhere, so the model is mounted exactly as
   * authored, and the disassembly loop's offset is the one number that has to be translated into the
   * frame's space — which `scene/disassembly.ts` does, in one place, from the manifest's scale.
   */
  const partition = partitionRecordMeshes(root, cell, MODEL_MANIFEST);
  const origins = new Map<Mesh, Object3D | null>();

  const frameGroup = new Group();

  frameGroup.name = `cell-frame:${cell}`;

  // The frame goes **on the model root itself**: a uniform scale about the cell's centre, expressed
  // as `scale` + the translation that recentres it. Nothing else in the graph carries the scale, so
  // `attach` reads it directly from the root's own world matrix.
  root.scale.setScalar(frame.scale);
  root.position.set(
    -frame.center[0] * frame.scale,
    -frame.center[1] * frame.scale,
    -frame.center[2] * frame.scale,
  );
  frameGroup.add(root);
  frameGroup.updateWorldMatrix(false, true);

  const hosts = new Map<string, Group>();

  for (const group of partition.groups) {
    const host = new Group();

    host.name = group.recordId;
    host.userData = { organelleId: group.recordId, basePosition: [0, 0, 0] };
    frameGroup.add(host);
    hosts.set(group.recordId, host);
  }

  frameGroup.updateWorldMatrix(false, true);

  const records: BuiltRecord[] = [];
  const materialsByRecord = new Map<string, Material[]>();

  for (const group of partition.groups) {
    const record = getRecord(group.recordId);
    const host = hosts.get(group.recordId)!;

    for (const mesh of group.meshes) {
      origins.set(mesh, mesh.parent);
      host.attach(mesh);
    }

    const materials: Material[] = [];

    for (const mesh of group.meshes) {
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;

      if (material && !materials.includes(material)) {
        materials.push(material);
      }
    }

    for (const material of materials) {
      prepareEmphasis(material);
    }

    materialsByRecord.set(group.recordId, materials);

    /**
     * The part's box, in the **frame's own local units** — the space the host's position lives in
     * and the space the anchor and the hit box are declared in.
     *
     * Refreshing each mesh first is load-bearing: `Box3.setFromObject` reads their *cached*
     * `matrixWorld`, and `attach` has just rewritten their local transforms without recomputing it.
     * The box is then expressed in the frame by applying the frame's own inverse to it.
     */
    frameGroup.updateWorldMatrix(false, true);

    const frameInverse = new Matrix4().copy(frameGroup.matrixWorld).invert();
    const box = new Box3();

    for (const mesh of group.meshes) {
      mesh.updateWorldMatrix(true, false);
      box.union(new Box3().setFromObject(mesh).applyMatrix4(frameInverse));
    }

    const centre = box.isEmpty() ? new Vector3() : box.getCenter(new Vector3());

    const bounds: Bounds3 = box.isEmpty()
      ? { min: [0, 0, 0], max: [0, 0, 0] }
      : {
          min: [box.min.x - centre.x, box.min.y - centre.y, box.min.z - centre.z],
          max: [box.max.x - centre.x, box.max.y - centre.y, box.max.z - centre.z],
        };

    /*
     * The host stays at the frame group's origin and the meshes keep the transforms `attach` gave
     * them. That is the whole mount: the model is exactly as authored, and a disassembly offset is
     * added on top of a host that begins at zero.
     *
     * `centre` is recorded as data (the isolate framing reads it through the record's own placement)
     * but it must NOT be applied as a host translation: a mesh's local `position` is usually zero
     * with all its geometry in the vertices, so subtracting a frame-unit centre from it moves the
     * mesh by `−centre` in *local* space — which the frame then scales down 247×, leaving the mesh
     * where it was while the host jumps. That is the bug that displaced the model.
     */
    host.userData.basePosition = [0, 0, 0];

    records.push({
      recordId: group.recordId,
      host,
      bounds,
      envelope: record !== undefined && isOuterEnvelope(record),
    });
  }

  return { frameGroup, records, materialsByRecord, origins };
}

/** The hover/isolate emphasis, written to each record's own materials on a store change. */
function MeshEmphasis({ materialsByRecord }: { materialsByRecord: Map<string, Material[]> }) {
  const hoveredId = useAppStore((state) => state.hoveredId);
  const selectedId = useAppStore((state) => state.selectedId);

  useEffect(() => {
    for (const [recordId, materials] of materialsByRecord) {
      const mode = emphasisFor(recordId, hoveredId, selectedId);

      for (const material of materials) {
        applyEmphasis(material, mode);
      }
    }
  }, [materialsByRecord, hoveredId, selectedId]);

  return null;
}

/**
 * The hit volumes, one per record, in the frame's units.
 *
 * A volume is a box, not a raycast against 808,443 triangles (design D7). It is placed from the
 * record's own measured bounds relative to its host, and follows the host's live position so a
 * separated organelle stays clickable.
 */
function MeshPickVolumes({ records }: { records: BuiltRecord[] }) {
  const disassemblyTarget = useAppStore((state) => state.disassemblyTarget);

  const boxes = useMemo(
    () =>
      records.map((record) => ({
        recordId: record.recordId,
        envelope: record.envelope,
        bounds: shiftBounds(record.bounds, record.host.position),
      })),
    // The host positions are written by the frame loop, not by React, so the memo is rebuilt on every
    // disassembly step rather than on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records, disassemblyTarget],
  );

  return (
    <>
      {boxes.map((box) => (
        <PickVolume
          key={box.recordId}
          organelleId={box.recordId}
          bounds={box.bounds}
          envelope={box.envelope}
        />
      ))}
    </>
  );
}

export interface MeshCellGroupProps {
  cell: CellId;
  model: LoadedCellModel;
}

export function MeshCellGroup({ cell, model }: MeshCellGroupProps) {
  const built = useMemo(() => buildModel(cell, model.root), [cell, model.root]);

  useLayoutEffect(() => {
    for (const record of built.records) {
      registerOrganelleAnchor(record.recordId, record.host, anchorOffsetFor(record.bounds));
    }

    return () => {
      // Restore the model graph the loader cached: a second mount must find its meshes where the
      // file put them. Restoring through `attach` also rewrites the original world matrices exactly,
      // because the origin's own matrix has not changed.
      for (const [mesh, origin] of built.origins) {
        if (origin) {
          origin.updateWorldMatrix(true, false);
          origin.attach(mesh);
        } else {
          mesh.removeFromParent();
        }
      }

      for (const record of built.records) {
        unregisterOrganelleAnchor(record.recordId);
      }
    };
  }, [built]);

  return (
    <>
      <MeshPickVolumes records={built.records} />
      <primitive object={built.frameGroup} />
      {/*
        One `<primitive>` per host. They were detached from the frame group in `buildModel`, so they
        are mounted here as siblings of it: `frameGroup` carries the model's own scale and offset,
        each host carries its measured scene-unit position, and the disassembly loop writes over that
        position every frame.
      */}
      {built.records.map((record) => (
        <primitive key={record.recordId} object={record.host} />
      ))}
      <MeshEmphasis materialsByRecord={built.materialsByRecord} />
    </>
  );
}
