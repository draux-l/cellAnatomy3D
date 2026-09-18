import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  ShaderMaterial,
} from 'three';

/**
 * The shared glow primitive (tasks 5.2/5.3).
 *
 * Both nutrition animations are made of luminous particles, and both need the same three things: a
 * quad that always faces the camera, a size in **world units** so the particle behaves correctly at
 * every camera distance, and a soft radial falloff so the particle reads as light rather than as a
 * disc.
 *
 * The first two inspected passes of respiration both failed on the third point, and the failures are
 * worth recording because they are the reason this module exists:
 *
 * 1. Opaque emissive spheres large enough to see at cell scale covered the cristae they were meant to
 *    be sitting on — the teaching object disappeared behind the marker.
 * 2. The same spheres switched to additive blending without a falloff saturated to flat white: an
 *    icosahedron's facets sum, but with hard edges, so the result is a white ball with a bright rim,
 *    not a glow.
 *
 * A billboarded quad with a `smoothstep` falloff solves both: the particle can be *larger* than a
 * solid marker without occluding anything (additive light does not hide what is behind it), and it
 * still reads as a point of light from the whole-cell view down to the isolated close-up.
 *
 * The two processes drive it differently, and that is the design's split, not an accident:
 * photosynthesis owns a vertex shader that computes the whole flow from `uTime` (continuous,
 * GPU-side), while respiration rewrites a handful of per-particle attributes from its GSAP timeline
 * (scripted, CPU-side, 36 particles).
 */

/** A quad's four corners, in the [-0.5, 0.5] range the vertex shader scales by the particle size. */
export const GLOW_CORNERS = [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5] as const;

/** Two triangles per quad. */
export const GLOW_INDICES = [0, 1, 2, 0, 2, 3] as const;

/**
 * The shared fragment shader: a soft radial falloff with a hot core.
 *
 * `vCorner` is the interpolated corner offset, so `length(vCorner * 2)` runs 0 at the centre to 1 at
 * the edge of the quad. The colour is brightened toward the centre and the alpha follows the square
 * of the falloff, which is what makes the particle read as a light source rather than a flat sprite.
 */
export const GLOW_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vCorner;
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    float distanceFromCentre = length(vCorner * 2.0);

    if (distanceFromCentre > 1.0) {
      discard;
    }

    float falloff = 1.0 - smoothstep(0.0, 1.0, distanceFromCentre);
    vec3 colour = vColor * (0.55 + 0.45 * falloff) + vec3(1.0) * falloff * falloff * 0.5;

    gl_FragColor = vec4(colour, falloff * falloff * vAlpha);
  }
`;

/** The four attributes the shared fragment shader needs. */
export const GLOW_DECLARATIONS = /* glsl */ `
  attribute vec2 aCorner;
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;

  varying vec2 vCorner;
  varying float vAlpha;
  varying vec3 vColor;
`;

/**
 * The vertex shader for a CPU-driven glow field: the particle's position is the vertex position,
 * and everything else is an attribute the owner rewrites when its animation changes.
 */
export const GLOW_VERTEX_SHADER = /* glsl */ `
  ${GLOW_DECLARATIONS}

  void main() {
    vec4 viewCentre = modelViewMatrix * vec4(position, 1.0);
    // Billboarding in view space: the quad always faces the camera and its size is in world units,
    // so nothing has to know the viewport or the pixel ratio.
    viewCentre.xy += aCorner * aSize;

    gl_Position = projectionMatrix * viewCentre;
    vCorner = aCorner;
    vAlpha = aAlpha;
    vColor = aColor;
  }
`;

/** One glow particle, as the CPU writes it. */
export interface GlowSample {
  x: number;
  y: number;
  z: number;
  /** Quad size in world units. */
  size: number;
  /** 0..1 opacity before the falloff. */
  alpha: number;
  r: number;
  g: number;
  b: number;
}

/**
 * The glow material, with the shared look.
 *
 * Both processes build their own vertex shader — one computes its particles from `uTime` on the GPU,
 * the other from attributes on the CPU — but neither gets to choose how a glow field looks. Additive,
 * no depth write, double sided and the shared falloff live here so the two animations cannot drift
 * into two different visual languages.
 */
export function createGlowMaterial(
  vertexShader: string,
  uniforms: Record<string, { value: unknown }> = {},
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader: GLOW_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
}

export interface GlowField {
  geometry: BufferGeometry;
  material: ShaderMaterial;
  /** Rewrites one particle's four vertices. Nothing is uploaded until `flush()` is called. */
  write: (index: number, sample: GlowSample) => void;
  /** Uploads this frame's writes. Call once per frame, never once per particle. */
  flush: () => void;
  dispose: () => void;
}

/**
 * A glow field for `count` CPU-driven particles.
 *
 * `uniforms` lets an owner add its own (photosynthesis's `uTime`), while the shared material
 * settings — additive, no depth write, double sided — live here so the two processes cannot drift
 * into two looks.
 */
export function createGlowField(
  count: number,
  uniforms: Record<string, { value: unknown }> = {},
): GlowField {
  const particles = Math.max(1, count);
  const vertices = particles * 4;
  const geometry = new BufferGeometry();
  const position = new Float32Array(vertices * 3);
  const corners = new Float32Array(vertices * 2);
  const sizes = new Float32Array(vertices);
  const alphas = new Float32Array(vertices);
  const colors = new Float32Array(vertices * 3);
  const indices = new Uint16Array(particles * 6);

  for (let index = 0; index < particles; index += 1) {
    for (let corner = 0; corner < 4; corner += 1) {
      const vertex = index * 4 + corner;

      corners[vertex * 2] = GLOW_CORNERS[corner * 2] ?? 0;
      corners[vertex * 2 + 1] = GLOW_CORNERS[corner * 2 + 1] ?? 0;
    }

    for (let corner = 0; corner < 6; corner += 1) {
      indices[index * 6 + corner] = index * 4 + (GLOW_INDICES[corner] ?? 0);
    }
  }

  const positionAttribute = new BufferAttribute(position, 3);
  const cornerAttribute = new BufferAttribute(corners, 2);
  const sizeAttribute = new BufferAttribute(sizes, 1);
  const alphaAttribute = new BufferAttribute(alphas, 1);
  const colorAttribute = new BufferAttribute(colors, 3);

  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('aCorner', cornerAttribute);
  geometry.setAttribute('aSize', sizeAttribute);
  geometry.setAttribute('aAlpha', alphaAttribute);
  geometry.setAttribute('aColor', colorAttribute);
  geometry.setIndex(new BufferAttribute(indices, 1));

  const material = createGlowMaterial(GLOW_VERTEX_SHADER, uniforms);

  return {
    geometry,
    material,

    write(index, sample) {
      // Loud rather than silent: an out-of-range write would corrupt another particle's vertices,
      // which reads as a stray glow somewhere in the organelle and is very hard to trace back.
      if (index < 0 || index >= particles) {
        throw new Error(`glow particle ${index} is outside this field of ${particles}`);
      }

      for (let corner = 0; corner < 4; corner += 1) {
        const vertex = index * 4 + corner;
        const offset = vertex * 3;

        position[offset] = sample.x;
        position[offset + 1] = sample.y;
        position[offset + 2] = sample.z;
        sizes[vertex] = sample.size;
        alphas[vertex] = sample.alpha;
        colors[offset] = sample.r;
        colors[offset + 1] = sample.g;
        colors[offset + 2] = sample.b;
      }
    },

    flush() {
      positionAttribute.needsUpdate = true;
      sizeAttribute.needsUpdate = true;
      alphaAttribute.needsUpdate = true;
      colorAttribute.needsUpdate = true;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
