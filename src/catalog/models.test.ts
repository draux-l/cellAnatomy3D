import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MODEL_MANIFEST, hasModel, modelFor } from './models';
import { ORGANELLE_RECORDS } from './cells';

/**
 * The committed manifest against the committed bytes.
 *
 * The whole identification map rests on two claims that no other test can check: that the sha256
 * fixes the file that ships, and that every `node`/`occurrence` pair names a real mesh in it. A
 * manifest that disagrees with the file resolves *nothing* at runtime — and the failure is silent,
 * because an unresolved mesh simply keeps its own material and never reaches a record.
 *
 * This reads `public/models/animal-cell.glb` and its GLB JSON chunk directly, so the check is
 * independent of three.js and of the loader.
 */

const MODEL_PATH = 'public/models/animal-cell.glb';

interface GlbJson {
  asset: { generator?: string };
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  nodes: { name?: string; mesh?: number; children?: number[] }[];
  meshes: { primitives: { material?: number }[] }[];
  materials: unknown[];
  accessors: { count: number }[];
}

function readGlbJson(path: string): { json: GlbJson; bytes: Buffer } {
  const bytes = readFileSync(path);

  expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
  const jsonLength = bytes.readUInt32LE(12);
  expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);

  return { json: JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')), bytes };
}

const { json, bytes } = readGlbJson(MODEL_PATH);
const frame = modelFor('animal')!.frame;
const rows = modelFor('animal')!.meshes;

function meshNodes(): GlbJson['nodes'] {
  return json.nodes.filter((node) => node.mesh !== undefined);
}

describe('the committed model manifest', () => {
  it('names the file that ships, byte for byte', () => {
    expect(frame.file).toBe('/models/animal-cell.glb');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(frame.sha256);
    expect(statSync(MODEL_PATH).size).toBeGreaterThan(0);
  });

  it('records the compression and texture extensions the loader has to wire', () => {
    // Draco needs `DRACOLoader` with decoder files under the served path, and the WebP extension
    // needs a browser that decodes WebP. Both are load-bearing: guessing Meshopt here would fail
    // to parse at all.
    expect(json.extensionsRequired).toContain('KHR_draco_mesh_compression');
    expect(json.extensionsRequired).toContain('EXT_texture_webp');
    expect(json.asset.generator).toContain('glTF-Transform');
  });

  it('has the mesh and material count the frame was measured from', () => {
    expect(meshNodes()).toHaveLength(21);
    expect(json.materials).toHaveLength(16);
  });

  it('covers every mesh in the file exactly once', () => {
    // Totality in both directions: every mesh node in the GLB has one manifest row, and no row
    // names a mesh that is not in the file. `occurrence` is derived from node order, which is what
    // the loader's de-duplication counter follows too.
    const expected: string[] = [];
    const counts = new Map<string, number>();

    for (const node of meshNodes()) {
      const name = node.name ?? '';
      const occurrence = counts.get(name) ?? 0;

      counts.set(name, occurrence + 1);
      expected.push(`${name}#${occurrence}`);
    }

    const declared = rows.map((row) => `${row.node}#${row.occurrence ?? 0}`);

    expect(declared).toEqual(expected);
    expect(new Set(declared).size).toBe(declared.length);
  });

  it('maps every roster record onto manifest rows that name it back', () => {
    for (const record of ORGANELLE_RECORDS) {
      expect(record.geometry.kind).toBe('mesh');

      if (record.geometry.kind !== 'mesh') {
        continue;
      }

      for (const ref of record.geometry.meshes) {
        const row = rows.find(
          (candidate) =>
            candidate.node === ref.node && (candidate.occurrence ?? 0) === (ref.occurrence ?? 0),
        );

        expect(row, `${record.id} references ${ref.node} which is not in the manifest`).toBeDefined();
        expect(row!.recordId).toBe(record.id);
        expect(row!.policy).toBe('map');
        expect(row!.materialKey).toBe(ref.materialKey);
      }
    }
  });

  it('never marks a shipped mesh "omit"', () => {
    // Every mesh is part of the model, so hiding one would be losing the model.
    expect(rows.filter((row) => row.policy === 'omit')).toEqual([]);
  });

  it('keeps the two-mesh mitochondrion on one record', () => {
    const mine = rows.filter((row) => row.recordId === 'mitochondrion');

    expect(mine).toHaveLength(2);
    expect(new Set(mine.map((row) => row.materialKey))).toEqual(
      new Set(['outerMembrane', 'innerMembrane']),
    );
  });

  it('ships a model for the animal cell only', () => {
    expect(hasModel('animal')).toBe(true);
    expect(hasModel('plant')).toBe(false);
    expect(Object.keys(MODEL_MANIFEST)).toEqual(['animal']);
  });
});
