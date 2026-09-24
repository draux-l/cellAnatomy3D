import type { CellId } from '../catalog/types';

/**
 * One cell, as the container a model mounts into.
 *
 * The group is the scene's cell seam: it carries the cell id on `userData` and in its name, and
 * everything a new model needs is parented here. The catalog roster is empty while the cell models
 * are reset, so today the group is the cell's identity and nothing more; composing it is a matter of
 * mounting children under this node, exactly as the previous procedural roster did.
 *
 * The group carries no rotation. A cell is the world: its silhouette is authored in the XY plane,
 * which is the plane the composed camera faces.
 */
export interface CellGroupProps {
  cell: CellId;
}

export function CellGroup({ cell }: CellGroupProps) {
  return <group name={`cell:${cell}`} userData={{ cell }} />;
}
