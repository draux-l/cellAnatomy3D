import { describe, expect, it } from 'vitest';
import { getRecord } from './cells';
import { MODEL_MANIFEST, meshRowFor } from './models';
import {
  CELL_IDS,
  MATERIAL_KEY_NAMES,
  MESH_POLICIES,
  type CellId,
  type ManifestMesh,
} from './types';

/**
 * Shape and policy tests for the committed mesh manifest (tasks 12.1, 12.2).
 *
 * The manifest is the identification map: it turns a model node into `(record, material key)` or an
 * explicit policy. These tests assert the map's *shape* in Node; `verify/model-audit.mjs` asserts
 * it against the committed GLB (sha256 + node names) once the files ship (12.7).
 */

const CELLS = CELL_IDS as readonly CellId[];

function rowsOfPolicy(rows: readonly ManifestMesh[], policy: string): ManifestMesh[] {
  return rows.filter((row) => row.policy === policy);
}

describe('the committed model manifest', () => {
  it('carries a frame for every cell with a served path and a hex sha256', () => {
    for (const cell of CELLS) {
      const { frame } = MODEL_MANIFEST[cell];

      expect(frame.file).toMatch(/^\/models\/.+\.glb$/);
      expect(frame.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(frame.scale).toBeGreaterThan(0);
      expect(Number.isFinite(frame.scale)).toBe(true);
      expect(frame.rotation).toHaveLength(3);
      expect(frame.center).toHaveLength(3);
    }
  });

  it('maps every row to a valid policy and a coherent record/key pair', () => {
    for (const cell of CELLS) {
      for (const row of MODEL_MANIFEST[cell].meshes) {
        expect(MESH_POLICIES).toContain(row.policy);
        expect(row.node.length).toBeGreaterThan(0);

        if (row.policy === 'map') {
          expect(row.recordId, `${cell}/${row.node} marked map must name a record`).toBeTruthy();
          expect(row.materialKey, `${cell}/${row.node} marked map must name a key`).toBeTruthy();
          expect(MATERIAL_KEY_NAMES).toContain(row.materialKey);
          expect(getRecord(row.recordId!)).toBeDefined();
        }

        if (row.policy === 'unmapped') {
          // Present but not part of the catalog: no record, no invented label (design D26).
          expect(row.recordId).toBeNull();
          expect(MATERIAL_KEY_NAMES).toContain(row.materialKey);
        }

        if (row.policy === 'omit') {
          expect(row.recordId).toBeNull();
          expect(row.materialKey).toBeNull();
        }
      }
    }
  });

  it('addresses every mesh uniquely with (node, occurrence)', () => {
    for (const cell of CELLS) {
      const seen = new Set<string>();

      for (const row of MODEL_MANIFEST[cell].meshes) {
        const key = `${row.node}#${row.occurrence ?? 0}`;

        expect(seen.has(key), `${cell} declares "${key}" twice`).toBe(false);
        seen.add(key);
      }
    }
  });

  it('never lets two records in one cell own the same material key', () => {
    for (const cell of CELLS) {
      const ownerByKey = new Map<string, string>();

      for (const row of rowsOfPolicy(MODEL_MANIFEST[cell].meshes, 'map')) {
        const owner = ownerByKey.get(row.materialKey!);

        if (owner !== undefined) {
          expect(
            owner,
            `${cell} shares material key "${row.materialKey}" between records`,
          ).toBe(row.recordId);
        } else {
          ownerByKey.set(row.materialKey!, row.recordId!);
        }
      }
    }
  });

  it('records the [15]/[10] identification policy as explicit omit flags (task 12.1)', () => {
    // The only two unresolved animal meshes: the purple tubes/rings (Material.026) and the bright
    // green blob (Material.1). The maintainer has not decided their policy, so they are committed
    // as explicit `omit` rows — never silently guessed, never given an invented label.
    const greenBlob = meshRowFor('animal', 'Nulo__Material.1_0');
    const purpleTubes = meshRowFor('animal', 'Nulo__Material.026_0');

    expect(greenBlob?.policy).toBe('omit');
    expect(greenBlob?.recordId).toBeNull();
    expect(purpleTubes?.policy).toBe('omit');
    expect(purpleTubes?.recordId).toBeNull();

    // No generic "misc organelle" record was invented for either.
    for (const id of ['misc', 'unknown', 'unidentified', 'blob', 'tubes', 'other']) {
      expect(getRecord(id)).toBeUndefined();
    }
  });

  it('maps the mitochondrion as ONE record over two animal meshes (design D29)', () => {
    const cristae = meshRowFor('animal', 'Nulo__Material.007_0');
    const outer = meshRowFor('animal', 'Nulo__Material.008_0');

    expect(cristae?.recordId).toBe('mitochondrion');
    expect(outer?.recordId).toBe('mitochondrion');
    expect(cristae?.materialKey).not.toBe(outer?.materialKey);
  });
});
