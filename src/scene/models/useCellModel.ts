import { useEffect, useState } from 'react';
import type { Object3D } from 'three';
import { cellDebug } from '../../app/debug';
import { cellModelFor, MODEL_MANIFEST } from '../../catalog/models';
import type { CellId, ModelManifest } from '../../catalog/types';
import { createOrganelleMaterials, type OrganelleMaterials } from '../materials';
import { assignCatalogMaterials, type MaterialAssignmentResult } from './assignMaterials';

/**
 * The per-cell GLB loader (design D20/D25, task 11.5).
 *
 * Three properties the budgets depend on:
 *
 * 1. **Lazy.** `GLTFLoader` and `MeshoptDecoder` are pulled in with a dynamic `import()` *inside*
 *    the load function, so they — like three.js itself — never reach the shell's entry graph. The
 *    size audit hard-fails if the 3D module comes back into the entry chunk.
 * 2. **Selected cell only.** One model loads per cell, keyed `{cell, sha256}`, and the second cell
 *    fetches only when it is first rendered. A cold animal load never requests the plant model.
 * 3. **Identity is the manifest.** The cache key is the committed sha256, so a re-optimized file
 *    (which the build-time audit already rejects) can never be served from a stale cache.
 *
 * The models are gltfpack/meshopt output, so {@link loadCellModel} wires the meshopt decoder;
 * `EXT_texture_webp` is supported natively by `GLTFLoader`.
 *
 * **Runtime consumption:** the parsed root + keyed materials are handed to `MeshOrganelleHost`
 * (scene assembly, the mesh slice). Until that lands, `OrganelleHost` renders each record through
 * its declared procedural builder — design D27's permanent fallback — so the composed-cell
 * screenshots stay byte-identical.
 */

export interface LoadedCellModel {
  cell: CellId;
  root: Object3D;
  materials: OrganelleMaterials;
  assignment: MaterialAssignmentResult;
}

/** Options for {@link loadCellModel}, all injectable so the loader is testable without a network. */
export interface LoadCellModelOptions {
  manifest?: ModelManifest;
  /** Overrides the dynamic import; used by tests to avoid the meshopt WASM path. */
  importLoaders?: () => Promise<GltfLoaderModule>;
  /** Receives a load failure before it is rethrown. Defaults to the debug counter. */
  onError?: (error: unknown, cell: CellId) => void;
}

interface GltfLoaderModule {
  GLTFLoader: new () => {
    setMeshoptDecoder(decoder: unknown): void;
    loadAsync(url: string): Promise<{ scene: Object3D }>;
  };
  MeshoptDecoder: unknown;
}

/** Lazily imports the GLTF loader and the meshopt decoder (kept out of the shell graph). */
async function importLoaders(): Promise<GltfLoaderModule> {
  const [loader, meshopt] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
  ]);

  return {
    GLTFLoader: loader.GLTFLoader,
    MeshoptDecoder: (meshopt as { MeshoptDecoder: unknown }).MeshoptDecoder,
  };
}

/** Module-level cache keyed by the manifest's own identity: `{cell}:{sha256}`. */
const cache = new Map<string, Promise<LoadedCellModel>>();

/** The cache key that fixes a model's identity. Exported so a test can prove the key's shape. */
export function modelCacheKey(cell: CellId, manifest: ModelManifest = MODEL_MANIFEST): string {
  return `${cell}:${cellModelFor(cell, manifest).frame.sha256}`;
}

/** Clears the module cache. Tests only — the app never needs to. */
export function clearModelCache(): void {
  for (const loaded of cache.values()) {
    void loaded.then((model) => model.materials.dispose()).catch(() => undefined);
  }

  cache.clear();
}

async function parseCellModel(
  cell: CellId,
  options: LoadCellModelOptions,
): Promise<LoadedCellModel> {
  const manifest = options.manifest ?? MODEL_MANIFEST;
  const frame = cellModelFor(cell, manifest).frame;
  const loaders = await (options.importLoaders ?? importLoaders)();
  const loader = new loaders.GLTFLoader();

  loader.setMeshoptDecoder(loaders.MeshoptDecoder);

  const gltf = await loader.loadAsync(frame.file);
  const materials = createOrganelleMaterials();
  const assignment = assignCatalogMaterials(gltf.scene, cell, (key) => materials[key], manifest);

  return { cell, root: gltf.scene, materials, assignment };
}

/**
 * Loads one cell's model, returning the cached promise when the same `{cell, sha256}` was already
 * requested. A failure increments `meshLoadErrors` and is **not** cached, so a transient failure
 * can be retried.
 */
export function loadCellModel(
  cell: CellId,
  options: LoadCellModelOptions = {},
): Promise<LoadedCellModel> {
  const manifest = options.manifest ?? MODEL_MANIFEST;
  const key = modelCacheKey(cell, manifest);
  const cached = cache.get(key);

  if (cached) {
    return cached;
  }

  const onError = options.onError ?? (() => cellDebug.recordMeshLoadError());
  const pending = parseCellModel(cell, options).catch((error: unknown) => {
    onError(error, cell);
    // A mesh record must fall back to its procedural builder and the cell must not blank, so the
    // failure is rethrown for the caller to handle and kept out of the cache for a retry.
    cache.delete(key);
    throw error;
  });

  cache.set(key, pending);

  return pending;
}

export type CellModelStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface CellModelState {
  status: CellModelStatus;
  model: LoadedCellModel | null;
  error: unknown;
}

/**
 * React view of {@link loadCellModel}: `idle` until the first render, then `loading` → `ready`
 * (or `error`). The hook never re-fetches for a `{cell, sha256}` already cached.
 */
export function useCellModel(cell: CellId, options: LoadCellModelOptions = {}): CellModelState {
  const [state, setState] = useState<CellModelState>({ status: 'idle', model: null, error: null });

  useEffect(() => {
    let active = true;

    setState({ status: 'loading', model: null, error: null });

    loadCellModel(cell, options)
      .then((model) => {
        if (active) {
          setState({ status: 'ready', model, error: null });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ status: 'error', model: null, error });
        }
      });

    return () => {
      active = false;
    };
    // `options` is intentionally not a dependency: the manifest and loader imports are stable, and
    // re-running on every object identity would refetch forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell]);

  return state;
}
