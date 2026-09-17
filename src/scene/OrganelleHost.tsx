import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { Group, Material } from 'three';
import { useAppStore } from '../app/store';
import { paramsForRecord, positionForRecord } from '../catalog/params';
import type { CellId, OrganelleRecord } from '../catalog/types';
import { anchorOffsetFor, registerOrganelleAnchor, unregisterOrganelleAnchor } from './anchors';
import { getBuilder } from './builders/registry';
import type { OrganelleMaterialKey } from './builders/primitives';
import { applyEmphasis, emphasisFor, prepareEmphasis } from './highlight';
import type { OrganelleMaterials } from './materials';
import { PartMesh } from './PartMesh';

/**
 * One catalog record, mounted as one organelle.
 *
 * This is the seam the whole architecture was built around (design D2): the host knows about the
 * record, the builder registry and the store, and nothing else. Adding an organelle is a catalog
 * record plus a registered builder — no change here.
 *
 * Four things the host owns:
 *
 * 1. **The build.** `paramsForRecord` resolves the record's geometry for *this* cell, so the
 *    plant membrane gets the wall's silhouette and the animal membrane stays round.
 * 2. **Per-organelle materials.** The host clones the material keys its build actually uses, which
 *    is what lets hover highlight one organelle without lighting up its neighbours. The clones are
 *    disposed with the host.
 * 3. **The anchor.** The label anchor's local offset is computed from the built geometry and
 *    published in the transient registry (`anchors.ts`) for the annotation layer.
 * 4. **The root transform.** `userData.organelleId` and the group position come from the record;
 *    the disassembly driver writes the same `position` every frame from the transient side.
 *
 * The root object is the same `Object3D` every consumer sees — picking, anchors, shadows and
 * disassembly all read it, which is why nothing has to be kept in sync by hand.
 */
export interface OrganelleHostProps {
  record: OrganelleRecord;
  cell: CellId;
  /** The shared material template set. The host clones what it needs; it never mutates this. */
  materials: OrganelleMaterials;
}

export function OrganelleHost({ record, cell, materials }: OrganelleHostProps) {
  const group = useRef<Group>(null);
  const hoveredId = useAppStore((state) => state.hoveredId);
  const selectedId = useAppStore((state) => state.selectedId);

  const build = useMemo(
    () => getBuilder(record.geometry.builder)(paramsForRecord(record, cell)),
    [record, cell],
  );

  useEffect(() => () => build.dispose(), [build]);

  /**
   * One clone per material key this build uses.
   *
   * A record's build touches one to three keys (the nucleus uses envelope, nucleolus and pore), so
   * a cell ends up with roughly fifteen material instances in total — cheap, and the price of
   * being able to highlight exactly one organelle.
   */
  const localMaterials = useMemo(() => {
    const clones = new Map<OrganelleMaterialKey, Material>();

    for (const part of build.parts) {
      if (clones.has(part.materialKey)) {
        continue;
      }

      clones.set(part.materialKey, prepareEmphasis(materials[part.materialKey].clone()));
    }

    return clones;
  }, [build, materials]);

  useEffect(
    () => () => {
      for (const material of localMaterials.values()) {
        material.dispose();
      }
    },
    [localMaterials],
  );

  const position = positionForRecord(record, cell);

  useLayoutEffect(() => {
    const object = group.current;

    if (!object) {
      return;
    }

    registerOrganelleAnchor(record.id, object, anchorOffsetFor(build));

    return () => unregisterOrganelleAnchor(record.id);
  }, [record.id, build]);

  // A discrete store change, never a frame loop: hover and isolate write material state once.
  useEffect(() => {
    const mode = emphasisFor(record.id, hoveredId, selectedId);

    for (const material of localMaterials.values()) {
      applyEmphasis(material, mode);
    }
  }, [hoveredId, selectedId, localMaterials, record.id]);

  return (
    <group
      ref={group}
      name={record.id}
      position={position}
      userData={{ organelleId: record.id }}
    >
      {build.parts.map((part) => (
        <PartMesh
          key={part.name}
          part={part}
          material={localMaterials.get(part.materialKey)!}
        />
      ))}
    </group>
  );
}
