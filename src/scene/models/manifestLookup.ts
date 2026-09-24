import { Mesh, PropertyBinding, type Object3D } from 'three';
import { cellModelFor } from '../../catalog/models';
import type { CellId, ManifestMesh, ModelManifest } from '../../catalog/types';

/**
 * Resolving a **runtime** model node back to its manifest row.
 *
 * The manifest addresses nodes by name, because names survive any tool that preserves names at all
 * (design D20). But the name a node has *in the GLB* is not always the name the `Mesh` has after
 * `GLTFLoader` has parsed it, and this module exists because that difference is silent:
 *
 * - `GLTFLoader.createUniqueName` runs every node/mesh name through
 *   `PropertyBinding.sanitizeNodeName`, which **strips** `.`, `[`, `]`, `:` and `/` and turns
 *   whitespace into `_`. So the manifest's `Nulo__Material.013_0` becomes `Nulo__Material013_0`.
 * - The same function keeps a per-parser counter, so a name that occurs more than once gets a
 *   `_1`, `_2`, … suffix: the four chromatin nodes arrive as `Nulo__Material027_0`,
 *   `Nulo__Material027_0_1`, `Nulo__Material027_0_2`, `Nulo__Material027_0_3`.
 *
 * A lookup keyed on the raw manifest name therefore resolves **nothing** on the animal model, and
 * the failure mode is not an error — it is a mesh that keeps its GLB material and never reaches a
 * record. So the resolution rule lives here, uses three's own sanitizer rather than a copy of it,
 * and is keyed by the **mesh object** rather than by name: the occurrence counter is consumed once
 * per mesh during one traversal, and a caller that asks twice for the same mesh cannot silently
 * skip a row.
 */

/** The manifest rows for one cell, indexed by the authored name and by the loader's sanitised one. */
function rowsByNodeName(
  cell: CellId,
  manifest: ModelManifest,
): { sanitized: Map<string, ManifestMesh[]>; authored: Map<string, ManifestMesh[]> } {
  const sanitized = new Map<string, ManifestMesh[]>();
  const authored = new Map<string, ManifestMesh[]>();

  for (const row of cellModelFor(cell, manifest).meshes) {
    const pairs = [
      [sanitized, PropertyBinding.sanitizeNodeName(row.node)],
      [authored, row.node],
    ] as const;

    for (const [map, name] of pairs) {
      const list = map.get(name);

      if (list) {
        list.push(row);
      } else {
        map.set(name, [row]);
      }
    }
  }

  return { sanitized, authored };
}

/**
 * Resolves every mesh under `root` to its manifest row, keyed by the mesh object.
 *
 * Occurrence is consumed in **traversal order per base name**, which is the order the loader
 * assigned its `_1`, `_2` suffixes in (both preserve sibling order), so the 0th, 1st, … mesh of a
 * repeated base maps to the manifest's `occurrence` 0, 1, ….
 *
 * The name is matched exactly first — against the loaded spelling and then against the authored one
 * (a test or a diagnostic may hold the manifest's own spelling) — and only then is a trailing
 * `_<digits>` de-duplication suffix stripped and the base retried. Exact-first matters, because a
 * node literally named `…_1` must win over a de-duplicated sibling.
 *
 * A mesh the manifest does not know maps to no entry, which is a caller's decision to report rather
 * than a silent skip.
 */
export function resolveManifestRows(
  root: Object3D,
  cell: CellId,
  manifest: ModelManifest,
): Map<Mesh, ManifestMesh> {
  const rows = rowsByNodeName(cell, manifest);
  const consumed = new Map<string, number>();
  const resolved = new Map<Mesh, ManifestMesh>();

  const take = (base: string, candidates: ManifestMesh[]): ManifestMesh | undefined => {
    const occurrence = consumed.get(base) ?? 0;

    consumed.set(base, occurrence + 1);

    return candidates[occurrence];
  };

  root.traverse((object) => {
    if (!(object instanceof Mesh) || !object.name) {
      return;
    }

    const exact =
      rows.sanitized.get(object.name) ?? rows.authored.get(object.name);

    if (exact) {
      const row = take(object.name, exact);

      if (row) {
        resolved.set(object, row);
      }

      return;
    }

    const base = object.name.replace(/_\d+$/, '');
    const candidates = rows.sanitized.get(base) ?? rows.authored.get(base);

    if (!candidates) {
      return;
    }

    const row = take(base, candidates);

    if (row) {
      resolved.set(object, row);
    }
  });

  return resolved;
}
