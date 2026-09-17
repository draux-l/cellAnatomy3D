/**
 * The organelle catalog data model (design D3, extended by D16).
 *
 * One record is the single source of truth for five consumers: the annotation label, the spec
 * sheet, the quiz answer check, the palette role, and the geometry build. Editing a record
 * updates all five with no other file changing (spec: Single Source Of Truth).
 *
 * **Nothing in `src/catalog/` may import three.js.** The catalog is data, and keeping it
 * three-free is what lets the app shell render before the 3D chunk loads (task 2.6, D18).
 */

/** User-facing copy. Every educational string exists in both languages (spec: Bilingual Content). */
export interface Localized {
  es: string;
  en: string;
}

/**
 * Which palette layer colours an organelle. A record references a **role**, never a colour, so
 * the palette selector and the high-contrast mode restyle every organelle without a catalog edit
 * (spec: Palette Role Reference).
 */
export type PaletteRole = 'membrane' | 'cytoplasm' | 'nucleus' | 'organelles';

export const PALETTE_ROLES = ['membrane', 'cytoplasm', 'nucleus', 'organelles'] as const;

/**
 * The declared builder vocabulary (design D3).
 *
 * These ids are the extension point names. `src/scene/builders/registry.ts` resolves them to
 * geometry, and it legitimately registers *fewer* than this list while a milestone is in flight —
 * builders land across PR 3 and PR 4. Declaring the vocabulary here and the resolution there
 * keeps the catalog three-free, and lets `integrity.ts` validate record data without depending
 * on the builder registry (task 2.3: no red-CI window before task 3.2 wires resolution).
 */
export type BuilderId =
  | 'membrane'
  | 'nucleus'
  | 'mitochondrion'
  | 'endoplasmic-reticulum'
  | 'golgi'
  | 'ribosome'
  | 'lysosome'
  | 'cell-wall'
  | 'chloroplast'
  | 'vacuole';

export const BUILDER_IDS = [
  'membrane',
  'nucleus',
  'mitochondrion',
  'endoplasmic-reticulum',
  'golgi',
  'ribosome',
  'lysosome',
  'cell-wall',
  'chloroplast',
  'vacuole',
] as const satisfies readonly BuilderId[];

/** The two cells the app renders. One record set drives both. */
export type CellId = 'animal' | 'plant';

export const CELL_IDS = ['animal', 'plant'] as const satisfies readonly CellId[];

/** Approximate biological size, with its unit. Not the scene-unit geometry scale. */
export interface SizeWithUnit {
  value: number;
  unit: 'µm' | 'nm';
}

export const SIZE_UNITS = ['µm', 'nm'] as const;

/**
 * Where an organelle travels when the disassembly control is raised (design D16).
 *
 * The vector is **required data**: an omitted vector fails the catalog integrity check. A
 * zero-length direction with `distance: 0` is the explicit "this part never separates" choice
 * (an outer envelope the author keeps in place), not an omission.
 *
 * `direction` is authored unit-length and cell-origin-relative; its radial component must be
 * outward or zero so no organelle is ever driven inward through the cell centre. The same record
 * yields the same vector in animal view, plant view and comparison mode — the records are frozen
 * and no view path can override them.
 */
export interface DisassemblyVector {
  direction: [number, number, number];
  distance: number;
}

/** How the record's geometry is built. Addresses the builder registry by id, not by path. */
export interface GeometrySpec {
  builder: BuilderId;
  /** `size`/`detail`/`count`/`seed` plus structure-specific parameters (cristaeCount, …). */
  params: Record<string, number | string | boolean>;
  /** Deterministic identity: the same record always builds the same geometry. */
  seed: string;
}

/**
 * A cell-specific deviation from a record's own data (design D3, extended for composition).
 *
 * A record set drives both cells, and most records need no deviation at all. Two composition
 * facts genuinely differ by cell, though:
 *
 * 1. **Silhouette.** The plant cell's outline is an angular rounded polygon imposed by the rigid
 *    wall, so its membrane must share that silhouette — while the animal membrane stays a sphere.
 *    That is a parameter, so it lands in `geometryParams`.
 * 2. **Placement.** The plant cell's large central vacuole occupies the volume the animal cell
 *    gives to the nucleus, so the nucleus has to sit at the periphery there. Placement is
 *    `position`.
 *
 * This is deliberately **not** a free-form escape hatch: the integrity gate accepts exactly the
 * two keys below, rejects an empty override, and rejects a cell the record is not a member of.
 * A model that accepted arbitrary keys would stop being a data model.
 */
export interface PerCellOverride {
  /** Scene-unit placement of the organelle root for this cell only. */
  position?: [number, number, number];
  /** Builder parameters merged over `geometry.params` for this cell only. */
  geometryParams?: Record<string, number | string | boolean>;
}

/** The declared deviation keys, in gate order. Anything else is an integrity failure. */
export const PER_CELL_OVERRIDE_KEYS = ['position', 'geometryParams'] as const;

/** Per-cell deviations, keyed by the cells the record belongs to. */
export type PerCellOverrides = Partial<Record<CellId, PerCellOverride>>;

/** The single source of truth for one organelle. */
export interface OrganelleRecord {
  /** Stable English identifier. Never localized (spec: Technical Identifiers Stay English). */
  id: string;
  /** Annotation label, spec sheet, and quiz answer. */
  name: Localized;
  /** Spec sheet: what the organelle does. */
  func: Localized;
  size: SizeWithUnit;
  funFact: Localized;
  paletteRole: PaletteRole;
  /**
   * Scene-unit placement of the organelle root relative to the cell origin.
   * Design D3 omits placement, but D16's integrity check is defined as
   * `dot(direction, normalize(recordPosition)) >= 0`, so a record position must exist as data.
   */
  position: [number, number, number];
  geometry: GeometrySpec;
  disassembly: DisassemblyVector;
  /**
   * Where this record deviates from its own data in one cell. Omitted when the record composes
   * identically in both cells, which is the common case.
   */
  perCell?: PerCellOverrides;
  /** Roster membership. Drives both cells from one record set. */
  cells: readonly CellId[];
  /** Participates in hover and quiz picking. */
  pickable: boolean;
}
