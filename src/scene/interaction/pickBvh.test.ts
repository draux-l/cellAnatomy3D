import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { armPickMesh, buildPickIndex } from './pickBvh';

/**
 * The exact-geometry picking contract, proved on synthetic triangles.
 *
 * The bug this replaces was **silent**: a bounding box around a mesh whose triangles are scattered
 * across the cell covered its neighbours and won every overlap. The regression test therefore states
 * the property the box could not have — a ray through a **gap** between two far-apart triangles must
 * miss, while a ray through a triangle must hit. A bounding box spanning both would fail the first
 * assertion.
 */

/** Two unit triangles at x ≈ −5 and x ≈ +5, sharing one geometry. */
function scatteredMesh(): Mesh {
  const geometry = new BufferGeometry();

  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      [
        // Left triangle, facing +z.
        -6, -1, 0, -6, 1, 0, -4, 0, 0,
        // Right triangle.
        4, -1, 0, 6, 1, 0, 4, 0, 0,
      ],
      3,
    ),
  );

  const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));

  mesh.updateMatrixWorld(true);

  return mesh;
}

function rayFrom(x: number, y: number): Raycaster {
  const raycaster = new Raycaster();

  raycaster.set(new Vector3(x, y, 5), new Vector3(0, 0, -1));

  return raycaster;
}

describe('armPickMesh', () => {
  it('builds a tree and adds it to the geometry', () => {
    const mesh = scatteredMesh();

    expect(mesh.geometry.boundsTree).toBeUndefined();
    armPickMesh(mesh);

    expect(mesh.geometry.boundsTree).toBeDefined();
    // The geometry is shared by the model's clones: a second arm must not rebuild it.
    const tree = mesh.geometry.boundsTree;
    armPickMesh(mesh);
    expect(mesh.geometry.boundsTree).toBe(tree);
  });

  it('hits a triangle and misses the gap between scattered ones', () => {
    const mesh = scatteredMesh();

    armPickMesh(mesh);

    expect(rayFrom(-5, 0).intersectObject(mesh)).toHaveLength(1);
    // The gap is what a bounding box would have wrongly claimed.
    expect(rayFrom(0, 0).intersectObject(mesh)).toHaveLength(0);
  });

  it('does not hit through an empty region beside the geometry', () => {
    const mesh = scatteredMesh();

    armPickMesh(mesh);

    expect(rayFrom(20, 0).intersectObject(mesh)).toHaveLength(0);
  });
});

describe('buildPickIndex', () => {
  it('arms every mesh and reports ready once', async () => {
    const first = scatteredMesh();
    const second = scatteredMesh();

    const ready = new Promise<void>((resolve) => {
      buildPickIndex([first, second], resolve);
    });

    await ready;

    expect(first.geometry.boundsTree).toBeDefined();
    expect(second.geometry.boundsTree).toBeDefined();
    expect(rayFrom(-5, 0).intersectObject(first)).toHaveLength(1);
  });

  it('never reports ready when cancelled before it finishes', async () => {
    const mesh = scatteredMesh();
    let reported = false;
    const cancel = buildPickIndex([mesh], () => {
      reported = true;
    });

    cancel();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(reported).toBe(false);
  });
});
