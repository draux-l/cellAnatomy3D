import {
  CELL_IDS,
  type CellId,
  type OrganelleRecord,
} from './types';

/**
 * The organelle rosters: one record set drives both cells (design D3, spec: Single Source Of
 * Truth). Membership is the only thing that differs between the animal and plant views; the
 * shared organelles are declared once.
 *
 * **PLACEHOLDER EDUCATIONAL COPY.** The *structure* here is final — ids, field coverage,
 * bilingual pairs, palette roles, geometry parameters, seeds, positions and disassembly
 * vectors are all real, and the integrity gate enforces them. The Spanish/English *wording*
 * (names, functions, sizes, fun facts) is pending the owner's review: it is written from
 * standard cell-biology teaching text, not from the owner's own material. Replace the strings,
 * keep the shape. Sizes are representative single values from commonly taught ranges, because
 * the model carries one value per unit rather than a range.
 *
 * Scene-unit values are authored for a cell of radius ~1 unit: `geometry.params.size` is the
 * model scale, `size` is the biological measurement, and they are deliberately different
 * numbers. Disassembly `distance` values are **hand-authored and are what renders**;
 * `catalog/vectors.ts` (task 3.12) exposes the ratified 1.5× bounding-radius suggestion as an
 * authoring aid for filling that field in, and it never overrides a declared value.
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
 * The catalog. Ordered inner → outer, which is the order the scene composes the cell in.
 *
 * Frozen on purpose: the disassembly vector must be identical in animal view, plant view and
 * comparison mode (spec: Same record, same vector, every view), so no layout code path may
 * rewrite a record. Freezing makes that a runtime fact instead of a convention.
 */
const CATALOG: readonly OrganelleRecord[] = [
  {
    id: 'nucleus',
    name: { es: 'Núcleo', en: 'Nucleus' },
    func: {
      es: 'Guarda el ADN y coordina la actividad de la célula. Su envoltura doble tiene poros que controlan el paso de moléculas.',
      en: 'Stores the DNA and coordinates the activity of the cell. Its double envelope has pores that control the passage of molecules.',
    },
    size: { value: 6, unit: 'µm' },
    funFact: {
      es: 'El ADN de una célula humana mide unos 2 metros de largo y cabe dentro de un núcleo de 6 µm.',
      en: 'The DNA of one human cell is about 2 metres long and fits inside a nucleus 6 µm across.',
    },
    paletteRole: 'nucleus',
    position: [0.1, 0.05, -0.06],
    geometry: {
      builder: 'nucleus',
      params: { size: 0.34, detail: 1, count: 0, poreCount: 48 },
      seed: 'nucleus/v1',
    },
    disassembly: { direction: [0.46, 0.23, -0.86], distance: 0.55 },
    cells: ['animal', 'plant'],
    pickable: true,
  },
  {
    id: 'mitochondrion',
    name: { es: 'Mitocondria', en: 'Mitochondrion' },
    func: {
      es: 'Produce la mayor parte del ATP de la célula mediante la respiración celular. Su membrana interna se pliega en crestas.',
      en: 'Produces most of the ATP of the cell through cellular respiration. Its inner membrane folds into cristae.',
    },
    size: { value: 2, unit: 'µm' },
    funFact: {
      es: 'Su membrana interna se pliega para aumentar la superficie donde ocurre la respiración: más pliegues, más ATP.',
      en: 'Its inner membrane folds to increase the surface where respiration happens: more folds, more ATP.',
    },
    paletteRole: 'organelles',
    position: [-0.34, -0.18, 0.22],
    geometry: {
      builder: 'mitochondrion',
      params: { size: 0.3, detail: 1, count: 0, cristaeCount: 12 },
      // The same seed M0 shipped, so the first organelle's identity is preserved.
      seed: 'mitochondrion/v1',
    },
    disassembly: { direction: [-0.72, -0.38, 0.58], distance: 0.75 },
    cells: ['animal', 'plant'],
    pickable: true,
  },
  {
    id: 'endoplasmic-reticulum',
    name: { es: 'Retículo endoplasmático', en: 'Endoplasmic reticulum' },
    func: {
      es: 'Red de túbulos y cisternas que fabrica lípidos y proteínas y los transporta por la célula. La parte rugosa lleva ribosomas adheridos.',
      en: 'A network of tubules and cisternae that builds lipids and proteins and transports them across the cell. The rough part carries attached ribosomes.',
    },
    size: { value: 50, unit: 'nm' },
    funFact: {
      es: 'Es continuo con la envoltura del núcleo: juntos forman un solo sistema de membranas.',
      en: 'It is continuous with the nuclear envelope: together they form a single membrane system.',
    },
    paletteRole: 'organelles',
    position: [0.14, -0.1, 0.1],
    geometry: {
      builder: 'endoplasmic-reticulum',
      params: { size: 0.5, detail: 1, count: 6, branchCount: 6 },
      seed: 'endoplasmic-reticulum/v1',
    },
    disassembly: { direction: [0.63, -0.45, 0.63], distance: 0.65 },
    cells: ['animal', 'plant'],
    pickable: true,
  },
  {
    id: 'golgi',
    name: { es: 'Aparato de Golgi', en: 'Golgi apparatus' },
    func: {
      es: 'Modifica, clasifica y empaqueta proteínas y lípidos en vesículas que salen hacia su destino.',
      en: 'Modifies, sorts and packages proteins and lipids into vesicles that leave for their destination.',
    },
    size: { value: 1, unit: 'µm' },
    funFact: {
      es: 'Tiene una cara cis, que recibe, y una cara trans, que despacha: el cargamento entra por un lado y sale por el otro.',
      en: 'It has a cis face that receives and a trans face that dispatches: cargo enters one side and leaves the other.',
    },
    paletteRole: 'organelles',
    position: [-0.16, 0.14, -0.12],
    geometry: {
      builder: 'golgi',
      params: { size: 0.3, detail: 1, count: 6, cisternaeCount: 6 },
      seed: 'golgi/v1',
    },
    disassembly: { direction: [-0.6, 0.53, -0.6], distance: 0.65 },
    cells: ['animal', 'plant'],
    pickable: true,
  },
  {
    id: 'ribosome',
    name: { es: 'Ribosomas', en: 'Ribosomes' },
    func: {
      es: 'Leen el ARN mensajero y ensamblan proteínas a partir de aminoácidos. Están libres en el citosol o adheridos al retículo rugoso.',
      en: 'Read messenger RNA and assemble proteins from amino acids. They are free in the cytosol or attached to the rough ER.',
    },
    size: { value: 25, unit: 'nm' },
    funFact: {
      es: 'Una célula puede contener millones de ribosomas, cada uno ensamblando proteínas a gran velocidad.',
      en: 'A cell can hold millions of ribosomes, each one assembling proteins at high speed.',
    },
    paletteRole: 'organelles',
    position: [0.3, 0.22, 0.06],
    geometry: {
      builder: 'ribosome',
      params: { size: 0.03, detail: 0, count: 220 },
      seed: 'ribosome/v1',
    },
    disassembly: { direction: [0.796, 0.584, 0.159], distance: 0.55 },
    cells: ['animal', 'plant'],
    pickable: true,
  },
  {
    id: 'lysosome',
    name: { es: 'Lisosoma', en: 'Lysosome' },
    func: {
      es: 'Vesícula con enzimas digestivas que degrada restos celulares y material que entra desde fuera.',
      en: 'A vesicle carrying digestive enzymes that breaks down cell debris and material taken in from outside.',
    },
    size: { value: 0.5, unit: 'µm' },
    funFact: {
      es: 'Mantiene su interior ácido para que sus enzimas funcionen.',
      en: 'It keeps its interior acidic so that its enzymes work.',
    },
    paletteRole: 'organelles',
    position: [-0.4, 0.3, 0.14],
    geometry: {
      builder: 'lysosome',
      params: { size: 0.12, detail: 1, count: 0 },
      seed: 'lysosome/v1',
    },
    disassembly: { direction: [-0.77, 0.58, 0.27], distance: 0.7 },
    cells: ['animal', 'plant'],
    pickable: true,
  },
  {
    id: 'membrane',
    name: { es: 'Membrana plasmática', en: 'Cell membrane' },
    func: {
      es: 'Delimita la célula y regula qué moléculas entran y salen. Es una bicapa de lípidos con proteínas embebidas.',
      en: 'Bounds the cell and regulates which molecules enter and leave. It is a lipid bilayer with embedded proteins.',
    },
    size: { value: 7, unit: 'nm' },
    funFact: {
      es: 'Mide unos 7 nm de espesor: si la célula fuera una pelota de fútbol, la membrana sería más delgada que una hoja de papel.',
      en: 'About 7 nm thick: if a cell were a football, the membrane would be thinner than a sheet of paper.',
    },
    paletteRole: 'membrane',
    // The membrane is the cell's own shell, so it is centred on the origin.
    position: [0, 0, 0],
    geometry: {
      builder: 'membrane',
      params: { size: 1, detail: 1, count: 0, noiseAmplitude: 0.035 },
      seed: 'membrane/v1',
    },
    /*
     * **The plant membrane shares the wall's silhouette.**
     *
     * A plant cell is a rounded polygon, not a sphere — the rigid cellulose wall imposes
     * straight-ish sides with rounded corners. A noise-displaced sphere inside that wall renders
     * as a round membrane rattling inside an angular box, with wide corner gaps: two unrelated
     * shapes claiming to be the same cell. The composition defect is real and it surfaced the
     * moment the cell was first assembled.
     *
     * The fix is a parameter, not a special case: `sides: 8` and the wall's own `0.4` corner
     * rounding make the membrane builder reuse the wall's silhouette generator, so both shapes
     * are derived from one function. The animal membrane declares nothing here and therefore
     * keeps its round default — no animal-cell behaviour changes.
     */
    perCell: {
      plant: { geometryParams: { sides: 8, cornerRounding: 0.4 } },
    },
    // Explicit "this part never separates": the outer envelope is what the others leave behind.
    disassembly: { direction: [0, 0, 0], distance: 0 },
    cells: ['animal', 'plant'],
    pickable: true,
  },
  {
    id: 'cell-wall',
    name: { es: 'Pared celular', en: 'Cell wall' },
    func: {
      es: 'Capa rígida de celulosa por fuera de la membrana que da forma, sostén y protección a la célula vegetal.',
      en: 'A rigid cellulose layer outside the membrane that gives the plant cell its shape, support and protection.',
    },
    size: { value: 0.1, unit: 'µm' },
    funFact: {
      es: 'Es lo que mantiene la forma de una célula vegetal cuando entra agua de más.',
      en: 'It is what keeps a plant cell in shape when too much water enters.',
    },
    // The palette's `membrane` layer is the outer-boundary role, so the wall shares it.
    paletteRole: 'membrane',
    position: [0, 0, 0],
    /*
     * `size` is the wall's **inner** boundary, and it was raised from 1.06 to 1.12 when the cell
     * was first composed. At 1.06 the membrane's outermost vertex (1.035 with its noise) cleared
     * the wall by 0.025 scene units — a seam roughly 2% of the cell radius, which reads as the
     * wall touching the membrane rather than as a wall outside it. 1.12 gives a uniform 0.085
     * gap at every azimuth, which is what makes "the wall sits outside the membrane" legible.
     * The organelle fixture renders builder *defaults*, so this record-level change moves no
     * committed screenshot.
     */
    geometry: {
      builder: 'cell-wall',
      params: { size: 1.12, detail: 1, count: 0 },
      seed: 'cell-wall/v1',
    },
    disassembly: { direction: [0, 0, 0], distance: 0 },
    cells: ['plant'],
    pickable: true,
  },
  {
    id: 'chloroplast',
    name: { es: 'Cloroplasto', en: 'Chloroplast' },
    func: {
      es: 'Realiza la fotosíntesis: captura la luz y la usa para fabricar glucosa a partir de agua y dióxido de carbono. Los grana apilan los tilacoides.',
      en: 'Carries out photosynthesis: captures light and uses it to build glucose from water and carbon dioxide. Grana stack the thylakoids.',
    },
    size: { value: 5, unit: 'µm' },
    funFact: {
      es: 'Los grana apilan discos de tilacoides para empaquetar la maquinaria que captura la luz en muy poco espacio.',
      en: 'Grana stack thylakoid discs to pack the light-capturing machinery into very little space.',
    },
    paletteRole: 'organelles',
    position: [0.24, 0.28, -0.2],
    geometry: {
      builder: 'chloroplast',
      params: { size: 0.42, detail: 1, count: 0, granaStacks: 5 },
      seed: 'chloroplast/v1',
    },
    disassembly: { direction: [0.572, 0.667, -0.477], distance: 0.8 },
    cells: ['plant'],
    pickable: true,
  },
  {
    id: 'vacuole',
    name: { es: 'Vacuola central', en: 'Central vacuole' },
    func: {
      es: 'Gran depósito de agua y solutos que mantiene la presión interna (turgencia) y guarda nutrientes y desechos.',
      en: 'A large reservoir of water and solutes that keeps the internal pressure (turgor) and stores nutrients and waste.',
    },
    size: { value: 50, unit: 'µm' },
    funFact: {
      es: 'Puede ocupar hasta el 80% del volumen de una célula vegetal.',
      en: 'It can take up as much as 80% of the volume of a plant cell.',
    },
    // The vacuole is a bounded body, not the cytosol: it takes the organelle role so the plant
    // cell's bulk volume does not disappear into the cytoplasm colour when the cell explodes.
    paletteRole: 'organelles',
    position: [-0.02, -0.03, 0.01],
    geometry: {
      builder: 'vacuole',
      params: { size: 0.72, detail: 1, count: 0 },
      seed: 'vacuole/v1',
    },
    disassembly: { direction: [-0.51, -0.7, 0.5], distance: 0.4 },
    cells: ['plant'],
    pickable: true,
  },
];

export const ORGANELLE_RECORDS: readonly OrganelleRecord[] = deepFreeze(CATALOG);

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
