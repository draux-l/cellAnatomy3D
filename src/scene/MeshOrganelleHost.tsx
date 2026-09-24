import { useLayoutEffect, useMemo, useRef } from 'react';
import type { Group, Material } from 'three';
import { useAppStore } from '../app/store';
import { positionForRecord } from '../catalog/params';
import type { CellId, OrganelleRecord } from '../catalog/types';
import { registerOrganelleAnchor, unregisterOrganelleAnchor } from './anchors';
import { applyEmphasis, emphasisFor, prepareEmphasis } from './highlight';
import { PickVolume } from './interaction/Picking';
import { isOuterEnvelope } from './interaction/pickingModel';
import {
  PROCESS_PART_NAME_BY_MATERIAL_KEY,
  planRecordAssembly,
} from './models/assemblyPlan';
import type { LoadedCellModel } from './models/useCellModel';

/**
 * One catalog record, mounted from the cell model's meshes instead of procedural geometry.
 *
 * This is design D24's reparenting host, and it is the same seam the procedural `OrganelleHost`
 * occupies: `root` carries `name={record.id}` and `userData.organelleId`, the disassembly loop
 * writes its `position`, the annotation layer reads its `matrixWorld`, and the pick proxy is its
 * child. Everything downstream of the seam is therefore unchanged — the mesh path never has to teach
 * picking, anchors or disassembly about meshes.
 *
 * Four things it owns:
 *
 * 1. **The reparent.** The record's meshes are moved off the model root into this record's holder
 *    with `Object3D.attach`, which preserves each mesh's world transform — so the assembled cell is
 *    the model's own arrangement.
 * 2. **The placement.** The holder is shifted so the record's **union** centre lands on the record's
 *    catalog position. That is what makes a two-mesh mitochondrion travel as one unit (design D29)
 *    and what lets isolate and disassembly, which read the catalog placement, point at the part.
 * 3. **The materials.** A mesh record draws with the keyed materials the loader assigned. One
 *    material key belongs to exactly one record in a cell (the catalog integrity gate enforces it),
 *    so emphasis can be written to the shared keyed material without cloning and without lighting
 *    up a neighbour.
 * 4. **The process names.** Each reparented mesh is renamed to the part name the equivalent
 *    procedural build would have carried, so the process animations' naming seam keeps working.
 */
export interface MeshOrganelleHostProps {
  record: OrganelleRecord;
  cell: CellId;
  model: LoadedCellModel;
}

export function MeshOrganelleHost({ record, cell, model }: MeshOrganelleHostProps) {
  const root = useRef<Group>(null);
  const holder = useRef<Group>(null);
  const hoveredId = useAppStore((state) => state.hoveredId);
  const selectedId = useAppStore((state) => state.selectedId);

  const plan = model.records.get(record.id);
  const position = positionForRecord(record, cell);
  const [px, py, pz] = position;

  const assembly = useMemo(
    () => (plan ? planRecordAssembly(plan, [px, py, pz]) : null),
    [plan, px, py, pz],
  );

  const recordMaterials = useMemo(() => {
    if (!plan) {
      return [] as Material[];
    }

    const distinct = new Map<string, Material>();

    for (const { mesh } of plan.meshes) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material && !distinct.has(material.uuid)) {
          distinct.set(material.uuid, prepareEmphasis(material));
        }
      }
    }

    return [...distinct.values()];
  }, [plan]);

  /**
   * The base transform and the reparent, written imperatively.
   *
   * The root's `position` is set once here and then overwritten every frame by the disassembly
   * driver, which is the same one-writer rule the procedural host follows. `holder.position` is the
   * recentring offset, and it must be set **after** the meshes are attached so it shifts the group
   * rather than the coordinate space the attach resolved against.
   */
  useLayoutEffect(() => {
    const rootObject = root.current;
    const holderObject = holder.current;

    if (!rootObject || !holderObject || !plan || !assembly) {
      return;
    }

    rootObject.position.set(px, py, pz);

    for (const { mesh, materialKey } of plan.meshes) {
      const processName = PROCESS_PART_NAME_BY_MATERIAL_KEY[materialKey];

      if (processName !== undefined) {
        mesh.name = processName;
      }

      holderObject.attach(mesh);
    }

    holderObject.position.set(
      assembly.recentre[0],
      assembly.recentre[1],
      assembly.recentre[2],
    );

    registerOrganelleAnchor(record.id, rootObject, assembly.anchorOffset);

    return () => unregisterOrganelleAnchor(record.id);
  }, [plan, assembly, record.id, px, py, pz]);

  // A discrete store change, never a frame loop: hover and isolate write material state once.
  useLayoutEffect(() => {
    const mode = emphasisFor(record.id, hoveredId, selectedId);

    for (const material of recordMaterials) {
      applyEmphasis(material, mode);
    }
  }, [hoveredId, selectedId, recordMaterials, record.id]);

  if (!plan || !assembly) {
    return null;
  }

  return (
    <group ref={root} name={record.id} userData={{ organelleId: record.id }}>
      <group ref={holder} />
      {record.pickable ? (
        <PickVolume
          organelleId={record.id}
          bounds={assembly.localBounds}
          envelope={isOuterEnvelope(record)}
        />
      ) : null}
    </group>
  );
}
