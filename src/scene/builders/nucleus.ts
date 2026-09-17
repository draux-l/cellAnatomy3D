import {
  IcosahedronGeometry,
  LatheGeometry,
  Matrix4,
  Quaternion,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
} from 'three';
import {
  createBuild,
  createSeededNoise,
  displaceAlongNormals,
  instancedPart,
  meshPart,
  ORGANELLE_PARAM_DEFAULTS,
  sampleSurfacePoints,
  smoothGeometry,
  writeInstanceMatrix,
  type OrganelleBuild,
  type OrganelleParams,
  type OrganellePart,
} from './primitives';

/**
 * Nucleus.
 *
 * Skill technique verbatim: `LatheGeometry` for the envelope, a noise-displaced
 * `IcosahedronGeometry` for the nucleolus, and `TorusGeometry` in an `InstancedMesh` for the
 * pores — three separable layers, because click-to-isolate needs them separate.
 *
 * Anatomy from the reference: a large body with a **clearly differentiated, well-separated
 * nucleolus** inside. The nucleolus is therefore a distinctly coloured opaque body at 42% of the
 * envelope radius, offset 0.43 of the radius off-centre, sitting behind a translucent envelope.
 * It is not a subtle bump — the whole point of the layer is that it is unmistakable.
 *
 * Draw calls: envelope 1, nucleolus 1, all pores 1.
 */

export interface NucleusParams extends OrganelleParams {
  /** Number of nuclear pores, placed on the envelope's actual surface. */
  poreCount: number;
}

export const NUCLEUS_PARAMS: NucleusParams = {
  ...ORGANELLE_PARAM_DEFAULTS,
  size: 0.8,
  count: 0,
  seed: 'nucleus/v1',
  poreCount: 48,
};

/** Nucleolus radius, as a fraction of the envelope radius. */
export const NUCLEUS_NUCLEOLUS_RADIUS_RATIO = 0.42;
/** Nucleolus centre offset from the nucleus centre, as a fraction of the envelope radius. */
export const NUCLEUS_NUCLEOLUS_OFFSET_RATIO = 0.43;
/** Pore ring radius and tube radius, as fractions of the envelope radius. */
export const NUCLEUS_PORE_RADIUS_RATIO = 0.085;
export const NUCLEUS_PORE_TUBE_RATIO = 0.022;
/** Envelope lobes: a perfectly round nucleus reads as a marble, so the profile breathes. */
export const NUCLEUS_PROFILE_WOBBLE = 0.045;

/**
 * The envelope's revolved profile: a full meridian from south pole to north pole with a gentle
 * seeded waver, so the body reads as a membrane rather than a mathematical sphere.
 */
export function nucleusProfile(radius: number, segments: number, seed: string): Vector2[] {
  const noise = createSeededNoise(`${seed}/envelope`);
  const steps = Math.max(8, Math.round(segments));
  const points: Vector2[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const angle = -Math.PI / 2 + (i / steps) * Math.PI;
    const waver = 1 + NUCLEUS_PROFILE_WOBBLE * noise.noise3D(0, i * 0.23, 0.5);

    points.push(
      new Vector2(Math.max(0, Math.cos(angle) * radius * waver), Math.sin(angle) * radius * waver),
    );
  }

  return points;
}

/** The offset nucleolus centre, in the nucleus's own frame. */
export function nucleolusOffset(radius: number): Vector3 {
  return new Vector3(0.62, 0.42, -0.66)
    .normalize()
    .multiplyScalar(radius * NUCLEUS_NUCLEOLUS_OFFSET_RATIO);
}

export function buildNucleus(
  overrides: Record<string, number | string | boolean> = {},
): OrganelleBuild {
  const params: NucleusParams = {
    ...NUCLEUS_PARAMS,
    ...(overrides as Partial<NucleusParams>),
  };
  const { size, detail, seed } = params;
  const poreCount = Math.max(0, Math.round(params.poreCount));
  const radius = size;

  const profileSegments = Math.max(12, Math.round(24 * detail));
  const radialSegments = Math.max(16, Math.round(48 * detail));

  const parts: OrganellePart[] = [];

  const envelope: BufferGeometry = new LatheGeometry(
    nucleusProfile(radius, profileSegments, seed),
    radialSegments,
  );

  envelope.computeVertexNormals();
  parts.push(
    meshPart({ name: 'nuclear-envelope', materialKey: 'nuclearEnvelope', geometry: envelope }),
  );

  const nucleolus = smoothGeometry(
    new IcosahedronGeometry(
      radius * NUCLEUS_NUCLEOLUS_RADIUS_RATIO,
      Math.max(1, Math.round(2 * detail)),
    ),
  );

  displaceAlongNormals(nucleolus, createSeededNoise(`${seed}/nucleolus`), {
    amplitude: radius * 0.09,
    frequency: 3.2 / radius,
  });

  const offset = nucleolusOffset(radius);

  nucleolus.translate(offset.x, offset.y, offset.z);
  parts.push(meshPart({ name: 'nucleolus', materialKey: 'nucleolus', geometry: nucleolus }));

  if (poreCount > 0) {
    // Sampled from the displaced envelope, so every pore sits on the surface it belongs to.
    const samples = sampleSurfacePoints(envelope, poreCount, createSeededNoise(`${seed}/pores`));
    const poreGeometry = new TorusGeometry(
      radius * NUCLEUS_PORE_RADIUS_RATIO,
      radius * NUCLEUS_PORE_TUBE_RATIO,
      6,
      10,
    );
    const matrices = new Float32Array(samples.length * 16);
    const quaternion = new Quaternion();
    const matrix = new Matrix4();
    const scale = new Vector3(1, 1, 1);
    const axis = new Vector3(0, 0, 1);
    const normal = new Vector3();
    // A second seeded stream keeps the scale jitter from shifting the sampled positions.
    const jitter = createSeededNoise(`${seed}/pore-scale`);

    samples.forEach((sample, index) => {
      normal.copy(sample.normal).normalize();
      // A torus is built in its own XY plane, so this turns its axis onto the surface normal.
      quaternion.setFromUnitVectors(axis, normal);
      scale.setScalar(0.85 + jitter.random() * 0.3);
      matrix.compose(sample.position, quaternion, scale);
      writeInstanceMatrix(matrices, index, matrix);
    });

    parts.push(
      instancedPart({
        name: 'nuclear-pores',
        materialKey: 'nuclearPore',
        geometry: poreGeometry,
        instanceCount: samples.length,
        matrices,
      }),
    );
  }

  return createBuild(parts, { ...params, poreCount }, seed);
}
