import { CELL_IDS, type CellId, type OrganelleRecord } from './types';

/**
 * The organelle roster.
 *
 * **One cell, one model.** The catalog holds the animal cell only: its organelles are the meshes of
 * the committed GLB (`catalog/models.ts`), and a record is the *identity* of one of those meshes for
 * the four consumers that read a record — the annotation label, the spec sheet, the palette role and
 * the isolate framing. The plant cell is absent rather than empty: there is no plant model, and a
 * record set for it would be data that renders nothing.
 *
 * ## What a record owns now, and what it must not own
 *
 * A record's `position` is the part's **measured centre in scene units**, derived from the model's
 * own bounds. It is *not* a placement: nothing moves a mesh to it. The viewer keeps every mesh at
 * its authored transform, so the model's arrangement is the cell's arrangement.
 *
 * - `position` frames the isolate view and gives the disassembly direction a radial basis.
 * - `geometry.extent` is the part's measured half-diagonal, which is what backs the isolate camera
 *   off by the right amount now that no builder `size` parameter exists.
 * - `disassembly.direction` is authored outward (the integrity gate proves the radial component is
 *   non-negative); `disassembly.distance` is the travel at 100%.
 * - The membrane and the cytoplasm declare a zero vector with zero distance: they are the cell's
 *   boundary surfaces and never separate, which is also what makes them non-occluding pick
 *   envelopes (`scene/interaction/pickingModel.ts`).
 *
 * ## The direction fan
 *
 * The nucleus, its envelope, the chromatin and the nucleolus are concentric, so a purely radial
 * direction would stack them along one line and read as one object. Each is authored a direction in
 * the same outward hemisphere but at a different azimuth, so they separate into a readable fan. The
 * same applies to the two concentric networks (ER and ribosomes). Every direction is verified by the
 * integrity gate rather than by eye.
 *
 * ## The gap
 *
 * The canonical animal roster names a **lysosome**, and this model has none — no mesh, and no
 * procedural builder to fall back to. No lysosome record is invented; `integrity.test.ts` asserts
 * that gap explicitly, so it is a recorded fact rather than a silent omission.
 *
 * Frozen on purpose: the disassembly vector must be identical in every view (spec: Same record, same
 * vector, every view), so no layout code path may rewrite a record.
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

/** The catalog, ordered inner → outer, which is also roughly the order the cell layers sit in. */
export const ORGANELLE_RECORDS: readonly OrganelleRecord[] = deepFreeze<OrganelleRecord[]>([
  {
    id: 'chromatin',
    name: { es: 'Cromatina', en: 'Chromatin' },
    func: {
      es: 'Es el ADN empaquetado con proteínas; guarda la información hereditaria.',
      en: 'DNA packaged with proteins; it stores the hereditary information.',
    },
    size: { value: 30, unit: 'nm' },
    funFact: {
      es: 'Desenrollada, la cromatina de una célula mediría unos dos metros.',
      en: 'Unwound, the chromatin in one cell would measure about two metres.',
    },
    paletteRole: 'nucleus',
    position: [-0.048765, 0.625161, -0.282757],
    geometry: {
      kind: 'mesh',
      meshes: [
        { cell: 'animal', node: 'Nulo__Material.027_0', occurrence: 0, materialKey: 'chromatin' },
        { cell: 'animal', node: 'Nulo__Material.027_0', occurrence: 1, materialKey: 'chromatin' },
        { cell: 'animal', node: 'Nulo__Material.027_0', occurrence: 2, materialKey: 'chromatin' },
        { cell: 'animal', node: 'Nulo__Material.027_0', occurrence: 3, materialKey: 'chromatin' },
      ],
      extent: 0.233636,
    },
    disassembly: { direction: [0.1, 0.723, 0.683], distance: 1.3 },
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'nucleolus',
    name: { es: 'Nucléolo', en: 'Nucleolus' },
    func: {
      es: 'Fabrica los ribosomas que después traducen las proteínas.',
      en: 'Builds the ribosomes that later translate proteins.',
    },
    size: { value: 1.5, unit: 'µm' },
    funFact: {
      es: 'Es la zona más densa del núcleo, y se ve como un punto oscuro.',
      en: 'It is the densest region of the nucleus and reads as a dark spot.',
    },
    paletteRole: 'nucleus',
    position: [-0.054124, 0.587987, -0.282757],
    geometry: {
      kind: 'mesh',
      meshes: [{ cell: 'animal', node: 'Nulo__Material.009_0', materialKey: 'nucleolus' }],
      extent: 0.176824,
    },
    disassembly: { direction: [-0.1, 0.92, 0.38], distance: 0.55 },
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'nucleus',
    name: { es: 'Núcleo', en: 'Nucleus' },
    func: {
      es: 'Contiene el ADN y dirige la actividad de la célula.',
      en: 'Holds the DNA and directs the cell’s activity.',
    },
    size: { value: 6, unit: 'µm' },
    funFact: {
      es: 'Su interior está separado del citoplasma por una doble membrana con poros.',
      en: 'A double membrane with pores separates its interior from the cytoplasm.',
    },
    paletteRole: 'nucleus',
    position: [-0.06175, 0.623261, -0.329603],
    geometry: {
      kind: 'mesh',
      meshes: [{ cell: 'animal', node: 'Nulo__Material.010_0', materialKey: 'nucleus' }],
      extent: 0.604948,
    },
    disassembly: { direction: [-0.3, 0.8, -0.52], distance: 0.85 },
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'nuclear-envelope',
    name: { es: 'Envoltura nuclear', en: 'Nuclear envelope' },
    func: {
      es: 'Rodea al núcleo y regula el paso de sustancias por sus poros.',
      en: 'Surrounds the nucleus and regulates what passes through its pores.',
    },
    size: { value: 20, unit: 'nm' },
    funFact: {
      es: 'Durante la división celular se desmonta y se vuelve a formar.',
      en: 'It disassembles during cell division and re-forms afterwards.',
    },
    paletteRole: 'nucleus',
    position: [-0.064116, 0.520905, -0.356455],
    geometry: {
      kind: 'mesh',
      meshes: [{ cell: 'animal', node: 'Nulo__Material.001_0', materialKey: 'nuclearEnvelope' }],
      extent: 0.761429,
    },
    disassembly: { direction: [0.62, 0.55, -0.56], distance: 1.15 },
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'mitochondrion',
    name: { es: 'Mitocondria', en: 'Mitochondrion' },
    func: {
      es: 'Obtiene energía de los nutrientes y la guarda como ATP.',
      en: 'Extracts energy from nutrients and stores it as ATP.',
    },
    size: { value: 2, unit: 'µm' },
    funFact: {
      es: 'Sus pliegues internos, las crestas, aumentan la superficie donde se produce el ATP.',
      en: 'Its inner folds, the cristae, increase the surface where ATP is produced.',
    },
    paletteRole: 'organelles',
    position: [-0.272046, 0.317464, 0.026802],
    geometry: {
      kind: 'mesh',
      // One part, two meshes: the purple outer membranes and the orange cristae. They share one
      // record so disassembly moves them as one unit.
      meshes: [
        { cell: 'animal', node: 'Nulo__Material.008_0', materialKey: 'outerMembrane' },
        { cell: 'animal', node: 'Nulo__Material.007_0', materialKey: 'innerMembrane' },
      ],
      extent: 1.513169,
    },
    disassembly: { direction: [-0.649, 0.758, 0.064], distance: 1.5 },
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'endoplasmic-reticulum',
    name: { es: 'Retículo endoplasmático', en: 'Endoplasmic reticulum' },
    func: {
      es: 'Transporta y fabrica proteínas y lípidos dentro de la célula.',
      en: 'Transports and builds proteins and lipids inside the cell.',
    },
    size: { value: 3, unit: 'µm' },
    funFact: {
      es: 'Sus membranas forman una red continua por todo el citoplasma.',
      en: 'Its membranes form one continuous network through the cytoplasm.',
    },
    paletteRole: 'organelles',
    position: [-0.074583, 0.366105, -0.310897],
    geometry: {
      kind: 'mesh',
      meshes: [
        { cell: 'animal', node: 'Nulo__Material.005_0', materialKey: 'er' },
      ],
      extent: 1.227893,
    },
    disassembly: { direction: [-0.752, 0.451, -0.481], distance: 0.75 },
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'golgi',
    name: { es: 'Aparato de Golgi', en: 'Golgi apparatus' },
    func: {
      es: 'Modifica, empaqueta y distribuye las proteínas de la célula.',
      en: 'Modifies, packages and ships the cell’s proteins.',
    },
    size: { value: 1.5, unit: 'µm' },
    funFact: {
      es: 'Sus sacos apilados recuerdan a una pila de tortitas.',
      en: 'Its stacked sacs look like a stack of pancakes.',
    },
    paletteRole: 'organelles',
    position: [0.56977, -0.010282, 0.532033],
    geometry: {
      kind: 'mesh',
      meshes: [{ cell: 'animal', node: 'Nulo__Material.006_0', materialKey: 'golgi' }],
      extent: 0.651287,
    },
    disassembly: { direction: [0.731, -0.013, 0.682], distance: 1.1 },
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'ribosome',
    name: { es: 'Ribosomas', en: 'Ribosomes' },
    func: {
      es: 'Leen el ARN y ensamblan las proteínas aminoácido a aminoácido.',
      en: 'Read RNA and assemble proteins amino acid by amino acid.',
    },
    size: { value: 25, unit: 'nm' },
    funFact: {
      es: 'Una célula puede contener millones de ribosomas a la vez.',
      en: 'A single cell can hold millions of ribosomes at once.',
    },
    paletteRole: 'organelles',
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
    disassembly: { direction: [0.349, 0.848, -0.399], distance: 1.25 },
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'cytoplasm',
    name: { es: 'Citoplasma', en: 'Cytoplasm' },
    func: {
      es: 'Es el medio interno donde ocurren las reacciones y se suspenden los orgánulos.',
      en: 'The internal medium where reactions happen and the organelles are suspended.',
    },
    size: { value: 20, unit: 'µm' },
    funFact: {
      es: 'Ocupa la mayor parte del volumen de la célula.',
      en: 'It fills most of the cell’s volume.',
    },
    paletteRole: 'cytoplasm',
    // The cell's inner volume: it contains every organelle, so it never separates.
    position: [0, 0, 0],
    geometry: {
      kind: 'mesh',
      meshes: [
        { cell: 'animal', node: 'citoplasma_remesh_Material.004_0', materialKey: 'cytoplasm' },
      ],
      extent: 1.818815,
    },
    disassembly: { direction: [0, 0, 0], distance: 0 },
    cells: ['animal'],
    pickable: true,
  },
  {
    id: 'membrane',
    name: { es: 'Membrana plasmática', en: 'Cell membrane' },
    func: {
      es: 'Delimita la célula y controla qué sustancias entran y salen.',
      en: 'Bounds the cell and controls which substances enter and leave.',
    },
    size: { value: 7, unit: 'nm' },
    funFact: {
      es: 'Es tan delgada que sólo se distingue con microscopio electrónico.',
      en: 'It is so thin that only an electron microscope resolves it.',
    },
    paletteRole: 'membrane',
    // The outer boundary: the cell itself, and the surface every other part is seen through.
    position: [0, 0, 0],
    geometry: {
      kind: 'mesh',
      meshes: [{ cell: 'animal', node: 'Nulo__Material_0', materialKey: 'membrane' }],
      extent: 2.002279,
    },
    disassembly: { direction: [0, 0, 0], distance: 0 },
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
