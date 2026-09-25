import { useCellModel } from './models/useCellModel';
import { MeshCellGroup } from './MeshCellGroup';
import type { CellId } from '../catalog/types';

/**
 * One cell, as the container a model mounts into.
 *
 * The group is the scene's cell seam: it carries the cell id on `userData` and in its name, and
 * everything a new model needs is parented here. A cell that ships a committed model mounts that
 * model; a cell with none mounts nothing, which is the honest rendering of "there is no model for
 * this cell yet".
 *
 * The group carries no rotation. The model's own frame (uniform scale + centring) lives one level
 * down, so a future per-cell composition could rotate the cell without touching the model.
 *
 * The loader is reached through `useCellModel`, which returns `absent` **without fetching** for a
 * cell with no manifest entry — that is what keeps a cold animal load from requesting a plant model
 * that does not exist.
 */
export interface CellGroupProps {
  cell: CellId;
}

function CellModel({ cell }: CellGroupProps) {
  const state = useCellModel(cell);

  if (state.status !== 'ready' || state.model === null) {
    return null;
  }

  return <MeshCellGroup cell={cell} model={state.model} />;
}

export function CellGroup({ cell }: CellGroupProps) {
  return (
    <group name={`cell:${cell}`} userData={{ cell }}>
      <CellModel cell={cell} />
    </group>
  );
}
