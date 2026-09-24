import { ORGANELLE_RECORDS } from './cells';
import {
  BUILDER_IDS,
  CELL_IDS,
  GEOMETRY_KINDS,
  MATERIAL_KEY_NAMES,
  PALETTE_ROLES,
  PER_CELL_OVERRIDE_KEYS,
  SIZE_UNITS,
  type CellId,
  type ManifestMesh,
  type ModelManifest,
  type OrganelleRecord,
} from './types';

/**
 * Catalog integrity gate (tasks 2.3, 2.5 / design D3, D16).
 *
 * This module is what makes the catalog a *source of truth* rather than a convention: it fails
 * the pipeline, naming the record id and the offending field, when a record is incomplete, when
 * a translation is missing, when a colour literal sneaks in, when the roster leaves the
 * canonical cell, or when a disassembly vector is absent, inward, non-normalizable or negative.
 *
 * Three deliberate properties:
 *
 * 1. **It is pure.** No three.js, no filesystem, no clock — so it runs as a fast unit test in
 *    Node and (later) as a build step without dragging the 3D chunk into the shell graph.
 * 2. **It validates the declared builder *vocabulary* by default, and registry resolution only
 *    when the registry is injected.** `src/catalog/` must stay three-free, and a 3D-side registry
 *    imports every builder, so the gate cannot import one.
 *    It takes the registered id list as data instead (task 3.2): the callers that own both sides
 *    — the integrity test and, later, the build step — pass it in.
 * 3. **It validates `unknown` input**, so tests can inject defects by spreading a real record
 *    without fighting the type system — the gate has to survive data it did not author.
 */

export interface IntegrityIssue {
  /** The record the issue belongs to, or a catalog-level marker. */
  recordId: string;
  /** Dotted path to the offending field, e.g. `funFact.es` or `disassembly.direction`. */
  field: string;
  message: string;
}

/**
 * Declared builders the catalog already references but that no registry entry serves *yet*.
 *
 * M1b left the plant three here so the catalog could reference builders that had not landed. M1c
 * built them, so the list is now **empty**: every declared builder resolves. It stays in the code
 * on purpose — a **shrinking allowlist, not a permanent hole** — and a test asserts it is exactly
 * the declared-but-unregistered gap, which is what forced the registration and the emptying to
 * happen in the same slice.
 */
export const PENDING_BUILDER_IDS: readonly string[] = [];

export interface BuilderResolutionOptions {
  /**
   * The builder ids a 3D-side registry resolves today. Omit it to validate the declared vocabulary
   * only. Defaults to none registered: the catalog is empty and no registry ships, so a caller that
   * wants resolution checks must inject the id list.
   */
  registeredBuilderIds?: readonly string[];
  /** Defaults to `PENDING_BUILDER_IDS`. */
  pendingBuilderIds?: readonly string[];
  /**
   * The committed identification map (design D20/D29). Injected **as data**, the same pattern as
   * `registeredBuilderIds`, so `src/catalog/` stays three-free and a test can inject a synthetic
   * manifest. There is no committed manifest while the catalog is empty, so a caller that wants the
   * node-level checks must inject one; without it the structural mesh rules still run.
   */
  manifest?: ModelManifest;
}

/** `‖direction‖` below this is a zero vector: "never separates" only when `distance` is also 0. */
export const DIRECTION_EPSILON = 1e-6;

/**
 * The canonical animal-cell roster (spec: Canonical Animal Cell Roster). Declared here rather
 * than derived from the catalog on purpose: if a record is deleted from `cells.ts`, the gate has
 * to be able to notice.
 */
export const CANONICAL_ANIMAL_IDS = [
  'nucleus',
  'mitochondrion',
  'endoplasmic-reticulum',
  'golgi',
  'ribosome',
  'lysosome',
  'membrane',
] as const;

/** Plant-only additions (spec: Plant Cell Roster). */
export const PLANT_ONLY_IDS = ['cell-wall', 'chloroplast', 'vacuole'] as const;

/** Out-of-scope structures and specialized cell types that must never appear. */
export const BANNED_ROSTER_TERMS = [
  'cilia',
  'cilium',
  'flagell',
  'pseudopod',
  'lamellipod',
  'neuron',
  'myocyte',
  'erythrocyte',
] as const;

/** Fields that carry user-facing copy and therefore must exist in both languages. */
export const LOCALIZED_FIELDS = ['name', 'func', 'funFact'] as const;

const COLOUR_KEY_PATTERN = /colou?r/i;
const COLOUR_VALUE_PATTERNS = [
  /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
  /^(?:rgb|hsl)a?\(/i,
  /^(?:red|blue|green|white|black|orange|purple|pink|yellow|grey|gray)$/i,
];
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isVector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
}

function magnitude(vector: readonly [number, number, number]): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function labelOf(record: unknown, index: number): string {
  if (isPlainObject(record) && isNonEmptyString(record.id)) {
    return record.id;
  }

  return `#${index}`;
}

/** Collects every literal colour in a record, as dotted field paths. */
function findColourLiterals(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findColourLiterals(item, `${path}[${index}]`));
  }

  if (!isPlainObject(value)) {
    return [];
  }

  const found: string[] = [];

  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;

    if (COLOUR_KEY_PATTERN.test(key)) {
      found.push(childPath);
      continue;
    }

    if (typeof child === 'string' && COLOUR_VALUE_PATTERNS.some((pattern) => pattern.test(child))) {
      found.push(childPath);
      continue;
    }

    found.push(...findColourLiterals(child, childPath));
  }

  return found;
}

type AddIssue = (field: string, message: string) => void;

/**
 * The procedural half of the union (task 2.3, unchanged): declared builder id, params object, seed.
 *
 * Declared vocabulary only. Registry resolution is task 3.2 and must not gate this PR.
 */
function validateProceduralGeometry(
  geometry: Record<string, unknown>,
  add: AddIssue,
): void {
  if (!isNonEmptyString(geometry.builder) || !(BUILDER_IDS as readonly string[]).includes(geometry.builder)) {
    add(
      'geometry.builder',
      `is ${String(geometry.builder)}, which is not a declared builder id (declared: ${BUILDER_IDS.join(', ')})`,
    );
  }

  if (!isPlainObject(geometry.params)) {
    add('geometry.params', 'is required and must be an object');
  }

  if (!isNonEmptyString(geometry.seed)) {
    add('geometry.seed', 'is required — deterministic identity is not optional');
  }
}

/**
 * The manifest row for a model node, addressed by name and occurrence.
 *
 * Node names survive any tool that preserves names, whereas numeric indices shift when an optimizer
 * merges or splits nodes — so the lookup is by `(cell, node, occurrence)`. Kept here as a pure data
 * query so `src/catalog/` needs no import of the (now removed) manifest module.
 */
function manifestRow(
  manifest: ModelManifest,
  cell: CellId,
  node: string,
  occurrence: number,
): ManifestMesh | undefined {
  const row = manifest[cell]?.meshes.find(
    (candidate) => candidate.node === node && (candidate.occurrence ?? 0) === occurrence,
  );

  return row;
}

/**
 * The mesh half of the union (tasks 11.4, 12.3).
 *
 * Every failure names the record id and the offending `geometry.meshes[...]` field. The manifest is
 * injected as data so the catalog stays three-free, and a mesh reference that the manifest does not
 * know — or knows as a *different* record — is a build failure, never a silent skip.
 */
function validateMeshGeometry(
  geometry: Record<string, unknown>,
  record: Record<string, unknown>,
  options: BuilderResolutionOptions,
  add: AddIssue,
): void {
  const manifest = options.manifest;
  const meshes = geometry.meshes;

  if (!Array.isArray(meshes) || meshes.length === 0) {
    add('geometry.meshes', 'is required and must reference at least one manifest mesh (design D29)');
  } else {
    meshes.forEach((ref, index) => {
      const path = `geometry.meshes[${index}]`;

      if (!isPlainObject(ref)) {
        add(path, 'must be an object with cell, node and materialKey');
        return;
      }

      if (!isNonEmptyString(ref.cell) || !(CELL_IDS as readonly string[]).includes(ref.cell)) {
        add(`${path}.cell`, `is ${String(ref.cell)}, which is not one of ${CELL_IDS.join(', ')}`);
        return;
      }

      if (!isNonEmptyString(ref.node)) {
        add(`${path}.node`, 'is required and must be a manifest node name');
        return;
      }

      if (
        !isNonEmptyString(ref.materialKey) ||
        !(MATERIAL_KEY_NAMES as readonly string[]).includes(ref.materialKey)
      ) {
        add(
          `${path}.materialKey`,
          `is ${String(ref.materialKey)}, which is not a declared material key (declared: ${MATERIAL_KEY_NAMES.join(', ')})`,
        );
        return;
      }

      const occurrence = isFiniteNumber(ref.occurrence) ? ref.occurrence : 0;

      if (manifest === undefined) {
        // No identification map was injected. The reference's shape is valid, but its node cannot be
        // resolved; the caller that owns the manifest opts into the node-level checks.
        return;
      }

      const row = manifestRow(manifest, ref.cell as CellId, ref.node, occurrence);

      if (!row) {
        add(
          `${path}.node`,
          `is "${ref.node}"${occurrence > 0 ? ` (occurrence ${occurrence})` : ''}, which is not in the ${ref.cell} model manifest`,
        );
        return;
      }

      if (row.policy !== 'map') {
        // A record may only own a mesh the manifest maps to it; an `omit`/`unmapped` row that a
        // record claims is a mapping mistake, not a rendering choice.
        add(
          `${path}.node`,
          `is "${ref.node}", which the manifest marks "${row.policy}" and does not map to a record`,
        );
        return;
      }

      if (row.recordId !== record.id) {
        add(
          `${path}.node`,
          `is mapped to record "${String(row.recordId)}" in the manifest, but this record is "${String(record.id)}"`,
        );
      }

      if (row.materialKey !== ref.materialKey) {
        add(
          `${path}.materialKey`,
          `is "${ref.materialKey}", which disagrees with the manifest's "${String(row.materialKey)}" for this node`,
        );
      }
    });
  }

  const fallback = geometry.fallback;

  if (!isPlainObject(fallback)) {
    add('geometry.fallback', 'is required — every mesh record declares its procedural fallback (D27)');
  } else {
    if (
      !isNonEmptyString(fallback.builder) ||
      !(BUILDER_IDS as readonly string[]).includes(fallback.builder)
    ) {
      add(
        'geometry.fallback.builder',
        `is ${String(fallback.builder)}, which is not a declared builder id (declared: ${BUILDER_IDS.join(', ')})`,
      );
    }

    if (!isPlainObject(fallback.params)) {
      add('geometry.fallback.params', 'is required and must be an object');
    }

    if (!isNonEmptyString(fallback.seed)) {
      add('geometry.fallback.seed', 'is required — the fallback reproduces the procedural build exactly');
    }
  }
}

/** Validates one record. Every issue names the record and the field it is about. */
export function validateRecord(
  record: unknown,
  index = 0,
  options: BuilderResolutionOptions = {},
): IntegrityIssue[] {
  const recordId = labelOf(record, index);
  const issues: IntegrityIssue[] = [];
  const add = (field: string, message: string): void => {
    issues.push({ recordId, field, message });
  };

  if (!isPlainObject(record)) {
    add('record', 'is not an object');
    return issues;
  }

  if (!isNonEmptyString(record.id) || !ID_PATTERN.test(record.id)) {
    add('id', 'is required and must be an English kebab-case identifier');
  }

  for (const field of LOCALIZED_FIELDS) {
    const localized = record[field];

    if (!isPlainObject(localized)) {
      add(field, 'is required and must carry both languages');
      continue;
    }

    for (const locale of ['es', 'en'] as const) {
      if (!isNonEmptyString(localized[locale])) {
        add(`${field}.${locale}`, `is empty — every educational string needs a ${locale} value`);
      }
    }
  }

  const size = record.size;

  if (!isPlainObject(size)) {
    add('size', 'is required and needs a value and a unit');
  } else {
    if (!isFiniteNumber(size.value) || size.value <= 0) {
      add('size.value', 'is required and must be a positive number');
    }

    if (!isNonEmptyString(size.unit) || !(SIZE_UNITS as readonly string[]).includes(size.unit)) {
      add('size.unit', `is ${String(size.unit)}, which is not one of ${SIZE_UNITS.join(', ')}`);
    }
  }

  if (!isNonEmptyString(record.paletteRole) || !(PALETTE_ROLES as readonly string[]).includes(record.paletteRole)) {
    add(
      'paletteRole',
      `is ${String(record.paletteRole)}, which is not one of ${PALETTE_ROLES.join(', ')}`,
    );
  }

  const geometry = record.geometry;

  if (!isPlainObject(geometry)) {
    add('geometry', 'is required and needs a kind plus its source');
  } else if (!isNonEmptyString(geometry.kind) || !(GEOMETRY_KINDS as readonly string[]).includes(geometry.kind)) {
    // The exhaustiveness half of the union: a record with no `kind`, or an unknown one, fails here
    // naming the field rather than silently defaulting to procedural.
    add(
      'geometry.kind',
      `is ${String(geometry.kind)}, which is not one of ${GEOMETRY_KINDS.join(', ')}`,
    );
  } else if (geometry.kind === 'procedural') {
    validateProceduralGeometry(geometry, add);
  } else {
    validateMeshGeometry(geometry, record, options, add);
  }

  if (!Array.isArray(record.cells) || record.cells.length === 0) {
    add('cells', 'is required and must name at least one cell');
  } else {
    for (const cell of record.cells) {
      if (!(CELL_IDS as readonly unknown[]).includes(cell)) {
        add('cells', `contains an unknown cell "${String(cell)}"`);
      }
    }
  }

  if (typeof record.pickable !== 'boolean') {
    add('pickable', 'is required and must be a boolean');
  }

  if (!isVector3(record.position)) {
    add('position', 'is required and must be three finite scene-unit numbers');
  }

  const perCell = record.perCell;

  if (perCell !== undefined) {
    if (!isPlainObject(perCell)) {
      add('perCell', 'must be an object keyed by cell id when present');
    } else {
      const declaredCells = Array.isArray(record.cells) ? record.cells : [];

      if (Object.keys(perCell).length === 0) {
        // "No silent default": an empty deviation block is an authoring mistake, not a no-op.
        add('perCell', 'is present but empty — remove it or declare what deviates');
      }

      for (const [cell, override] of Object.entries(perCell)) {
        const path = `perCell.${cell}`;

        if (!(CELL_IDS as readonly string[]).includes(cell)) {
          add(path, `is not one of the known cells (${CELL_IDS.join(', ')})`);
          continue;
        }

        if (!declaredCells.includes(cell)) {
          add(path, `overrides a cell this record is not part of (cells: ${declaredCells.join(', ') || 'none'})`);
        }

        if (!isPlainObject(override)) {
          add(path, 'must be an object with at least one override');
          continue;
        }

        if (Object.keys(override).length === 0) {
          add(path, 'is an empty override — it must change position, geometryParams, or both');
        }

        for (const key of Object.keys(override)) {
          if (!(PER_CELL_OVERRIDE_KEYS as readonly string[]).includes(key)) {
            add(
              `${path}.${key}`,
              `is not an override this model supports (${PER_CELL_OVERRIDE_KEYS.join(', ')})`,
            );
          }
        }

        if (override.position !== undefined && !isVector3(override.position)) {
          add(`${path}.position`, 'must be three finite scene-unit numbers');
        }

        if (override.geometryParams !== undefined) {
          if (
            !isPlainObject(override.geometryParams) ||
            Object.keys(override.geometryParams).length === 0
          ) {
            add(`${path}.geometryParams`, 'must be a non-empty parameter object');
          }

          // A mesh record has no builder parameters of its own to merge, so a per-cell shape
          // deviation there is an authoring mistake. The fallback's deviation lives on
          // `geometry.fallback.perCell` instead (see `ProceduralFallback`).
          const geometry = record.geometry;

          if (isPlainObject(geometry) && geometry.kind === 'mesh') {
            add(
              `${path}.geometryParams`,
              'is not valid on a mesh record — a baked mesh has no parameters to merge; move it to geometry.fallback.perCell',
            );
          }
        }
      }
    }
  }

  const disassembly = record.disassembly;

  if (!isPlainObject(disassembly)) {
    // D16: the field is required. A part that never separates declares a zero vector instead,
    // which is a deliberate authoring choice rather than an omission.
    add('disassembly', 'is required — declare { direction, distance }, use [0,0,0] with 0 to keep a part in place');
  } else {
    const direction = disassembly.direction;
    const distance = disassembly.distance;
    const directionOk = isVector3(direction);

    if (!directionOk) {
      add('disassembly.direction', 'is required and must be three finite numbers');
    }

    if (!isFiniteNumber(distance) || distance < 0) {
      add('disassembly.distance', 'is required and must be zero or a positive number of scene units');
    }

    if (directionOk) {
      const length = magnitude(direction);

      if (isFiniteNumber(distance) && distance > 0 && length <= DIRECTION_EPSILON) {
        add(
          'disassembly.direction',
          `is not normalizable (‖direction‖ must exceed ${DIRECTION_EPSILON}) while distance is ${distance}`,
        );
      }

      if (length > DIRECTION_EPSILON && isVector3(record.position)) {
        const positionLength = magnitude(record.position);

        // A record at the cell origin has no radial basis: every direction's radial component is
        // zero there, which the spec allows.
        if (positionLength > DIRECTION_EPSILON) {
          const radial =
            (direction[0] * record.position[0] +
              direction[1] * record.position[1] +
              direction[2] * record.position[2]) /
            (length * positionLength);

          if (radial < -DIRECTION_EPSILON) {
            add(
              'disassembly.direction',
              `points toward the cell centre (radial component ${radial.toFixed(3)}); outward or zero is required`,
            );
          }
        }
      }
    }
  }

  /*
   * A per-cell placement must satisfy the same outward rule the record's own position does.
   *
   * The disassembly vector is authored per record, and the plant nucleus sits somewhere the animal
   * nucleus does not — so checking only `record.position` would let a cell override drive an
   * organelle inward through the centre while the gate reported a pass. The rule is the same one
   * applied above, evaluated against whichever placement this cell actually uses.
   */
  if (
    isPlainObject(record.perCell) &&
    isPlainObject(record.disassembly) &&
    isVector3(record.disassembly.direction)
  ) {
    const direction = record.disassembly.direction;
    const length = magnitude(direction);

    if (length > DIRECTION_EPSILON) {
      for (const [cell, override] of Object.entries(record.perCell)) {
        if (!isPlainObject(override) || !isVector3(override.position)) {
          continue;
        }

        const position = override.position;
        const positionLength = magnitude(position);

        if (positionLength <= DIRECTION_EPSILON) {
          continue;
        }

        const radial =
          (direction[0] * position[0] + direction[1] * position[1] + direction[2] * position[2]) /
          (length * positionLength);

        if (radial < -DIRECTION_EPSILON) {
          add(
            `perCell.${cell}.position`,
            `puts the organelle where its disassembly direction points toward the cell centre ` +
              `(radial component ${radial.toFixed(3)}); outward or zero is required`,
          );
        }
      }
    }
  }

  for (const colourPath of findColourLiterals(record)) {
    add(colourPath, 'is a literal colour — records reference a palette role, never a colour');
  }

  return issues;
}

/**
 * Validates that the catalog's builder references resolve (task 3.2, design D3: the gate "fails
 * the build on a builder id with no registry entry").
 *
 * Two directions, and both matter:
 *
 * - **Registry → vocabulary.** Every registered builder id must be a declared `BuilderId`. A
 *   typo'd registration the catalog can never reference is otherwise invisible until a viewer
 *   throws at runtime.
 * - **Record → resolution.** Every builder a record *references* must resolve, or be on the
 *   explicit pending list. This is the check that would have made the M1a/M1b sequencing a
 *   build failure instead of a comment.
 *
 * Pure: the registry arrives as data. See `BuilderResolutionOptions`.
 */
export function validateBuilderResolution(
  records: readonly unknown[],
  options: BuilderResolutionOptions = {},
): IntegrityIssue[] {
  const registeredIds = options.registeredBuilderIds;

  if (registeredIds === undefined) {
    // Resolution was not requested: this run validates the declared vocabulary only.
    return [];
  }

  const registered = new Set(registeredIds);
  const pending = new Set(options.pendingBuilderIds ?? PENDING_BUILDER_IDS);
  const declared = new Set<string>(BUILDER_IDS);
  const issues: IntegrityIssue[] = [];

  for (const id of registered) {
    if (!declared.has(id)) {
      issues.push({
        recordId: '<registry>',
        field: 'geometry.builder',
        message: `registers "${id}", which is not a declared builder id (declared: ${BUILDER_IDS.join(', ')})`,
      });
    }
  }

  records.forEach((record, index) => {
    if (!isPlainObject(record) || !isPlainObject(record.geometry)) {
      return;
    }

    const geometry = record.geometry;
    // A procedural record resolves `geometry.builder`; a mesh record resolves its fallback, which
    // is what the viewer builds when the model cannot load. Either way, an unregistered builder is
    // a runtime throw, so both are gated here.
    const meshRecord = geometry.kind === 'mesh';
    const builder = meshRecord
      ? isPlainObject(geometry.fallback)
        ? geometry.fallback.builder
        : undefined
      : geometry.builder;

    if (!isNonEmptyString(builder) || registered.has(builder) || pending.has(builder)) {
      return;
    }

    issues.push({
      recordId: labelOf(record, index),
      field: meshRecord ? 'geometry.fallback.builder' : 'geometry.builder',
      message: `is "${builder}", which has no registry entry and is not a pending builder — the viewer would throw while building this record`,
    });
  });

  return issues;
}

/**
 * The per-cell material-key collision rule (task 11.4, design D29).
 *
 * Two mesh records in one cell may not draw with the same material key: they would then be
 * indistinguishable under hover emphasis. **Two keys inside one record are the intended case** —
 * the mitochondrion's cristae and outer membranes are separate keys on one record — so the check
 * groups by record and only flags a key two *different* records claim.
 */
export function validateMaterialKeyOwnership(records: readonly unknown[]): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const ownerByCellAndKey = new Map<string, string>();

  for (const record of records) {
    if (!isPlainObject(record) || !isNonEmptyString(record.id) || !isPlainObject(record.geometry)) {
      continue;
    }

    const geometry = record.geometry;

    if (geometry.kind !== 'mesh' || !Array.isArray(geometry.meshes)) {
      continue;
    }

    for (const ref of geometry.meshes) {
      if (!isPlainObject(ref) || !isNonEmptyString(ref.cell) || !isNonEmptyString(ref.materialKey)) {
        continue;
      }

      const key = `${ref.cell}:${ref.materialKey}`;
      const owner = ownerByCellAndKey.get(key);

      if (owner === undefined) {
        ownerByCellAndKey.set(key, record.id);
        continue;
      }

      if (owner !== record.id) {
        issues.push({
          recordId: record.id,
          field: 'geometry.meshes.materialKey',
          message: `is "${ref.materialKey}", already owned by record "${owner}" in the ${ref.cell} cell — two records may not share a material key`,
        });
      }
    }
  }

  return issues;
}

/**
 * Validates a whole catalog: every record, plus the catalog-level rules that no single record
 * can answer for (duplicate ids, roster canonicality, out-of-scope structures, and — when the
 * registry ids are supplied — builder resolution).
 */
export function validateCatalog(
  records: readonly unknown[],
  options: BuilderResolutionOptions = {},
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const seen = new Set<string>();

  if (records.length === 0) {
    issues.push({ recordId: '<catalog>', field: 'records', message: 'the catalog is empty' });
  }

  records.forEach((record, index) => {
    issues.push(...validateRecord(record, index, options));

    if (isPlainObject(record) && isNonEmptyString(record.id)) {
      if (seen.has(record.id)) {
        issues.push({ recordId: record.id, field: 'id', message: 'is declared more than once' });
      }

      seen.add(record.id);
    }
  });

  const rosterIds = (cell: string): string[] =>
    records
      .filter(
        (record) =>
          isPlainObject(record) &&
          Array.isArray(record.cells) &&
          (record.cells as readonly unknown[]).includes(cell) &&
          isNonEmptyString(record.id),
      )
      .map((record) => (record as { id: string }).id);

  const animalIds = rosterIds('animal');
  const plantIds = rosterIds('plant');

  for (const id of CANONICAL_ANIMAL_IDS) {
    if (!animalIds.includes(id)) {
      issues.push({
        recordId: '<catalog>',
        field: 'roster.animal',
        message: `is missing the canonical organelle "${id}"`,
      });
    }

    if (!plantIds.includes(id)) {
      issues.push({
        recordId: '<catalog>',
        field: 'roster.plant',
        message: `is missing the shared organelle "${id}"`,
      });
    }
  }

  for (const id of PLANT_ONLY_IDS) {
    if (!plantIds.includes(id)) {
      issues.push({
        recordId: '<catalog>',
        field: 'roster.plant',
        message: `is missing the plant-only organelle "${id}"`,
      });
    }

    if (animalIds.includes(id)) {
      issues.push({
        recordId: id,
        field: 'cells',
        message: 'is a plant-only organelle and must not be part of the animal roster',
      });
    }
  }

  for (const record of records) {
    if (!isPlainObject(record) || !isNonEmptyString(record.id)) {
      continue;
    }

    const geometry = isPlainObject(record.geometry) ? record.geometry : undefined;
    const builder = isPlainObject(geometry) ? geometry.builder : undefined;
    const fallbackBuilder =
      isPlainObject(geometry) && isPlainObject(geometry.fallback) ? geometry.fallback.builder : undefined;
    const haystack =
      `${record.id} ${isNonEmptyString(builder) ? builder : ''} ${isNonEmptyString(fallbackBuilder) ? fallbackBuilder : ''}`.toLowerCase();

    for (const term of BANNED_ROSTER_TERMS) {
      if (haystack.includes(term)) {
        issues.push({
          recordId: record.id,
          field: 'id',
          message: `is out of scope for the canonical cells (matched "${term}")`,
        });
      }
    }
  }

  issues.push(...validateBuilderResolution(records, options));
  issues.push(...validateMaterialKeyOwnership(records));

  return issues;
}

/** Renders issues as one indented line each, for a thrown error or a test failure message. */
export function formatIssues(issues: readonly IntegrityIssue[]): string {
  return issues.map((issue) => `- [${issue.recordId}] ${issue.field}: ${issue.message}`).join('\n');
}

/**
 * The gate itself. Throws with every offender named, so a broken catalog cannot reach a build.
 *
 * Pass `registeredBuilderIds` to include builder resolution; omit it to validate record data and
 * the declared vocabulary only.
 */
export function assertCatalogIntegrity(
  records: readonly unknown[] = ORGANELLE_RECORDS,
  options: BuilderResolutionOptions = {},
): void {
  const issues = validateCatalog(records, options);

  if (issues.length > 0) {
    throw new Error(
      `Catalog integrity failed with ${issues.length} issue(s):\n${formatIssues(issues)}`,
    );
  }
}

/** True when a record passes every per-record rule. Convenience for consumers and tests. */
export function isValidRecord(record: OrganelleRecord | unknown): boolean {
  return validateRecord(record).length === 0;
}
