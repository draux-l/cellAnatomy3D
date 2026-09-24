import alea from 'alea';
import { createNoise3D } from 'simplex-noise';
import { MATERIAL_KEY_NAMES, type MaterialKeyName } from '../../catalog/types';
import {
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
} from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Shared geometry primitives (task 3.1).
 *
 * Every organelle builder is driven by the same parameter convention so the same
 * record always produces the same geometry (spec: Deterministic Scene Reconstruction):
 * the seed is identity, not decoration.
 *
 * Three families live here:
 *
 * 1. **Determinism** — seeded simplex noise, rejection sampling and a position hash, so a
 *    build is reproducible in Node with no WebGL context and therefore unit-testable.
 * 2. **Assembly** — `MeshSurfaceSampler` for surface-bound scattering (pores, vesicles) and
 *    `mergeGeometries` for collapsing a stack of static parts into one draw call.
 * 3. **The part model** — one geometry is one draw call, and a repeated structure is an
 *    `InstancedMesh` part, which is also one draw call. The `InstancedMesh` gate (skill:
 *    repeat more than ~20 times) is encoded here as a data shape, not as a convention.
 */

/** The minimum parameter set every organelle builder accepts. */
export interface OrganelleParams {
  /** Overall scale, in scene units. */
  size: number;
  /** Subdivision level, scaled by each builder. */
  detail: number;
  /** Repetition count for structures that repeat. */
  count: number;
  /** Deterministic seed for every pseudo-random placement or displacement. */
  seed: string;
}

export const ORGANELLE_PARAM_DEFAULTS: OrganelleParams = {
  size: 1,
  detail: 1,
  count: 0,
  seed: 'cellanatomy3d/v1',
};

export function resolveOrganelleParams(
  overrides: Record<string, number | string | boolean> = {},
): OrganelleParams & Record<string, number | string | boolean> {
  return { ...ORGANELLE_PARAM_DEFAULTS, ...overrides };
}

/** A pseudo-random source whose sequence is fully determined by its seed. */
export interface SeededNoise {
  readonly seed: string;
  /** 3D simplex noise in roughly [-1, 1]. */
  noise3D(x: number, y: number, z: number): number;
  /** Seeded uniform float in [0, 1). */
  random(): number;
}

/**
 * Material roles a builder — or a mesh manifest entry — may ask the host for.
 *
 * The vocabulary now lives in the three-free catalog (`catalog/types.ts`) because a mesh reference
 * names a key and `src/catalog/` may not import three.js (design D21, task 11.1). It is re-exported
 * here so every existing `import { OrganelleMaterialKey } from './builders/primitives'` keeps
 * working, and `src/scene/materials.ts` remains the one place a key becomes a material.
 *
 * The record carries a `paletteRole`, never a colour; the builder cannot see the record, so it
 * names the *surface* it produced and `src/scene/materials.ts` resolves it. Several keys map to
 * one palette role until `catalog/palettes.ts` (task 8.1) becomes the colour source of truth;
 * the split exists because a nucleolus must stay distinguishable from the envelope that hides
 * it, and one merged role could not express that.
 */
type OrganelleMaterialKey = MaterialKeyName;

export type { OrganelleMaterialKey };
export { MATERIAL_KEY_NAMES as ORGANELLE_MATERIAL_KEYS };


/** One geometry, one draw call. */
export interface MeshPart {
  kind: 'mesh';
  /** Stable name, unique inside a build. Used for test output and the perf report. */
  name: string;
  materialKey: OrganelleMaterialKey;
  geometry: BufferGeometry;
}

/**
 * N copies of one geometry, one draw call (the skill's `InstancedMesh` gate).
 *
 * `matrices` is the raw 16-float-per-instance buffer in the column-major layout
 * `Matrix4.fromArray`/`toArray` use, so the host can hand it straight to `setMatrixAt`
 * without re-deriving anything.
 */
export interface InstancedPart {
  kind: 'instanced';
  name: string;
  materialKey: OrganelleMaterialKey;
  geometry: BufferGeometry;
  instanceCount: number;
  matrices: Float32Array;
}

export type OrganellePart = MeshPart | InstancedPart;

export interface OrganelleBuild {
  parts: OrganellePart[];
  /** Triangles summed over every part, counting each instance, for the ≤25k per-organelle budget. */
  triangles: number;
  /** One draw call per part, for the ≤150 per-cell budget. */
  drawCalls: number;
  /** The parameters actually used, so the skill's output contract can be reported. */
  params: Record<string, number | string | boolean>;
  /** The deterministic identity of this build. */
  seed: string;
  dispose: () => void;
}

export function createSeededNoise(seed: string): SeededNoise {
  const random = alea(seed);
  const noise3D = createNoise3D(random);

  return {
    seed,
    noise3D,
    random,
  };
}

/**
 * FNV-1a over a float array. Used to assert that two builds from the same seed are
 * byte-identical geometry, not merely the same size.
 */
export function hashFloats(values: ArrayLike<number>): string {
  let hash = 0x811c9dc5;

  for (let i = 0; i < values.length; i += 1) {
    // Quantise before hashing so the hash survives float formatting and is not
    // sensitive to the last bit of a transcendental result.
    const quantised = Math.round((values[i] ?? 0) * 1e5);
    hash ^= quantised & 0xffffffff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

export function hashGeometryPositions(geometry: BufferGeometry): string {
  const attribute = geometry.getAttribute('position');

  if (!(attribute instanceof BufferAttribute)) {
    throw new Error('hashGeometryPositions requires a geometry with a position attribute');
  }

  return `${attribute.count}:${hashFloats(attribute.array)}`;
}

/** The identity of a whole part — geometry, and every instance transform when it has them. */
export function hashPart(part: OrganellePart): string {
  const geometry = hashGeometryPositions(part.geometry);

  return part.kind === 'instanced'
    ? `${part.name}:${part.instanceCount}:${geometry}:${hashFloats(part.matrices)}`
    : `${part.name}:${geometry}`;
}

/** Triangles in one geometry, indexed or not. */
export function countTriangles(geometry: BufferGeometry): number {
  const index = geometry.getIndex();

  if (index) {
    return Math.floor(index.count / 3);
  }

  const position = geometry.getAttribute('position');

  return position ? Math.floor(position.count / 3) : 0;
}

/** Triangles a part contributes to the scene: geometry × instances. */
export function countPartTriangles(part: OrganellePart): number {
  const geometry = countTriangles(part.geometry);

  return part.kind === 'instanced' ? geometry * part.instanceCount : geometry;
}

export interface MeshPartOptions {
  name: string;
  materialKey: OrganelleMaterialKey;
  geometry: BufferGeometry;
}

export function meshPart(options: MeshPartOptions): MeshPart {
  return { kind: 'mesh', ...options };
}

export interface InstancedPartOptions {
  name: string;
  materialKey: OrganelleMaterialKey;
  geometry: BufferGeometry;
  matrices: Float32Array;
  instanceCount: number;
}

export function instancedPart(options: InstancedPartOptions): InstancedPart {
  return { kind: 'instanced', ...options };
}

/** Writes one `Matrix4` into an instance buffer at `index`. */
export function writeInstanceMatrix(
  matrices: Float32Array,
  index: number,
  matrix: Matrix4,
): void {
  matrix.toArray(matrices, index * 16);
}

const COMPOSE_SCALE = new Vector3();
const COMPOSE_QUATERNION = new Quaternion();

/**
 * Builds an instance buffer from positions, a uniform scale and a seeded rotation per instance.
 *
 * Rotating each instance is what keeps a scattered set from reading as a stamped repeat, and
 * the scale jitter is what keeps a cytosolic cloud from reading as a lattice. Both come from
 * the seeded generator, so the layout is identical on every load.
 */
export function buildInstanceMatrices(
  noise: SeededNoise,
  positions: readonly Vector3[],
  options: { scale?: number; scaleJitter?: number; orient?: boolean } = {},
): Float32Array {
  const { scale = 1, scaleJitter = 0, orient = true } = options;
  const matrices = new Float32Array(positions.length * 16);
  const matrix = new Matrix4();

  positions.forEach((position, index) => {
    const jitter = scaleJitter > 0 ? 1 - scaleJitter + noise.random() * scaleJitter * 2 : 1;
    COMPOSE_SCALE.setScalar(scale * jitter);

    if (orient) {
      // A uniform in [0,1) mapped onto the sphere gives a deterministic, evenly spread tilt.
      const u = noise.random() * 2 - 1;
      const theta = noise.random() * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - u * u));

      COMPOSE_QUATERNION.set(r * Math.cos(theta), r * Math.sin(theta), u, 0).normalize();
    } else {
      COMPOSE_QUATERNION.identity();
    }

    matrix.compose(position, COMPOSE_QUATERNION, COMPOSE_SCALE);
    writeInstanceMatrix(matrices, index, matrix);
  });

  return matrices;
}

export interface SurfaceSample {
  position: Vector3;
  normal: Vector3;
}

/**
 * The parts of `MeshSurfaceSampler` this project uses.
 *
 * `@types/three@0.186` is missing `setRandomGenerator`, which three 0.186 does implement
 * (`examples/jsm/math/MeshSurfaceSampler.js`). Without it, sampling would fall back to
 * `Math.random()` and a seeded build would stop being reproducible, so the method is named here
 * and the one cast below is the smallest honest way to keep determinism typed.
 */
interface DeterministicSurfaceSampler {
  setRandomGenerator(randomFunction: () => number): DeterministicSurfaceSampler;
  build(): DeterministicSurfaceSampler;
  sample(targetPosition: Vector3, targetNormal?: Vector3): void;
}

/**
 * Samples `count` points on a geometry's surface, with correct outward normals.
 *
 * This is the skill's scattering mechanism for surface-bound structures — nuclear pores and
 * budding vesicles — so a part sits *on* the mesh the builder produced rather than near it.
 * The sampler's RNG is replaced with the seeded one, so two builds from one seed sample the
 * same points.
 */
export function sampleSurfacePoints(
  geometry: BufferGeometry,
  count: number,
  noise: SeededNoise,
): SurfaceSample[] {
  const sampler = new MeshSurfaceSampler(new Mesh(geometry)) as unknown as DeterministicSurfaceSampler;

  sampler.setRandomGenerator(noise.random).build();

  const samples: SurfaceSample[] = [];

  for (let i = 0; i < count; i += 1) {
    const position = new Vector3();
    const normal = new Vector3();

    sampler.sample(position, normal);
    samples.push({ position, normal });
  }

  return samples;
}

/**
 * Seeded rejection sampling inside a sphere.
 *
 * Cytosolic structures are scattered through a volume, not over a surface (skill: placement
 * and scattering). `Math.random()` is not an option — the same record must look identical in
 * animal view, plant view, comparison mode and inside any animation.
 */
export function samplePointsInSphere(
  noise: SeededNoise,
  count: number,
  radius: number,
): Vector3[] {
  const points: Vector3[] = [];
  // A rejection loop that cannot terminate would hang a build, so it has a hard budget.
  const attempts = count * 250 + 500;
  let taken = 0;

  while (points.length < count && taken < attempts) {
    taken += 1;

    const x = noise.random() * 2 - 1;
    const y = noise.random() * 2 - 1;
    const z = noise.random() * 2 - 1;

    if (x * x + y * y + z * z <= 1) {
      points.push(new Vector3(x * radius, y * radius, z * radius));
    }
  }

  if (points.length < count) {
    throw new Error(
      `samplePointsInSphere could not place ${count} points after ${attempts} attempts`,
    );
  }

  return points;
}

/**
 * Merges static geometry into one buffer so a stack of parts becomes one draw call.
 *
 * The skill's second-highest-leverage optimization after instancing: cisternae, ER layers and
 * other structures that never move independently should not each cost a call. Merged
 * geometries must agree on their attribute sets, so a mismatch is a loud error instead of a
 * silently missing surface.
 */
export function mergeGeometryList(geometries: BufferGeometry[]): BufferGeometry {
  if (geometries.length === 0) {
    throw new Error('mergeGeometryList requires at least one geometry');
  }

  if (geometries.length === 1) {
    return geometries[0]!;
  }

  const merged = mergeGeometries(geometries, false);

  if (!merged) {
    throw new Error(
      `mergeGeometryList could not merge ${geometries.length} geometries — their attributes are incompatible`,
    );
  }

  return merged;
}

export interface DisplaceOptions {
  /** Peak displacement along the vertex normal, in the geometry's own units. */
  amplitude: number;
  /** Noise sampling frequency. Higher values read as finer surface detail. */
  frequency?: number;
  /** Offsets the noise field so two displaced shells do not share bumps. */
  offset?: number;
}

/**
 * Welds duplicated vertices so a polyhedron gains **shared, smooth normals**.
 *
 * `IcosahedronGeometry` is non-indexed: every face carries its own copies of its corners, so
 * `computeVertexNormals` produces per-face normals. Displacing along those normals is not a
 * displacement at all — each copy of a shared corner moves a different way and the surface opens
 * along every edge. That is why an unmerged icosahedron renders as a faceted crystal instead of a
 * slightly irregular sphere.
 *
 * **The UV attribute is dropped first, and that is not optional.** `mergeVertices` only welds
 * vertices whose *every* attribute matches, and a polyhedron's per-face UVs differ at shared
 * positions, so welding with UVs present silently leaves the surface torn — 183 vertices where a
 * closed detail-3 icosahedron has 162, with 44 boundary edges. Displacing that tears visible
 * cracks into the render. These bodies are untextured, so the UVs carry nothing worth keeping;
 * `countBoundaryEdges` exists so a test can prove the shell came out closed.
 *
 * **The normal attribute is dropped for exactly the same reason, and it was missed for a long
 * time.** `mergeVertices` hashes every attribute, normals included, and a *non-indexed* geometry
 * from `ExtrudeGeometry` carries one normal **per face**: two copies of a shared corner hold
 * different normals, so the weld refuses every one of them. The failure is silent and it looks like
 * a shading artefact rather than a topology one — the wall welded to 2,016 vertices where a closed
 * 960-triangle shell needs about 482, so its corner arcs stayed a mosaic of flat facets and its
 * flat annulus caps shaded triangle by triangle. Both attributes are recomputed or unused
 * downstream (`computeVertexNormals` below), so dropping them changes nothing but the weld's
 * ability to succeed.
 *
 * The input is left untouched; the caller owns it.
 */
export function smoothGeometry(geometry: BufferGeometry, tolerance = 1e-6): BufferGeometry {
  if (geometry.getAttribute('uv')) {
    geometry.deleteAttribute('uv');
  }

  if (geometry.getAttribute('normal')) {
    geometry.deleteAttribute('normal');
  }

  const welded = mergeVertices(geometry, tolerance);

  welded.computeVertexNormals();

  return welded;
}

/**
 * Edges used by fewer than two triangles, and edges used by more than two.
 *
 * A closed shell has zero of both. This is the measurable form of the skill's "one closed shell"
 * rule: it is what tells a welded polyhedron apart from a torn one, and a torn shell is exactly
 * what turns a noise displacement into visible cracks.
 */
export function countBoundaryEdges(geometry: BufferGeometry): {
  boundary: number;
  nonManifold: number;
} {
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  const count = index ? index.count : position.count;
  const uses = new Map<string, number>();

  for (let triangle = 0; triangle < count; triangle += 3) {
    const corners = [0, 1, 2].map((offset) =>
      index ? index.getX(triangle + offset) : triangle + offset,
    );

    for (let edge = 0; edge < 3; edge += 1) {
      const a = corners[edge]!;
      const b = corners[(edge + 1) % 3]!;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;

      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
  }

  let boundary = 0;
  let nonManifold = 0;

  for (const useCount of uses.values()) {
    if (useCount === 1) {
      boundary += 1;
    } else if (useCount > 2) {
      nonManifold += 1;
    }
  }

  return { boundary, nonManifold };
}

/**
 * Boundary edges of a surface, keyed by vertex **position** rather than by vertex index.
 *
 * `countBoundaryEdges` is the right tool for "did the weld succeed?" — it is deliberately
 * index-keyed, so a vertex that survived duplication is reported as a tear. But index-keying
 * answers a different question than "is this surface closed?": a `SphereGeometry` duplicates its
 * wrap column and its poles, so the index-keyed count reports 356 boundary edges for a surface that
 * is geometrically sealed.
 *
 * This is the "is it closed?" measurement. Two vertices are the same vertex when they quantise to
 * the same position, so a UV seam unifies and only a genuine hole remains. It is what lets a
 * builder decision that depends on closure — "this shell never needs its back faces" — be an
 * asserted invariant instead of a comment.
 */
export function countSurfaceBoundaryEdges(geometry: BufferGeometry, tolerance = 1e-4): number {
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');

  if (!(position instanceof BufferAttribute)) {
    throw new Error('countSurfaceBoundaryEdges requires a geometry with a position attribute');
  }

  const keyOf = (vertex: number): string => {
    const quantise = (value: number): number => Math.round(value / tolerance);

    return `${quantise(position.getX(vertex))},${quantise(position.getY(vertex))},${quantise(position.getZ(vertex))}`;
  };

  const count = index ? index.count : position.count;
  const uses = new Map<string, number>();

  for (let triangle = 0; triangle < count; triangle += 3) {
    const corners = [0, 1, 2].map((offset) =>
      index ? index.getX(triangle + offset) : triangle + offset,
    );

    for (let edge = 0; edge < 3; edge += 1) {
      const a = keyOf(corners[edge]!);
      const b = keyOf(corners[(edge + 1) % 3]!);
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;

      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
  }

  let boundary = 0;

  for (const useCount of uses.values()) {
    if (useCount === 1) {
      boundary += 1;
    }
  }

  return boundary;
}

/**
 * Displaces every vertex along its own normal using seeded 3D noise.
 *
 * This is the membrane/nucleolus surface treatment from the skill's technique table:
 * a closed shell stays honest, the noise only breaks the perfect sphere.
 */
export function displaceAlongNormals(
  geometry: BufferGeometry,
  noise: SeededNoise,
  options: DisplaceOptions,
): BufferGeometry {
  const { amplitude, frequency = 1, offset = 0 } = options;
  const position = geometry.getAttribute('position');

  if (!(position instanceof BufferAttribute)) {
    throw new Error('displaceAlongNormals requires a geometry with a position attribute');
  }

  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals();
  }

  const normal = geometry.getAttribute('normal');

  if (!(normal instanceof BufferAttribute)) {
    throw new Error('displaceAlongNormals could not obtain vertex normals');
  }

  const vertex = new Vector3();

  for (let i = 0; i < position.count; i += 1) {
    vertex.set(position.getX(i), position.getY(i), position.getZ(i));

    const sample = noise.noise3D(
      vertex.x * frequency + offset,
      vertex.y * frequency + offset,
      vertex.z * frequency + offset,
    );

    position.setXYZ(
      i,
      vertex.x + normal.getX(i) * sample * amplitude,
      vertex.y + normal.getY(i) * sample * amplitude,
      vertex.z + normal.getZ(i) * sample * amplitude,
    );
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
}

/** Assembles the standard build envelope so every builder reports its cost the same way. */
export function createBuild(
  parts: OrganellePart[],
  params: Record<string, number | string | boolean>,
  seed: string,
): OrganelleBuild {
  const triangles = parts.reduce((total, part) => total + countPartTriangles(part), 0);

  return {
    parts,
    triangles,
    drawCalls: parts.length,
    params,
    seed,
    dispose: () => {
      for (const part of parts) {
        part.geometry.dispose();
      }
    },
  };
}
