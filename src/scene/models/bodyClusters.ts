import type { BufferGeometry } from 'three';
import type { Bounds3 } from '../../catalog/bounds';

/**
 * Splitting one model node into the anatomical parts it actually contains.
 *
 * ## The problem this solves
 *
 * The identification map turns a **node** into a record. That works while a node is one anatomical
 * part, and this model has one that is not: `Nulo__Material.025_0` draws the lysosomes **and** the
 * centrioles in a single mesh, so the app calls the centrioles "Lisosomas" and no amount of data
 * editing can separate them.
 *
 * ## What "a part" means here, and how it was decided
 *
 * Two steps, and the first one is not obvious:
 *
 * 1. **Weld by position.** `GLTFLoader` hands back a surface cut apart for shading, so neighbouring
 *    triangles carry their own copies of the vertices they share and share no vertex *index*.
 *    Connectivity over the raw buffer therefore reports every triangle as its own body — measured:
 *    675 "bodies" in this mesh. Merging by position first is what makes "body" mean a blob a person
 *    could pick up; the count then drops to 56, which is the number the parts actually have.
 *
 *    three's own `mergeVertices` is **not** usable here: it compares every attribute, so vertices
 *    split by normal never merge and the weld silently does nothing (measured: the nucleolus mesh
 *    reported the *same* 13,256 bodies before and after, which is the signature of a no-op).
 *
 * 2. **Cluster the bodies by proximity**, because an anatomical part is not always one body either.
 *    Each centriole measures as ~27 bodies: a rod whose surface the exporter sliced into patches.
 *    Grouping bodies whose centres sit within a radius puts each rod back together.
 *
 * The radius was read off the measurement rather than guessed, and it has a wide plateau: anywhere
 * from 0.05 to 0.08 scene units gives the same four groups, which is the signature of a real
 * separation rather than of a tuned threshold. That measurement lives in `artifacts/tmp/clusters.mjs`.
 */

/** One anatomical group of bodies, as a set of triangles over the source geometry's own attributes. */
export interface BodySplit {
  /** Triangle indices into the source geometry. A fresh array; **no vertex data is copied**. */
  index: Uint32Array;
  /** How many separate bodies this group merged. */
  bodies: number;
  /** True triangle count. */
  triangles: number;
  /** The group's box, in the geometry's own units. */
  bounds: Bounds3;
}

/** One body: the triangles connected to each other and to nothing else. */
interface Body {
  /** The original vertex ids of every triangle corner, three per triangle. */
  vertices: Int32Array;
  triangles: number;
  centre: [number, number, number];
}

/**
 * Labels every vertex of a geometry with the body it belongs to.
 *
 * The weld is by **position alone**. That is what a person means by "the same point", and it is the
 * only thing that survives an exporter cutting a surface apart for shading.
 */
function labelsByBody(geometry: BufferGeometry, tolerance: number): Int32Array | null {
  const position = geometry.getAttribute('position');

  if (!position || position.count <= 0) {
    return null;
  }

  const count = position.count;
  const parent = new Int32Array(count);

  for (let index = 0; index < count; index += 1) {
    parent[index] = index;
  }

  const find = (start: number): number => {
    let root = start;

    while (parent[root] !== root) {
      root = parent[root]!;
    }

    // Path compression, so the pass over a big mesh stays near-linear.
    let node = start;

    while (parent[node] !== root) {
      const next = parent[node]!;

      parent[node] = root;
      node = next;
    }

    return root;
  };

  const union = (a: number, b: number): void => {
    const rootA = find(a);
    const rootB = find(b);

    if (rootA !== rootB) {
      parent[rootA] = rootB;
    }
  };

  const firstAt = new Map<string, number>();

  for (let vertex = 0; vertex < count; vertex += 1) {
    const key = `${Math.round(position.getX(vertex) / tolerance)},${Math.round(position.getY(vertex) / tolerance)},${Math.round(position.getZ(vertex) / tolerance)}`;
    const previous = firstAt.get(key);

    if (previous === undefined) {
      firstAt.set(key, vertex);
    } else {
      union(previous, vertex);
    }
  }

  const index = geometry.getIndex();

  if (index && index.count >= 3) {
    for (let cursor = 0; cursor + 2 < index.count; cursor += 3) {
      const a = index.getX(cursor);

      union(a, index.getX(cursor + 1));
      union(a, index.getX(cursor + 2));
    }
  } else {
    for (let cursor = 0; cursor + 2 < count; cursor += 3) {
      union(cursor, cursor + 1);
      union(cursor, cursor + 2);
    }
  }

  const labels = new Int32Array(count);

  for (let vertex = 0; vertex < count; vertex += 1) {
    labels[vertex] = find(vertex);
  }

  return labels;
}

/** Every body in a geometry, with the triangles it owns and a centre to cluster it by. */
function bodiesOf(geometry: BufferGeometry, tolerance: number): Body[] {
  const position = geometry.getAttribute('position');
  const labels = labelsByBody(geometry, tolerance);

  if (!position || !labels) {
    return [];
  }

  const index = geometry.getIndex();
  const indexAt = (cursor: number): number => (index ? index.getX(cursor) : cursor);
  const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(position.count / 3);
  const trianglesByLabel = new Map<number, number[]>();

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const label = labels[indexAt(triangle * 3)]!;
    const list = trianglesByLabel.get(label);

    if (list) {
      list.push(triangle);
    } else {
      trianglesByLabel.set(label, [triangle]);
    }
  }

  const bodies: Body[] = [];

  for (const triangles of trianglesByLabel.values()) {
    const corners: number[] = [];
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

    for (const triangle of triangles) {
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = indexAt(triangle * 3 + corner);

        corners.push(vertex);

        const x = position.getX(vertex);
        const y = position.getY(vertex);
        const z = position.getZ(vertex);

        min[0] = Math.min(min[0], x);
        min[1] = Math.min(min[1], y);
        min[2] = Math.min(min[2], z);
        max[0] = Math.max(max[0], x);
        max[1] = Math.max(max[1], y);
        max[2] = Math.max(max[2], z);
      }
    }

    bodies.push({
      vertices: Int32Array.from(corners),
      triangles: triangles.length,
      centre: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    });
  }

  return bodies;
}

/**
 * Splits one geometry into anatomical groups, **biggest group first**.
 *
 * The order is part of the contract: a split declaration names its records by position, so "the first
 * group" has to mean the same thing every time. Ordering by body count is deterministic and, for this
 * model, is also the meaningful order — the two rods come out ahead of the two single vesicles.
 */
export function splitByBodies(geometry: BufferGeometry, radius: number): BodySplit[] {
  const position = geometry.getAttribute('position');
  const bodies = bodiesOf(geometry, Math.max(1e-6, radius / 100));

  if (!position || bodies.length === 0) {
    return [];
  }

  const parent = new Int32Array(bodies.length);

  for (let index = 0; index < bodies.length; index += 1) {
    parent[index] = index;
  }

  const find = (start: number): number => {
    let root = start;

    while (parent[root] !== root) {
      root = parent[root]!;
    }

    return root;
  };

  const radiusSquared = radius * radius;

  for (let a = 0; a < bodies.length; a += 1) {
    for (let b = a + 1; b < bodies.length; b += 1) {
      const [ax, ay, az] = bodies[a]!.centre;
      const [bx, by, bz] = bodies[b]!.centre;
      const dx = ax - bx;
      const dy = ay - by;
      const dz = az - bz;

      if (dx * dx + dy * dy + dz * dz <= radiusSquared) {
        parent[find(a)] = find(b);
      }
    }
  }

  const membersByRoot = new Map<number, number[]>();

  for (let index = 0; index < bodies.length; index += 1) {
    const root = find(index);
    const members = membersByRoot.get(root);

    if (members) {
      members.push(index);
    } else {
      membersByRoot.set(root, [index]);
    }
  }

  const anchorOf = (members: number[]): [number, number, number] =>
    members
      .map((index) => bodies[index]!.centre)
      .reduce((best, centre) => {
        if (centre[0] !== best[0]) {
          return centre[0] < best[0] ? centre : best;
        }

        if (centre[1] !== best[1]) {
          return centre[1] < best[1] ? centre : best;
        }

        return centre[2] < best[2] ? centre : best;
      });

  return [...membersByRoot.values()]
    /*
     * Biggest first, and the tie-break is not decoration: a declaration names its records by position,
     * so two groups of equal size must still come out in a fixed order. The tie is broken by where the
     * group sits, which is spatial, deterministic and needs no measurement.
     */
    .sort((a, b) => {
      if (b.length !== a.length) {
        return b.length - a.length;
      }

      const [ax, ay, az] = anchorOf(a);
      const [bx, by, bz] = anchorOf(b);

      return ax - bx || ay - by || az - bz;
    })
    .map((members) => {
      const corners: number[] = [];
      const bounds: Bounds3 = {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
      };
      let triangles = 0;

      for (const index of members) {
        const body = bodies[index]!;

        triangles += body.triangles;

        for (const vertex of body.vertices) {
          corners.push(vertex);

          const x = position.getX(vertex);
          const y = position.getY(vertex);
          const z = position.getZ(vertex);

          bounds.min[0] = Math.min(bounds.min[0], x);
          bounds.min[1] = Math.min(bounds.min[1], y);
          bounds.min[2] = Math.min(bounds.min[2], z);
          bounds.max[0] = Math.max(bounds.max[0], x);
          bounds.max[1] = Math.max(bounds.max[1], y);
          bounds.max[2] = Math.max(bounds.max[2], z);
        }
      }

      return {
        index: Uint32Array.from(corners),
        bodies: members.length,
        triangles,
        bounds,
      };
    });
}
