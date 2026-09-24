import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Texture } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { cellDebug, createCellDebug } from '../../app/debug';
import { MODEL_MANIFEST } from '../../catalog/models';
import type { MaterialKeyName } from '../../catalog/types';
import { assignCatalogMaterials } from './assignMaterials';
import { clearModelCache, loadCellModel, modelCacheKey } from './useCellModel';

/**
 * The mesh loader's pure half (tasks 11.5, 12.5).
 *
 * `assignCatalogMaterials` is exercised with a hand-built `Object3D` graph: no GLB, no WebGL
 * context, no meshopt decoder. The GLB-specific facts (sha256, node names, the 2.6→17.3 fps
 * material swap) are validated by `verify/model-audit.mjs` against the committed files.
 */

function materialRecorder(): {
  materialForKey: (key: MaterialKeyName) => MeshStandardMaterial;
  requested: MaterialKeyName[];
} {
  const requested: MaterialKeyName[] = [];
  const cache = new Map<MaterialKeyName, MeshStandardMaterial>();

  return {
    requested,
    materialForKey(key) {
      requested.push(key);
      let material = cache.get(key);

      if (!material) {
        material = new MeshStandardMaterial({ color: 0xffffff });
        cache.set(key, material);
      }

      return material;
    },
  };
}

/** A node named `name` carrying a disposable GLB-style material, optionally with a texture. */
function meshNode(name: string, withTexture = false): Mesh {
  const material = new MeshBasicMaterial();

  if (withTexture) {
    material.map = new Texture();
  }

  const mesh = new Mesh(undefined, material);
  mesh.name = name;
  return mesh;
}

describe('assignCatalogMaterials', () => {
  it('discards every GLB material and assigns the manifest key per mesh', () => {
    const root = new Object3D();
    const membraneNode = meshNode('Nulo__Material_0', true);
    const golgiNode = meshNode('Nulo__Material.006_0');
    root.add(membraneNode, golgiNode);

    const { materialForKey, requested } = materialRecorder();
    const disposed: string[] = [];

    for (const mesh of [membraneNode, golgiNode]) {
      (mesh.material as MeshBasicMaterial).addEventListener('dispose', () => disposed.push(mesh.name));
    }

    const result = assignCatalogMaterials(root, 'animal', materialForKey, MODEL_MANIFEST);

    // The GLB's own materials are gone — this is the plant 2.6 → 17.3 fps fix (D21).
    expect(disposed.sort()).toEqual(['Nulo__Material.006_0', 'Nulo__Material_0']);
    expect(result.discarded).toBe(2);
    expect(result.assigned).toBe(2);
    expect(requested).toEqual(['membrane', 'golgi']);
    expect(membraneNode.material).not.toBeInstanceOf(MeshBasicMaterial);
  });

  it('assigns distinct materials to the four chromatin meshes that share one name', () => {
    const root = new Object3D();

    for (let i = 0; i < 4; i += 1) {
      root.add(meshNode('Nulo__Material.027_0'));
    }

    const { materialForKey, requested } = materialRecorder();
    const result = assignCatalogMaterials(root, 'animal', materialForKey, MODEL_MANIFEST);

    expect(result.assigned).toBe(4);
    expect(requested).toEqual(['chromatin', 'chromatin', 'chromatin', 'chromatin']);
    expect(result.unknown).toEqual([]);
  });

  it('hides an omitted mesh and reports it rather than assigning a material', () => {
    const root = new Object3D();
    const debris = meshNode('Nulo__Material.003_0');
    root.add(debris);

    const { materialForKey } = materialRecorder();
    const result = assignCatalogMaterials(root, 'animal', materialForKey, MODEL_MANIFEST);

    expect(debris.visible).toBe(false);
    expect(result.omitted).toBe(1);
    expect(result.assigned).toBe(0);
  });

  it('renders an unmapped mesh with its key and counts it as unlabelled', () => {
    const root = new Object3D();
    root.add(meshNode('Nulo__Material.013_0'));

    const { materialForKey, requested } = materialRecorder();
    const result = assignCatalogMaterials(root, 'animal', materialForKey, MODEL_MANIFEST);

    expect(requested).toEqual(['cytoskeleton']);
    expect(result.unmapped).toBe(1);
    expect(result.assigned).toBe(1);
  });

  it('names a mesh the manifest does not know instead of failing silently', () => {
    const root = new Object3D();
    root.add(meshNode('Nulo__Material.999_0'));

    const { materialForKey } = materialRecorder();
    const result = assignCatalogMaterials(root, 'animal', materialForKey, MODEL_MANIFEST);

    expect(result.unknown).toEqual(['Nulo__Material.999_0']);
    expect(result.assigned).toBe(0);
  });

  it('maps every plant mesh to its key', () => {
    const root = new Object3D();

    for (const row of MODEL_MANIFEST.plant.meshes) {
      root.add(meshNode(row.node));
    }

    const { materialForKey } = materialRecorder();
    const result = assignCatalogMaterials(root, 'plant', materialForKey, MODEL_MANIFEST);

    expect(result.assigned + result.omitted).toBe(MODEL_MANIFEST.plant.meshes.length);
    expect(result.unknown).toEqual([]);
  });
});

describe('model cache identity', () => {
  it('keys the cache by cell and the committed sha256', () => {
    expect(modelCacheKey('animal')).toBe(`animal:${MODEL_MANIFEST.animal.frame.sha256}`);
    expect(modelCacheKey('plant')).toBe(`plant:${MODEL_MANIFEST.plant.frame.sha256}`);
    expect(modelCacheKey('animal')).not.toBe(modelCacheKey('plant'));
  });
});

describe('loadCellModel failure path (task 11.6)', () => {
  it('increments meshLoadErrors and does not cache the failure', async () => {
    clearModelCache();
    const before = cellDebug.meshLoadErrors;
    const importLoaders = vi.fn(async () => {
      throw new Error('network down');
    });

    await expect(loadCellModel('animal', { importLoaders })).rejects.toThrow('network down');

    expect(cellDebug.meshLoadErrors).toBe(before + 1);
    expect(importLoaders).toHaveBeenCalledTimes(1);

    // Not cached: a retry attempts again rather than replaying the rejected promise.
    await expect(loadCellModel('animal', { importLoaders })).rejects.toThrow('network down');
    expect(importLoaders).toHaveBeenCalledTimes(2);
  });

  it('reports through an injected sink when asked', async () => {
    clearModelCache();
    const debug = createCellDebug();
    const onError = vi.fn(() => debug.recordMeshLoadError());

    await expect(
      loadCellModel('plant', {
        importLoaders: async () => {
          throw new Error('decode failed');
        },
        onError,
      }),
    ).rejects.toThrow('decode failed');

    expect(onError).toHaveBeenCalledTimes(1);
    expect(debug.meshLoadErrors).toBe(1);
  });
});

describe('the loader stays lazy (task 11.5)', () => {
  it('never reaches the shell graph with a static three/addons import', () => {
    const source = readFileSync(join(process.cwd(), 'src/scene/models/useCellModel.ts'), 'utf8');

    // A static import of the loader or the meshopt decoder would pull three.js into the entry
    // chunk; the size audit hard-fails on that. The imports must be dynamic.
    expect(source).not.toMatch(/^import\s+.*from\s+'three\/examples/m);
    expect(source).toMatch(/import\('three\/examples\/jsm\/loaders\/GLTFLoader\.js'\)/);
    expect(source).toMatch(/import\('three\/examples\/jsm\/libs\/meshopt_decoder\.module\.js'\)/);
  });

  it('leaves an unused-import-free module surface', async () => {
    // Importing this module must not touch three's GLTF loader or the WASM decoder.
    const module = await import('./useCellModel');
    expect(typeof module.loadCellModel).toBe('function');
    expect(typeof module.useCellModel).toBe('function');
  });
});
