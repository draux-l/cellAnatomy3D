import { Mesh, type Material, type Object3D, type Texture } from 'three';
import { cellModelFor } from '../../catalog/models';
import type { CellId, ManifestMesh, MaterialKeyName, ModelManifest } from '../../catalog/types';

/**
 * Discard the GLB's own materials and assign catalog-keyed materials per mesh (design D21, 12.5).
 *
 * **Both models need this and the plant one is a measured blocker.** The plant's single shared
 * material ships with `alphaMode: BLEND` + `doubleSided: true` and measured 2.6 fps; the same
 * geometry with opaque, front-side materials measured 17.3 fps. The plant material also carries a
 * `TT_checker_512x512_UV_GRID` Substance placeholder — a UV checker, not organelle colour. The
 * animal's 16 material-index materials are equally meaningless as colours. So the loader throws
 * every one of them away, together with their textures, and draws each mesh with the key the
 * committed manifest assigns it.
 *
 * This function is deliberately pure over an `Object3D` graph: it takes the already-parsed model
 * root and a `materialForKey` resolver, so it is unit-testable in Node with a hand-built scene and
 * no GLB, WebGL context or meshopt decoder.
 */

export interface MaterialAssignmentResult {
  /** Meshes given a catalog-keyed material. */
  assigned: number;
  /** GLB materials (and their textures) disposed. */
  discarded: number;
  /** Meshes hidden by an `omit` manifest row. */
  omitted: number;
  /** Meshes rendered without a catalog record (`unmapped`). */
  unmapped: number;
  /** Meshes the manifest does not know at all — always empty for a validated model. */
  unknown: string[];
}

/** Disposes a material and every texture it carries. `Material.dispose` does not free textures. */
function disposeMaterial(material: Material | Material[]): number {
  const list = Array.isArray(material) ? material : [material];
  let disposed = 0;

  for (const entry of list) {
    const textured = entry as Material & Record<string, unknown>;

    for (const value of Object.values(textured)) {
      if (value && typeof value === 'object' && 'isTexture' in value && (value as Texture).isTexture) {
        (value as Texture).dispose();
      }
    }

    entry.dispose();
    disposed += 1;
  }

  return disposed;
}

/**
 * Walks `root` in scene-graph order, resolving each mesh to its manifest row by
 * `(name, occurrence)` and assigning the row's key.
 *
 * Occurrence is the ordinal among meshes sharing a name **in traversal order**, which is the same
 * order the manifest lists them in (both follow the GLB's node order), so the four chromatin meshes
 * and three ribosome meshes resolve to distinct rows.
 */
export function assignCatalogMaterials(
  root: Object3D,
  cell: CellId,
  materialForKey: (key: MaterialKeyName) => Material,
  manifest: ModelManifest,
): MaterialAssignmentResult {
  const cellManifest = manifest[cell];
  const result: MaterialAssignmentResult = {
    assigned: 0,
    discarded: 0,
    omitted: 0,
    unmapped: 0,
    unknown: [],
  };

  if (!cellManifest) {
    return result;
  }

  // (name, occurrence) → row, rebuilt from the manifest so traversal can resolve in O(1).
  const rowsByNode = new Map<string, ManifestMesh[]>();

  for (const row of cellManifest.meshes) {
    const rows = rowsByNode.get(row.node);

    if (rows) {
      rows.push(row);
    } else {
      rowsByNode.set(row.node, [row]);
    }
  }

  const seenByNode = new Map<string, number>();

  root.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }

    const occurrence = seenByNode.get(object.name) ?? 0;
    seenByNode.set(object.name, occurrence + 1);

    const row = rowsByNode.get(object.name)?.[occurrence];

    if (!row) {
      result.unknown.push(object.name);
      return;
    }

    // The GLB material is discarded regardless of policy: it is never a colour we want.
    result.discarded += disposeMaterial(object.material);

    if (row.policy === 'omit') {
      object.visible = false;
      result.omitted += 1;
      return;
    }

    if (row.materialKey === null) {
      result.unknown.push(object.name);
      return;
    }

    object.material = materialForKey(row.materialKey);
    result.assigned += 1;

    if (row.policy === 'unmapped') {
      result.unmapped += 1;
    }
  });

  return result;
}

/** Convenience: the manifest for a cell, defaulting to the committed one. */
export function manifestFor(cell: CellId, manifest: ModelManifest): ManifestMesh[] {
  return [...cellModelFor(cell, manifest).meshes];
}
