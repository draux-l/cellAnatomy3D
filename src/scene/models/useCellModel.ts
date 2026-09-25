import { useEffect, useState } from 'react';
import type { Object3D } from 'three';
import { cellDebug } from '../../app/debug';
import { MODEL_MANIFEST, modelFor } from '../../catalog/models';
import type { CellId, ModelManifest } from '../../catalog/types';

/**
 * The per-cell GLB loader.
 *
 * Four properties the budgets and the fidelity both depend on:
 *
 * 1. **Lazy.** `GLTFLoader` and `DRACOLoader` are pulled in with a dynamic `import()` inside the
 *    load function, so they — like three.js itself — never reach the shell's entry graph. The size
 *    audit hard-fails if a three.js marker comes back into the entry chunk.
 * 2. **The right decoder.** This model is compressed with `KHR_draco_mesh_compression`, **not**
 *    Meshopt. Wiring the wrong decoder is not a subtle bug: the parse fails outright. three r186's
 *    `DRACOLoader` can resolve its glTF-targeted decoder pair from a bundler-emitted URL, but that
 *    resolution only holds in the built bundle: the Vite dev server does not serve those files at the
 *    URLs the loader asks for, so the request falls through to the SPA `index.html` and the parse
 *    dies on `SyntaxError: Unexpected token '<'`. The decoder is therefore served from the stable
 *    `public/draco/` path — the glTF-targeted `draco_wasm_wrapper.js`, `draco_decoder.wasm` and
 *    `draco_decoder.js` copied verbatim from `three/examples/jsm/libs/draco/gltf/` — so dev and build
 *    resolve the same three files identically. The decoder path is a plain string here, which keeps
 *    the loader's own URL assets out of the entry graph.
 * 3. **As authored.** The loader applies **no** material substitution, no per-mesh re-centring and no
 *    decimation. The scene graph it returns is the file's own. The model's 16 materials and their
 *    colours are the model, and the transforms are the arrangement.
 * 4. **Identity is the manifest.** The cache key is the committed sha256, so a re-optimized file
 *    (which the manifest test already rejects) can never be served from a stale cache, and the
 *    selected cell is the only one fetched.
 */

export interface LoadedCellModel {
  cell: CellId;
  /** The model's own scene graph, unmodified. */
  root: Object3D;
}

interface GltfLoaderModule {
  GLTFLoader: new () => {
    setDRACOLoader(decoder: unknown): void;
    loadAsync(url: string): Promise<{ scene: Object3D }>;
  };
  DRACOLoader: new () => { setDecoderPath(path: unknown): void };
}

/**
 * The public path the glTF-targeted Draco decoder is served from. The files are copied verbatim
 * from `three/examples/jsm/libs/draco/gltf/` into `public/draco/`, so the same URLs resolve in the
 * dev server and in the built bundle.
 */
export const DRACO_DECODER_PATH = '/draco/';

/** Lazily imports the GLTF loader and the Draco decoder (kept out of the shell graph). */
async function importLoaders(): Promise<GltfLoaderModule> {
  const [loader, draco] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/loaders/DRACOLoader.js'),
  ]);

  return {
    GLTFLoader: loader.GLTFLoader,
    DRACOLoader: draco.DRACOLoader,
  };
}

export interface LoadCellModelOptions {
  manifest?: ModelManifest;
  /** Overrides the dynamic import; used by tests to avoid the decoder WASM path. */
  importLoaders?: () => Promise<GltfLoaderModule>;
  /** Receives a load failure before it is rethrown. Defaults to the debug bridge. */
  onError?: (error: unknown, cell: CellId) => void;
}

/** Module-level cache keyed by the manifest's own identity: `{cell}:{sha256}`. */
const cache = new Map<string, Promise<LoadedCellModel>>();

/** The cache key that fixes a model's identity. Exported so a test can prove the key's shape. */
export function modelCacheKey(cell: CellId, manifest: ModelManifest = MODEL_MANIFEST): string {
  return `${cell}:${manifest[cell]?.frame.sha256 ?? 'absent'}`;
}

/** Clears the module cache. Tests only — the app never needs to. */
export function clearModelCache(): void {
  cache.clear();
}

async function parseCellModel(
  cell: CellId,
  manifest: ModelManifest,
  options: LoadCellModelOptions,
): Promise<LoadedCellModel> {
  const frame = manifest[cell]?.frame;

  if (!frame) {
    throw new Error(`No committed model for the ${cell} cell`);
  }

  const loaders = await (options.importLoaders ?? importLoaders)();
  const loader = new loaders.GLTFLoader();
  const draco = new loaders.DRACOLoader();

  // The glTF-targeted decoder, from the stable public path both the dev server and the build serve.
  draco.setDecoderPath(DRACO_DECODER_PATH);
  loader.setDRACOLoader(draco);

  const gltf = await loader.loadAsync(frame.file);

  // Deliberately nothing else: no material substitution, no re-centring, no decimation. The model
  // mounts as authored; the disassembly offset is the only transform the viewer adds, and it is
  // added on top of each part's own position.
  return { cell, root: gltf.scene };
}

/**
 * Loads one cell's model, returning the cached promise when the same `{cell, sha256}` was already
 * requested. A failure is **not** cached, so a transient failure can be retried.
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

  const onError = options.onError ?? (() => cellDebug.setModelStatus('error', cell));
  // A model that failed to load must not blank the app, so the failure is rethrown for the caller to
  // handle and kept out of the cache for a retry.
  const pending = parseCellModel(cell, manifest, options).catch((error: unknown) => {
    onError(error, cell);
    cache.delete(key);
    throw error;
  });

  cache.set(key, pending);

  return pending;
}

export type CellModelStatus = 'idle' | 'loading' | 'ready' | 'error' | 'absent';

export interface CellModelState {
  status: CellModelStatus;
  model: LoadedCellModel | null;
  error: unknown;
}

/**
 * React view of {@link loadCellModel}: `absent` for a cell with no committed model (the plant cell
 * today, which is also what makes a cold animal load fetch nothing for it), `loading` → `ready`
 * otherwise.
 */
export function useCellModel(cell: CellId): CellModelState {
  const [state, setState] = useState<CellModelState>({ status: 'idle', model: null, error: null });

  useEffect(() => {
    if (!modelFor(cell)) {
      cellDebug.setModelStatus('absent', cell);
      setState({ status: 'absent', model: null, error: null });

      return undefined;
    }

    let active = true;

    cellDebug.setModelStatus('loading', cell);
    setState({ status: 'loading', model: null, error: null });

    loadCellModel(cell)
      .then((model) => {
        if (active) {
          cellDebug.setModelStatus('ready', cell);
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
  }, [cell]);

  return state;
}
