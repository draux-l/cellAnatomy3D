import { gsap } from 'gsap';
import { Color, Mesh, Object3D, Vector3 } from 'three';
import { createSeededNoise } from '../../scene/builders/primitives';
import { bandProgress, mix, smoothstep, wrap01 } from '../curve';
import { createGlowField, type GlowSample } from '../glow';
import { findCristae, partsRadius, samplePartSites, type StructureSite } from '../structure';
import type { EmittedCounts, ProcessContext, ProcessFrame, ProcessInstance } from '../types';
import { NUTRITION_COLORS } from './colors';
import { ATP_PER_CRISTA, RESPIRATION_BANDS, RESPIRATION_CYCLE_SECONDS, RESPIRATION_PHASES, RESPIRATION_STAGE_ORDER } from './stages';

/**
 * Respiration, on the cristae (task 5.2).
 *
 * **Scripted, not continuous.** Design D5 splits the two paradigms by motion type: this one is a
 * scrubbable, reversible, labelled sequence, so it is a `gsap.timeline({ paused: true })` with
 * labels, and the shared speed control maps onto `timeline.timeScale()` (pause 0, slow 0.25, real
 * time 1). Nothing here animates by accumulation, so a fixture that pins the clock at time `t`
 * produces exactly the frame that time describes.
 *
 * **Where the animation is.** Every ATP molecule is placed on a real crista surface: the sites come
 * from `MeshSurfaceSampler` over the folds the mitochondrion builder actually produced, so the
 * markers emerge from the sheets themselves. That is the difference between an animation *inside
 * the mitochondrion on its cristae* — which is what the spec requires — and a particle cloud that
 * merely surrounds the organelle.
 *
 * **No light, anywhere.** There is no light uniform in this module, no light state read, and the
 * instance reports `lightDriven: false`. `respiration.test.ts` runs it across the whole slider
 * range and asserts the app's light-uniform write counter does not move, and a source scan asserts
 * the module could not write one: the requirement that the two processes are not conflated is a
 * test, not a promise.
 *
 * **One cycle, many overlapping copies.** The labels describe *one* ATP-production cycle — the folds
 * react, then ATP is released — because that is the sentence the spec licenses. The particles are
 * phase-staggered across the cycle, so the organelle is never momentarily still: a living cell
 * respires continuously, and a metronome of simultaneous bursts would teach the wrong rhythm.
 */

/**
 * ATP size, as a fraction of the cristae bundle's own bounding radius.
 *
 * A legibility count, not a biology count — and it took two inspected passes to get right. The
 * cristae are long thin sheets, so the *bundle's* bounding radius is dominated by the organelle's
 * length (~0.28 units for the catalog's mitochondrion) rather than by the folds' own width (~0.05).
 * Sizing against the bundle at 0.15 therefore produced molecules wider than the folds they sit on:
 * the first inspected frame read as "a mitochondrion full of balls", which hides the teaching object.
 * The second pass moved to the other failure — at 0.03 opaque spheres were legible up close and
 * invisible at cell scale. The size now pairs with an **additive** material (see `buildRespiration`),
 * where a molecule reads as light: a glow can be larger than a solid marker without covering the fold
 * it sits on, which is what makes the process visible both in the isolated close-up and at cell scale.
 */
export const ATP_RADIUS_RATIO = 0.05;
/** How far a released molecule drifts into the matrix, as a fraction of the cristae's radius. */
export const ATP_DRIFT_RATIO = 0.35;
/**
 * The scale a molecule holds while it sits on its fold, and the scale it flares to when the fold
 * reacts.
 *
 * Never zero at rest: a marker that vanishes between beats cannot be tracked to the fold it belongs
 * to, and the fold itself is too small to carry the eye. The flare is the readable event.
 */
export const ATP_REST_SCALE = 0.35;
export const ATP_PEAK_SCALE = 1.6;

/** Where each ATP molecule is in its cycle. */
export interface AtpStage {
  /** Uniform scale of the instance. */
  scale: number;
  /** 0 at rest, 1 at the moment of release. Drives the per-instance colour. */
  glow: number;
  /** Distance travelled along the surface normal, in scene units. */
  drift: number;
}

/**
 * What one ATP molecule is doing at a phase in `[0, 1)`.
 *
 * Pure, and exported so the two bands can be asserted directly: a particle on a fold must be at the
 * fold (zero drift), a released one must be off it, and the two bands must meet without a jump —
 * a discontinuity here is a visible pop, not a maths curiosity.
 */
export function atpStage(local: number, driftDistance: number): AtpStage {
  const reactions = RESPIRATION_BANDS.reactions;

  if (local < reactions.end) {
    const u = bandProgress(reactions.start, reactions.end, local);
    const pulse = Math.sin(Math.PI * u);

    return {
      scale: mix(ATP_REST_SCALE, ATP_PEAK_SCALE, pulse),
      glow: 0.15 + 0.85 * pulse,
      drift: 0,
    };
  }

  const atp = RESPIRATION_BANDS.atp;
  const u = bandProgress(atp.start, atp.end, local);
  const emerge = smoothstep(0, 0.22, u);
  const fade = 1 - smoothstep(0.6, 1, u);

  return {
    scale: mix(ATP_REST_SCALE, ATP_PEAK_SCALE, emerge) * mix(0.3, 1, fade),
    glow: 0.25 + 0.75 * emerge * fade,
    drift: emerge * driftDistance,
  };
}

/** The ATP glow colour, in the form the shader consumes it. */
const ATP_COLOR = new Color(NUTRITION_COLORS.atp);
const POSITION = new Vector3();

export function buildRespiration(context: ProcessContext): ProcessInstance {
  const cristae = findCristae(context.root);
  const noise = createSeededNoise(`${context.seed}/respiration`);
  const sites: StructureSite[] = samplePartSites(cristae, ATP_PER_CRISTA, context.root, noise);
  const radius = partsRadius(cristae, context.root) || 0.1;
  const driftDistance = radius * ATP_DRIFT_RATIO;
  const moleculeSize = radius * ATP_RADIUS_RATIO;

  const object = new Object3D();
  object.name = `process:${context.target.id}`;

  const glow = createGlowField(sites.length);
  const molecules = new Mesh(glow.geometry, glow.material);
  molecules.name = 'process:respiration/atp';
  // The field is rewritten every frame, so the geometry's own bounding sphere is meaningless.
  molecules.frustumCulled = false;
  object.add(molecules);

  /**
   * Each molecule's phase along the cycle, keyed by the fold it sits on (see `StructureSite.part`).
   *
   * One fold's molecules move together, so the reaction travels from fold to fold instead of every
   * fold firing at once. A single shared cycle is what the labels describe; the phase offsets are
   * what make a dozen overlapping cycles read as one continuous process.
   */
  const phases = sites.map((site) => (cristae.length > 0 ? site.part / cristae.length : 0));

  // A single tween on a plain object: GSAP owns *when* the cycle is, `writeFrame` owns *what* it
  // looks like. One tween means one source for the phase, and `repeat: -1` makes the process
  // continuous without a second driver.
  const cycle = { value: 0 };
  const timeline: gsap.core.Timeline = gsap
    .timeline({ paused: true, repeat: -1 })
    .to(cycle, { value: 1, duration: RESPIRATION_CYCLE_SECONDS, ease: 'none' }, 0);

  for (const label of RESPIRATION_STAGE_ORDER) {
    timeline.addLabel(label, RESPIRATION_PHASES[label] * RESPIRATION_CYCLE_SECONDS);
  }

  let time = 0;
  let rate = 1;
  let playing = false;
  let uniformWrites = 0;
  const emitted: EmittedCounts = { atp: 0, oxygen: 0, glucose: 0 };
  const sample: GlowSample = { x: 0, y: 0, z: 0, size: 0, alpha: 1, r: 1, g: 1, b: 1 };

  function writeFrame(): void {
    const current = wrap01(cycle.value);

    for (const [index, site] of sites.entries()) {
      const stage = atpStage(wrap01(current + (phases[index] ?? 0)), driftDistance);

      POSITION.copy(site.position).addScaledVector(site.normal, stage.drift);

      sample.x = POSITION.x;
      sample.y = POSITION.y;
      sample.z = POSITION.z;
      sample.size = moleculeSize * stage.scale;
      // The alpha carries the release: a molecule on its fold is dim, a released one is bright, and
      // the fade at the end of the band is what makes it read as dissipating rather than popping out.
      sample.alpha = mix(0.35, 1, stage.glow);
      sample.r = ATP_COLOR.r;
      sample.g = ATP_COLOR.g;
      sample.b = ATP_COLOR.b;

      glow.write(index, sample);
    }

    glow.flush();
  }

  return {
    id: context.target.id,
    processId: 'nutrition',
    cell: context.cell,
    organelleId: context.target.organelleId,
    scripted: true,
    lightDriven: false,
    object,
    timeline,
    phases: RESPIRATION_PHASES,
    get rate() {
      return rate;
    },
    get time() {
      return time;
    },
    get label() {
      const label = timeline.currentLabel();

      return label === '' ? null : label;
    },
    get progress() {
      const duration = timeline.duration();

      return duration > 0 ? (timeline.time() % duration) / duration : null;
    },
    // Respiration is the process that must NOT care about light, at any value of the slider.
    lightRequired: false,
    get uniformWrites() {
      return uniformWrites;
    },
    emitted,

    update(frame: ProcessFrame) {
      if (frame.frozen !== null) {
        // A fixture pins the clock, so the timeline is *seeked* rather than played: the frame has to
        // be a function of the URL, and GSAP's own ticker would otherwise drift between two loads.
        timeline.pause();
        timeline.timeScale(1);
        timeline.time(Math.min(frame.frozen, timeline.duration()));
        time = frame.frozen;
        rate = 0;
      } else {
        timeline.timeScale(frame.scale);

        if (!playing) {
          timeline.play();
          playing = true;
        }

        time += frame.delta * frame.scale;
        rate = frame.scale;
      }

      writeFrame();

      emitted.atp = Math.floor(time / RESPIRATION_CYCLE_SECONDS) * sites.length;
    },

    dispose() {
      timeline.kill();
      object.remove(molecules);
      glow.dispose();
    },
  };
}
