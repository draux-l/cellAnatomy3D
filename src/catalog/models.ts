import type { CellId, CellModelManifest, ModelManifest } from './types';

/**
 * The committed model manifest (design D20/D23): one cell's GLB, its frame, and the identification
 * map over its meshes.
 *
 * **Three-free by rule.** This module is data — `src/catalog/` may not import three.js, because the
 * catalog travels into the app shell and three.js must not. The loader
 * (`scene/models/useCellModel.ts`) consumes this file; the integrity gate takes it injected.
 *
 * ## The file
 *
 * `public/models/animal-cell.glb` — the maintainer's animal cell, glTF-Transform v4.4.2 output,
 * 21 meshes / 16 materials / 808,443 triangles, `KHR_draco_mesh_compression` +
 * `EXT_texture_webp`. The sha256 below is of the bytes that actually ship; a re-optimized file
 * fails the audit rather than silently rendering something else.
 *
 * ## The frame
 *
 * The model is authored in its own units (a ≈596 × 477 × 626 unit box) around a non-origin centre.
 * `frame` is the **one** transform the viewer applies: a uniform scale about the model's own
 * geometry, plus the translation that puts the cell's centre at the scene origin.
 *
 * - `center` is the membrane mesh's own bounding-box centre, in model units. The membrane is the
 *   outermost surface, so its box centre *is* the cell's centre.
 * - `scale` maps the membrane's largest half-extent (313.05 model units) to **1.27 scene units** —
 *   the radial reach the composed camera and the zoom clamp were ratified against. It is uniform, so
 *   it changes the cell's size and nothing else about it.
 * - `rotation` is identity. The model's own node graph carries a −90°/+90° X pair that cancels
 *   exactly; adding a rotation here would double it. Verified by inspecting the GLB node transforms,
 *   not by eye.
 *
 * **Nothing here re-centres, re-scales or re-places an individual mesh.** Every mesh keeps its
 * authored local transform under this single root transform, which is what makes 0% disassembly
 * identical to loading the file unmodified (`scene/disassembly.ts` offsets from the part's own
 * position, never from a catalog placement).
 *
 * ## The identification map
 *
 * One row per mesh, in mesh order. `node` is the **authored** GLB name
 * (`Nulo__Material.013_0`); `GLTFLoader` sanitises names as it parses, and
 * `scene/models/manifestLookup.ts` is what bridges the two — see its header for why a raw name key
 * resolves nothing.
 *
 * `materialKey` is the **palette-override hook**, not a description of the render: the default
 * viewer keeps each mesh's own GLB material (the model's 16 authored colours *are* the model), and
 * the key names the catalog role a future palette override would substitute.
 *
 * The maintainer's verified map is the source for every row, and it assigns **all 21 meshes to the
 * 14 records — none is left over**. Two parts own mesh pairs/groups: the nucleus is meshes [2]+[3]
 * (the inner sphere must not split from it) and the mitochondria are [13]+[14] (cristae + outer
 * membranes). The repeat-named groups resolve by `occurrence`: `Nulo__Material.027_0` ×4 → nucleolus
 * (meshes [5]–[8]) and `Nulo__Material.018_0` ×3 → ribosomes (meshes [17]–[19]). Because every mesh
 * is mapped, no row carries the `unmapped` policy any more; the policy vocabulary survives because
 * it is data.
 */

/** The animal cell's committed model. */
export const ANIMAL_CELL_MODEL: CellModelManifest = {
  cell: 'animal',
  frame: {
    file: '/models/animal-cell.glb',
    sha256: '626e30ceb8de95bb19a34a08459a0df770327f88c3018a02b05a5683eca4fb17',
    scale: 0.00405687,
    rotation: [0, 0, 0],
    center: [-23.142113, -67.996469, 30.208282],
  },
  meshes: [
    // [0] — branching filament network (`Material.013`) → cytoskeleton.
    {
      node: 'Nulo__Material.013_0',
      policy: 'map',
      recordId: 'cytoskeleton',
      materialKey: 'cytoskeleton',
    },
    // [1] — small loose bodies (`Material.003`) → centrioles.
    { node: 'Nulo__Material.003_0', policy: 'map', recordId: 'centriole', materialKey: 'centriole' },
    // [2] + [3] — the nucleus is ONE part in TWO meshes: the outer and inner spheres. Both rows
    // name the same record so both move as one unit; the inner sphere must not be separated.
    { node: 'Nulo__Material.010_0', policy: 'map', recordId: 'nucleus', materialKey: 'nucleus' },
    { node: 'Nulo__Material.009_0', policy: 'map', recordId: 'nucleus', materialKey: 'nucleus' },
    {
      node: 'Nulo__Material.001_0',
      policy: 'map',
      recordId: 'nuclear-envelope',
      materialKey: 'nuclearEnvelope',
    },
    // [5]–[8]: the four nucleolus bodies share one authored name; `occurrence` is the only key.
    { node: 'Nulo__Material.027_0', occurrence: 0, policy: 'map', recordId: 'nucleolus', materialKey: 'nucleolus' },
    { node: 'Nulo__Material.027_0', occurrence: 1, policy: 'map', recordId: 'nucleolus', materialKey: 'nucleolus' },
    { node: 'Nulo__Material.027_0', occurrence: 2, policy: 'map', recordId: 'nucleolus', materialKey: 'nucleolus' },
    { node: 'Nulo__Material.027_0', occurrence: 3, policy: 'map', recordId: 'nucleolus', materialKey: 'nucleolus' },
    // [9] — small vesicles (`Material.025`) → lysosomes.
    { node: 'Nulo__Material.025_0', policy: 'map', recordId: 'lysosome', materialKey: 'lysosome' },
    // [10] — the green body (`Material.1`) → small vacuoles.
    { node: 'Nulo__Material.1_0', policy: 'map', recordId: 'small-vacuoles', materialKey: 'vacuole' },
    { node: 'Nulo__Material_0', policy: 'map', recordId: 'membrane', materialKey: 'membrane' },
    { node: 'Nulo__Material.006_0', policy: 'map', recordId: 'golgi', materialKey: 'golgi' },
    // [13] + [14] — the mitochondrion is ONE part in TWO meshes: cristae (`Material.007`) + outer
    // membranes (`Material.008`). Both rows name the same record, so they move as one unit.
    {
      node: 'Nulo__Material.007_0',
      policy: 'map',
      recordId: 'mitochondrion',
      materialKey: 'innerMembrane',
    },
    {
      node: 'Nulo__Material.008_0',
      policy: 'map',
      recordId: 'mitochondrion',
      materialKey: 'outerMembrane',
    },
    // [15] — the magenta tubular stack (`Material.026`) → smooth ER.
    {
      node: 'Nulo__Material.026_0',
      policy: 'map',
      recordId: 'smooth-endoplasmic-reticulum',
      materialKey: 'smoothEr',
    },
    // [16] — the folded network around the nucleus (`Material.005`) → rough ER.
    {
      node: 'Nulo__Material.005_0',
      policy: 'map',
      recordId: 'endoplasmic-reticulum',
      materialKey: 'er',
    },
    // [17]–[19]: three ribosome clouds share one authored name.
    { node: 'Nulo__Material.018_0', occurrence: 0, policy: 'map', recordId: 'ribosome', materialKey: 'granule' },
    { node: 'Nulo__Material.018_0', occurrence: 1, policy: 'map', recordId: 'ribosome', materialKey: 'granule' },
    { node: 'Nulo__Material.018_0', occurrence: 2, policy: 'map', recordId: 'ribosome', materialKey: 'granule' },
    {
      node: 'citoplasma_remesh_Material.004_0',
      policy: 'map',
      recordId: 'cytoplasm',
      materialKey: 'cytoplasm',
    },
  ],
};

/**
 * The models that ship, keyed by cell. Partial: only the animal cell has committed bytes, and a
 * plant entry would have to invent a file and a sha256 for a model that does not exist.
 */
export const MODEL_MANIFEST: ModelManifest = Object.freeze({ animal: ANIMAL_CELL_MODEL });

/** True when this cell ships a model. The loader and the mount both gate on it. */
export function hasModel(cell: CellId): boolean {
  return MODEL_MANIFEST[cell] !== undefined;
}

/** One cell's manifest, or undefined. The loader resolves its file and frame through this. */
export function modelFor(cell: CellId): CellModelManifest | undefined {
  return MODEL_MANIFEST[cell];
}
