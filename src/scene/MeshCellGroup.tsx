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
  /** The frame's uniform scale and the translation that recentres the cell. Applied by the JSX. */
  frameScale: number;
  framePosition: [number, number, number];
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

/**
 * The mount, as one pure-ish function over a model root.
 *
 * **Exported for the world-preservation test.** The contract that matters here — "every mesh keeps
 * the world transform the file gave it" — is invisible in code review and was wrong for a while, so
 * it is asserted against a real three.js graph in `MeshCellGroup.test.ts` rather than left to
 * inspection.
 */
export function buildModel(cell: CellId, root: Object3D): BuiltModel {
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
  frameGroup.add(root);

  /*
   * The frame is written here **and** passed as JSX props below, and both are necessary.
   *
   * Here, because `buildModel` measures every host's bounds through the frame's matrices and those
   * numbers are the ones that render. And as props, because R3F reconciles a `<primitive>`'s
   * transform from its props and would otherwise reset this group to scale 1 — which is exactly what
   * happened: the hosts stayed at the model's raw 50-unit scale, so at 0% they happened to sit at the
   * origin and looked right, and any disassembly offset threw them thousands of pixels off screen.
   */
  frameGroup.scale.setScalar(frame.scale);
  frameGroup.position.set(
    -frame.center[0] * frame.scale,
    -frame.center[1] * frame.scale,
    -frame.center[2] * frame.scale,
  );
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

    /**
     * The meshes are **recorded here and moved later**, and that order is load-bearing.
     *
     * `Object3D.attach()` derives its world-preserving offset from `object.parent.matrixWorld`. When
     * the mesh is *already* a child of the target, that offset is `this.matrixWorld⁻¹ ×
     * this.matrixWorld` — the identity — so `attach` silently degrades to a no-op. The mount used to
     * attach here, with the host still at the origin, and then attach again after the host had moved
     * to the part's own centre: the second call did nothing, so the host's move was applied **on top
     * of** its meshes rather than around them.
     *
     * The measured result was a per-record translation of `frame.scale × that record's own box
     * centre`, in scene units: the Golgi by ≈(+0.57, −0.01, +0.53) — about 81 px right and 72 px down
     * at the composed pose, the largest of the offsets — and the membrane by ≈0.31 units. The meshes
     * the manifest does not map are never reparented, so they stayed put, and the two groups sliding
     * apart is the displacement that reads as "the cell is stretched". Attaching **once**, after the
     * host has been moved, is what makes the reparenting genuinely world-preserving — and therefore
     * what makes 0 % disassembly the file unmodified.
     */
    for (const mesh of group.meshes) {
      origins.set(mesh, mesh.parent);
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

    /*
     * The bounds are published in **scene units**, while `box` was measured in the frame's units.
     * Multiplying by the frame's scale is the one conversion: it is what makes the hit volume a
     * scene-unit box at the scene root, and what keeps the anchor offset meaningful to the isolate
     * framing (which reads the record's scene-unit placement).
     */
    const toScene = (v: number) => v * frame.scale;
    const bounds: Bounds3 = box.isEmpty()
      ? { min: [0, 0, 0], max: [0, 0, 0] }
      : {
          min: [toScene(box.min.x - centre.x), toScene(box.min.y - centre.y), toScene(box.min.z - centre.z)],
          max: [toScene(box.max.x - centre.x), toScene(box.max.y - centre.y), toScene(box.max.z - centre.z)],
        };

    /**
     * The host becomes a **pivot at the part's own centre**: it moves to that centre and each mesh
     * moves back by the same amount, so the assembly renders exactly where the file put it.
     *
     * This is what makes `disassemblyOffset` mean "away from this part's own centre" rather than
     * "away from the cell's centre". Without it every part travels from the origin along a
     * cell-radial direction, and a 1.5-unit travel throws the whole cell's contents out of frame —
     * measured: at 100% only the membrane and cytoplasm survived, at 9 draw calls.
     *
     * `attach` already gave each mesh a local transform in the frame's units, so subtracting a
     * frame-unit centre from `mesh.position` is consistent. The host's new position is published on
     * `userData` because the disassembly loop writes over `position` every frame and needs the
     * authored base to add its offset to.
     */
    /*
     * The host becomes a pivot at the part's own centre, without moving the model a pixel.
     *
     * The arithmetic is done in **world** space and finished by `attach`, because that is the only
     * space three keeps consistent for us: the host is moved to the part's world centre, and each
     * mesh is re-attached, which recomputes its local transform from its (unchanged) world matrix.
     * Hand-subtracting a frame-unit or scene-unit offset is what produced every previous failure —
     * `position` is multiplied by the frame's scale, so a value measured in the wrong space lands
     * 247× off.
     *
     * This is the **first and only** reparenting of these meshes. It has to be, for the reason
     * spelled out above: `attach` is a no-op against its own child, so a second call would leave the
     * mesh where the host's move put it.
     */
    host.position.copy(centre);
    host.updateWorldMatrix(true, false);

    for (const mesh of group.meshes) {
      mesh.updateWorldMatrix(true, false);
      host.attach(mesh);
    }

    host.userData.basePosition = host.position.toArray();

    records.push({
      recordId: group.recordId,
      host,
      bounds,
      envelope: record !== undefined && isOuterEnvelope(record),
    });
  }

  return {
    frameGroup,
    frameScale: frame.scale,
    framePosition: [
      -frame.center[0] * frame.scale,
      -frame.center[1] * frame.scale,
      -frame.center[2] * frame.scale,
    ],
    records,
    materialsByRecord,
    origins,
  };
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
function MeshPickVolumes({ records, frameScale }: { records: BuiltRecord[]; frameScale: number }) {
  const disassemblyTarget = useAppStore((state) => state.disassemblyTarget);

  const boxes = useMemo(
    () =>
      records.map((record) => ({
        recordId: record.recordId,
        envelope: record.envelope,
        // The host's live position is in the frame's units; the bounds are scene units, so the
        // offset is scaled by the frame on the way in.
        bounds: shiftBounds(
          record.bounds,
          new Vector3(
            record.host.position.x * frameScale,
            record.host.position.y * frameScale,
            record.host.position.z * frameScale,
          ),
        ),
      })),
    // The host positions are written by the frame loop, not by React, so the memo is rebuilt on every
    // disassembly step rather than on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records, disassemblyTarget, frameScale],
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
  /*
   * Each mount builds on its **own clone** of the model, not on the loader's shared `model.root`.
   *
   * `buildModel` mutates the graph it is handed — it reparents every mesh into a per-record host with
   * three's `attach()`. On the shared, cached root that mutation is not idempotent: React StrictMode
   * invokes the render (and therefore this `useMemo` factory) more than once on mount, and the second
   * pass finds a root whose meshes have already been moved out, so it mounts an empty frame group.
   * That is a development-only failure — production builds never double-invoke — and it presented as
   * the model rendering **nothing** under `npm run dev` (0 draw calls) while `npm run preview` of the
   * build rendered it (22 draw calls). Cloning makes the build a pure function of its input; the
   * clone shares geometries and materials, so the model still renders exactly as authored.
   */
  const built = useMemo(() => buildModel(cell, model.root.clone()), [cell, model.root]);

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
      <MeshPickVolumes records={built.records} frameScale={built.frameScale} />
      {/*
        **One** `<primitive>`, and that is deliberate: the hosts are children of `frameGroup` and stay
        there. Rendering each host as its own `<primitive>` would reparent it to the R3F scene root —
        stripping the frame's scale and its centring translation — which is what put every organelle
        at ~50 scene units once the disassembly loop moved it off the origin.
      */}
      <primitive
        object={built.frameGroup}
        scale={built.frameScale}
        position={built.framePosition}
      />
      <MeshEmphasis materialsByRecord={built.materialsByRecord} />
    </>
  );
}
