import { BufferGeometry, Float32BufferAttribute } from 'three';
import { describe, expect, it } from 'vitest';
import { boundingRadius, suggestedDistance } from '../src/catalog/vectors';
import {
  auditModel,
  buildGlb,
  centerOf,
  disassemblySuggestions,
  meshInventory,
  parseGlb,
  radiusOf,
  sha256Of,
  unionBounds,
} from './model-audit.mjs';

/**
 * The model audit's pure half (task 11.7).
 *
 * Every case drives a **synthetic GLB** built in-memory, so the audit's failure modes are proven
 * without shipping a multi-megabyte fixture. The real files are validated against the same
 * functions by the CLI once they land (12.7).
 */

interface SyntheticMesh {
  name: string;
  min: [number, number, number];
  max: [number, number, number];
  triangles: number;
}

/** A minimal glTF whose nodes carry their own accessor min/max, like the real quantized models. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function syntheticModel(meshes: SyntheticMesh[]): Record<string, any> {
  return {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: meshes.map((_, index) => index) }],
    nodes: meshes.map((mesh) => ({ name: mesh.name, mesh: meshes.indexOf(mesh) })),
    meshes: meshes.map((mesh, index) => ({
      name: mesh.name,
      primitives: [{ attributes: { POSITION: index }, indices: index + meshes.length, material: index }],
    })),
    accessors: [
      ...meshes.map((mesh) => ({
        componentType: 5126,
        count: mesh.triangles * 3,
        type: 'VEC3',
        min: mesh.min,
        max: mesh.max,
      })),
      ...meshes.map((mesh) => ({
        componentType: 5125,
        count: mesh.triangles * 3,
        type: 'SCALAR',
        min: [0],
        max: [mesh.triangles * 3 - 1],
      })),
    ],
    materials: meshes.map((_, index) => ({ name: `GLBMaterial.${index}` })),
  };
}

function manifestCell(meshes: { node: string; occurrence?: number; recordId: string | null; policy: string; materialKey: string | null }[], sha256 = 'deadbeef') {
  return { cell: 'animal', frame: { file: '/models/x.glb', sha256, scale: 1, rotation: [0, 0, 0], center: [0, 0, 0] }, meshes };
}

describe('parseGlb / buildGlb', () => {
  it('round-trips a synthetic GLB', () => {
    const json = syntheticModel([{ name: 'a', min: [-1, -1, -1], max: [1, 1, 1], triangles: 4 }]);
    const buffer = buildGlb(json);
    const parsed = parseGlb(buffer);

    expect(parsed.version).toBe(2);
    expect(parsed.json.nodes).toHaveLength(1);
  });

  it('refuses a file that is not a GLB', () => {
    expect(() => parseGlb(Buffer.from('definitely not a glb file at all'))).toThrow(/not a GLB/);
  });
});

describe('meshInventory', () => {
  it('numbers same-named nodes by occurrence and sums triangles from indices', () => {
    const json = syntheticModel([
      { name: 'Nulo__Material.027_0', min: [-1, -1, -1], max: [1, 1, 1], triangles: 10 },
      { name: 'Nulo__Material.027_0', min: [-1, -1, -1], max: [1, 1, 1], triangles: 20 },
      { name: 'other', min: [-2, -2, -2], max: [2, 2, 2], triangles: 5 },
    ]);

    const inventory = meshInventory(json);

    expect(inventory.map((entry) => entry.occurrence)).toEqual([0, 1, 0]);
    expect(inventory.map((entry) => entry.triangles)).toEqual([10, 20, 5]);
    expect(inventory[0]!.materialName).toBe('GLBMaterial.0');
  });

  it('dequantizes a normalized accessor before measuring bounds', () => {
    // A quantized accessor stores ±32767 for a normalized [-1,1] range; the inventory must
    // divide by the component's normalization divisor before measuring.
    const json = syntheticModel([{ name: 'q', min: [-32767, -32767, -32767], max: [32767, 32767, 32767], triangles: 3 }]);
    json.nodes = [{ name: 'q', mesh: 0 }];
    json.accessors[0].normalized = true;
    json.accessors[0].componentType = 5122;

    const [entry] = meshInventory(json);

    expect(entry!.bounds.max[0]).toBeCloseTo(1, 6);
    expect(radiusOf(entry!.bounds)).toBeCloseTo(1.7320508, 5);
  });
});

describe('auditModel', () => {
  const inventory = meshInventory(
    syntheticModel([{ name: 'nucleus_node', min: [-1, -1, -1], max: [1, 1, 1], triangles: 10 }]),
  );

  it('fails on a sha256 mismatch and names the model', () => {
    const { failures } = auditModel('animal', manifestCell([{ node: 'nucleus_node', policy: 'map', recordId: 'nucleus', materialKey: 'nucleus' }]), inventory, 'ffff');

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('animal');
    expect(failures[0]).toContain('re-optimized');
  });

  it('passes when the sha and every node match', () => {
    const report = auditModel('animal', manifestCell([{ node: 'nucleus_node', policy: 'map', recordId: 'nucleus', materialKey: 'nucleus' }], 'abc'), inventory, 'abc');

    expect(report.failures).toEqual([]);
  });

  it('fails on a renamed node and names the manifest row', () => {
    const { failures } = auditModel('animal', manifestCell([{ node: 'renamed_node', policy: 'map', recordId: 'nucleus', materialKey: 'nucleus' }], 'abc'), inventory, 'abc');

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('renamed_node');
    expect(failures[0]).toContain('no matching node');
  });

  it('reports a model mesh the map does not name', () => {
    const report = auditModel('animal', manifestCell([], 'abc'), inventory, 'abc');

    expect(report.unmappedInModel).toEqual(['nucleus_node#0']);
  });
});

describe('disassemblySuggestions', () => {
  it('measures one record from the union of its meshes', () => {
    const json = syntheticModel([
      { name: 'cristae', min: [1, 0, 0], max: [2, 1, 1], triangles: 4 },
      { name: 'outer', min: [0, 0, 0], max: [0.5, 0.5, 0.5], triangles: 4 },
    ]);
    const inventory = meshInventory(json);
    const cell = manifestCell([
      { node: 'cristae', policy: 'map', recordId: 'mitochondrion', materialKey: 'innerMembrane' },
      { node: 'outer', policy: 'map', recordId: 'mitochondrion', materialKey: 'outerMembrane' },
    ]);

    const [entry] = Object.values(disassemblySuggestions(cell, inventory));

    expect(entry!.meshCount).toBe(2);
    // Union box is [0,0,0]..[2,1,1]; its centre is (1, 0.5, 0.5).
    expect(entry!.center).toEqual([1, 0.5, 0.5]);
    expect(entry!.suggestedDistance).toBeCloseTo(1.5 * radiusOf(unionBounds([
      inventory[0]!.bounds,
      inventory[1]!.bounds,
    ])), 3);
    expect(Math.hypot(...entry!.suggestedDirection)).toBeCloseTo(1, 3);
  });

  it('matches catalog/vectors.ts on the same box (no duplicated geometry maths)', () => {
    // The audit cannot import a TypeScript module, so it re-implements the radius formula; this
    // pins the two implementations together so they cannot drift.
    const bounds = { min: [-2, -1, 0], max: [3, 4, 5] };
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute(
        [
          -2, -1, 0,
          3, 4, 5,
          -2, 4, 5,
        ],
        3,
      ),
    );

    expect(radiusOf(bounds)).toBeCloseTo(boundingRadius([geometry]), 6);
    expect(1.5 * radiusOf(bounds)).toBeCloseTo(suggestedDistance([geometry]), 6);
    expect(centerOf(bounds)).toEqual([0.5, 1.5, 2.5]);

    geometry.dispose();
  });
});

describe('sha256Of', () => {
  it('hashes bytes the way the manifest records them', () => {
    // The known digest of the ASCII string "abc".
    expect(sha256Of(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
