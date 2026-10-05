import { Box3, BufferAttribute, BufferGeometry, Mesh, Sphere, Vector3, type Object3D } from 'three';
import type { CellId, ManifestSplit, ModelManifest } from '../../catalog/types';
import { splitByBodies } from './bodyClusters';
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
 * One exception, and it is not a placement: a node the manifest marks `split` draws several
 * anatomical parts, so this module **divides** it into them. The parts share the source geometry's
 * attributes and inherit its transform, which is what keeps the model exactly where it was while the
 * identity of each part becomes its own record.
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
 * Divides one node's mesh into the anatomical parts it draws, and hands each to its record.
 *
 * The sub-meshes **share the source attributes** and differ only in their index buffer, so the whole
 * split costs indices and nothing else — no vertex is copied, and the triangles render identically.
 * Each one inherits the source mesh's transform, because the geometry's coordinates are in that
 * mesh's own local space: copying the transform is what puts them back where the file had them.
 *
 * Returns how many parts were produced, so the caller can fall through to `unmapped` when the
 * geometry yielded nothing to split.
 */
function splitMeshIntoParts(
  mesh: Mesh,
  split: ManifestSplit,
  frameScale: number,
  byRecord: Map<string, Mesh[]>,
): number {
  const parent = mesh.parent;

  if (!parent || split.records.length === 0) {
    return 0;
  }

  // The radius is authored in scene units; the geometry is in the mesh's own units.
  const parts = splitByBodies(mesh.geometry, split.radius / frameScale);

  if (parts.length === 0) {
    return 0;
  }

  for (const [position, part] of parts.entries()) {
    // The last declared record takes every remaining part — see `ManifestSplit.records`.
    const recordId = split.records[Math.min(position, split.records.length - 1)];
    const bucket = recordId === undefined ? undefined : byRecord.get(recordId);

    if (!bucket) {
      continue;
    }

    const geometry = new BufferGeometry();

    for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) {
      geometry.setAttribute(name, attribute);
    }

    geometry.setIndex(new BufferAttribute(part.index, 1));
    /*
     * The part shares every attribute with the source, so three would measure its box over the WHOLE
     * geometry — the index is ignored by `Box3.setFromObject` — and then place the record's anchor and
     * its framing by the source's extent. Publishing the part's own box is what keeps "this record's
     * box" meaning this part.
     */
    geometry.boundingBox = new Box3(new Vector3(...part.bounds.min), new Vector3(...part.bounds.max));
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new Sphere());

    const subMesh = new Mesh(geometry, mesh.material);

    subMesh.name = `${mesh.name}#${position}`;
    subMesh.position.copy(mesh.position);
    subMesh.quaternion.copy(mesh.quaternion);
    subMesh.scale.copy(mesh.scale);

    parent.add(subMesh);
    bucket.push(subMesh);
  }

  /*
   * The original draws every part at once, so leaving it visible would draw each part twice. Hidden
   * rather than removed: it keeps its transform, which keeps it usable as the reference the parts
   * have to match, and the pick path already skips geometry that is not being drawn.
   */
  mesh.visible = false;

  return parts.length;
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
      const records =
        row.policy === 'map' && row.recordId !== null
          ? [row.recordId]
          : row.policy === 'split' && row.split
            ? row.split.records
            : [];

      for (const recordId of records) {
        if (!byRecord.has(recordId)) {
          byRecord.set(recordId, []);
          order.push(recordId);
        }
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

    if (row.policy === 'split' && row.split) {
      const parts = splitMeshIntoParts(mesh, row.split, model?.frame.scale ?? 1, byRecord);

      if (parts > 0) {
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
