import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Matrix3,
  Mesh,
  Object3D,
  Vector3,
} from 'three';
import { createSeededNoise } from '../../scene/builders/primitives';
import { GLOW_CORNERS, GLOW_DECLARATIONS, GLOW_INDICES, createGlowMaterial } from '../glow';
import { processLight } from '../light';
import { findGrana, readInstancePlacements, rootLocalMatrixOf } from '../structure';
import type { EmittedCounts, ProcessContext, ProcessFrame, ProcessInstance } from '../types';
import { NUTRITION_COLORS } from './colors';
import {
  CARRIERS_PER_GRANUM,
  GLUCOSE_PER_CYCLE,
  OXYGEN_PER_CYCLE,
  PHOTOSYNTHESIS_CYCLE_SECONDS,
} from './stages';

/**
 * Photosynthesis, on the grana (task 5.3).
 *
 * **Continuous, not scripted.** Design D5 splits the paradigms by motion type: this process has no
 * phases to scrub, it flows, so it is a `useFrame` step that writes two uniforms — `uTime` and
 * `uLightIntensity` — and the whole animation is a function of those numbers in the vertex shader.
 * There is no per-frame CPU geometry work, no instance-matrix upload, and one draw call for every
 * particle in the organelle (skill: `Cyclosis, molecule flow, light → Shader + instances, GPU-side`).
 *
 * **Where the animation is.** Each granum's centre, stack axis and radius come from the chloroplast
 * builder's own instance buffer, so the carriers orbit real grana and the emitted molecules leave
 * real grana. Nothing here invents a layout: "photosynthesis happens on the grana" is a statement
 * about the geometry the builder produced.
 *
 * **The light term.** `uLightIntensity` drives both the flow's visibility and its rate, and it is the
 * only `uLightIntensity` uniform in the app; every write goes through
 * `processLight.recordUniformWrite`, so the number of writes is measurable. At zero the particles
 * are invisible *and* `uTime` stops, so "the light-dependent animation stops" is true twice over —
 * and the UI says why (spec: `Zero light is honest`).
 *
 * **The mapping from light to rate is linear, and that is a product decision.** A real
 * light-response curve saturates, and drawing one would be a claim this app has no source for. The
 * control's job is to make the rate distinguishable at its two ends, so the rate is proportional to
 * the slider and the spec's "measurably change" is met without inventing biology.
 */

/** A carrier's orbit radius, as a multiple of its granum's outer radius. Just outside the discs. */
export const CARRIER_ORBIT_RATIO = 1.15;
/** An emitted molecule's travel into the stroma, as a multiple of its granum's outer radius. */
export const EMISSION_DRIFT_RATIO = 1.6;
/** Glucose travels less far than oxygen: it is the product the chloroplast keeps. */
export const GLUCOSE_DRIFT_FACTOR = 0.75;
/** Axial wobble, as a multiple of the orbit radius or the drift distance. */
export const FLOW_RISE_RATIO = 0.45;
/**
 * How far along its granum a carrier travels (its axial span), as a multiple of the stack's half height.
 *
 * At 1 the carrier enters at one end of the pile and leaves at the other, which is the motion that
 * makes the granum read as the *route* the flow takes rather than as an obstacle it circles.
 */
export const FLOW_AXIAL_SPAN_RATIO = 1;
/** Particle sizes, as multiples of the granum's outer radius. */
export const CARRIER_SIZE_RATIO = 0.45;
export const OXYGEN_SIZE_RATIO = 0.4;
export const GLUCOSE_SIZE_RATIO = 0.62;
/** How fast the carriers complete an orbit relative to one emission cycle. */
export const CARRIER_SPEED = 0.85;
/** Orbits per cycle for a carrier. */
export const FLOW_TURNS = 1.5;

export const PARTICLE_KIND = {
  carrier: 0,
  oxygen: 1,
  glucose: 2,
} as const;

/** One particle kind's colour. Shared by the CPU-side attribute write and, for a test, the assertion. */
export function particleColour(kind: number): Color {
  if (kind === PARTICLE_KIND.glucose) {
    return new Color(NUTRITION_COLORS.glucose);
  }

  return kind === PARTICLE_KIND.oxygen
    ? new Color(NUTRITION_COLORS.oxygen)
    : new Color(NUTRITION_COLORS.carrier);
}

/** One granum, resolved into the organelle root's local space: where the flow happens. */
export interface GranumSite {
  centre: Vector3;
  /** The stack axis, normalised. */
  axis: Vector3;
  /** A unit vector perpendicular to the axis: the orbit's zero-angle reference. */
  radial: Vector3;
  /** The granum's outer radius — the sizing unit for carriers, drift and particle size. */
  outerRadius: number;
  /** Half the stack's height along its own axis, so a carrier can travel from one end to the other. */
  halfHeight: number;
}

/** One particle in the flow, before it becomes vertex data. */
export interface FlowParticle {
  centre: Vector3;
  axis: Vector3;
  radial: Vector3;
  /** Orbit radius for a carrier, drift distance for an emitted molecule. */
  radius: number;
  /** Axial half-extent a carrier travels along its granum: it enters one end and leaves the other. */
  travel: number;
  /** Quad size in world units. */
  size: number;
  phase: number;
  kind: number;
  /** Cycles per emission cycle. */
  speed: number;
}

const AXIS = new Vector3(0, 1, 0);
const RADIAL_REFERENCE = new Vector3(0, 0, 1);

/**
 * Where the grana are, read from the built instance buffer.
 *
 * Pure and exported so the placement can be asserted without a renderer: a test builds the
 * chloroplast, reads its grana, and checks every site's axis is unit length and perpendicular to its
 * radial — the two invariants the shader's helix depends on.
 */
export function granumSites(root: Object3D, grana: readonly Object3D[]): GranumSite[] {
  const sites: GranumSite[] = [];

  for (const stack of grana) {
    const geometry = (stack as Mesh).geometry;

    if (!geometry) {
      continue;
    }

    geometry.computeBoundingBox();

    const bounds = geometry.boundingBox;

    if (!bounds) {
      continue;
    }

    const outerRadius = Math.max(bounds.max.x, bounds.max.z);
    const toRoot = rootLocalMatrixOf(stack, root);
    const normalMatrix = new Matrix3().getNormalMatrix(toRoot);

    for (const placement of readInstancePlacements(stack)) {
      const centre = placement.position.clone().applyMatrix4(toRoot);
      const axis = AXIS.clone().applyQuaternion(placement.quaternion).applyMatrix3(normalMatrix).normalize();
      const radial = RADIAL_REFERENCE.clone()
        .applyQuaternion(placement.quaternion)
        .applyMatrix3(normalMatrix)
        .normalize();

      sites.push({
        centre,
        axis,
        // Gram-Schmidt, so a stack whose own rotation is not exactly orthonormal cannot tilt the
        // orbit off the disc plane.
        radial: radial.addScaledVector(axis, -radial.dot(axis)).normalize(),
        outerRadius: outerRadius * placement.scale.x,
        halfHeight: bounds.max.y * placement.scale.y,
      });
    }
  }

  return sites;
}

function rotateAroundAxis(vector: Vector3, axis: Vector3, radians: number): Vector3 {
  return vector.clone().applyAxisAngle(axis, radians);
}

/**
 * The particle set: a flow of carriers around every granum, plus the molecules the grana emit.
 *
 * Seeded, so the same chloroplast gets the same flow on every load, in the fixture and in the app.
 * Carriers outnumber emitters roughly two to one because the flow is the visual statement of
 * "the thylakoids are working"; the emitters are the stoichiometric consequence of it.
 */
export function photosynthesisParticles(
  sites: readonly GranumSite[],
  seed: string,
): FlowParticle[] {
  const noise = createSeededNoise(`${seed}/photosynthesis`);
  const particles: FlowParticle[] = [];

  for (const site of sites) {
    for (let index = 0; index < CARRIERS_PER_GRANUM; index += 1) {
      particles.push({
        centre: site.centre.clone(),
        axis: site.axis.clone(),
        radial: rotateAroundAxis(site.radial, site.axis, (index / CARRIERS_PER_GRANUM) * Math.PI * 2),
        radius: site.outerRadius * CARRIER_ORBIT_RATIO,
        travel: site.halfHeight * FLOW_AXIAL_SPAN_RATIO,
        size: site.outerRadius * CARRIER_SIZE_RATIO,
        phase: noise.random(),
        kind: PARTICLE_KIND.carrier,
        speed: CARRIER_SPEED,
      });
    }

    for (let index = 0; index < OXYGEN_PER_CYCLE + GLUCOSE_PER_CYCLE; index += 1) {
      const isGlucose = index >= OXYGEN_PER_CYCLE;

      particles.push({
        centre: site.centre.clone(),
        axis: site.axis.clone(),
        radial: rotateAroundAxis(site.radial, site.axis, noise.random() * Math.PI * 2),
        radius: site.outerRadius * EMISSION_DRIFT_RATIO * (isGlucose ? GLUCOSE_DRIFT_FACTOR : 1),
        travel: 0,
        size: site.outerRadius * (isGlucose ? GLUCOSE_SIZE_RATIO : OXYGEN_SIZE_RATIO),
        phase: noise.random(),
        kind: isGlucose ? PARTICLE_KIND.glucose : PARTICLE_KIND.oxygen,
        speed: 1,
      });
    }
  }

  return particles;
}

/**
 * The flow, in the vertex shader.
 *
 * Respiration rewrites a handful of attributes per frame because GSAP owns *when* each molecule is;
 * this process has no beats to schedule, so the whole motion is a pure function of `uTime` and
 * nothing crosses the CPU/GPU boundary per frame except two uniform writes. Colour arrives as an
 * attribute, so both processes ink their particles through the same shared shader (`../glow.ts`).
 */
const VERTEX_SHADER = /* glsl */ `
  ${GLOW_DECLARATIONS}
  attribute vec3 aAxis;
  attribute vec3 aRadial;
  attribute float aRadius;
  attribute float aTravel;
  attribute float aPhase;
  attribute float aKind;
  attribute float aSpeed;

  uniform float uTime;
  uniform float uCycleSeconds;
  uniform float uLightIntensity;
  uniform float uRise;
  uniform float uTurns;

  const float TAU = 6.283185307179586;

  void main() {
    float light = uLightIntensity;
    float t = uTime / uCycleSeconds;
    float local = fract(t * aSpeed + aPhase);
    vec3 centre = position;
    vec3 tangent = normalize(cross(aAxis, aRadial));

    if (aKind < 0.5) {
      // A carrier travels *through* its granum: it enters at one end of the pile, spirals along the
      // stack axis and leaves at the other. Circling a single granum read as an orbit rather than as
      // a flow, and the discs are the route the thylakoid flow takes.
      float progress = fract(t * aSpeed + aPhase);
      float angle = TAU * (uTurns * progress) + aPhase * TAU;
      vec3 radial = normalize(aRadial * cos(angle) + tangent * sin(angle));
      centre += radial * aRadius + aAxis * ((progress * 2.0 - 1.0) * aTravel);
      vAlpha = light;
    } else {
      // An emitted molecule: it leaves the granum once per cycle and drifts into the stroma.
      float emerge = smoothstep(0.05, 0.35, local);
      float fade = 1.0 - smoothstep(0.55, 0.95, local);
      centre += aRadial * (emerge * aRadius) + aAxis * (local * aRadius * uRise * 0.5);
      vAlpha = light * emerge * fade;
    }

    vec4 viewCentre = modelViewMatrix * vec4(centre, 1.0);
    float size = aSize * (aKind > 1.5 ? 1.6 : 1.0);
    // Billboarding in view space: the quad always faces the camera and its size is in world units,
    // so nothing has to know the viewport or the pixel ratio.
    viewCentre.xy += aCorner * size;

    gl_Position = projectionMatrix * viewCentre;
    vCorner = aCorner;
    vColor = aColor;
  }
`;

function particleGeometry(particles: readonly FlowParticle[]): BufferGeometry {
  const geometry = new BufferGeometry();
  const count = particles.length;
  const vertices = Math.max(1, count) * 4;

  const position = new Float32Array(vertices * 3);
  const axes = new Float32Array(vertices * 3);
  const radials = new Float32Array(vertices * 3);
  const radii = new Float32Array(vertices);
  const travels = new Float32Array(vertices);
  const sizes = new Float32Array(vertices);
  const phases = new Float32Array(vertices);
  const kinds = new Float32Array(vertices);
  const speeds = new Float32Array(vertices);
  const colors = new Float32Array(vertices * 3);
  const alphas = new Float32Array(vertices);
  const corners = new Float32Array(vertices * 2);
  const indices = new Uint16Array(Math.max(1, count) * 6);

  const colour = new Color();

  for (const [index, particle] of particles.entries()) {
    colour.copy(particleColour(particle.kind));

    for (let corner = 0; corner < 4; corner += 1) {
      const vertex = index * 4 + corner;
      const offset = vertex * 3;

      position[offset] = particle.centre.x;
      position[offset + 1] = particle.centre.y;
      position[offset + 2] = particle.centre.z;
      axes[offset] = particle.axis.x;
      axes[offset + 1] = particle.axis.y;
      axes[offset + 2] = particle.axis.z;
      radials[offset] = particle.radial.x;
      radials[offset + 1] = particle.radial.y;
      radials[offset + 2] = particle.radial.z;

      radii[vertex] = particle.radius;
      travels[vertex] = particle.travel;
      sizes[vertex] = particle.size;
      phases[vertex] = particle.phase;
      kinds[vertex] = particle.kind;
      speeds[vertex] = particle.speed;
      // The shader owns the alpha (it is the light term); the colour is fixed per particle kind.
      alphas[vertex] = 1;
      colors[offset] = colour.r;
      colors[offset + 1] = colour.g;
      colors[offset + 2] = colour.b;
      corners[vertex * 2] = GLOW_CORNERS[corner * 2] ?? 0;
      corners[vertex * 2 + 1] = GLOW_CORNERS[corner * 2 + 1] ?? 0;
    }

    for (let corner = 0; corner < 6; corner += 1) {
      indices[index * 6 + corner] = index * 4 + (GLOW_INDICES[corner] ?? 0);
    }
  }

  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('aCorner', new BufferAttribute(corners, 2));
  geometry.setAttribute('aAlpha', new BufferAttribute(alphas, 1));
  geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
  geometry.setAttribute('aAxis', new BufferAttribute(axes, 3));
  geometry.setAttribute('aRadial', new BufferAttribute(radials, 3));
  geometry.setAttribute('aRadius', new BufferAttribute(radii, 1));
  geometry.setAttribute('aTravel', new BufferAttribute(travels, 1));
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new BufferAttribute(phases, 1));
  geometry.setAttribute('aKind', new BufferAttribute(kinds, 1));
  geometry.setAttribute('aSpeed', new BufferAttribute(speeds, 1));
  geometry.setIndex(new BufferAttribute(indices, 1));

  return geometry;
}

export function buildPhotosynthesis(context: ProcessContext): ProcessInstance {
  const grana = findGrana(context.root);
  const sites = granumSites(context.root, grana);
  const particles = photosynthesisParticles(sites, context.seed);

  const object = new Object3D();
  object.name = `process:${context.target.id}`;

  const geometry = particleGeometry(particles);
  const uniforms = {
    uTime: { value: 0 },
    uCycleSeconds: { value: PHOTOSYNTHESIS_CYCLE_SECONDS },
    uLightIntensity: { value: processLight.intensity },
    uRise: { value: FLOW_RISE_RATIO },
    uTurns: { value: FLOW_TURNS },
  };
  const material = createGlowMaterial(VERTEX_SHADER, uniforms);

  const flow = new Mesh(geometry, material);
  flow.name = 'process:photosynthesis/flow';
  // The shader moves every vertex, so the geometry's own bounding sphere is meaningless.
  flow.frustumCulled = false;
  object.add(flow);

  let time = 0;
  let rate = 1;
  let light = processLight.intensity;
  let uniformWrites = 0;
  const emitted: EmittedCounts = { atp: 0, oxygen: 0, glucose: 0 };

  return {
    id: context.target.id,
    processId: 'nutrition',
    cell: context.cell,
    organelleId: context.target.organelleId,
    scripted: false,
    lightDriven: true,
    object,
    timeline: null,
    phases: {},
    get rate() {
      return rate;
    },
    get time() {
      return time;
    },
    label: null,
    progress: null,
    get lightRequired() {
      return light <= 0;
    },
    get uniformWrites() {
      return uniformWrites;
    },
    emitted,

    update(frame: ProcessFrame) {
      light = frame.light;
      rate = frame.light <= 0 ? 0 : frame.scale * frame.light;

      if (frame.frozen !== null) {
        // A fixture pins the clock: the flow is written at that time and does not advance, so the
        // frame is a function of the URL rather than of how long the page has been open.
        time = frame.frozen;
      } else {
        time += frame.delta * rate;
      }

      uniforms.uTime.value = time;
      // The one `uLightIntensity` write in the app, counted so "respiration never writes it" is a
      // measurement rather than a claim.
      uniforms.uLightIntensity.value = processLight.recordUniformWrite();
      uniformWrites += 1;

      const cycles = Math.floor(time / PHOTOSYNTHESIS_CYCLE_SECONDS);

      // Derived from completed cycles, so the counter can never report an emission the animation
      // did not run. Each granum emits once per cycle and the phases are staggered, so the count is
      // accurate to one cycle.
      emitted.oxygen = cycles * OXYGEN_PER_CYCLE * sites.length;
      emitted.glucose = cycles * GLUCOSE_PER_CYCLE * sites.length;
    },

    dispose() {
      object.remove(flow);
      geometry.dispose();
      material.dispose();
    },
  };
}
