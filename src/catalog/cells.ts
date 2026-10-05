import { CELL_IDS, type CellId, type OrganelleRecord } from './types';

/**
 * The organelle roster.
 *
 * **One cell, one model.** The catalog holds the animal cell only: its 14 organelles are the meshes
 * of the committed GLB (`catalog/models.ts`, 21 meshes mapped onto 14 records), and a record is the
 * *identity* of one part for the consumers that read a record — the hover label, the spec sheet, the
 * palette role, the isolate framing and the pick target.
 *
 * ## Bilingual names only, for now
 *
 * Every record carries its `name` in both languages and nothing else. The maintainer supplies the
 * descriptions, sizes and fun facts in a later pass, and while they are absent the spec sheet omits
 * their rows rather than rendering blanks or placeholders that would read as real content
 * (`ui/SpecSheet.tsx`). The integrity gate validates each of those fields only when present.
 *
 * ## Measured from the file, with the correct mount
 *
 * `position` is the part's **measured centre in scene units** and `geometry.extent` its measured
 * half-diagonal — both re-derived from the raw GLB with the world-preserving mount
 * (`scene/MeshCellGroup.tsx`, fixed in e1f62d2). The previous values were measured while the mount
 * double-attached each mesh (translating every mapped record by its own box centre); these supersede
 * them. The measurement method and the per-record contact sheet live in `artifacts/tmp/`.
 *
 * - `position` frames the isolate view and backs the pick envelope rule.
 * - `geometry.extent` is what the isolate camera backs off by, now that no builder `size` parameter
 *   exists.
 *
 * ## The disassembly policy is a flag; where a part goes is a rule
 *
 * A record declares only `separates`. **Where** it travels is decided by the layout
 * (`catalog/separation.ts`), because the product has two views of the same control:
 *
 * - **`ordered`** — one ring of evenly spaced slots in the plane of the default view, with a slot
 *   radius that grows with the part's own `extent`. Predictable and legible: it answers *what parts
 *   are there*, and it is the menu the inspection is chosen from.
 * - **`real`** — every part travels along the ray it genuinely occupies, to a radius that clears the
 *   membrane by its own size. Less tidy and a wider frame, but it answers *where each part is*, which
 *   is the only thing that teaches the cell's spatial arrangement.
 *
 * Neither is authored per record, and that is deliberate: a second set of numbers per view would be
 * data no one could keep in sync, and it could not express a view that does not exist yet. Both
 * layouts derive from `position` and `geometry.extent` — data this file already measures — and both
 * answer to one invariant: **every slot clears the membrane by the part's own radius**.
 *
 * Three records declare `separates: false`, and each for its own reason:
 *
 * - `membrane` and `cytoplasm` are the cell's **envelope**. They are declared at the origin so
 *   `isOuterEnvelope` (`scene/interaction/pickingModel.ts`) keys on `separates === false` **and**
 *   `position ≈ 0` and reads them as surfaces the user looks *through*, not answers. The cytoplasm's
 *   mesh centre is measured at `[0.0066, 0.2901, 0.0194]`; an off-origin cytoplasm would make its
 *   whole-cell hit box a normal pick target and swallow every organelle click.
 * - `cytoskeleton` is the **scaffold**, kept in place so the arrangement opens around a stable frame
 *   of reference. Its `position` is off-origin, so keeping it still does not change its pick
 *   classification.
 *
 * Two properties of this model are decided by the `.glb`, not by the code, and the layouts have to
 * live with both:
 *
 * - Five records are **distributed networks**, not compact bodies (`cytoskeleton` 1.781,
 *   `mitochondrion` 1.513, `ribosome` 1.241, `endoplasmic-reticulum` 1.228, `lysosome` 1.131 — each a
 *   half-diagonal against a cell radius of 2.002). They span the cell and cannot be extracted whole;
 *   their bounding spheres overlap the rest by construction.
 * - Two groups are **co-located**: `ribosome` sits inside `endoplasmic-reticulum` (centres 0.009
 *   apart), and the nucleus, its envelope, the nucleolus and the centrioles share one ray within 4°.
 *   The `real` layout therefore **stacks** them along the shared ray, which is the honest picture:
 *   they really are on top of one another in the cell.
 *
 * ## Node addressing
 *
 * A record's meshes are addressed by `(node, occurrence)` through the committed manifest. The model
 * derives node names from material indices, so several nodes share a name; `occurrence` is the
 * loader's dedup order and is the only reliable key for the repeat groups
 * (`Nulo__Material.027_0` ×4 → nucleolus, `Nulo__Material.018_0` ×3 → ribosomes). A raw name-keyed
 * lookup resolves nothing on this model, which is the failure this project has hit twice.
 *
 * Frozen on purpose: the same record yields the same data in every view, so no layout code path may
 * rewrite a record.
 */

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);

    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }

  return value;
}

export { deepFreeze };

/**
 * The catalog, inner → outer. Every record is a name-only mesh record for the animal cell.
 *
 * The `Nulo__Material…` node names are the **authored** GLB names; `occurrence` disambiguates the
 * repeated ones.
 */
export const ORGANELLE_RECORDS: readonly OrganelleRecord[] = deepFreeze<OrganelleRecord[]>([
  {
    id: 'nucleus',
    name: { es: 'Núcleo', en: 'Nucleus' },
    paletteRole: 'nucleus',
    // [2] + [3]: the outer chromatin sphere and its inner sphere are ONE part — [3] must not split.
    position: [-0.06175, 0.62326, -0.329603],
    geometry: {
      kind: 'mesh',
      meshes: [
        { cell: 'animal', node: 'Nulo__Material.010_0', occurrence: 0, materialKey: 'nucleus' },
        { cell: 'animal', node: 'Nulo__Material.009_0', occurrence: 0, materialKey: 'nucleus' },
      ],
      extent: 0.604948,
    },
    separates: true,
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'nucleolus',
    name: { es: 'Nucléolo', en: 'Nucleolus' },
    paletteRole: 'nucleus',
    // The four bodies share one authored name; occurrence is the only key.
    position: [-0.048765, 0.625161, -0.282757],
    geometry: {
      kind: 'mesh',
      meshes: [
        { cell: 'animal', node: 'Nulo__Material.027_0', occurrence: 0, materialKey: 'nucleolus' },
        { cell: 'animal', node: 'Nulo__Material.027_0', occurrence: 1, materialKey: 'nucleolus' },
        { cell: 'animal', node: 'Nulo__Material.027_0', occurrence: 2, materialKey: 'nucleolus' },
        { cell: 'animal', node: 'Nulo__Material.027_0', occurrence: 3, materialKey: 'nucleolus' },
      ],
      extent: 0.233636,
    },
    separates: true,
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'nuclear-envelope',
    name: { es: 'Envoltura nuclear', en: 'Nuclear envelope' },
    paletteRole: 'nucleus',
    position: [-0.064116, 0.520904, -0.356455],
    geometry: {
      kind: 'mesh',
      meshes: [
        { cell: 'animal', node: 'Nulo__Material.001_0', materialKey: 'nuclearEnvelope' },
        // The pores are a second surface of the same part: a ring of them sits on the envelope, and
        // isolating the record without this row shows an empty shell (`catalog/models.ts`, row [1]).
        { cell: 'animal', node: 'Nulo__Material.003_0', materialKey: 'nuclearPore' },
      ],
      extent: 0.761429,
    },
    separates: true,
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'centriole',
    name: { es: 'Centríolos (centrosoma)', en: 'Centrioles (centrosome)' },
    paletteRole: 'organelles',
    /*
     * Re-measured after the split: this record is now the **two rods** of `Material.025`, not the
     * nuclear pores it used to carry. The pores' numbers described a different part entirely.
     */
    position: [-0.374983, -0.109058, 0.816204],
    geometry: {
      kind: 'mesh',
      // One node, shared with `lysosome`: this record owns the first two body groups of
      // `Material.025` and the lysosomes own the rest (`catalog/models.ts`, row [9]).
      meshes: [{ cell: 'animal', node: 'Nulo__Material.025_0', materialKey: 'centriole' }],
      extent: 0.228698,
    },
    separates: true,
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'mitochondrion',
    name: { es: 'Mitocondrias', en: 'Mitochondria' },
    paletteRole: 'organelles',
    // One part, two meshes: the cristae and the outer membranes move as one unit.
    position: [-0.272046, 0.317464, 0.026802],
    geometry: {
      kind: 'mesh',
      meshes: [
        { cell: 'animal', node: 'Nulo__Material.007_0', materialKey: 'innerMembrane' },
        { cell: 'animal', node: 'Nulo__Material.008_0', materialKey: 'outerMembrane' },
      ],
      extent: 1.513169,
    },
    separates: true,
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'endoplasmic-reticulum',
    name: { es: 'Retículo endoplasmático rugoso (RER)', en: 'Rough endoplasmic reticulum (RER)' },
    paletteRole: 'organelles',
    position: [-0.074583, 0.366105, -0.310897],
    geometry: {
      kind: 'mesh',
      meshes: [{ cell: 'animal', node: 'Nulo__Material.005_0', materialKey: 'er' }],
      extent: 1.227892,
    },
    separates: true,
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'smooth-endoplasmic-reticulum',
    name: { es: 'Retículo endoplasmático liso (REL)', en: 'Smooth endoplasmic reticulum (SER)' },
    paletteRole: 'organelles',
    position: [-0.582227, 0.113402, 0.496962],
    geometry: {
      kind: 'mesh',
      meshes: [{ cell: 'animal', node: 'Nulo__Material.026_0', materialKey: 'smoothEr' }],
      extent: 0.446803,
    },
    separates: true,
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'golgi',
    name: { es: 'Aparato de Golgi', en: 'Golgi apparatus' },
    paletteRole: 'organelles',
    position: [0.56977, -0.010282, 0.532033],
    geometry: {
      kind: 'mesh',
      meshes: [{ cell: 'animal', node: 'Nulo__Material.006_0', materialKey: 'golgi' }],
      extent: 0.651287,
    },
    separates: true,
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'ribosome',
    name: { es: 'Ribosomas', en: 'Ribosomes' },
    paletteRole: 'organelles',
    // Three granule clouds share one authored name; occurrence is the only key.
    position: [-0.074692, 0.374699, -0.313823],
    geometry: {
      kind: 'mesh',
      meshes: [
        { cell: 'animal', node: 'Nulo__Material.018_0', occurrence: 0, materialKey: 'granule' },
        { cell: 'animal', node: 'Nulo__Material.018_0', occurrence: 1, materialKey: 'granule' },
        { cell: 'animal', node: 'Nulo__Material.018_0', occurrence: 2, materialKey: 'granule' },
      ],
      extent: 1.240848,
    },
    separates: true,
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'lysosome',
    name: { es: 'Lisosomas', en: 'Lysosomes' },
    paletteRole: 'organelles',
    // Re-measured after the split: only the round vesicles of `Material.025` remain, so the box is
    // the union of those two and not of the whole 56-body mesh.
    position: [0.039886, 0.188369, 0.216124],
    geometry: {
      kind: 'mesh',
      // The rest of `Material.025`: the round vesicles. The rods beside them are the centrioles.
      meshes: [{ cell: 'animal', node: 'Nulo__Material.025_0', materialKey: 'lysosome' }],
      extent: 1.051921,
    },
    separates: true,
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'small-vacuoles',
    name: { es: 'Vacuolas pequeñas', en: 'Small vacuoles' },
    paletteRole: 'organelles',
    position: [-0.064052, -0.093361, 0.697632],
    geometry: {
      kind: 'mesh',
      meshes: [{ cell: 'animal', node: 'Nulo__Material.1_0', materialKey: 'vacuole' }],
      extent: 0.308558,
    },
    separates: true,
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'cytoskeleton',
    name: { es: 'Citoesqueleto', en: 'Cytoskeleton' },
    paletteRole: 'organelles',
    position: [0.034062, -0.006494, -0.152551],
    geometry: {
      kind: 'mesh',
      meshes: [{ cell: 'animal', node: 'Nulo__Material.013_0', materialKey: 'cytoskeleton' }],
      extent: 1.780936,
    },
    separates: false,
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'cytoplasm',
    name: { es: 'Citoplasma', en: 'Cytoplasm' },
    paletteRole: 'cytoplasm',
    // The cell's inner volume: it contains every organelle and never separates. Declared at the
    // origin so it stays a non-occluding pick envelope; its measured centre is
    // [0.0066, 0.2901, 0.0194] and it is deliberately not used here (see the file header).
    position: [0, 0, 0],
    geometry: {
      kind: 'mesh',
      meshes: [
        { cell: 'animal', node: 'citoplasma_remesh_Material.004_0', materialKey: 'cytoplasm' },
      ],
      extent: 1.818815,
    },
    separates: false,
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'membrane',
    name: { es: 'Membrana plasmática', en: 'Cell membrane' },
    paletteRole: 'membrane',
    // The outer boundary: the cell itself, at the frame's origin (the membrane box centre is the
    // scene origin by construction), so it is the other non-occluding pick envelope.
    position: [0, 0, 0],
    geometry: {
      kind: 'mesh',
      meshes: [{ cell: 'animal', node: 'Nulo__Material_0', materialKey: 'membrane' }],
      extent: 2.002279,
    },
    separates: false,
    cells: ['animal'],
    pickable: true,
  },
]);

const RECORDS_BY_ID = new Map(ORGANELLE_RECORDS.map((record) => [record.id, record]));

/** The record for an id, or undefined. The viewer resolves geometry through this, not by path. */
export function getRecord(id: string): OrganelleRecord | undefined {
  return RECORDS_BY_ID.get(id);
}

/** The ordered roster for one cell, inner → outer. */
export function rosterFor(cell: CellId): readonly OrganelleRecord[] {
  return ORGANELLE_RECORDS.filter((record) => record.cells.includes(cell));
}

/** Every cell id the catalog knows about, re-exported so consumers need one import. */
export { CELL_IDS };

export type { CellId, OrganelleRecord };
