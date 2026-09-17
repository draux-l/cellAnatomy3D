import { ORGANELLE_RECORDS } from './cells';
import {
  BUILDER_IDS,
  CELL_IDS,
  PALETTE_ROLES,
  SIZE_UNITS,
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
 *    when the registry is injected.** `src/catalog/` must stay three-free, and
 *    `scene/builders/registry.ts` imports every builder, so the gate cannot import the registry.
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
 * buys them; the chloroplast has registered (task 3.9), so the list is down to the two builders
 * tasks 3.10 owes. It stays in the code on purpose — a **shrinking allowlist, not a permanent
 * hole** — and a test asserts it is exactly the declared-but-unregistered gap, which is what
 * forces each registration to shrink it in the same change.
 */
export const PENDING_BUILDER_IDS = ['cell-wall', 'vacuole'] as const;

export interface BuilderResolutionOptions {
  /**
   * The builder ids `src/scene/builders/registry.ts` resolves today. Omit it to validate the
   * declared vocabulary only — the M1a sequencing rule, kept as the default so no caller can
   * accidentally start failing on a partial registry.
   */
  registeredBuilderIds?: readonly string[];
  /** Defaults to `PENDING_BUILDER_IDS`. */
  pendingBuilderIds?: readonly string[];
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

/** Validates one record. Every issue names the record and the field it is about. */
export function validateRecord(record: unknown, index = 0): IntegrityIssue[] {
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
    add('geometry', 'is required and needs a builder, params and a seed');
  } else {
    // Declared vocabulary only. Registry resolution is task 3.2 and must not gate this PR.
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

    const builder = record.geometry.builder;

    if (!isNonEmptyString(builder) || registered.has(builder) || pending.has(builder)) {
      return;
    }

    issues.push({
      recordId: labelOf(record, index),
      field: 'geometry.builder',
      message: `is "${builder}", which has no registry entry and is not a pending builder — the viewer would throw while building this record`,
    });
  });

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
    issues.push(...validateRecord(record, index));

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

    const builder = isPlainObject(record.geometry) ? record.geometry.builder : undefined;
    const haystack = `${record.id} ${isNonEmptyString(builder) ? builder : ''}`.toLowerCase();

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
