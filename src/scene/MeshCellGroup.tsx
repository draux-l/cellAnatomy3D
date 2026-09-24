import { useMemo } from 'react';
import { rosterFor } from '../catalog/cells';
import type { CellId } from '../catalog/types';
import { OrganelleHost } from './OrganelleHost';
import { MeshOrganelleHost } from './MeshOrganelleHost';
import type { OrganelleMaterials } from './materials';
import type { LoadedCellModel } from './models/useCellModel';

/**
 * One cell composed from the loaded model's meshes (design D24, task 13.1).
 *
 * The same map over `rosterFor(cell)` the procedural `CellGroup` performs, with two differences:
 *
 * - The normalised model root is mounted as a sibling, so the meshes the manifest does **not** map
 *   to a record — the animal's cell-spanning filament network, `policy: 'unmapped'` — render once,
 *   as part of the model, with no label and no hit volume (design D26).
 * - A record whose manifest rows for this cell exist draws from its meshes; a record that has none
 *   draws through its declared procedural fallback. The animal `lysosome` is exactly that case: its
 *   only mesh belongs to the plant model, so it keeps rendering procedurally inside the mesh cell.
 *
 * The `group` name and `userData.cell` are unchanged, because the shell, the harness and
 * `mountCell` all identify the cell group by them.
 */
export interface MeshCellGroupProps {
  cell: CellId;
  materials: OrganelleMaterials;
  model: LoadedCellModel;
}

export function MeshCellGroup({ cell, materials, model }: MeshCellGroupProps) {
  const roster = useMemo(() => rosterFor(cell), [cell]);

  return (
    <group name={`cell:${cell}`} userData={{ cell }}>
      <primitive object={model.root} />
      {roster.map((record) =>
        model.records.has(record.id) ? (
          <MeshOrganelleHost key={record.id} record={record} cell={cell} model={model} />
        ) : (
          <OrganelleHost key={record.id} record={record} cell={cell} materials={materials} />
        ),
      )}
    </group>
  );
}
