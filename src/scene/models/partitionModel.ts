import type { Mesh, Object3D } from 'three';
import type { CellId, ModelManifest } from '../../catalog/types';
import { resolveManifestRows } from './manifestLookup';

/**
 * Splitting a loaded model into its records — by identity, and only by identity.
 *
 * The loader hands back the model exactly as authored. This module does the one structural thing the
 * inspection mechanisms need: it says **which meshes belong to which record**, in manifest order.
 *
 * It deliberately does *not* move anything. The previous integration's fatal design error was
 * re-centring each record's meshes onto a catalog placement authored for the old procedural cell —
 * which scattered the model. Here a record's meshes are only *grouped*; the caller reparents them
 * with three's world-preserving `attach()`, so every mesh keeps the transform the file gave it and
 * 0% disassembly is the file unmodified.
 *
 * Meshes the manifest does not map are returned separately. The caller keeps them mounted: they are
 * part of the model, and dropping one would be losing the model.
 */

export interface RecordMeshGroup {
  recordId: string;
  meshes: Mesh[];
}

export interface ModelPartition {
  /** One entry per mapped record, in manifest order. A record with no mesh is absent. */
  groups: RecordMeshGroup[];
  /** Meshes with no manifest row. Kept mounted, part of the model, never a record. */
  unmapped: Mesh[];
}

/**
 * Groups the meshes under `root` by the record the manifest maps them to.
 *
 * `root` is traversed once; the row lookup is the single source of truth for "which record is this
 * mesh", which is what keeps the grouping and the material keys from disagreeing.
 */
export function partitionRecordMeshes(
  root: Object3D,
  cell: CellId,
  manifest: ModelManifest,
): ModelPartition {
  const model = manifest[cell];
  const rows = resolveManifestRows(root, cell, manifest);
  const order: string[] = [];
  const byRecord = new Map<string, Mesh[]>();
  const unmapped: Mesh[] = [];

  if (model) {
    for (const row of model.meshes) {
      if (row.policy === 'map' && row.recordId !== null && !byRecord.has(row.recordId)) {
        byRecord.set(row.recordId, []);
        order.push(row.recordId);
      }
    }
  }

  for (const [mesh, row] of rows) {
    if (row.policy === 'map' && row.recordId !== null) {
      const bucket = byRecord.get(row.recordId);

      if (bucket) {
        bucket.push(mesh);
        continue;
      }
    }

    unmapped.push(mesh);
  }

  return {
    groups: order
      .map((recordId) => ({ recordId, meshes: byRecord.get(recordId) ?? [] }))
      .filter((group) => group.meshes.length > 0),
    unmapped,
  };
}
