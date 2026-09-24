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
  validateMaterialKeyOwnership,
  validateRecord,
} from './integrity';
import { baseGeometryParamsFor } from './params';
import type { ModelManifest } from './types';
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

/**
 * A synthetic **procedural** record.
 *
 * Every committed record is now a mesh record (task 12.3), so the procedural branch of the gate
 * needs a record of its own. It carries the mitochondrion's previous procedural geometry.
 */
const PROCEDURAL: Record<string, unknown> = {
  ...BASE,
  geometry: {
    kind: 'procedural',
    builder: 'mitochondrion',
    params: { size: 0.3, detail: 1, count: 0, cristaeCount: 12 },
    seed: 'mitochondrion/v1',
  },
};

const RESOLUTION = { registeredBuilderIds: REGISTERED_BUILDER_IDS } as const;

function withDefect(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...BASE, ...overrides };
}

/** Injects a defect into the synthetic procedural record. */
function withProceduralDefect(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...PROCEDURAL, ...overrides };
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
    // Task 2.3's sequencing rule: resolution is opt-in, so a caller that never supplies a
    // registry can never fail on one. The catalog's own record data still has to pass.
    expect(validateCatalog(ORGANELLE_RECORDS)).toEqual([]);
    expect(validateBuilderResolution(ORGANELLE_RECORDS)).toEqual([]);
  });
});

describe('catalog integrity — builder resolution (D3, task 3.2)', () => {
  it('leaves no pending allowance once M1c registers its last builder', () => {
    // The shrinking allowlist is exactly the declared-but-unregistered gap, and registration
    // shrinks it in the same change: a builder left pending after it ships fails here.
    const gaps = BUILDER_IDS.filter((id) => !REGISTERED_BUILDER_IDS.includes(id));

    expect(gaps).toEqual([]);
    expect([...PENDING_BUILDER_IDS]).toEqual([]);
    expect(validateBuilderResolution(ORGANELLE_RECORDS, RESOLUTION)).toEqual([]);
  });

  it('fails when a referenced builder has no registry entry', () => {
    const issues = validateCatalog(ORGANELLE_RECORDS, {
      registeredBuilderIds: REGISTERED_BUILDER_IDS.filter((id) => id !== 'nucleus'),
      // A pending allowance cannot hide a gap the author did not declare as pending.
      pendingBuilderIds: PENDING_BUILDER_IDS,
    });
    const offender = issues.find((issue) => issue.recordId === 'nucleus');

    // nucleus is a mesh record: the builder the viewer would actually build is its fallback.
    expect(offender?.field).toBe('geometry.fallback.builder');
    expect(offender?.message).toContain('no registry entry');
    expect(formatIssues(issues)).toContain('[nucleus] geometry.fallback.builder:');
    // The gap is only in one record: the tolerance for the still-pending builders holds.
    expect(issues).toHaveLength(1);
  });

  it('fails when a builder the catalog references is registered, except one the allowlist hides', () => {
    // Simulates the sequencing rule itself: drop a registered builder with no allowance for it
    // and every record that references it fails, named. This is the check that keeps the
    // allowlist a gap-hider rather than a permanent hole.
    const issues = validateCatalog(ORGANELLE_RECORDS, {
      registeredBuilderIds: REGISTERED_BUILDER_IDS.filter((id) => id !== 'chloroplast'),
      pendingBuilderIds: PENDING_BUILDER_IDS,
    });

    expect(issues.map((issue) => issue.recordId)).toEqual(['chloroplast']);
    expect(issues[0]?.field).toBe('geometry.fallback.builder');
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
    const procedural = PROCEDURAL.geometry as Record<string, unknown>;
    const issues = validateRecord(
      withProceduralDefect({ geometry: { ...procedural, seed: undefined } }),
    );

    expect(issues.map((issue) => issue.field)).toEqual(['geometry.seed']);
  });

  it('fails on an undeclared builder id, naming the field', () => {
    const procedural = PROCEDURAL.geometry as Record<string, unknown>;
    const issues = validateRecord(
      withProceduralDefect({ geometry: { ...procedural, builder: 'photosystem' } }),
    );

    expect(issues.map((issue) => issue.field)).toEqual(['geometry.builder']);
    expect(issues[0]?.message).toContain('photosystem');
  });

  it('fails on an unknown geometry kind, naming the field', () => {
    const issues = validateRecord(
      withDefect({ geometry: { kind: 'hybrid', builder: 'membrane', params: {}, seed: 'x' } }),
    );

    expect(issues.map((issue) => issue.field)).toEqual(['geometry.kind']);
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
        geometry: { ...BASE.geometry, params: { ...baseGeometryParamsFor(BASE), tint: 'rgb(12, 34, 56)' } },
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

describe('catalog integrity — per-cell overrides (composition)', () => {
  it('accepts the committed membrane override', () => {
    const membrane = getRecord('membrane')!;

    // A mesh record rejects per-cell `geometryParams`, so the plant silhouette deviation lives on
    // the procedural fallback instead.
    expect(membrane.geometry.kind).toBe('mesh');
    expect(
      membrane.geometry.kind === 'mesh'
        ? membrane.geometry.fallback.perCell?.plant?.geometryParams
        : undefined,
    ).toEqual({ sides: 8, cornerRounding: 0.4 });
    expect(isValidRecord(membrane)).toBe(true);
  });

  it('rejects an override for a cell the record is not part of', () => {
    const animalOnly = { ...PROCEDURAL, cells: ['animal'] };
    const issues = validateRecord({
      ...animalOnly,
      perCell: { plant: { geometryParams: { size: 2 } } },
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.recordId).toBe('mitochondrion');
    expect(issues[0]?.field).toBe('perCell.plant');
    expect(issues[0]?.message).toContain('not part of');
  });

  it('rejects an unknown cell key', () => {
    const issues = validateRecord({ ...BASE, perCell: { fungal: { position: [0, 0, 0] } } });

    expect(issues.map((issue) => issue.field)).toEqual(['perCell.fungal']);
    expect(issues[0]?.message).toContain('known cells');
  });

  it('rejects an empty override rather than treating it as a no-op', () => {
    // "No silent default": an override block that changes nothing is an authoring mistake.
    const issues = validateRecord({ ...BASE, perCell: { plant: {} } });

    expect(issues.map((issue) => issue.field)).toEqual(['perCell.plant']);
    expect(issues[0]?.message).toContain('empty');
  });

  it('rejects an unsupported override key', () => {
    const issues = validateRecord({
      ...BASE,
      perCell: { plant: { silhouette: 'octagon' } },
    });

    expect(issues.map((issue) => issue.field)).toEqual(['perCell.plant.silhouette']);
    expect(issues[0]?.message).toContain('position, geometryParams');
  });

  it('validates the shape of each override key', () => {
    const badPosition = validateRecord({ ...PROCEDURAL, perCell: { plant: { position: [1, 2] } } });
    const emptyParams = validateRecord({ ...PROCEDURAL, perCell: { plant: { geometryParams: {} } } });

    expect(badPosition.map((issue) => issue.field)).toEqual(['perCell.plant.position']);
    expect(emptyParams.map((issue) => issue.field)).toEqual(['perCell.plant.geometryParams']);
  });

  it('accepts both override keys together and reads them as valid', () => {
    const issues = validateRecord({
      ...PROCEDURAL,
      perCell: { plant: { position: [-0.5, -0.3, 0.2], geometryParams: { size: 0.28 } } },
    });

    expect(issues).toEqual([]);
  });

  it('applies the outward rule to a per-cell placement as well as the record position', () => {
    const position = BASE.position;
    const length = Math.hypot(...position);
    const inward: [number, number, number] = [
      -position[0] / length,
      -position[1] / length,
      -position[2] / length,
    ];

    const issues = validateRecord({ ...BASE, perCell: { plant: { position: inward } } });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe('perCell.plant.position');
    expect(issues[0]?.message).toContain('centre');
  });

  it('accepts the committed plant nucleus placement', () => {
    const nucleus = getRecord('nucleus')!;

    expect(nucleus.perCell?.plant?.position).toBeDefined();
    expect(isValidRecord(nucleus)).toBe(true);
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
    const ciliated = { ...PROCEDURAL, id: 'cilium', geometry: { ...(PROCEDURAL.geometry as object), builder: 'membrane' } };
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

describe('catalog integrity — the mesh branch (tasks 11.4, 12.3)', () => {
  it('accepts the committed multi-mesh mitochondrion (design D29)', () => {
    const mitochondrion = getRecord('mitochondrion')!;

    expect(mitochondrion.geometry.kind).toBe('mesh');
    expect(
      mitochondrion.geometry.kind === 'mesh' ? mitochondrion.geometry.meshes.length : 0,
    ).toBe(3);
    expect(isValidRecord(mitochondrion)).toBe(true);
  });

  it('fails on an empty mesh list, naming record and field', () => {
    const issues = validateRecord({ ...BASE, geometry: { ...BASE.geometry, meshes: [] } });
    const offender = issues.find((issue) => issue.field === 'geometry.meshes');

    expect(offender?.recordId).toBe('mitochondrion');
    expect(offender?.message).toContain('at least one');
  });

  it('fails on a node absent from the manifest, naming the record and the entry', () => {
    const meshes = [{ cell: 'animal', node: 'Nulo__Material.999_0', materialKey: 'membrane' }];
    const issues = validateRecord({ ...BASE, geometry: { ...BASE.geometry, meshes } });

    expect(issues.map((issue) => issue.field)).toEqual(['geometry.meshes[0].node']);
    expect(issues[0]?.message).toContain('not in the animal model manifest');
  });

  it('fails when the manifest maps the node to a different record', () => {
    // 'Nulo__Material_0' is the membrane's mesh, not the mitochondrion's.
    const meshes = [{ cell: 'animal', node: 'Nulo__Material_0', materialKey: 'membrane' }];
    const issues = validateRecord({ ...BASE, geometry: { ...BASE.geometry, meshes } });
    const offender = issues.find((issue) => issue.field === 'geometry.meshes[0].node');

    expect(offender?.message).toContain('mapped to record "membrane"');
  });

  it('fails on a material key the catalog does not declare', () => {
    const meshes = [{ cell: 'animal', node: 'Nulo__Material.007_0', materialKey: 'shiny' }];
    const issues = validateRecord({ ...BASE, geometry: { ...BASE.geometry, meshes } });

    expect(issues.map((issue) => issue.field)).toContain('geometry.meshes[0].materialKey');
  });

  it('fails on an unknown cell in a mesh reference', () => {
    const meshes = [{ cell: 'fungus', node: 'Nulo__Material.007_0', materialKey: 'innerMembrane' }];
    const issues = validateRecord({ ...BASE, geometry: { ...BASE.geometry, meshes } });

    expect(issues.map((issue) => issue.field)).toEqual(['geometry.meshes[0].cell']);
  });

  it('rejects perCell.geometryParams on a mesh record, naming the field', () => {
    const issues = validateRecord({
      ...BASE,
      perCell: { plant: { geometryParams: { size: 0.2 } } },
    });
    const offender = issues.find((issue) => issue.field === 'perCell.plant.geometryParams');

    expect(offender?.message).toContain('not valid on a mesh record');
  });

  it('rejects a fallback without a declared builder', () => {
    const geometry = BASE.geometry as unknown as Record<string, unknown>;
    const issues = validateRecord({
      ...BASE,
      geometry: { ...geometry, fallback: { ...(geometry.fallback as object), builder: 'photosystem' } },
    });

    expect(issues.map((issue) => issue.field)).toContain('geometry.fallback.builder');
  });

  it('fails when two records in one cell claim the same material key', () => {
    // Two records may share a key *inside* one record (the mitochondrion's two meshes), but never
    // across records — they would be indistinguishable under hover emphasis.
    const first = {
      ...BASE,
      id: 'first',
      geometry: { ...BASE.geometry, meshes: [{ cell: 'animal', node: 'a', materialKey: 'membrane' }] },
    };
    const second = {
      ...BASE,
      id: 'second',
      geometry: { ...BASE.geometry, meshes: [{ cell: 'animal', node: 'b', materialKey: 'membrane' }] },
    };
    const issues = validateMaterialKeyOwnership([first, second]);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.recordId).toBe('second');
    expect(issues[0]?.field).toBe('geometry.meshes.materialKey');
    expect(issues[0]?.message).toContain('already owned by record "first"');

    // The committed catalog has no such collision.
    expect(validateMaterialKeyOwnership(ORGANELLE_RECORDS)).toEqual([]);
  });

  it('reads the manifest from injected data, not a hard-coded one', () => {
    // A synthetic manifest that knows none of the real nodes: the committed record must fail,
    // proving the gate consults the injected map rather than assuming the committed one.
    const synthetic = {
      animal: {
        cell: 'animal',
        frame: { file: '/models/x.glb', sha256: 'a'.repeat(64), scale: 1, rotation: [0, 0, 0], center: [0, 0, 0] },
        meshes: [],
      },
      plant: {
        cell: 'plant',
        frame: { file: '/models/y.glb', sha256: 'b'.repeat(64), scale: 1, rotation: [0, 0, 0], center: [0, 0, 0] },
        meshes: [],
      },
    } as unknown as ModelManifest;

    const issues = validateRecord(BASE, 0, { manifest: synthetic });
    const meshIssues = issues.filter((issue) => issue.field.startsWith('geometry.meshes'));

    // Three references, all unresolved in the injected map.
    expect(meshIssues).toHaveLength(3);
    expect(meshIssues[0]?.message).toContain('not in the animal model manifest');

    // The same record passes against the committed map.
    expect(isValidRecord(BASE)).toBe(true);
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
