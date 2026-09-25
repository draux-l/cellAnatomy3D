import { CELL_IDS, type CellId, type DisassemblyVector, type OrganelleRecord } from './types';

/**
 * The organelle roster.
 *
 * **One cell, one model.** The catalog holds the animal cell only: its 14 organelles are the meshes
 * of the committed GLB (`catalog/models.ts`, 21 meshes mapped onto 14 records), and a record is the
 * *identity* of one part for the consumers that read a record — the hover label, the spec sheet, the
 * palette role, the isolate framing and the pick volume.
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
 * ## The disassembly vectors are deliberate placeholders
 *
 * The exploded view is hidden (`app/structureTools.ts`) and the maintainer will define the travel
 * later, so every record declares the explicit "does not separate" zero vector — no travel distance
 * is tuned here. Two consequences worth naming:
 *
 * - It is honest: a record whose vector were invented would be data no one authored.
 * - The two **boundary surfaces** are the records at the cell origin. `isOuterEnvelope`
 *   (`scene/interaction/pickingModel.ts`) keys on `distance === 0` **and** `position ≈ 0`, and every
 *   inner organelle sits off-origin, so the membrane and the cytoplasm remain non-occluding pick
 *   envelopes while the rest stay reachable. The cytoplasm is declared at the origin for exactly that
 *   reason: its mesh centre is measured at `[0.0066, 0.2901, 0.0194]`, but an off-origin cytoplasm
 *   would make its whole-cell hit box a normal pick target and swallow every organelle click.
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

/** The explicit "this part does not separate (yet)" vector: disassembly is hidden and unauthored. */
const NO_DISASSEMBLY: DisassemblyVector = { direction: [0, 0, 0], distance: 0 };

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
    disassembly: { ...NO_DISASSEMBLY },
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
    disassembly: { ...NO_DISASSEMBLY },
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
      meshes: [{ cell: 'animal', node: 'Nulo__Material.001_0', materialKey: 'nuclearEnvelope' }],
      extent: 0.761429,
    },
    disassembly: { ...NO_DISASSEMBLY },
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'centriole',
    name: { es: 'Centríolos (centrosoma)', en: 'Centrioles (centrosome)' },
    paletteRole: 'organelles',
    position: [-0.055464, 0.813822, -0.362531],
    geometry: {
      kind: 'mesh',
      meshes: [{ cell: 'animal', node: 'Nulo__Material.003_0', materialKey: 'centriole' }],
      extent: 0.480949,
    },
    disassembly: { ...NO_DISASSEMBLY },
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
    disassembly: { ...NO_DISASSEMBLY },
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
    disassembly: { ...NO_DISASSEMBLY },
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
    disassembly: { ...NO_DISASSEMBLY },
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
    disassembly: { ...NO_DISASSEMBLY },
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
    disassembly: { ...NO_DISASSEMBLY },
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'lysosome',
    name: { es: 'Lisosomas', en: 'Lysosomes' },
    paletteRole: 'organelles',
    position: [0.039886, 0.11381, 0.343495],
    geometry: {
      kind: 'mesh',
      meshes: [{ cell: 'animal', node: 'Nulo__Material.025_0', materialKey: 'lysosome' }],
      extent: 1.130731,
    },
    disassembly: { ...NO_DISASSEMBLY },
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
    disassembly: { ...NO_DISASSEMBLY },
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
    disassembly: { ...NO_DISASSEMBLY },
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
    disassembly: { ...NO_DISASSEMBLY },
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
    disassembly: { ...NO_DISASSEMBLY },
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
