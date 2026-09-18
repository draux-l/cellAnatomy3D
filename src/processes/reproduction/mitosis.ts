import { gsap } from 'gsap';
import {
  CapsuleGeometry,
  CylinderGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { clamp01, smoothstep } from '../curve';
import { findParts, partsCentre, partsRadius } from '../structure';
import type { EmittedCounts, ProcessContext, ProcessFrame, ProcessInstance } from '../types';
import {
  CHROMATID_COUNT,
  CHROMATID_LENGTH,
  CHROMATID_RADIUS,
  chromatidPlacements,
  chromosomeStats,
  daughterOffset,
  type ChromatidPlacement,
  type ChromosomeSpace,
} from './chromosomes';
import { REPRODUCTION_COLORS } from './colors';
import {
  captureRestPose,
  equatorialRadius,
  PINCH_DEPTH,
  restoreRestPose,
  writeEquatorialPinch,
  type RestPose,
} from './deform';
import {
  MITOSIS_BANDS,
  MITOSIS_DURATION_SECONDS,
  MITOSIS_PHASE_ORDER,
  MITOSIS_PHASES,
  activeMechanism,
  phaseProgress,
} from './stages';

/**
 * Mitosis, on the whole cell (tasks 6.1–6.6).
 *
 * **One factory, two genuinely different divisions.** The spec's contrast requirement is explicit
 * that the animal and plant mechanisms must not be *"the same motion with a recolored label"*, and
 * task 6.4 makes it a defect rather than a shortcut. So the two mechanisms share nothing but the
 * timeline they are keyed against:
 *
 * | | animal | plant |
 * |---|---|---|
 * | what moves | the cell's own boundary, pinched inward at the equator | a disc built outward from the plate |
 * | what appears | a contractile ring that shrinks with the waist | an opaque band that grows until it meets the wall |
 * | how it is written | a vertex deformation of the membrane and cytosol shells | a scaled, translated `CylinderGeometry` |
 * | what it leaves | two lobes joined by a narrowing neck | a partition across an unchanged boundary |
 *
 * The mechanisms are mutually exclusive per frame — the plate is not merely textured differently
 * when the animal mechanism runs, it is not drawn at all — so `+4` draw calls never becomes `+8`.
 *
 * **The timeline is the sequence.** One paused GSAP timeline with the five labels, one tween of a
 * scalar over `MITOSIS_DURATION_SECONDS`, and a `writeFrame` that is a pure function of that scalar.
 * Everything downstream — the chromatid matrices, the pinch, the ring, the plate, the daughter
 * nuclei — is derived from it, so:
 *
 * - **Scrubbing is reversible by construction** (spec: `Scrub backwards`): seeking to a value renders
 *   exactly the frame that value describes, whichever direction it was reached from. There is no
 *   event, no accumulator and no callback that a rewind could replay.
 * - **The fixture is deterministic** (design D10): a pinned time produces one frame, byte for byte.
 * - **The structural facts are assertable** (spec: `Chromosome Behavior Matches Each Phase`):
 *   `chromosomeStats` reports what the frame shows, and the driver mirrors it, so "no separation
 *   before metaphase, two condensed groups after" is measured rather than reviewed.
 *
 * **What it borrows and gives back.** The animal mechanism writes the membrane's and the cytosol's
 * vertices and the nuclear envelope's opacity, and restores all three on `dispose()` — the base
 * viewer is not rebuilt, it is put back. `reproduction.spec.ts` asserts the exit path leaves the
 * same scene, and `deform.test.ts` asserts the restore is exact.
 */

/** The nucleus parts the sequence fades: its envelope, its nucleolus and its pores. */
export const NUCLEAR_ENVELOPE_PART = 'nuclear-envelope';
export const NUCLEOLUS_PART = 'nucleolus';
export const NUCLEAR_PORE_PART = 'nuclear-pores';
/** The two boundary shells the animal mechanism pinches. */
export const MEMBRANE_PART = 'membrane';
export const CYTOPLASM_PART = 'cytoplasm';

export const CHROMATID_PART = 'chromatids';
export const RING_PART = 'contractile-ring';
export const PLATE_PART = 'cell-plate';
export const DAUGHTER_ENVELOPE_PART = 'daughter-nuclei';

/** The plate's thickness, in scene units. Thin, but wide enough to read as a band at cell scale. */
export const PLATE_THICKNESS = 0.04;
/** How far past the cell's equatorial radius the plate grows, so it visibly meets the boundary. */
export const PLATE_REACH = 1.06;
export const RING_TUBE_RADIUS = 0.028;
export const DAUGHTER_ENVELOPE_RADIUS = 0.3;
export const DAUGHTER_ENVELOPE_OPACITY = 0.34;

/** Cap and radial subdivision of one chromatid. Small body, so the counts are small. */
export const CHROMATID_CAP_SEGMENTS = 3;
export const CHROMATID_RADIAL_SEGMENTS = 8;

/**
 * A pinch change smaller than this is not worth a vertex rewrite.
 *
 * The shells are several thousand vertices each and the normals have to be recomputed, so the write
 * is driven by the *rendered* change rather than by the frame rate: at real speed the furrow closing
 * over ~2 s produces a few dozen writes, not one per frame.
 */
export const PINCH_WRITE_EPSILON = 0.004;

/** The material's resting opacity, as `scene/highlight.ts` records it on every clone. */
const BASE_OPACITY_KEY = 'cellBaseOpacity';

/**
 * The progress at which each derived motion starts.
 *
 * `phaseProgress` would be the obvious source, but these spans are deliberately *inside* their band
 * rather than across it — the furrow closes in the first half of cytokinesis and then holds, so the
 * last frames of the sequence show the completed division instead of a permanently moving one.
 */
export const PINCH_SPAN = 0.55;
export const PLATE_SPAN = 0.5;
export const RING_SPAN = 0.12;
export const DAUGHTER_FADE_SPAN = 0.12;
export const ENVELOPE_BREAKDOWN_LEAD = 0.04;
export const ENVELOPE_BREAKDOWN_TRAIL = 0.06;

function baseOpacityOf(material: MeshStandardMaterial): number {
  const stored = material.userData[BASE_OPACITY_KEY];

  return typeof stored === 'number' ? stored : material.opacity;
}

function asMesh(object: Object3D | undefined): Mesh | undefined {
  return object instanceof Mesh ? object : undefined;
}

export function buildMitosis(context: ProcessContext): ProcessInstance {
  // The cell group the boundary shells and the nucleus live under. The process itself is parented
  // to its target root (the cytoplasm, which the catalog places at the cell centre), so its
  // children are authored directly in cell coordinates.
  const cellGroup = context.root.parent ?? context.root;
  const envelope = findParts(cellGroup, (name) => name === NUCLEAR_ENVELOPE_PART)[0];
  const fadeParts = [
    envelope,
    findParts(cellGroup, (name) => name === NUCLEOLUS_PART)[0],
    findParts(cellGroup, (name) => name === NUCLEAR_PORE_PART)[0],
  ].filter((part): part is Object3D => part !== undefined);
  const shells: RestPose[] = [MEMBRANE_PART, CYTOPLASM_PART].flatMap((name) =>
    findParts(cellGroup, (candidate) => candidate === name)
      .map(asMesh)
      .filter((mesh): mesh is Mesh => mesh !== undefined)
      .map((mesh) => captureRestPose(mesh.geometry)),
  );
  const membraneRest = shells[0];
  const envelopeMesh = asMesh(envelope);
  const envelopeMaterial =
    envelopeMesh?.material instanceof MeshStandardMaterial ? envelopeMesh.material : undefined;
  const envelopeBaseOpacity = envelopeMaterial ? baseOpacityOf(envelopeMaterial) : 0;
  const nucleusRadius = envelopeMesh ? partsRadius([envelopeMesh], context.root) : 0.3;
  const nucleusCentre = envelopeMesh
    ? partsCentre([envelopeMesh], context.root)
    : new Vector3(0, 0, 0);
  const space: ChromosomeSpace = {
    centre: { x: nucleusCentre.x, y: nucleusCentre.y, z: nucleusCentre.z },
    radius: nucleusRadius || 0.3,
  };
  const plateReach = (membraneRest ? equatorialRadius(membraneRest) : 1) * PLATE_REACH;

  const object = new Object3D();
  object.name = `process:${context.target.id}`;

  // --- The chromatids: one instanced draw call for every chromosome in the cell. -------------
  const chromatidGeometry = new CapsuleGeometry(
    CHROMATID_RADIUS,
    Math.max(0.001, CHROMATID_LENGTH - CHROMATID_RADIUS * 2),
    CHROMATID_CAP_SEGMENTS,
    CHROMATID_RADIAL_SEGMENTS,
  );
  const chromatidMaterial = new MeshStandardMaterial({
    color: REPRODUCTION_COLORS.chromatid,
    roughness: 0.5,
    metalness: 0,
    // A little self-illumination. The chromosomes travel through a cytosol full of cream granules
    // and green membranes, and a matte surface of any colour loses that fight — the inspected first
    // pass read as a smudge among the ribosomes. Emission is what makes the subject of every phase
    // read as the subject.
    emissive: REPRODUCTION_COLORS.chromatid,
    emissiveIntensity: 0.42,
  });
  const chromatids = new InstancedMesh(chromatidGeometry, chromatidMaterial, CHROMATID_COUNT);
  chromatids.name = CHROMATID_PART;
  // The instances travel from the nucleus to the poles, so the geometry's own bounds say nothing.
  chromatids.frustumCulled = false;
  object.add(chromatids);

  // --- The animal mechanism: a contractile ring that closes with the waist. -------------------
  const ringGeometry = new TorusGeometry(1, RING_TUBE_RADIUS, 8, 48);
  const ringMaterial = new MeshStandardMaterial({
    color: REPRODUCTION_COLORS.ring,
    roughness: 0.45,
    metalness: 0.05,
  });
  const ring = new Mesh(ringGeometry, ringMaterial);
  ring.name = RING_PART;
  // A torus is built in its own XY plane; the furrow's ring lies in the cell's equatorial (XZ) plane.
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  object.add(ring);

  // --- The plant mechanism: an opaque plate built outward from the centre. --------------------
  const plateGeometry = new CylinderGeometry(1, 1, PLATE_THICKNESS, 56, 1, false);
  const plateMaterial = new MeshStandardMaterial({
    color: REPRODUCTION_COLORS.plate,
    roughness: 0.58,
    metalness: 0,
    // Opaque on purpose: it is the new cell wall, and opacity is what makes the partition a band a
    // screenshot can be measured against rather than a tint.
    transparent: false,
  });
  const plate = new Mesh(plateGeometry, plateMaterial);
  plate.name = PLATE_PART;
  plate.visible = false;
  object.add(plate);

  // --- The two nuclei that form at telophase. -------------------------------------------------
  const daughterGeometry = new SphereGeometry(DAUGHTER_ENVELOPE_RADIUS, 24, 16);
  const daughterMaterial = new MeshStandardMaterial({
    color: REPRODUCTION_COLORS.daughterEnvelope,
    roughness: 0.42,
    metalness: 0.06,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const daughters = [1, -1].map((side) => {
    const mesh = new Mesh(daughterGeometry, daughterMaterial);

    mesh.name = `${DAUGHTER_ENVELOPE_PART}:${side > 0 ? 'north' : 'south'}`;
    mesh.visible = false;
    object.add(mesh);

    return mesh;
  });

  // --- The timeline. --------------------------------------------------------------------------
  const sequence = { value: 0 };
  const timeline: gsap.core.Timeline = gsap
    .timeline({ paused: true })
    .to(sequence, { value: 1, duration: MITOSIS_DURATION_SECONDS, ease: 'none' }, 0);

  for (const label of MITOSIS_PHASE_ORDER) {
    timeline.addLabel(label, MITOSIS_PHASES[label] * MITOSIS_DURATION_SECONDS);
  }

  let time = 0;
  let rate = 1;
  let playing = false;
  let uniformWrites = 0;
  let lastPinch = 0;
  let lastEnvelopeFade = 1;
  let extra: Record<string, number> = {};
  const emitted: EmittedCounts = { atp: 0, oxygen: 0, glucose: 0 };

  const MATRIX = new Matrix4();
  const POSITION = new Vector3();
  const SCALE = new Vector3();
  const QUATERNION = new Quaternion();
  const EULER = new Euler(0, 0, 0);

  function writeChromatids(progress: number): ChromatidPlacement[] {
    const placements = chromatidPlacements(progress, space);

    for (const [index, placement] of placements.entries()) {
      POSITION.set(placement.x, placement.y, placement.z);
      EULER.set(0, 0, placement.yaw);
      QUATERNION.setFromEuler(EULER);
      SCALE.setScalar(placement.scale);
      MATRIX.compose(POSITION, QUATERNION, SCALE);
      chromatids.setMatrixAt(index, MATRIX);
    }

    chromatids.instanceMatrix.needsUpdate = true;

    return placements;
  }

  /**
   * The nuclear envelope breaks down before the chromosomes can leave it, and the two daughter
   * nuclei form around the two groups at telophase. Both are the same statement — *which* nuclei
   * exist — so they are written from one fade and its complement.
   */
  function writeNucleus(progress: number, daughterFade: number): void {
    const fade = clamp01(
      1 -
        smoothstep(
          MITOSIS_BANDS.prophase.end - ENVELOPE_BREAKDOWN_LEAD,
          MITOSIS_BANDS.metaphase.start + ENVELOPE_BREAKDOWN_TRAIL,
          progress,
        ),
    );

    if (Math.abs(fade - lastEnvelopeFade) > PINCH_WRITE_EPSILON) {
      lastEnvelopeFade = fade;

      if (envelopeMaterial) {
        envelopeMaterial.opacity = envelopeBaseOpacity * fade;
      }

      // The nucleolus and the pores are opaque bodies, and flipping `transparent` on them would
      // recompile their shader mid-sequence. Hiding them is the same statement at no cost.
      const visible = fade > 0.5;

      for (const part of fadeParts) {
        part.visible = visible;
      }
    }

    const offset = daughterOffset(progress);

    for (const [index, mesh] of daughters.entries()) {
      const side = index === 0 ? 1 : -1;

      mesh.position.set(0, side * offset, 0);
      mesh.visible = daughterFade > 0.01;
    }

    daughterMaterial.opacity = DAUGHTER_ENVELOPE_OPACITY * daughterFade;
  }

  function writeFrame(mechanism: 'animal' | 'plant'): void {
    const progress = clamp01(sequence.value);

    const placements = writeChromatids(progress);

    const cytokinesis = phaseProgress('cytokinesis', progress);
    const pinch = mechanism === 'animal' ? Math.min(1, cytokinesis / PINCH_SPAN) : 0;
    const plateAmount = mechanism === 'plant' ? Math.min(1, cytokinesis / PLATE_SPAN) : 0;
    const ringFade = mechanism === 'animal' ? smoothstep(0, RING_SPAN, cytokinesis) : 0;
    const daughterFade = smoothstep(0, DAUGHTER_FADE_SPAN, phaseProgress('telophase', progress));

    // The animal mechanism, and only the animal mechanism, rewrites the cell's own boundary. The
    // plant cell's wall is rigid and does not pinch — that is the biology, not an omission — so
    // only the membrane and the cytosol move.
    if (Math.abs(pinch - lastPinch) > PINCH_WRITE_EPSILON) {
      lastPinch = pinch;

      for (const shell of shells) {
        writeEquatorialPinch(shell, pinch);
      }
    }

    // The ring rides the waist it is closing: at rest it sits just outside the boundary, and it
    // shrinks with the pinch rather than being scaled by a second, independent curve.
    const waistRadius = Math.max(0.05, plateReach * (1 - PINCH_DEPTH * pinch)) + RING_TUBE_RADIUS;

    ring.visible = ringFade > 0.01;
    ring.scale.setScalar(waistRadius);

    plate.visible = plateAmount > 0.01;
    plate.scale.set(plateReach * plateAmount, 1, plateReach * plateAmount);

    writeNucleus(progress, daughterFade);

    const stats = chromosomeStats(placements);

    extra = {
      sisterSeparation: stats.sisterSeparation,
      groupDistance: stats.groupDistance,
      groups: stats.groups,
      groupSpread: stats.groupSpread,
      pinch,
      plate: plateAmount,
      ring: ringFade,
    };
  }

  return {
    id: context.target.id,
    processId: 'reproduction',
    cell: context.cell,
    organelleId: context.target.organelleId,
    scripted: true,
    lightDriven: false,
    object,
    timeline,
    phases: MITOSIS_PHASES,
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

      return duration > 0 ? clamp01(timeline.time() / duration) : null;
    },
    lightRequired: false,
    get uniformWrites() {
      return uniformWrites;
    },
    get extra() {
      return extra;
    },
    emitted,

    update(frame: ProcessFrame) {
      if (frame.frozen !== null) {
        // A fixture pins the clock, so the timeline is *seeked* rather than played: the frame has to
        // be a function of the URL, and a ticker left running would drift between two loads.
        timeline.pause();
        timeline.timeScale(1);
        timeline.time(Math.min(Math.max(0, frame.frozen), timeline.duration()));
        rate = 0;
      } else {
        timeline.timeScale(frame.scale);

        if (!playing) {
          timeline.play();
          playing = true;
        }

        rate = frame.scale;
      }

      // The playhead is the truth, so the mirror reports it rather than a private accumulator: a
      // scrub, a seek by label and a plain play all move the same number.
      time = timeline.time();

      writeFrame(activeMechanism(context.cell, frame.cytokinesis));
    },

    dispose() {
      timeline.kill();

      for (const shell of shells) {
        restoreRestPose(shell);
      }

      if (envelopeMaterial) {
        envelopeMaterial.opacity = envelopeBaseOpacity;
      }

      for (const part of fadeParts) {
        part.visible = true;
      }

      object.clear();
      chromatidGeometry.dispose();
      chromatidMaterial.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      plateGeometry.dispose();
      plateMaterial.dispose();
      daughterGeometry.dispose();
      daughterMaterial.dispose();
    },
  };
}
