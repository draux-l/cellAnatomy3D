import manifestData from './models.json';
import type {
  CellId,
  CellModelManifest,
  ManifestMesh,
  ModelManifest,
} from './types';

/**
 * The committed model manifest — the identification map (design D20/D29, tasks 12.1–12.2).
 *
 * This file is **three-free data**: it converts a model node into `(record, material key)` or an
 * explicit policy, and nothing here is allowed to import three.js, so the catalog stays out of the
 * shell's entry graph. `verify/model-audit.mjs` validates every row against the committed GLB
 * (sha256 + node names + one record per mesh), and `scene/models/useCellModel.ts` is the only
 * runtime consumer.
 *
 * ## Addressing (design D20)
 *
 * Nodes are addressed by **name**, not by index, because names survive any tool that preserves
 * names at all. The animal model derives its names from material indices
 * (`Nulo__Material.013_0`), so four chromatin meshes and three ribosome meshes legitimately share a
 * name; `occurrence` is the 0-based ordinal among manifest rows with that name and is absent when
 * the name is unique. Re-optimizing a model changes its sha256, which the audit fails on loudly.
 *
 * ## Policies (design D26)
 *
 * - `map` — has a catalog record: pickable, annotated, drawn with `materialKey`.
 * - `unmapped` — a real, identified structure with no canonical roster entry (the animal's
 *   cell-spanning branching network; the plant's peroxisome and plasmodesma). It renders as part of
 *   the model root, unpickable and unannotated. **No label is invented for it.**
 * - `omit` — hidden: genuine debris, or one of the two animal meshes whose identification is still
 *   an open maintainer decision.
 *
 * ## The licensing decision
 *
 * The maintainer confirmed rights for both models and authorized their placement in the app. The
 * sha256 values below fix the exact bytes that ship; the audit refuses a file whose hash differs.
 */

/**
 * The typed view of the committed identification map.
 *
 * The data itself lives in `models.json` so that `verify/model-audit.mjs` — a plain Node build
 * step — can read the exact same rows without a TypeScript runtime, while `src/catalog/models.ts`
 * stays the one typed entry point the gate and the loader import. There is no second copy to drift.
 *
 * ## Addressing (design D20)
 *
 * Nodes are addressed by **name**, not by index, because names survive any tool that preserves
 * names at all. The animal model derives its names from material indices
 * (`Nulo__Material.013_0`), so four chromatin meshes and three ribosome meshes legitimately share a
 * name; `occurrence` is the 0-based ordinal among manifest rows with that name and is absent when
 * the name is unique. Re-optimizing a model changes its sha256, which the audit fails on loudly.
 *
 * ## Policies (design D26)
 *
 * - `map` — has a catalog record: pickable, annotated, drawn with `materialKey`.
 * - `unmapped` — a real, identified structure with no canonical roster entry (the animal's
 *   cell-spanning branching network; the plant's peroxisome and plasmodesma). It renders as part of
 *   the model root, unpickable and unannotated. **No label is invented for it.**
 * - `omit` — hidden: genuine debris, or one of the two animal meshes whose identification is still
 *   an open maintainer decision.
 *
 * ## The licensing decision
 *
 * The maintainer confirmed rights for both models and authorized their placement in the app. The
 * sha256 values in the JSON fix the exact bytes that ship; the audit refuses a file whose hash
 * differs.
 *
 * ## The two authoring decisions worth review (recorded, not hidden)
 *
 * 1. The plant's single boundary mesh (`cell`) is mapped to `cell-wall`, the plant's defining outer
 *    layer; the model provides no separate plasma-membrane mesh, so the `membrane` **record** stays
 *    procedural (D27's hybrid, which the union supports). If the maintainer reads `cell` as the
 *    membrane instead, it is a one-line swap in the JSON and nothing else changes.
 * 2. `peroxisome` and `plasmodesma` are real, named plant structures with no canonical roster
 *    entry. They render unlabelled (`unmapped`); no record is invented for them (D26).
 */

// JSON infers `number[]`/`string` where the model wants tuples and literal unions; the shape is
// asserted by `models.test.ts` and by `verify/model-audit.mjs`, so the cast is the honest boundary.
export const MODEL_MANIFEST = manifestData as unknown as ModelManifest;

/** The manifest for one cell. */
export function cellModelFor(cell: CellId, manifest: ModelManifest = MODEL_MANIFEST): CellModelManifest {
  return manifest[cell];
}

/**
 * Finds the manifest row addressed by `(cell, node, occurrence)`, counting occurrences in row
 * order. This is the one resolution rule the loader and the gate share: a name the model repeats is
 * addressed by its ordinal, and a name that appears once resolves to occurrence 0.
 */
export function meshRowFor(
  cell: CellId,
  node: string,
  occurrence = 0,
  manifest: ModelManifest = MODEL_MANIFEST,
): ManifestMesh | undefined {
  const cellManifest = manifest[cell];

  if (!cellManifest) {
    return undefined;
  }

  let seen = 0;

  for (const row of cellManifest.meshes) {
    if (row.node !== node) {
      continue;
    }

    if (seen === occurrence) {
      return row;
    }

    seen += 1;
  }

  return undefined;
}
