import alea from 'alea';
import { createNoise3D } from 'simplex-noise';
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

/**
 * Shared geometry primitives.
 *
 * Every organelle builder is driven by the same parameter convention so the same
 * record always produces the same geometry (spec: Deterministic Scene Reconstruction):
 * the seed is identity, not decoration.
 *
 * Task 3.1 extends this module with `MeshSurfaceSampler` helpers and geometry-merge
 * utilities. M0 lands the seeded-noise core and the displacement it exists for.
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

/** Material roles a builder may ask the host for. */
export type OrganelleMaterialKey = 'outerMembrane' | 'innerMembrane';

/**
 * One geometry, one draw call.
 *
 * Parts stay separate where a later milestone needs to reach an individual structure —
 * the cristae are animated by the respiration process, so they are not merged.
 */
export interface OrganellePart {
  /** Stable name, unique inside a build. Used for test output and the perf report. */
  name: string;
  materialKey: OrganelleMaterialKey;
  geometry: BufferGeometry;
}

export interface OrganelleBuild {
  parts: OrganellePart[];
  /** Triangles summed over every part, for the ≤25k per-organelle budget. */
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
 * FNV-1a over the raw position floats. Used to assert that two builds from the same
 * seed are byte-identical geometry, not merely the same size.
 */
export function hashGeometryPositions(geometry: BufferGeometry): string {
  const attribute = geometry.getAttribute('position');

  if (!(attribute instanceof BufferAttribute)) {
    throw new Error('hashGeometryPositions requires a geometry with a position attribute');
  }

  const array = attribute.array;
  let hash = 0x811c9dc5;

  for (let i = 0; i < array.length; i += 1) {
    // Quantise before hashing so the hash survives float formatting and is not
    // sensitive to the last bit of a transcendental result.
    const quantised = Math.round((array[i] ?? 0) * 1e5);
    hash ^= quantised & 0xffffffff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return `${attribute.count}:${hash.toString(16).padStart(8, '0')}`;
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
