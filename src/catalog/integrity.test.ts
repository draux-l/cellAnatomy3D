import { ORGANELLE_RECORDS } from './cells';
import { MODEL_MANIFEST } from './models';
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_ANIMAL_IDS,
  PENDING_BUILDER_IDS,
  PLANT_ONLY_IDS,
  assertCatalogIntegrity,
  formatIssues,
  isValidRecord,
  validateBuilderResolution,
  validateCatalog,
  validateMaterialKeyOwnership,
  validateRecord,
} from './integrity';
import type { ModelManifest, OrganelleRecord } from './types';
import { BUILDER_IDS } from './types';

/**
 * Gate behaviour for the catalog (tasks 2.3, 2.5, 3.2).
 *
 * The committed catalog is empty while the cell models are reset, so every case here injects
 * **synthetic** records — a real record is not available to spread a defect into. The contract is
 * unchanged: the gate has to fail **naming the record and the field**, because a gate that fails
 * without saying who is at fault is not usable in a build log.
 *
 * Builder resolution is wired in by injecting a registry's id list, because `src/catalog/` must stay
 * three-free and a 3D-side registry imports every builder.
 */

const BASE: OrganelleRecord = {
  id: 'mitochondrion',
  name: { es: 'Mitocondria', en: 'Mitochondrion' },
  func: { es: 'Produce ATP.', en: 'Produces ATP.' },
  size: { value: 2, unit: 'µm' },
  funFact: { es: 'Tiene crestas.', en: 'It has cristae.' },
  paletteRole: 'organelles',
  position: [-0.52, -0.3, 0.26],
  geometry: {
    kind: 'procedural',
    builder: 'mitochondrion',
    params: { size: 0.3, detail: 1, count: 0, cristaeCount: 12 },
    seed: 'mitochondrion/v1',
  },
  disassembly: { direction: [-0.72, -0.38, 0.58], distance: 0.75 },
  cells: ['animal', 'plant'],
  pickable: true,
};

/** A synthetic **mesh** record: one manifest node plus its procedural fallback. */
const MESH_NODE = 'Nulo__Material.007_0';

const MESH: Record<string, unknown> = {
  ...BASE,
  geometry: {
    kind: 'mesh',
    meshes: [{ cell: 'animal', node: MESH_NODE, materialKey: 'innerMembrane' }],
    extent: 0.3,
    fallback: {
      builder: 'mitochondrion',
      params: { size: 0.3, detail: 1, count: 0 },
      seed: 'mitochondrion/v1',
    },
  },
};

/** A one-node manifest that maps `MESH_NODE` to the mitochondrion. */
const MANIFEST = {
  animal: {
    cell: 'animal',
    frame: {
      file: '/models/animal-cell.glb',
      sha256: 'a'.repeat(64),
      scale: 1,
      rotation: [0, 0, 0],
      center: [0, 0, 0],
    },
    meshes: [{ node: MESH_NODE, policy: 'map', recordId: 'mitochondrion', materialKey: 'innerMembrane' }],
  },
  plant: {
    cell: 'plant',
    frame: {
      file: '/models/plant-cell.glb',
      sha256: 'b'.repeat(64),
      scale: 1,
      rotation: [0, 0, 0],
      center: [0, 0, 0],
    },
    meshes: [],
  },
} satisfies ModelManifest;

const RESOLUTION = { registeredBuilderIds: ['mitochondrion'] } as const;
const MESH_OPTIONS = { manifest: MANIFEST, registeredBuilderIds: ['mitochondrion'] } as const;

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...BASE, ...overrides };
}

/**
 * A synthetic catalog that satisfies the canonical roster rules: the shared seven in both cells and
 * the plant three in the plant cell only.
 */
function catalog(): Record<string, unknown>[] {
  return [
    record({ id: 'nucleus' }),
    record({ id: 'mitochondrion' }),
    record({ id: 'endoplasmic-reticulum' }),
    record({ id: 'golgi' }),
    record({ id: 'ribosome' }),
    record({ id: 'lysosome' }),
    record({ id: 'membrane', position: [0, 0, 0], disassembly: { direction: [0, 0, 0], distance: 0 } }),
    record({ id: 'cell-wall', cells: ['plant'] }),
    record({ id: 'chloroplast', cells: ['plant'] }),
    record({ id: 'vacuole', cells: ['plant'] }),
  ];
}

describe('catalog integrity — a well-formed synthetic catalog', () => {
  it('passes with no issues', () => {
    expect(validateCatalog(catalog())).toEqual([]);
    expect(() => assertCatalogIntegrity(catalog())).not.toThrow();
    expect(() => assertCatalogIntegrity(catalog(), RESOLUTION)).not.toThrow();
  });

  it('accepts the explicit "never separates" zero vector', () => {
    const membrane = record({
      id: 'membrane',
      position: [0, 0, 0],
      disassembly: { direction: [0, 0, 0], distance: 0 },
    });

    expect(isValidRecord(membrane)).toBe(true);
  });

  it('validates the declared builder vocabulary without requiring registry resolution', () => {
    expect(validateBuilderResolution(catalog())).toEqual([]);
  });
});

describe('catalog integrity — builder resolution (D3, task 3.2)', () => {
  it('leaves no pending allowance by default', () => {
    expect([...PENDING_BUILDER_IDS]).toEqual([]);
    expect(validateBuilderResolution(catalog(), RESOLUTION)).toEqual([]);
  });

  it('fails when a referenced builder has no registry entry', () => {
    const issues = validateCatalog(catalog(), {
      registeredBuilderIds: BUILDER_IDS.filter((id) => id !== 'mitochondrion'),
      pendingBuilderIds: PENDING_BUILDER_IDS,
    });

    expect(issues).toHaveLength(10);
    expect(issues[0]?.field).toBe('geometry.builder');
    expect(issues[0]?.message).toContain('no registry entry');
    expect(formatIssues(issues)).toContain('[nucleus] geometry.builder:');
  });

  it('fails on a builder registered under an id the catalog never declares', () => {
    const issues = validateBuilderResolution(catalog(), {
      registeredBuilderIds: ['mitochondrion', 'photosystem'],
    });
    const offender = issues.find((issue) => issue.recordId === '<registry>');

    expect(offender?.field).toBe('geometry.builder');
    expect(offender?.message).toContain('photosystem');
  });

  it('does not resolve anything when no registry is supplied', () => {
    expect(
      validateBuilderResolution([
        record({ geometry: { ...BASE.geometry, builder: 'chloroplast' } }),
      ]),
    ).toEqual([]);
  });
});

describe('catalog integrity — required fields', () => {
  it('accepts a name-only record: the descriptions are authored in a later pass', () => {
    // The 2026-09 rebuild loaded the parts name-first. An absent `func`, `size` or `funFact` is the
    // documented state, not a defect — only a *malformed present* field fails.
    const issues = validateRecord(record({ func: undefined, size: undefined, funFact: undefined }));

    expect(issues).toEqual([]);
  });

  it('fails naming the record and the field when a present size is malformed', () => {
    const issues = validateRecord(record({ size: { value: -1, unit: 'µm' } }));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.recordId).toBe('mitochondrion');
    expect(issues[0]?.field).toBe('size.value');
    expect(formatIssues(issues)).toContain('[mitochondrion] size.value:');
  });

  it('fails on a half-authored optional localized field, naming the empty locale', () => {
    const issues = validateRecord(record({ funFact: { es: 'Solo español' } as never }));

    expect(issues.map((issue) => issue.field)).toEqual(['funFact.en']);
  });

  it('fails on a missing geometry seed', () => {
    const geometry = BASE.geometry as unknown as Record<string, unknown>;
    const issues = validateRecord(record({ geometry: { ...geometry, seed: undefined } }));

    expect(issues.map((issue) => issue.field)).toEqual(['geometry.seed']);
  });

  it('fails on an undeclared builder id, naming the field', () => {
    const geometry = BASE.geometry as unknown as Record<string, unknown>;
    const issues = validateRecord(record({ geometry: { ...geometry, builder: 'photosystem' } }));

    expect(issues.map((issue) => issue.field)).toEqual(['geometry.builder']);
    expect(issues[0]?.message).toContain('photosystem');
  });

  it('fails on an unknown geometry kind, naming the field', () => {
    const issues = validateRecord(
      record({ geometry: { kind: 'hybrid', builder: 'membrane', params: {}, seed: 'x' } }),
    );

    expect(issues.map((issue) => issue.field)).toEqual(['geometry.kind']);
  });

  it('fails on a palette role that is not declared', () => {
    const issues = validateRecord(record({ paletteRole: 'teal' }));

    expect(issues.map((issue) => issue.field)).toEqual(['paletteRole']);
  });

  it('fails on an unknown cell id', () => {
    const issues = validateRecord(record({ cells: ['animal', 'fungus'] }));

    expect(issues.map((issue) => issue.field)).toEqual(['cells']);
  });

  it('fails on a bad size unit and a non-positive size value', () => {
    const issues = validateRecord(record({ size: { value: 0, unit: 'cm' } }));

    expect(issues.map((issue) => issue.field).sort()).toEqual(['size.unit', 'size.value']);
  });

  it('fails on a missing position', () => {
    const issues = validateRecord(record({ position: [0, Number.NaN, 0] }));

    expect(issues.map((issue) => issue.field)).toEqual(['position']);
  });
});

describe('catalog integrity — bilingual content', () => {
  it('fails naming the empty locale', () => {
    const issues = validateRecord(record({ funFact: { es: '', en: 'Mitochondria make ATP.' } }));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.recordId).toBe('mitochondrion');
    expect(issues[0]?.field).toBe('funFact.es');
    expect(formatIssues(issues)).toContain('funFact.es');
  });

  it('fails naming the record when the en side is missing', () => {
    const issues = validateRecord(record({ name: { es: 'Mitocondria', en: '   ' } }));

    expect(issues.map((issue) => issue.field)).toEqual(['name.en']);
  });
});

describe('catalog integrity — no literal colours', () => {
  it('fails when a record carries a colour key', () => {
    const issues = validateRecord(record({ colour: '#b4694a' }));

    expect(issues.map((issue) => issue.field)).toEqual(['colour']);
  });

  it('fails when a nested parameter carries a colour value', () => {
    const geometry = BASE.geometry as unknown as Record<string, unknown>;
    const issues = validateRecord(
      record({ geometry: { ...geometry, params: { size: 0.3, tint: 'rgb(12, 34, 56)' } } }),
    );

    expect(issues.map((issue) => issue.field)).toEqual(['geometry.params.tint']);
  });
});

describe('catalog integrity — disassembly vector (D16)', () => {
  it('fails when the vector is omitted, and says a zero vector is the explicit choice', () => {
    const issues = validateRecord(record({ disassembly: undefined }));

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

    const issues = validateRecord(record({ disassembly: { direction: inward, distance: 0.75 } }));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.recordId).toBe('mitochondrion');
    expect(issues[0]?.field).toBe('disassembly.direction');
    expect(issues[0]?.message).toContain('centre');
  });

  it('fails on a non-normalizable direction while a distance is declared', () => {
    const issues = validateRecord(record({ disassembly: { direction: [0, 0, 0], distance: 2 } }));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe('disassembly.direction');
    expect(issues[0]?.message).toContain('not normalizable');
  });

  it('fails on a negative distance', () => {
    const issues = validateRecord(
      record({ disassembly: { direction: BASE.disassembly.direction, distance: -1 } }),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe('disassembly.distance');
    expect(issues[0]?.message).toContain('positive');
  });

  it('fails on a non-finite direction component', () => {
    const issues = validateRecord(
      record({ disassembly: { direction: [1, Number.NaN, 0], distance: 1 } }),
    );

    expect(issues.map((issue) => issue.field)).toEqual(['disassembly.direction']);
  });

  it('rejects the omission but accepts an explicit zero vector with zero distance', () => {
    expect(validateRecord(record({ disassembly: { direction: [0, 0, 0], distance: 0 } }))).toEqual([]);
    expect(validateRecord(record({ disassembly: { direction: [0, 0, 0] } })).length).toBeGreaterThan(0);
  });
});

describe('catalog integrity — per-cell overrides (composition)', () => {
  it('rejects an override for a cell the record is not part of', () => {
    const issues = validateRecord(
      record({ cells: ['animal'], perCell: { plant: { geometryParams: { size: 2 } } } }),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe('perCell.plant');
    expect(issues[0]?.message).toContain('not part of');
  });

  it('rejects an unknown cell key', () => {
    const issues = validateRecord(record({ perCell: { fungal: { position: [0, 0, 0] } } }));

    expect(issues.map((issue) => issue.field)).toEqual(['perCell.fungal']);
    expect(issues[0]?.message).toContain('known cells');
  });

  it('rejects an empty override rather than treating it as a no-op', () => {
    const issues = validateRecord(record({ perCell: { plant: {} } }));

    expect(issues.map((issue) => issue.field)).toEqual(['perCell.plant']);
    expect(issues[0]?.message).toContain('empty');
  });

  it('rejects an unsupported override key', () => {
    const issues = validateRecord(record({ perCell: { plant: { silhouette: 'octagon' } } }));

    expect(issues.map((issue) => issue.field)).toEqual(['perCell.plant.silhouette']);
    expect(issues[0]?.message).toContain('position, geometryParams');
  });

  it('validates the shape of each override key', () => {
    const badPosition = validateRecord(record({ perCell: { plant: { position: [1, 2] } } }));
    const emptyParams = validateRecord(record({ perCell: { plant: { geometryParams: {} } } }));

    expect(badPosition.map((issue) => issue.field)).toEqual(['perCell.plant.position']);
    expect(emptyParams.map((issue) => issue.field)).toEqual(['perCell.plant.geometryParams']);
  });

  it('accepts both override keys together and reads them as valid', () => {
    const issues = validateRecord(
      record({ perCell: { plant: { position: [-0.5, -0.3, 0.2], geometryParams: { size: 0.28 } } } }),
    );

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

    const issues = validateRecord(record({ perCell: { plant: { position: inward } } }));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe('perCell.plant.position');
    expect(issues[0]?.message).toContain('centre');
  });
});

describe('catalog integrity — roster canonicality', () => {
  it('fails when the animal roster loses a canonical organelle', () => {
    const issues = validateCatalog(catalog().filter((item) => item.id !== 'nucleus'));

    expect(issues.some((issue) => issue.field === 'roster.animal' && issue.message.includes('nucleus'))).toBe(true);
    expect(issues.some((issue) => issue.field === 'roster.plant' && issue.message.includes('nucleus'))).toBe(true);
  });

  it('fails when a plant-only organelle joins the animal roster', () => {
    const patched = catalog().map((item) =>
      item.id === 'chloroplast' ? { ...item, cells: ['animal', 'plant'] } : item,
    );
    const issues = validateCatalog(patched);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.recordId).toBe('chloroplast');
    expect(issues[0]?.field).toBe('cells');
  });

  it('fails when a cilia, flagellum or pseudopod record is introduced', () => {
    const ciliated = record({ id: 'cilium', geometry: { ...(BASE.geometry as object) } });
    const issues = validateCatalog([...catalog(), ciliated]);
    const offender = issues.find((issue) => issue.recordId === 'cilium');

    expect(offender?.field).toBe('id');
    expect(offender?.message).toContain('out of scope');
    expect(offender?.message).toContain('cilium');
  });

  it('fails on a duplicated id', () => {
    const issues = validateCatalog([...catalog(), record({ id: 'golgi' })]);

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
  it('accepts a mesh record against an injected manifest', () => {
    expect(validateRecord(MESH, 0, MESH_OPTIONS)).toEqual([]);
  });

  it('accepts a mesh record that declares no fallback', () => {
    // The procedural builders were removed, so a fallback-less mesh record is the shipped shape:
    // there is nothing to fall back to and the gate must not invent a requirement.
    const geometry = MESH.geometry as unknown as Record<string, unknown>;
    const { fallback: _fallback, ...withoutFallback } = geometry;

    expect(validateRecord({ ...MESH, geometry: withoutFallback }, 0, MESH_OPTIONS)).toEqual([]);
  });

  it('fails on a missing or non-positive extent, naming the field', () => {
    const geometry = MESH.geometry as unknown as Record<string, unknown>;
    const missing = validateRecord(
      { ...MESH, geometry: { ...geometry, extent: undefined } },
      0,
      MESH_OPTIONS,
    );
    const zero = validateRecord({ ...MESH, geometry: { ...geometry, extent: 0 } }, 0, MESH_OPTIONS);

    expect(missing.map((issue) => issue.field)).toContain('geometry.extent');
    expect(zero.map((issue) => issue.field)).toContain('geometry.extent');
  });

  it('fails on an empty mesh list, naming record and field', () => {
    const geometry = MESH.geometry as unknown as Record<string, unknown>;
    const issues = validateRecord({ ...MESH, geometry: { ...geometry, meshes: [] } }, 0, MESH_OPTIONS);
    const offender = issues.find((issue) => issue.field === 'geometry.meshes');

    expect(offender?.recordId).toBe('mitochondrion');
    expect(offender?.message).toContain('at least one');
  });

  it('fails on a node absent from the manifest, naming the record and the entry', () => {
    const meshes = [{ cell: 'animal', node: 'Nulo__Material.999_0', materialKey: 'membrane' }];
    const geometry = MESH.geometry as unknown as Record<string, unknown>;
    const issues = validateRecord({ ...MESH, geometry: { ...geometry, meshes } }, 0, MESH_OPTIONS);

    expect(issues.map((issue) => issue.field)).toEqual(['geometry.meshes[0].node']);
    expect(issues[0]?.message).toContain('not in the animal model manifest');
  });

  it('fails when the manifest maps the node to a different record', () => {
    const other: ModelManifest = {
      ...MANIFEST,
      animal: {
        ...MANIFEST.animal,
        meshes: [{ node: MESH_NODE, policy: 'map', recordId: 'membrane', materialKey: 'innerMembrane' }],
      },
    };
    const issues = validateRecord(MESH, 0, { manifest: other });
    const offender = issues.find((issue) => issue.field === 'geometry.meshes[0].node');

    expect(offender?.message).toContain('mapped to record "membrane"');
  });

  it('fails when the manifest maps the node to a different material key', () => {
    const other: ModelManifest = {
      ...MANIFEST,
      animal: {
        ...MANIFEST.animal,
        meshes: [
          { node: MESH_NODE, policy: 'map', recordId: 'mitochondrion', materialKey: 'outerMembrane' },
        ],
      },
    };
    const issues = validateRecord(MESH, 0, { manifest: other });

    expect(issues.map((issue) => issue.field)).toContain('geometry.meshes[0].materialKey');
  });

  it('fails on a material key the catalog does not declare', () => {
    const meshes = [{ cell: 'animal', node: MESH_NODE, materialKey: 'shiny' }];
    const geometry = MESH.geometry as unknown as Record<string, unknown>;
    const issues = validateRecord({ ...MESH, geometry: { ...geometry, meshes } }, 0, MESH_OPTIONS);

    expect(issues.map((issue) => issue.field)).toContain('geometry.meshes[0].materialKey');
  });

  it('fails on an unknown cell in a mesh reference', () => {
    const meshes = [{ cell: 'fungus', node: MESH_NODE, materialKey: 'innerMembrane' }];
    const geometry = MESH.geometry as unknown as Record<string, unknown>;
    const issues = validateRecord({ ...MESH, geometry: { ...geometry, meshes } }, 0, MESH_OPTIONS);

    expect(issues.map((issue) => issue.field)).toEqual(['geometry.meshes[0].cell']);
  });

  it('rejects perCell.geometryParams on a mesh record, naming the field', () => {
    const issues = validateRecord({ ...MESH, perCell: { plant: { geometryParams: { size: 0.2 } } } }, 0, MESH_OPTIONS);
    const offender = issues.find((issue) => issue.field === 'perCell.plant.geometryParams');

    expect(offender?.message).toContain('not valid on a mesh record');
  });

  it('rejects a fallback without a declared builder', () => {
    const geometry = MESH.geometry as unknown as Record<string, unknown>;
    const fallback = geometry.fallback as Record<string, unknown>;
    const issues = validateRecord(
      { ...MESH, geometry: { ...geometry, fallback: { ...fallback, builder: 'photosystem' } } },
      0,
      MESH_OPTIONS,
    );

    expect(issues.map((issue) => issue.field)).toContain('geometry.fallback.builder');
  });

  it('fails when two records in one cell claim the same material key', () => {
    // Two records may share a key *inside* one record, but never across records — they would be
    // indistinguishable under hover emphasis.
    const geometry = MESH.geometry as unknown as Record<string, unknown>;
    const first = { ...MESH, id: 'first', geometry: { ...geometry, meshes: [{ cell: 'animal', node: 'a', materialKey: 'membrane' }] } };
    const second = { ...MESH, id: 'second', geometry: { ...geometry, meshes: [{ cell: 'animal', node: 'b', materialKey: 'membrane' }] } };
    const issues = validateMaterialKeyOwnership([first, second]);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.recordId).toBe('second');
    expect(issues[0]?.field).toBe('geometry.meshes.materialKey');
    expect(issues[0]?.message).toContain('already owned by record "first"');
  });

  it('reads the manifest from injected data, not a hard-coded one', () => {
    const emptyManifest = {
      animal: { cell: 'animal', frame: { file: '/x.glb', sha256: 'a'.repeat(64), scale: 1, rotation: [0, 0, 0], center: [0, 0, 0] }, meshes: [] },
      plant: { cell: 'plant', frame: { file: '/y.glb', sha256: 'b'.repeat(64), scale: 1, rotation: [0, 0, 0], center: [0, 0, 0] }, meshes: [] },
    } as ModelManifest;

    const issues = validateRecord(MESH, 0, { manifest: emptyManifest });
    const meshIssues = issues.filter((issue) => issue.field.startsWith('geometry.meshes'));

    expect(meshIssues).toHaveLength(1);
    expect(meshIssues[0]?.message).toContain('not in the animal model manifest');
  });

  it('skips node resolution when no manifest is injected', () => {
    // The structural rules still run; only the node lookup needs a manifest.
    const issues = validateRecord(MESH);
    const meshIssues = issues.filter((issue) => issue.field.startsWith('geometry.meshes'));

    expect(meshIssues).toEqual([]);
  });
});

describe('catalog integrity — the build gate', () => {  it('throws with every offender named', () => {
    const broken = [
      record({ id: 'alpha', disassembly: undefined }),
      record({ id: 'beta', paletteRole: 'teal', size: { value: 0, unit: 'cm' } }),
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

describe('catalog integrity — the committed catalog', () => {
  it('passes every record-level and manifest-level rule', () => {
    // The gate is normally exercised with injected records; this runs it against the records that
    // actually ship, with the committed identification map injected as data.
    const issues = validateCatalog(ORGANELLE_RECORDS, {
      manifest: MODEL_MANIFEST,
      registeredBuilderIds: [],
    });

    // Every record-level rule passes: ids, bilingual copy, sizes, the mesh references resolving to
    // the committed manifest, the material-key vocabulary and the outward disassembly vectors.
    expect(issues.filter((issue) => !issue.field.startsWith('roster.'))).toEqual([]);
  });

  it('records the roster gaps the committed catalog knowingly has', () => {
    // One fact, real and asserted rather than hidden: the plant cell has no records and no model,
    // so its whole roster is absent. The animal roster is now complete — the model's mesh [9] is a
    // lysosome, so the canonical animal gap the previous catalog recorded is closed.
    const issues = validateCatalog(ORGANELLE_RECORDS, { manifest: MODEL_MANIFEST });
    const expected = [
      ...CANONICAL_ANIMAL_IDS.map((id) => ({
        recordId: '<catalog>',
        field: 'roster.plant',
        message: `is missing the shared organelle "${id}"`,
      })),
      ...PLANT_ONLY_IDS.map((id) => ({
        recordId: '<catalog>',
        field: 'roster.plant',
        message: `is missing the plant-only organelle "${id}"`,
      })),
    ];

    expect(issues).toEqual(expected);
    expect(issues.some((issue) => issue.field === 'roster.animal')).toBe(false);
  });

  it('gives every record a distinct material key inside its cell', () => {
    expect(validateMaterialKeyOwnership(ORGANELLE_RECORDS)).toEqual([]);
  });
});
