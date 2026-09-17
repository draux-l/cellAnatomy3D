import { useMemo } from 'react';
import { rosterFor } from '../catalog/cells';
import type { CellId } from '../catalog/types';
import type { OrganelleMaterials } from './materials';
import { OrganelleHost } from './OrganelleHost';

/**
 * One cell, composed from the catalog roster.
 *
 * The whole function is a map over `rosterFor(cell)`. That is the design's point: the animal and
 * the plant cell are the *same code* over the same frozen records, and the only thing that differs
 * is which records declare membership plus the per-cell deviations a record declares.
 *
 * The group carries no rotation. The organelle fixture rotates its single build into the hero
 * pose, but a cell is the world: its polygon silhouette is authored in the XY plane, which is the
 * plane the composed camera faces.
 */
export interface CellGroupProps {
  cell: CellId;
  materials: OrganelleMaterials;
}

export function CellGroup({ cell, materials }: CellGroupProps) {
  const roster = useMemo(() => rosterFor(cell), [cell]);

  return (
    <group name={`cell:${cell}`} userData={{ cell }}>
      {roster.map((record) => (
        <OrganelleHost key={record.id} record={record} cell={cell} materials={materials} />
      ))}
    </group>
  );
}
