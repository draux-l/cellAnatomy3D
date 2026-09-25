import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import type { Mesh } from 'three';

/**
 * The spatial index the pick ray runs against.
 *
 * `three-mesh-bvh` is the standard accelerator for exactly this job: it builds a bounding-volume
 * hierarchy over a geometry's triangles so a ray test is `O(log n)` instead of `O(n)`. At ~808k
 * triangles across the model, a brute-force ray per hover frame is not affordable on integrated
 * graphics; the tree makes it cheap.
 *
 * Two properties the rest of the pick path depends on:
 *
 * 1. **Built once, when the model mounts — never per frame.** `buildPickIndex` walks the meshes over
 *    successive animation frames so a long build cannot block a single frame, then reports ready. The
 *    geometry is shared by the model's clones, so a rebuild on a remount finds the tree already there
 *    and only re-arms the mesh's raycast.
 * 2. **The raycast goes through the tree, not around it.** `acceleratedRaycast` reads
 *    `geometry.boundsTree` and falls back to three's own `Mesh.raycast` when it is absent. Arming a
 *    mesh therefore only happens after its tree exists — a mesh with no tree is never in the path the
 *    pick controller tests, because the controller waits for `setPickIndexReady(true)`.
 */

/** Builds one mesh's tree (once per geometry) and routes its raycast through it. */
export function armPickMesh(mesh: Mesh): void {
  if (!mesh.geometry.boundsTree) {
    // `new MeshBVH` is what the prototype helper `geometry.computeBoundsTree()` does underneath; using
    // the class directly avoids patching `BufferGeometry.prototype` for the whole process.
    mesh.geometry.boundsTree = new MeshBVH(mesh.geometry);
  }

  mesh.raycast = acceleratedRaycast;
}

/** `requestAnimationFrame` in the browser, a macrotask in a test/headless context. */
function nextFrame(callback: () => void): number {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback);
  }

  return setTimeout(callback, 0) as unknown as number;
}

function cancelFrame(handle: number): void {
  if (typeof requestAnimationFrame === 'function') {
    cancelAnimationFrame(handle);
    return;
  }

  clearTimeout(handle);
}

/**
 * Arms every mesh's raycast and builds a BVH per geometry, at most one geometry per frame.
 *
 * Returns a cancel function; a cancelled build never reports ready. `onReady` runs on the frame after
 * the last geometry is built, so a caller can flip the pick index armed exactly once.
 */
export function buildPickIndex(meshes: readonly Mesh[], onReady: () => void): () => void {
  let cancelled = false;
  let index = 0;
  let handle = 0;

  const step = (): void => {
    if (cancelled) {
      return;
    }

    if (index >= meshes.length) {
      onReady();
      return;
    }

    armPickMesh(meshes[index]!);
    index += 1;
    handle = nextFrame(step);
  };

  handle = nextFrame(step);

  return () => {
    cancelled = true;
    cancelFrame(handle);
  };
}
