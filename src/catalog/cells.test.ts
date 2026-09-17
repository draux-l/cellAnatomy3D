import { describe, expect, it } from 'vitest';
import { ORGANELLE_RECORDS, getRecord, rosterFor } from './cells';
import { BUILDER_IDS, CELL_IDS, PALETTE_ROLES, SIZE_UNITS } from './types';

/**
 * Roster and data-shape assertions for the catalog (tasks 2.1, 2.2).
 *
 * These read the real catalog, so a record added without membership, translation or a declared
 * builder fails here. The injected-defect tests for the integrity gate live in `integrity.test.ts`.
 */

const SHARED_IDS = [
  'nucleus',
  'mitochondrion',
  'endoplasmic-reticulum',
  'golgi',
  'ribosome',
  'lysosome',
  'membrane',
  'cytoplasm',
];

const PLANT_ONLY_IDS = ['cell-wall', 'chloroplast', 'vacuole'];

/** Names that must never appear: out-of-scope structures and specialized cell types. */
const BANNED_TERMS = [
  'cilia',
  'cilium',
  'flagell',
  'pseudopod',
  'neuron',
  'muscle',
  'erythrocyte',
  'red-blood',
];

describe('organelle catalog rosters', () => {
  it('declares each record once under an English kebab-case id', () => {
    expect(ORGANELLE_RECORDS).toHaveLength(SHARED_IDS.length + PLANT_ONLY_IDS.length);

    const ids = ORGANELLE_RECORDS.map((record) => record.id);

    expect(new Set(ids).size).toBe(ids.length);

    for (const id of ids) {
      // Technical identifiers stay English (spec: Technical Identifiers Stay English).
      expect(id, `"${id}" must be an English kebab-case identifier`).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it('keeps the canonical animal roster', () => {
    const animalIds = rosterFor('animal').map((record) => record.id);

    for (const id of SHARED_IDS) {
      expect(animalIds, `animal roster is missing "${id}"`).toContain(id);
    }

    // The animal cell is the canonical textbook cell: no plant-only parts.
    for (const id of PLANT_ONLY_IDS) {
      expect(animalIds, `animal roster must not contain "${id}"`).not.toContain(id);
    }
  });

  it('adds the plant-only organelles to the plant roster', () => {
    const plantIds = rosterFor('plant').map((record) => record.id);

    for (const id of [...SHARED_IDS, ...PLANT_ONLY_IDS]) {
      expect(plantIds, `plant roster is missing "${id}"`).toContain(id);
    }

    expect(plantIds).toHaveLength(ORGANELLE_RECORDS.length);
  });

  it('contains no cilia, flagellum, pseudopod or specialized cell type', () => {
    for (const record of ORGANELLE_RECORDS) {
      const haystack = `${record.id} ${record.geometry.builder}`.toLowerCase();

      for (const term of BANNED_TERMS) {
        expect(haystack, `"${record.id}" is out of scope (matched "${term}")`).not.toContain(term);
      }
    }
  });

  it('labels every educational field in both languages', () => {
    for (const record of ORGANELLE_RECORDS) {
      for (const [field, value] of Object.entries({
        name: record.name,
        func: record.func,
        funFact: record.funFact,
      })) {
        expect(value.es.trim().length, `${record.id}.${field}.es is empty`).toBeGreaterThan(0);
        expect(value.en.trim().length, `${record.id}.${field}.en is empty`).toBeGreaterThan(0);
      }

      expect(SIZE_UNITS).toContain(record.size.unit);
      expect(record.size.value).toBeGreaterThan(0);
    }
  });

  it('keeps record ids unchanged regardless of the active language', () => {
    // Ids are not `Localized`, so no locale can rename a record: the Spanish and English
    // lookups resolve the same identity.
    for (const id of [...SHARED_IDS, ...PLANT_ONLY_IDS]) {
      expect(getRecord(id)?.id).toBe(id);
    }

    expect(getRecord('mitocondria')).toBeUndefined();
  });

  it('references a palette role and a declared builder on every record', () => {
    for (const record of ORGANELLE_RECORDS) {
      expect(PALETTE_ROLES).toContain(record.paletteRole);
      expect(BUILDER_IDS).toContain(record.geometry.builder);
      expect(record.geometry.seed.length).toBeGreaterThan(0);
      expect(record.cells.length).toBeGreaterThan(0);

      for (const cell of record.cells) {
        expect(CELL_IDS).toContain(cell);
      }
    }
  });

  it('gives every record an outward, finite disassembly vector', () => {
    for (const record of ORGANELLE_RECORDS) {
      const { direction, distance } = record.disassembly;

      expect(distance, `${record.id}.disassembly.distance must not be negative`).toBeGreaterThanOrEqual(0);
      expect(direction).toHaveLength(3);

      for (const component of direction) {
        expect(Number.isFinite(component), `${record.id} direction is not finite`).toBe(true);
      }

      const magnitude = Math.hypot(...direction);
      const positionMagnitude = Math.hypot(...record.position);

      if (magnitude > 1e-6) {
        // Authored directions are unit-length; the gate only requires normalizability.
        expect(magnitude, `${record.id} direction should be unit length`).toBeCloseTo(1, 2);
      }

      if (magnitude > 1e-6 && positionMagnitude > 1e-6) {
        const radial =
          direction[0] * (record.position[0] / positionMagnitude) +
          direction[1] * (record.position[1] / positionMagnitude) +
          direction[2] * (record.position[2] / positionMagnitude);

        expect(radial, `${record.id} travels inward through the cell centre`).toBeGreaterThanOrEqual(0);
      }

      if (distance > 0) {
        expect(magnitude, `${record.id} travels without a direction`).toBeGreaterThan(1e-6);
      }
    }
  });

  it('freezes the catalog so no view can rewrite a disassembly vector', () => {
    const record = ORGANELLE_RECORDS[0];

    expect(record).toBeDefined();
    expect(Object.isFrozen(ORGANELLE_RECORDS)).toBe(true);

    const target = getRecord('mitochondrion')!;
    const before = target.disassembly.distance;

    expect(Object.isFrozen(target.disassembly)).toBe(true);
    expect(() => {
      target.disassembly.distance = before + 1;
    }).toThrow(TypeError);
    expect(target.disassembly.distance).toBe(before);
  });
});
