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
 * The animal model's **asset sha256** and its measured frame.
 *
 * Source: `references/models/optimized/animal-err0.03.glb` (gitignored), copied verbatim to
 * `public/models/animal-cell.glb`. Measured boundbox 592.6 × 481.0 × 626.1 source units, bounding
 * radius 493.59 → `scale` to bring the envelope radius to ≈1 scene unit. The two Sketchfab root
 * rotations (−90° X and +90° X) cancel, so no orientation correction is required.
 */
const ANIMAL_MODEL: CellModelManifest = {
  cell: 'animal',
  frame: {
    file: '/models/animal-cell.glb',
    sha256: '80fd71fe64287a3d2561de7995c745692f5c2ee3ca0774566ed3ede04423fc61',
    scale: 0.00202597,
    rotation: [0, 0, 0],
    center: [-24.648, -66.063, 30.208],
  },
  meshes: [
    // The cell-spanning branching network. Identified (medium confidence) as cytoskeleton-like, but
    // the canonical roster has no cytoskeleton entry, so it renders unlabelled rather than invented.
    { node: 'Nulo__Material.013_0', policy: 'unmapped', recordId: null, materialKey: 'cytoskeleton' },
    // Genuine debris — not an organelle.
    { node: 'Nulo__Material.003_0', policy: 'omit', recordId: null, materialKey: null },
    { node: 'Nulo__Material.010_0', policy: 'map', recordId: 'nucleus', materialKey: 'nucleus' },
    { node: 'Nulo__Material.009_0', policy: 'map', recordId: 'nucleus', materialKey: 'nucleolus' },
    { node: 'Nulo__Material.001_0', policy: 'map', recordId: 'nucleus', materialKey: 'nuclearEnvelope' },
    // Four chromatin meshes share one name; occurrence disambiguates them.
    { node: 'Nulo__Material.027_0', occurrence: 0, policy: 'map', recordId: 'nucleus', materialKey: 'chromatin' },
    { node: 'Nulo__Material.027_0', occurrence: 1, policy: 'map', recordId: 'nucleus', materialKey: 'chromatin' },
    { node: 'Nulo__Material.027_0', occurrence: 2, policy: 'map', recordId: 'nucleus', materialKey: 'chromatin' },
    { node: 'Nulo__Material.027_0', occurrence: 3, policy: 'map', recordId: 'nucleus', materialKey: 'chromatin' },
    // Genuine debris.
    { node: 'Nulo__Material.025_0', policy: 'omit', recordId: null, materialKey: null },
    // UNRESOLVED — bright green blob (Material.1, #219600, 90×63×103). Maintainer decision pending
    // (task 12.1): left out of the catalog, no generic "misc organelle" record invented.
    { node: 'Nulo__Material.1_0', policy: 'omit', recordId: null, materialKey: null },
    { node: 'Nulo__Material_0', policy: 'map', recordId: 'membrane', materialKey: 'membrane' },
    { node: 'Nulo__Material.006_0', policy: 'map', recordId: 'golgi', materialKey: 'golgi' },
    // The mitochondrion is ONE record referencing TWO meshes (design D29): cristae + outer membranes.
    { node: 'Nulo__Material.007_0', policy: 'map', recordId: 'mitochondrion', materialKey: 'innerMembrane' },
    { node: 'Nulo__Material.008_0', policy: 'map', recordId: 'mitochondrion', materialKey: 'outerMembrane' },
    // UNRESOLVED — purple tubes/rings (Material.026, #8c317e, 164×82×115). Maintainer decision pending.
    { node: 'Nulo__Material.026_0', policy: 'omit', recordId: null, materialKey: null },
    { node: 'Nulo__Material.005_0', policy: 'map', recordId: 'endoplasmic-reticulum', materialKey: 'er' },
    // Three ribosome meshes share one name.
    { node: 'Nulo__Material.018_0', occurrence: 0, policy: 'map', recordId: 'ribosome', materialKey: 'granule' },
    { node: 'Nulo__Material.018_0', occurrence: 1, policy: 'map', recordId: 'ribosome', materialKey: 'granule' },
    { node: 'Nulo__Material.018_0', occurrence: 2, policy: 'map', recordId: 'ribosome', materialKey: 'granule' },
    { node: 'citoplasma_remesh_Material.004_0', policy: 'map', recordId: 'cytoplasm', materialKey: 'cytoplasm' },
  ],
};

/**
 * The plant model's asset sha256 and frame.
 *
 * Source: `references/models/optimized/vegetal-v2.glb` (gitignored), copied verbatim to
 * `public/models/plant-cell.glb`. Measured boundbox 164.4 × 122.0 × 190.5 source units, bounding
 * radius 139.82 → `scale` to bring the envelope radius to ≈1 scene unit.
 *
 * **Two authoring decisions worth review (recorded, not hidden):**
 *
 * 1. `cell` is the plant's single boundary mesh. It is mapped to `cell-wall`, the plant's defining
 *    outer layer; the model provides no separate plasma-membrane mesh, so the `membrane` **record**
 *    stays procedural (D27's hybrid, which the union supports). If the maintainer reads `cell` as
 *    the membrane instead, this is a one-line swap and nothing else changes.
 * 2. `peroxisome` and `plasmodesma` are real, named plant structures with no canonical roster
 *    entry. They render unlabelled (`unmapped`); no record is invented for them (D26).
 */
const PLANT_MODEL: CellModelManifest = {
  cell: 'plant',
  frame: {
    file: '/models/plant-cell.glb',
    sha256: 'f791fd9851d90ecb98b58ed69a996c4379c8340e003eccc1aa65ad4b36adbe42',
    scale: 0.00715207,
    rotation: [0, 0, 0],
    center: [0.0, -1.303, -0.086],
  },
  meshes: [
    { node: 'cytoplasm_TT_checker_512x512_UV_GRID_0', policy: 'map', recordId: 'cytoplasm', materialKey: 'cytoplasm' },
    // chloroplast.in (thylakoids/grana) and chloroplast.out are ONE record referencing two meshes.
    { node: 'chloroplast.in_TT_checker_512x512_UV_GRID_0', policy: 'map', recordId: 'chloroplast', materialKey: 'grana' },
    { node: 'chloroplast.out_TT_checker_512x512_UV_GRID_0', policy: 'map', recordId: 'chloroplast', materialKey: 'chloroplast' },
    { node: 'nucleus_TT_checker_512x512_UV_GRID_0', policy: 'map', recordId: 'nucleus', materialKey: 'nucleus' },
    { node: 'ribosomes_TT_checker_512x512_UV_GRID_0', policy: 'map', recordId: 'ribosome', materialKey: 'granule' },
    // rough.ER and smooth.ER are ONE record referencing two meshes (the ER tubule network).
    { node: 'rough.ER_TT_checker_512x512_UV_GRID_0', policy: 'map', recordId: 'endoplasmic-reticulum', materialKey: 'er' },
    { node: 'golgi.appratus_TT_checker_512x512_UV_GRID_0', policy: 'map', recordId: 'golgi', materialKey: 'golgi' },
    { node: 'lysosome_TT_checker_512x512_UV_GRID_0', policy: 'map', recordId: 'lysosome', materialKey: 'lysosome' },
    { node: 'peroxisome_TT_checker_512x512_UV_GRID_0', policy: 'unmapped', recordId: null, materialKey: 'peroxisome' },
    { node: 'vacuole_TT_checker_512x512_UV_GRID_0', policy: 'map', recordId: 'vacuole', materialKey: 'vacuole' },
    { node: 'plasmodesma_TT_checker_512x512_UV_GRID_0', policy: 'unmapped', recordId: null, materialKey: 'plasmodesma' },
    // The single boundary mesh. See the note above: mapped to the wall, not the membrane.
    { node: 'cell_TT_checker_512x512_UV_GRID_0', policy: 'map', recordId: 'cell-wall', materialKey: 'cellWall' },
    { node: 'mitochondria_TT_checker_512x512_UV_GRID_0', policy: 'map', recordId: 'mitochondrion', materialKey: 'outerMembrane' },
    { node: 'smooth.ER_TT_checker_512x512_UV_GRID_0', policy: 'map', recordId: 'endoplasmic-reticulum', materialKey: 'er' },
  ],
};

/** Both models, keyed by cell id. The integrity gate and the loader both default to this. */
export const MODEL_MANIFEST: ModelManifest = {
  animal: ANIMAL_MODEL,
  plant: PLANT_MODEL,
};

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
