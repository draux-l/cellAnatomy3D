import { BoxGeometry, Mesh, Object3D, PropertyBinding } from 'three';
import { describe, expect, it } from 'vitest';
import { MODEL_MANIFEST } from '../../catalog/models';
import { resolveManifestRows } from './manifestLookup';

/**
 * Runtime-name resolution (the `GLTFLoader` naming trap).
 *
 * The animal model shipped with manifest node names like `Nulo__Material.013_0`, but a loaded
 * `Mesh` is named `Nulo__Material013_0` — `GLTFLoader.createUniqueName` strips `.` and friends —
 * and the four chromatin nodes become `Nulo__Material027_0`, `…_1`, `…_2`, `…_3`. A resolver keyed
 * on the raw manifest name therefore resolved nothing, silently, leaving every mesh with its GLB
 * material and no record. These tests pin the resolution against the loader's real naming rule
 * (`PropertyBinding.sanitizeNodeName`, three's own function and not a copy).
 */

/** The loader's naming, reproduced: sanitise, then de-duplicate with `_1`, `_2`, …. */
function createLoaderNamer(): (rawName: string) => string {
  const used = new Map<string, number>();

  return (rawName: string): string => {
    const sanitized = PropertyBinding.sanitizeNodeName(rawName);
    const seen = used.get(sanitized);

    if (seen === undefined) {
      used.set(sanitized, 0);

      return sanitized;
    }

    const next = seen + 1;

    used.set(sanitized, next);

    return `${sanitized}_${next}`;
  };
}

/** A root whose mesh node names match the manifest's, run through the loader's own naming. */
function modelGraph(nodeNames: readonly string[]): { root: Object3D; meshes: Mesh[] } {
  const root = new Object3D();
  const nameFor = createLoaderNamer();
  const meshes: Mesh[] = [];

  for (const nodeName of nodeNames) {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1));

    mesh.name = nameFor(nodeName);
    root.add(mesh);
    meshes.push(mesh);
  }

  return { root, meshes };
}

/** The manifest's node names, in order, with the loader's naming applied. */
function animalNodeNames(): string[] {
  return MODEL_MANIFEST.animal.meshes.map((row) => row.node);
}

describe('resolveManifestRows', () => {
  it('resolves a sanitised runtime name back to its row', () => {
    const { root, meshes } = modelGraph(animalNodeNames());
    const resolved = resolveManifestRows(root, 'animal', MODEL_MANIFEST);

    // `Nulo__Material.013_0` in the manifest; `.`-stripped by the loader.
    const cytoskeleton = resolved.get(meshes[0]!);

    expect(meshes[0]!.name).toBe('Nulo__Material013_0');
    expect(cytoskeleton?.materialKey).toBe('cytoskeleton');
    expect(cytoskeleton?.policy).toBe('unmapped');
    expect(cytoskeleton?.recordId).toBeNull();
    expect(resolved.get(meshes.at(-1)!)?.recordId).toBe('cytoplasm');
  });

  it('resolves the de-duplicated repeats to successive occurrences', () => {
    const nodeNames = animalNodeNames();
    const { root, meshes } = modelGraph(nodeNames);
    const resolved = resolveManifestRows(root, 'animal', MODEL_MANIFEST);
    const chromatin = meshes.filter((mesh) => mesh.name.startsWith('Nulo__Material027_0'));

    // The loader names them `…_0`, `…_0_1`, `…_0_2`, `…_0_3`; every one must resolve, and the
    // manifest gives all four the same record/key — which is the assertion that the occurrences
    // line up rather than collapsing onto row 0.
    expect(chromatin.map((mesh) => mesh.name)).toEqual([
      'Nulo__Material027_0',
      'Nulo__Material027_0_1',
      'Nulo__Material027_0_2',
      'Nulo__Material027_0_3',
    ]);

    for (const mesh of chromatin) {
      expect(resolved.get(mesh)?.recordId).toBe('nucleus');
      expect(resolved.get(mesh)?.materialKey).toBe('chromatin');
    }
  });

  it('resolves every node of the animal model to exactly one manifest row', () => {
    const { root, meshes } = modelGraph(animalNodeNames());
    const resolved = resolveManifestRows(root, 'animal', MODEL_MANIFEST);
    const rows = meshes.map((mesh) => resolved.get(mesh));

    // Totality: no mesh is left unresolvable, which is what makes "keeps its GLB material" — the
    // silent failure this module exists to prevent — impossible.
    expect(rows.every((row) => row !== undefined)).toBe(true);
    // And it is a bijection: each runtime mesh claims a distinct manifest row.
    expect(new Set(rows).size).toBe(meshes.length);
    expect(rows.length).toBe(MODEL_MANIFEST.animal.meshes.length);
  });

  it('leaves a name the manifest does not know unresolved', () => {
    const { root, meshes } = modelGraph(['Nulo__Material.999_0']);
    const resolved = resolveManifestRows(root, 'animal', MODEL_MANIFEST);

    expect(resolved.get(meshes[0]!)).toBeUndefined();
    expect(resolved.size).toBe(0);
  });

  it('also accepts the authored spelling, which a test or a diagnostic may hold', () => {
    // The authored index is what keeps a hand-built graph (the loader tests) meaningful.
    const { root, meshes } = modelGraph(['Nulo__Material_0']);
    const resolved = resolveManifestRows(root, 'animal', MODEL_MANIFEST);

    expect(resolved.get(meshes[0]!)?.recordId).toBe('membrane');
  });
});
