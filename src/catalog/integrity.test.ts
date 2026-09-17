import { describe, expect, it } from 'vitest';
import { REGISTERED_BUILDER_IDS } from '../scene/builders/registry';
import { ORGANELLE_RECORDS, getRecord } from './cells';
import {
  PENDING_BUILDER_IDS,
  assertCatalogIntegrity,
  formatIssues,
  isValidRecord,
  validateBuilderResolution,
  validateCatalog,
  validateRecord,
} from './integrity';
import { BUILDER_IDS } from './types';

/**
 * Gate behaviour for the catalog (tasks 2.3, 2.5, 3.2).
 *
 * The committed catalog must pass; every other test injects exactly one defect into a copy of a
 * real record and asserts that the gate fails **naming the record and the field** — a gate that
 * fails without saying who is at fault is not usable in a build log.
 *
 * Builder resolution (3.2) is wired in by injecting the registry's id list, because
 * `src/catalog/` must stay three-free and `scene/builders/registry.ts` imports every builder.
 */

const BASE = getRecord('mitochondrion')!;

const RESOLUTION = { registeredBuilderIds: REGISTERED_BUILDER_IDS } as const;

function withDefect(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...BASE, ...overrides };
}

describe('catalog integrity — the committed catalog', () => {
  it('passes with no issues', () => {
    expect(validateCatalog(ORGANELLE_RECORDS)).toEqual([]);
    expect(() => assertCatalogIntegrity()).not.toThrow();
  });

  it('passes with builder resolution wired in', () => {
    expect(validateCatalog(ORGANELLE_RECORDS, RESOLUTION)).toEqual([]);
    expect(() => assertCatalogIntegrity(ORGANELLE_RECORDS, RESOLUTION)).not.toThrow();
  });

  it('accepts the explicit "never separates" zero vector', () => {
    const membrane = getRecord('membrane')!;
    const wall = getRecord('cell-wall')!;

    expect(membrane.disassembly).toEqual({ direction: [0, 0, 0], distance: 0 });
    expect(wall.disassembly).toEqual({ direction: [0, 0, 0], distance: 0 });
    expect(isValidRecord(membrane)).toBe(true);
    expect(isValidRecord(wall)).toBe(true);
  });

  it('validates the declared builder vocabulary without requiring registry resolution', () => {
    // Task 2.3's sequencing rule: resolution is opt-in, so a partial registry can never fail a
    // caller that did not ask about it. Task 3.2 owns the opt-in check below.
    expect(REGISTERED_BUILDER_IDS.length).toBeLessThan(BUILDER_IDS.length);

    const declaredButUnbuilt = getRecord('chloroplast')!;

    expect(REGISTERED_BUILDER_IDS).not.toContain(declaredButUnbuilt.geometry.builder);
    expect(validateRecord(declaredButUnbuilt)).toEqual([]);
  });
});

describe('catalog integrity — builder resolution (D3, task 3.2)', () => {
  it('tolerates the declared builders a later milestone owns', () => {
    // The M1a/M1b window: the plant three are referenced by the catalog and not registered yet.
    const gaps = BUILDER_IDS.filter((id) => !REGISTERED_BUILDER_IDS.includes(id));

    expect(gaps.length).toBeGreaterThan(0);
    expect([...PENDING_BUILDER_IDS].sort()).toEqual([...gaps].sort());
    expect(validateBuilderResolution(ORGANELLE_RECORDS, RESOLUTION)).toEqual([]);
  });

  it('fails when a referenced builder has no registry entry', () => {
    const issues = validateCatalog(ORGANELLE_RECORDS, {
      registeredBuilderIds: REGISTERED_BUILDER_IDS.filter((id) => id !== 'nucleus'),
      // A pending allowance cannot hide a gap the author did not declare as pending.
      pendingBuilderIds: PENDING_BUILDER_IDS,
    });
    const offender = issues.find((issue) => issue.recordId === 'nucleus');

    expect(offender?.field).toBe('geometry.builder');
    expect(offender?.message).toContain('no registry entry');
    expect(formatIssues(issues)).toContain('[nucleus] geometry.builder:');
    // The gap is only in one record: the tolerance for the plant three still holds.
    expect(issues).toHaveLength(1);
  });

  it('fails when a pending allowance is withdrawn before the builder exists', () => {
    const issues = validateCatalog(ORGANELLE_RECORDS, {
      registeredBuilderIds: REGISTERED_BUILDER_IDS,
      pendingBuilderIds: [],
    });

    expect(issues.map((issue) => issue.recordId).sort()).toEqual([
      'cell-wall',
      'chloroplast',
      'vacuole',
    ]);
  });

  it('fails on a builder registered under an id the catalog never declares', () => {
    const issues = validateBuilderResolution(ORGANELLE_RECORDS, {
      registeredBuilderIds: [...REGISTERED_BUILDER_IDS, 'photosystem'],
    });
    const offender = issues.find((issue) => issue.recordId === '<registry>');

    expect(offender?.field).toBe('geometry.builder');
    expect(offender?.message).toContain('photosystem');
  });

  it('does not resolve anything when no registry is supplied', () => {
    expect(
      validateBuilderResolution([{ ...BASE, geometry: { ...BASE.geometry, builder: 'chloroplast' } }]),
    ).toEqual([]);
  });
});

describe('catalog integrity — required fields', () => {
  it('fails naming the record and the missing field', () => {
    const issues = validateRecord(withDefect({ size: undefined }));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.recordId).toBe('mitochondrion');
    expect(issues[0]?.field).toBe('size');
    expect(formatIssues(issues)).toContain('[mitochondrion] size:');
  });

  it('fails on a missing localized field, naming the whole field', () => {
    const issues = validateRecord(withDefect({ funFact: undefined }));

    expect(issues.map((issue) => issue.field)).toEqual(['funFact']);
  });

  it('fails on a missing geometry seed', () => {
    const issues = validateRecord(
      withDefect({ geometry: { ...BASE.geometry, seed: undefined } }),
    );

    expect(issues.map((issue) => issue.field)).toEqual(['geometry.seed']);
  });

  it('fails on an undeclared builder id, naming the field', () => {
    const issues = validateRecord(
      withDefect({ geometry: { ...BASE.geometry, builder: 'photosystem' } }),
    );

    expect(issues.map((issue) => issue.field)).toEqual(['geometry.builder']);
    expect(issues[0]?.message).toContain('photosystem');
  });

  it('fails on a palette role that is not declared', () => {
    const issues = validateRecord(withDefect({ paletteRole: 'teal' }));

    expect(issues.map((issue) => issue.field)).toEqual(['paletteRole']);
  });

  it('fails on an unknown cell id', () => {
    const issues = validateRecord(withDefect({ cells: ['animal', 'fungus'] }));

    expect(issues.map((issue) => issue.field)).toEqual(['cells']);
  });

  it('fails on a bad size unit and a non-positive size value', () => {
    const issues = validateRecord(withDefect({ size: { value: 0, unit: 'cm' } }));

    expect(issues.map((issue) => issue.field).sort()).toEqual(['size.unit', 'size.value']);
  });

  it('fails on a missing position', () => {
    const issues = validateRecord(withDefect({ position: [0, Number.NaN, 0] }));

    expect(issues.map((issue) => issue.field)).toEqual(['position']);
  });
});

describe('catalog integrity — bilingual content', () => {
  it('fails naming the empty locale', () => {
    const issues = validateRecord(withDefect({ funFact: { es: '', en: 'Mitochondria make ATP.' } }));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.recordId).toBe('mitochondrion');
    expect(issues[0]?.field).toBe('funFact.es');
    expect(formatIssues(issues)).toContain('funFact.es');
  });

  it('fails naming the record when the en side is missing', () => {
    const issues = validateRecord(withDefect({ name: { es: 'Mitocondria', en: '   ' } }));

    expect(issues.map((issue) => issue.field)).toEqual(['name.en']);
  });
});

describe('catalog integrity — no literal colours', () => {
  it('fails when a record carries a colour key', () => {
    const issues = validateRecord(withDefect({ colour: '#b4694a' }));

    expect(issues.map((issue) => issue.field)).toEqual(['colour']);
  });

  it('fails when a nested parameter carries a colour value', () => {
    const issues = validateRecord(
      withDefect({
        geometry: { ...BASE.geometry, params: { ...BASE.geometry.params, tint: 'rgb(12, 34, 56)' } },
      }),
    );

    expect(issues.map((issue) => issue.field)).toEqual(['geometry.params.tint']);
  });
});

describe('catalog integrity — disassembly vector (D16)', () => {
  it('fails when the vector is omitted, and says a zero vector is the explicit choice', () => {
    const issues = validateRecord(withDefect({ disassembly: undefined }));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.recordId).toBe('mitochondrion');
    expect(issues[0]?.field).toBe('disassembly');
    expect(issues[0]?.message).toContain('[0,0,0]');
  });

  it('fails on an inward direction and names the record', () => {
    const position = BASE.position;
    const length = Math.hypot(...position);
    const inward: [number, number, number] = [
      -position[0] / length,
      -position[1] / length,
      -position[2] / length,
    ];

    const issues = validateRecord(withDefect({ disassembly: { direction: inward, distance: 0.75 } }));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.recordId).toBe('mitochondrion');
    expect(issues[0]?.field).toBe('disassembly.direction');
    expect(issues[0]?.message).toContain('centre');
    expect(formatIssues(issues)).toContain('[mitochondrion] disassembly.direction:');
  });

  it('fails on a non-normalizable direction while a distance is declared', () => {
    const issues = validateRecord(
      withDefect({ disassembly: { direction: [0, 0, 0], distance: 2 } }),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe('disassembly.direction');
    expect(issues[0]?.message).toContain('not normalizable');
  });

  it('fails on a negative distance', () => {
    const issues = validateRecord(
      withDefect({ disassembly: { direction: BASE.disassembly.direction, distance: -1 } }),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe('disassembly.distance');
    expect(issues[0]?.message).toContain('positive');
  });

  it('fails on a non-finite direction component', () => {
    const issues = validateRecord(
      withDefect({ disassembly: { direction: [1, Number.NaN, 0], distance: 1 } }),
    );

    expect(issues.map((issue) => issue.field)).toEqual(['disassembly.direction']);
  });

  it('rejects the omission but accepts neither a zero vector with travel nor an unknown field', () => {
    // The pair of rules that make "never separates" unambiguous: it is an explicit zero vector
    // with zero distance, never a missing field and never a zero direction with travel.
    expect(validateRecord(withDefect({ disassembly: { direction: [0, 0, 0], distance: 0 } }))).toEqual([]);
    expect(validateRecord(withDefect({ disassembly: { direction: [0, 0, 0] } })).length).toBeGreaterThan(0);
  });
});

describe('catalog integrity — roster canonicality', () => {
  it('fails when the animal roster loses a canonical organelle', () => {
    const issues = validateCatalog(ORGANELLE_RECORDS.filter((record) => record.id !== 'nucleus'));

    expect(issues.some((issue) => issue.field === 'roster.animal' && issue.message.includes('nucleus'))).toBe(true);
    expect(issues.some((issue) => issue.field === 'roster.plant' && issue.message.includes('nucleus'))).toBe(true);
  });

  it('fails when a plant-only organelle joins the animal roster', () => {
    const patched = ORGANELLE_RECORDS.map((record) =>
      record.id === 'chloroplast' ? { ...record, cells: ['animal', 'plant'] } : record,
    );
    const issues = validateCatalog(patched);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.recordId).toBe('chloroplast');
    expect(issues[0]?.field).toBe('cells');
  });

  it('fails when a cilia, flagellum or pseudopod record is introduced', () => {
    const ciliated = { ...BASE, id: 'cilium', geometry: { ...BASE.geometry, builder: 'membrane' } };
    const issues = validateCatalog([...ORGANELLE_RECORDS, ciliated]);
    const offender = issues.find((issue) => issue.recordId === 'cilium');

    expect(offender?.field).toBe('id');
    expect(offender?.message).toContain('out of scope');
    expect(offender?.message).toContain('cilium');
  });

  it('fails on a duplicated id', () => {
    const issues = validateCatalog([...ORGANELLE_RECORDS, getRecord('golgi')!]);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.recordId).toBe('golgi');
    expect(issues[0]?.field).toBe('id');
  });

  it('fails on an empty catalog', () => {
    const issues = validateCatalog([]);

    expect(issues[0]?.recordId).toBe('<catalog>');
    expect(issues[0]?.field).toBe('records');
  });
});

describe('catalog integrity — the build gate', () => {
  it('throws with every offender named', () => {
    const broken = [
      withDefect({ id: 'alpha', disassembly: undefined }),
      { ...BASE, id: 'beta', paletteRole: 'teal', size: undefined },
    ];

    expect(() => assertCatalogIntegrity(broken)).toThrow(/Catalog integrity failed/);

    try {
      assertCatalogIntegrity(broken);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const mentioned = ['disassembly', 'paletteRole', 'size'].filter((field) => message.includes(field));

      expect(mentioned).toHaveLength(3);
      expect(message).toContain('alpha');
      expect(message).toContain('beta');
    }
  });

  it('reports a non-object entry instead of crashing', () => {
    const issues = validateRecord(null);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.recordId).toBe('#0');
    expect(issues[0]?.field).toBe('record');
  });
});
