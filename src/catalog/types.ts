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
  | 'cytoplasm'
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
  'cytoplasm',
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

/**
 * The geometry kind discriminator (design D19/D29).
 *
 * A record's geometry is a discriminated union so every consumer is forced by the type checker to
 * handle both a procedural build and a mesh reference. The union is what lets the integrity gate
 * branch, and an unknown `kind` fails the gate naming the field — there is no silent default.
 */
export type GeometryKind = 'procedural' | 'mesh';

export const GEOMETRY_KINDS = ['procedural', 'mesh'] as const satisfies readonly GeometryKind[];

/**
 * The catalog's material-key vocabulary (design D21).
 *
 * Declared here, in the three-free catalog, because a mesh reference names a material key and
 * `src/catalog/` may not import three.js. `scene/builders/primitives.ts` re-exports this union and
 * `scene/materials.ts` resolves each key to a material; the identification map in
 * `catalog/models.ts` uses these names.
 */
export type MaterialKeyName =
  | 'outerMembrane'
  | 'innerMembrane'
  | 'membrane'
  | 'cytoplasm'
  | 'nuclearEnvelope'
  | 'nucleolus'
  | 'chromatin'
  | 'nucleus'
  | 'nuclearPore'
  | 'granule'
  | 'lysosome'
  | 'er'
  | 'smoothEr'
  | 'golgi'
  | 'vesicle'
  | 'chloroplast'
  | 'grana'
  | 'cellWall'
  | 'vacuole'
  | 'cytoskeleton'
  | 'centriole'
  | 'peroxisome'
  | 'plasmodesma';

export const MATERIAL_KEY_NAMES = [
  'outerMembrane',
  'innerMembrane',
  'membrane',
  'cytoplasm',
  'nuclearEnvelope',
  'nucleolus',
  'chromatin',
  'nucleus',
  'nuclearPore',
  'granule',
  'lysosome',
  'er',
  'smoothEr',
  'golgi',
  'vesicle',
  'chloroplast',
  'grana',
  'cellWall',
  'vacuole',
  'cytoskeleton',
  'centriole',
  'peroxisome',
  'plasmodesma',
] as const satisfies readonly MaterialKeyName[];

/** `size`/`detail`/`count`/`seed` plus structure-specific parameters (cristaeCount, …). */
export type GeometryParams = Record<string, number | string | boolean>;

/**
 * One mesh inside a model, addressed through the committed identification map (design D20/D29).
 *
 * Nodes are addressed by name because names survive any tool that preserves names at all, whereas
 * numeric indices shift whenever an optimizer merges or splits nodes. The animal model derives its
 * node names from material indices (`Nulo__Material.013_0`), so several nodes legitimately share a
 * name; `occurrence` disambiguates those and is absent when the name is unique. The committed
 * manifest (`catalog/models.ts`) is what turns `{ cell, node, occurrence }` into `(record, key)`.
 */
export interface MeshAssetRef {
  /** Which model the mesh lives in. */
  cell: CellId;
  /** GLB node name — stable, human-auditable. */
  node: string;
  /** 0-based occurrence among nodes sharing `node`; absent when the name is unique. */
  occurrence?: number;
  /** The catalog material key this mesh is drawn with (design D21). */
  materialKey: MaterialKeyName;
}

/** A procedural build: the builder registry resolves `builder`, `params` and `seed` drive it. */
export interface ProceduralGeometrySpec {
  kind: 'procedural';
  builder: BuilderId;
  params: GeometryParams;
  /** Deterministic identity: the same record always builds the same geometry. */
  seed: string;
}

/**
 * The per-cell geometry deviation a fallback may carry.
 *
 * The design's union gives a mesh record a bare `fallback: BuilderId`. That is insufficient to keep
 * the fallback byte-identical: the nucleus and the cytoplasm deviate per cell (the plant nucleus is
 * smaller, the plant cytoplasm takes the wall's silhouette), and those deviations live in the
 * record's procedural parameters. A mesh record rejects `perCell.*.geometryParams` (task 11.4:
 * a baked mesh has no builder parameters to merge), so the fallback carries the deviation here
 * instead. Without it a failed mesh load would render at the animal's parameters in the plant cell
 * and move the composed-plant baselines.
 */
export interface FallbackPerCell {
  geometryParams?: GeometryParams;
}

/** What a mesh record builds when its model cannot be loaded (design D27). */
export interface ProceduralFallback {
  builder: BuilderId;
  params: GeometryParams;
  seed: string;
  /** Fallback-only per-cell parameter deviations, keyed by the cells the record belongs to. */
  perCell?: Partial<Record<CellId, FallbackPerCell>>;
}

/**
 * A mesh build: one or more meshes from a committed model.
 *
 * The mitochondrion is one record referencing two meshes (outer membranes + cristae), so
 * `meshes` is a list, not a single reference.
 *
 * **`fallback` is optional, and every record ships without one.** The 2026-09 rebuild removed the
 * procedural organelle builders outright, so a record that declared a fallback would be pointing
 * at geometry that no longer exists — data that reads as a safety net and is in fact a lie. A
 * missing model therefore renders nothing, and the integrity gate says so rather than pretending.
 * The key stays in the model so a future record may declare one; when present it is validated.
 */
export interface MeshGeometrySpec {
  kind: 'mesh';
  /** ≥1 reference. An empty list fails the integrity gate naming record + field. */
  meshes: readonly MeshAssetRef[];
  /**
   * Scene-unit **half-diagonal of the part's own bounds**, measured from the model.
   *
   * This is the record's extent as the viewer needs it: the isolate framing backs the camera off by
   * a multiple of it, and nothing else can supply the number once the procedural builders (and
   * their `size` parameter) are gone. It is committed data, not measured at load, so the `?fixture=`
   * route can frame an organelle in the shell before the 3D chunk exists.
   */
  extent: number;
  /** An optional declarative fallback. Absent on every shipped record; see the note above. */
  fallback?: ProceduralFallback;
}

/** How the record's geometry is built. Addresses the builder registry by id, not by path. */
export type GeometrySpec = ProceduralGeometrySpec | MeshGeometrySpec;

/** Type guard: true when the spec is a procedural build. */
export function isProceduralGeometry(spec: GeometrySpec): spec is ProceduralGeometrySpec {
  return spec.kind === 'procedural';
}

/** Type guard: true when the spec is a mesh build. */
export function isMeshGeometry(spec: GeometrySpec): spec is MeshGeometrySpec {
  return spec.kind === 'mesh';
}

/**
 * The committed model manifest vocabulary (design D20/D23).
 *
 * `parse`-time metadata for one cell's GLB: the path that ships, the sha256 that fixes its
 * identity, and the cell-frame normalization that maps the model's own units into scene units.
 * Nothing here imports three.js — the loader (`scene/models/useCellModel.ts`) consumes it.
 */
export interface CellModelFrame {
  /** Served path, e.g. `/models/animal-cell.glb`. */
  file: string;
  /** Lowercase hex sha256 of the bytes that actually ship. */
  sha256: string;
  /** Scene-unit scale applied to the raw model. */
  scale: number;
  /** Euler XYZ radians that fix the model's up-axis. */
  rotation: [number, number, number];
  /** Source-unit centre subtracted before scaling. */
  center: [number, number, number];
}

/**
 * What happens to one model mesh.
 *
 * - `map` — has a catalog record: pickable, annotated, drawn with the model's own material.
 * - `unmapped` — a real, identified structure with no canonical roster entry: drawn as part of the
 *   model root, unpickable and unannotated. No label is invented for it (design D26).
 * - `omit` — hidden.
 *
 * **No shipped mesh is `omit`.** Every mesh in the animal model is part of the model, so hiding one
 * would be losing the thing the model is. The policy value survives because the vocabulary is data.
 */
export type MeshPolicy = 'map' | 'unmapped' | 'omit';

export const MESH_POLICIES = ['map', 'unmapped', 'omit'] as const satisfies readonly MeshPolicy[];

/** One row of the identification map: a model node turned into a record reference or a policy. */
export interface ManifestMesh {
  /** GLB node name, as authored — `Nulo__Material.013_0`. */
  node: string;
  /** 0-based occurrence among nodes sharing `node`; absent when the name is unique. */
  occurrence?: number;
  policy: MeshPolicy;
  /** The catalog record this mesh belongs to when `policy === 'map'`; otherwise null. */
  recordId: string | null;
  /**
   * The **palette-override** material key for this mesh, or null.
   *
   * The default render keeps the model's own material, so this key is a hook, not a description: it
   * names the catalog material a future palette override would substitute. `null` means "there is
   * no catalog key for this surface" — which is what the unmapped meshes carry, because no role is
   * invented for a structure the roster does not name.
   */
  materialKey: MaterialKeyName | null;
}

/** One cell's committed model: its frame plus the identification map over its meshes. */
export interface CellModelManifest {
  cell: CellId;
  frame: CellModelFrame;
  meshes: readonly ManifestMesh[];
}

/**
 * The cells that ship a model, keyed by cell id.
 *
 * Partial on purpose: only the animal cell has a committed `.glb` today, and inventing a plant
 * entry (with a file and a sha256 for bytes that do not exist) would be fabricated data. A missing
 * key means "this cell has no model", which is exactly the fact.
 */
export type ModelManifest = Readonly<Partial<Record<CellId, CellModelManifest>>>;

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
  /** Annotation label, spec sheet, and quiz answer. Required — every record is named. */
  name: Localized;
  /**
   * Spec sheet: what the organelle does.
   *
   * **Optional while the educational copy is authored in a separate pass.** The 2026-09 rebuild
   * loaded the model's parts as name-only records first; the maintainer supplies the descriptions,
   * sizes and fun facts afterwards. When a field is absent the sheet omits its row entirely rather
   * than rendering a blank or a placeholder that would read as real content. The integrity gate
   * validates each of these fields only when it is present.
   */
  func?: Localized;
  size?: SizeWithUnit;
  funFact?: Localized;
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
