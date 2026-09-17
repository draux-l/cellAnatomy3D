import {
  ExtrudeGeometry,
  IcosahedronGeometry,
  Shape,
  type BufferGeometry,
} from 'three';
import {
  buildInstanceMatrices,
  createBuild,
  createSeededNoise,
  instancedPart,
  mergeGeometryList,
  meshPart,
  ORGANELLE_PARAM_DEFAULTS,
  sampleSurfacePoints,
  type OrganelleBuild,
  type OrganelleParams,
  type OrganellePart,
} from './primitives';

/**
 * Golgi apparatus.
 *
 * Skill technique verbatim: stacked flattened `ExtrudeGeometry` arcs, with budding vesicles.
 *
 * **Anatomy note.** The reference shows **undulating stacked ribbons**, not neat flat stacked
 * discs, plus a legible cis → trans progression. Two things carry that here:
 *
 * 1. Every cisterna's ribbon is *wavy*: its half-width is modulated along the arc, so no two
 *    cross-sections match and the stack reads as folded membrane rather than as cut discs.
 * 2. The progression is structural — ribbon width grows and bow tightens from the cis-most to the
 *    trans-most cisterna — and the vesicle cluster sits on the trans face, which is where the
 *    cargo actually leaves.
 *
 * The cisternae never move independently, so they are merged into **one draw call**; the vesicles
 * are an `InstancedMesh`, so the whole organelle is **two draw calls**.
 */

export interface GolgiParams extends OrganelleParams {
  /** Number of stacked cisternae. */
  cisternaeCount: number;
  /** Number of budding vesicles. */
  vesicleCount: number;
}

export const GOLGI_PARAMS: GolgiParams = {
  ...ORGANELLE_PARAM_DEFAULTS,
  size: 0.8,
  detail: 1,
  count: 6,
  cisternaeCount: 6,
  vesicleCount: 14,
  seed: 'golgi/v1',
};

/** Half-angle the cisterna arc spans at the cis face and at the trans face, in radians. */
export const GOLGI_ARC_HALF_ANGLE_CIS = 1.05;
export const GOLGI_ARC_HALF_ANGLE_TRANS = 1.25;
/** Arc radius, as a fraction of `size`. Barely shrinks toward trans; the ribbon does the growing. */
export const GOLGI_ARC_RADIUS_RATIO = 0.6;
export const GOLGI_ARC_RADIUS_TRANS_SPAN = 0.04;
/** Half ribbon width at the cis face, as a fraction of `size`; grows toward trans. */
export const GOLGI_WIDTH_RATIO = 0.09;
export const GOLGI_WIDTH_TRANS_SPAN = 0.09;
/** Ribbon width undulation, as a fraction of the local half width. */
export const GOLGI_WIDTH_WOBBLE = 0.38;
/** Cisterna slab thickness, as a fraction of `size`. */
export const GOLGI_THICKNESS_RATIO = 0.028;
/** Axial pitch between cisternae, as a fraction of `size`. */
export const GOLGI_STACK_PITCH_RATIO = 0.13;
/** Peak twist per cisterna, in radians. */
export const GOLGI_CISTERNA_TWIST = 0.12;

/**
 * One cisterna's cross-section: a wavy arc band lying in the XY plane. Extruded, then rotated
 * so its thickness runs along the stack axis.
 */
export function cisternaShape(
  progression: number,
  size: number,
  samples: number,
  seed: string,
): Shape {
  const noise = createSeededNoise(`${seed}/cisterna-${Math.round(progression * 1000)}`);
  const phase = noise.random() * Math.PI * 2;
  const steps = Math.max(6, Math.round(samples));
  const arcRadius = size * (GOLGI_ARC_RADIUS_RATIO - GOLGI_ARC_RADIUS_TRANS_SPAN * progression);
  const arcHalfAngle =
    GOLGI_ARC_HALF_ANGLE_CIS + (GOLGI_ARC_HALF_ANGLE_TRANS - GOLGI_ARC_HALF_ANGLE_CIS) * progression;
  const halfWidth = size * (GOLGI_WIDTH_RATIO + GOLGI_WIDTH_TRANS_SPAN * progression);
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];

  for (let i = 0; i <= steps; i += 1) {
    const angle = -arcHalfAngle + (i / steps) * 2 * arcHalfAngle;
    const width = halfWidth * (1 + GOLGI_WIDTH_WOBBLE * Math.sin(2.5 * angle + phase));
    const outerRadius = arcRadius + width;
    const innerRadius = Math.max(size * 0.02, arcRadius - width);

    outer.push([outerRadius * Math.sin(angle), -arcRadius + outerRadius * Math.cos(angle)]);
    inner.push([innerRadius * Math.sin(angle), -arcRadius + innerRadius * Math.cos(angle)]);
  }

  const shape = new Shape();

  shape.moveTo(outer[0]![0], outer[0]![1]);

  for (const [x, y] of outer.slice(1)) {
    shape.lineTo(x, y);
  }

  for (const [x, y] of inner.slice().reverse()) {
    shape.lineTo(x, y);
  }

  shape.closePath();

  return shape;
}

/** The stack position of one cisterna, from the cis face (0) to the trans face (count − 1). */
export function cisternaStackOffset(index: number, count: number, size: number): number {
  return (index - (count - 1) / 2) * size * GOLGI_STACK_PITCH_RATIO;
}

export function buildGolgi(
  overrides: Record<string, number | string | boolean> = {},
): OrganelleBuild {
  const params: GolgiParams = {
    ...GOLGI_PARAMS,
    ...(overrides as Partial<GolgiParams>),
  };
  const { size, detail, seed } = params;
  const cisternae = Math.max(1, Math.round(params.cisternaeCount));
  const vesicleCount = Math.max(0, Math.round(params.vesicleCount));
  const shapeSamples = Math.max(8, Math.round(14 * detail));
  const cisternaGeometries: BufferGeometry[] = [];

  for (let index = 0; index < cisternae; index += 1) {
    const progression = cisternae > 1 ? index / (cisternae - 1) : 0;
    const slab = new ExtrudeGeometry(
      cisternaShape(progression, size, shapeSamples, seed),
      {
        depth: size * GOLGI_THICKNESS_RATIO,
        bevelEnabled: false,
        steps: 1,
      },
    );
    const twist = (createSeededNoise(`${seed}/cisterna-${index}/twist`).random() * 2 - 1) *
      GOLGI_CISTERNA_TWIST;

    // Lay the slab into the XZ plane so its thickness runs along the stack axis.
    slab.rotateX(-Math.PI / 2);
    slab.rotateY(twist);
    slab.translate(0, cisternaStackOffset(index, cisternae, size), 0);
    cisternaGeometries.push(slab);
  }

  const transGeometry = cisternaGeometries[cisternae - 1]!;
  const vesicleNoise = createSeededNoise(`${seed}/vesicles`);
  const vesiclePositions =
    vesicleCount > 0
      ? sampleSurfacePoints(transGeometry, vesicleCount, vesicleNoise).map(
          (sample) => sample.position,
        )
      : [];

  const stack = mergeGeometryList(cisternaGeometries);

  for (const geometry of cisternaGeometries) {
    if (geometry !== stack) {
      geometry.dispose();
    }
  }

  const parts: OrganellePart[] = [
    meshPart({ name: 'cisternae', materialKey: 'golgi', geometry: stack }),
  ];

  if (vesiclePositions.length > 0) {
    parts.push(
      instancedPart({
        name: 'golgi-vesicles',
        materialKey: 'vesicle',
        geometry: new IcosahedronGeometry(size * 0.045, Math.max(0, Math.round(detail))),
        instanceCount: vesiclePositions.length,
        matrices: buildInstanceMatrices(vesicleNoise, vesiclePositions, {
          scale: 1,
          scaleJitter: 0.3,
          orient: false,
        }),
      }),
    );
  }

  return createBuild(parts, { ...params, cisternaeCount: cisternae }, seed);
}
