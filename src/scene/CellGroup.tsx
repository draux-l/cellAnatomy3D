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

  /*
   * The model is checked against the cell as well as the status, and that is not belt-and-braces.
   *
   * `useCellModel` returns the previous hook state for one render when `cell` changes — React has
   * re-rendered with the new `cell` before the effect that resets the state has run — so a switch to
   * a cell with no model would briefly hand `MeshCellGroup` a model it cannot frame. That threw, and
   * the thrown error unmounted the whole viewer (measured: `.cell-view` and `.nav` both went to
   * zero, leaving a blank page after switching to the plant view).
   */
  if (state.status !== 'ready' || state.model === null || state.model.cell !== cell) {
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
