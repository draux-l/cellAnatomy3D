import { Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { mountCell } from '../partMount';
import type { ProcessFrame, ProcessInstance } from '../types';
import { SISTER_REST_GAP } from './chromosomes';
import { MITOSIS_TARGET } from './index';
import {
  DAUGHTER_ENVELOPE_PART,
  MEMBRANE_PART,
  NUCLEAR_ENVELOPE_PART,
  PLATE_PART,
  RING_PART,
  buildMitosis,
} from './mitosis';
import { MITOSIS_BANDS, MITOSIS_DURATION_SECONDS, MITOSIS_PHASE_ORDER } from './stages';

/**
 * The mitosis factory, against a real composed cell (tasks 6.1–6.5).
 *
 * Two claims in this file are the ones the slice lives or dies by, and neither can be checked from a
 * screenshot alone:
 *
 * 1. **The chromosome structure is enforced, in the real instance.** `chromosomes.test.ts` proves the
 *    keyframes are right; this proves the instance actually renders them — the mirror's
 *    `extra.sisterSeparation` and `extra.groups` are read from the very matrices written to the
 *    instanced mesh, so "no separation before metaphase" is measured on the frame.
 * 2. **The two cytokinesis mechanisms are two motions, not one with a recoloured label.** The
 *    assertion is deliberately about *mechanism*, not about colour: with the animal mechanism the
 *    membrane's own geometry is narrower at the equator and the plate is not drawn at all; with the
 *    plant mechanism the boundary is untouched and the opaque plate is drawn. A relabelled single
 *    motion cannot satisfy both halves.
 *
 * The timeline is never played here: a unit test has no render loop, and GSAP would fall back to a
 * timer ticker. Frozen frames exercise the same seek path a fixture uses.
 */

const ENVELOPE_OPACITY = 0.3;

interface Setup {
  mounted: ReturnType<typeof mountCell>;
  instance: ProcessInstance;
  envelope: Mesh | undefined;
  envelopeMaterial: MeshStandardMaterial;
}

function findMesh(root: Object3D, name: string): Mesh | undefined {
  let found: Mesh | undefined;

  root.traverse((child) => {
    if (found === undefined && child instanceof Mesh && child.name === name) {
      found = child;
    }
  });

  return found;
}

function setup(cell: 'animal' | 'plant' = 'animal'): Setup {
  const mounted = mountCell(cell);
  const envelope = findMesh(mounted.group, NUCLEAR_ENVELOPE_PART);
  // The Node mount gives parts a default basic material; the viewer gives every part a prepared
  // clone of a `MeshStandardMaterial`. The process fades the envelope's opacity, so the test has to
  // hand it one — and record the resting value the way `scene/highlight.ts` does.
  const envelopeMaterial = new MeshStandardMaterial({ transparent: true, opacity: ENVELOPE_OPACITY });

  envelopeMaterial.userData['cellBaseOpacity'] = ENVELOPE_OPACITY;

  if (envelope) {
    envelope.material = envelopeMaterial;
  }

  const root = mounted.roots.get(MITOSIS_TARGET.organelleId);

  if (!root) {
    throw new Error('the cell mount has no cytoplasm root');
  }

  const instance = buildMitosis({
    cell,
    target: MITOSIS_TARGET,
    root,
    seed: 'test/reproduction',
  });

  return { mounted, instance, envelope, envelopeMaterial };
}

function frameAt(progress: number, cytokinesis: 'auto' | 'animal' | 'plant' = 'auto'): ProcessFrame {
  const frozen = progress * MITOSIS_DURATION_SECONDS;

  return { elapsed: frozen, scale: 1, delta: 0, light: 1, cytokinesis, frozen };
}

/** The largest `x` among the membrane's vertices near the equator, in the geometry's own space. */
function equatorialExtent(geometry: Mesh['geometry'], band = 0.05): number {
  const attribute = geometry.getAttribute('position');
  let extent = 0;

  for (let index = 0; index < attribute.count; index += 1) {
    if (Math.abs(attribute.getY(index)) > band) {
      continue;
    }

    extent = Math.max(extent, Math.abs(attribute.getX(index)));
  }

  return extent;
}

function visibleMeshes(instance: ProcessInstance): number {
  let count = 0;

  instance.object.traverse((child) => {
    if (child instanceof Mesh && child.visible) {
      count += 1;
    }
  });

  return count;
}

/** The two daughter nuclei, which are named per pole rather than once for the pair. */
function daughterMeshes(instance: ProcessInstance): Mesh[] {
  const found: Mesh[] = [];

  instance.object.traverse((child) => {
    if (child instanceof Mesh && child.name.startsWith(DAUGHTER_ENVELOPE_PART)) {
      found.push(child);
    }
  });

  return found;
}

describe('the mitosis instance', () => {
  it('is a scripted, whole-cell process with a paused labelled timeline', () => {
    const { mounted, instance } = setup();

    try {
      expect(instance.id).toBe('mitosis');
      expect(instance.processId).toBe('reproduction');
      expect(instance.organelleId).toBe('cytoplasm');
      expect(instance.scripted).toBe(true);
      // Mitosis has nothing to do with light, and the counter is what proves it does not touch it.
      expect(instance.lightDriven).toBe(false);
      expect(instance.uniformWrites).toBe(0);
      expect(instance.timeline).not.toBeNull();
      expect(instance.timeline?.paused()).toBe(true);
      expect(instance.timeline?.duration()).toBeCloseTo(MITOSIS_DURATION_SECONDS, 6);
      // The label vocabulary the timeline inserts is the phase vocabulary, and nothing else.
      expect(Object.keys({ ...instance.phases })).toEqual([...MITOSIS_PHASE_ORDER]);
      expect(instance.phases['anaphase']).toBe(MITOSIS_BANDS.anaphase.start);
      expect(instance.object.name).toBe('process:mitosis');
    } finally {
      instance.dispose();
      mounted.dispose();
    }
  });

  it('plays the five phases in order, and each label is reachable by seeking to it', () => {
    const { mounted, instance } = setup();

    try {
      const seen: string[] = [];

      for (const phase of ['prophase', 'metaphase', 'anaphase', 'telophase', 'cytokinesis'] as const) {
        instance.update(frameAt(MITOSIS_BANDS[phase].start));
        seen.push(instance.label ?? '');
      }

      expect(seen).toEqual(['prophase', 'metaphase', 'anaphase', 'telophase', 'cytokinesis']);

      // A frozen frame reports the playhead it actually holds, and no advance.
      instance.update(frameAt(MITOSIS_BANDS.anaphase.start));
      expect(instance.rate).toBe(0);
      expect(instance.time).toBeCloseTo(MITOSIS_BANDS.anaphase.start * MITOSIS_DURATION_SECONDS, 6);
      expect(instance.progress).toBeCloseTo(MITOSIS_BANDS.anaphase.start, 6);
    } finally {
      instance.dispose();
      mounted.dispose();
    }
  });

  it('renders the same frame whichever direction a progress value was reached from', () => {
    const first = setup();
    const second = setup();

    try {
      first.instance.update(frameAt(0.95));
      const forward = first.instance.extra;

      // Walk the scrub backwards through the intermediate phases, then land on the same value.
      for (const progress of [0.7, 0.5, 0.3, 0.1, 0.5, 0.9]) {
        first.instance.update(frameAt(progress));
      }

      first.instance.update(frameAt(0.95));

      expect(first.instance.extra).toEqual(forward);

      // And two independent builds of the same time agree, which is what makes a fixture a function
      // of the URL rather than of the page's history.
      second.instance.update(frameAt(0.95));
      expect(second.instance.extra).toEqual(forward);
    } finally {
      first.instance.dispose();
      first.mounted.dispose();
      second.instance.dispose();
      second.mounted.dispose();
    }
  });

  it('reports the chromosome structure the frame actually drew', () => {
    const { mounted, instance } = setup();

    try {
      instance.update(frameAt(MITOSIS_BANDS.prophase.start));
      expect(instance.extra?.sisterSeparation).toBeCloseTo(SISTER_REST_GAP, 9);
      expect(instance.extra?.groups).toBe(1);

      instance.update(frameAt(0.34));
      expect(instance.extra?.sisterSeparation).toBeCloseTo(SISTER_REST_GAP, 9);
      expect(instance.extra?.groups).toBe(1);

      instance.update(frameAt(0.5));
      expect(instance.extra?.groups).toBe(2);
      expect(instance.extra?.sisterSeparation).toBeGreaterThan(0.5);

      instance.update(frameAt(0.9));
      expect(instance.extra?.groups).toBe(2);
      expect(instance.extra?.groupSpread).toBeLessThan(0.25);
    } finally {
      instance.dispose();
      mounted.dispose();
    }
  });
});

describe('the two cytokinesis mechanisms', () => {
  it('pinches the animal boundary and shrinks the ring, and draws no plate at all', () => {
    const { mounted, instance } = setup('animal');

    try {
      const membrane = findMesh(mounted.group, MEMBRANE_PART);
      const plate = findMesh(instance.object, PLATE_PART);
      const ring = findMesh(instance.object, RING_PART);

      expect(membrane).toBeDefined();
      const resting = equatorialExtent(membrane!.geometry);

      instance.update(frameAt(0.95, 'auto'));

      expect(instance.extra?.pinch).toBe(1);
      expect(instance.extra?.plate).toBe(0);
      expect(ring?.visible).toBe(true);
      // The mechanism is a deformation of the cell's own boundary, and the plate is absent — not
      // present with another colour.
      expect(plate?.visible).toBe(false);
      expect(equatorialExtent(membrane!.geometry)).toBeLessThan(resting * 0.85);
    } finally {
      instance.dispose();
      mounted.dispose();
    }
  });

  it('builds an opaque plate outward from the centre in the plant cell, and touches no boundary', () => {
    const { mounted, instance } = setup('plant');

    try {
      const membrane = findMesh(mounted.group, MEMBRANE_PART);
      const plate = findMesh(instance.object, PLATE_PART);
      const ring = findMesh(instance.object, RING_PART);

      expect(membrane).toBeDefined();
      const resting = equatorialExtent(membrane!.geometry);

      instance.update(frameAt(0.95, 'auto'));

      expect(instance.extra?.plate).toBe(1);
      expect(instance.extra?.pinch).toBe(0);
      expect(plate?.visible).toBe(true);
      expect(ring?.visible).toBe(false);
      // The boundary is untouched: the plant cell builds a new wall rather than pinching.
      expect(equatorialExtent(membrane!.geometry)).toBeCloseTo(resting, 6);
      // And the plate has grown to reach it.
      expect(plate?.scale.x).toBeGreaterThan(0.8);
    } finally {
      instance.dispose();
      mounted.dispose();
    }
  });

  it('honours the single-cell toggle: the plant mechanism inside the animal cell', () => {
    const { mounted, instance } = setup('animal');

    try {
      const plate = findMesh(instance.object, PLATE_PART);
      const ring = findMesh(instance.object, RING_PART);

      instance.update(frameAt(0.95, 'plant'));

      expect(instance.extra?.plate).toBe(1);
      expect(instance.extra?.pinch).toBe(0);
      expect(plate?.visible).toBe(true);
      expect(ring?.visible).toBe(false);

      // And the toggle is live: the same frame flips back with no rebuild.
      instance.update(frameAt(0.95, 'animal'));
      expect(instance.extra?.plate).toBe(0);
      expect(instance.extra?.pinch).toBe(1);
      expect(plate?.visible).toBe(false);
    } finally {
      instance.dispose();
      mounted.dispose();
    }
  });

  it('costs four draw calls at the cytokinesis frame, whichever mechanism runs', () => {
    // Chromatids (one instanced call), the ring or the plate, and the two daughter nuclei. Asserted
    // rather than bounded because it is what makes the <=150-per-cell budget meaningful.
    const animal = setup('animal');
    const plant = setup('plant');

    try {
      animal.instance.update(frameAt(0.95, 'animal'));
      plant.instance.update(frameAt(0.95, 'plant'));

      expect(visibleMeshes(animal.instance)).toBe(4);
      expect(visibleMeshes(plant.instance)).toBe(4);
      expect(daughterMeshes(animal.instance)).toHaveLength(2);
      expect(animal.instance.extra?.ring).toBe(1);
    } finally {
      animal.instance.dispose();
      animal.mounted.dispose();
      plant.instance.dispose();
      plant.mounted.dispose();
    }
  });
});

describe('what the sequence borrows and gives back', () => {
  it('restores the boundary geometry exactly, and the nucleus with it', () => {
    const { mounted, instance, envelope, envelopeMaterial } = setup('animal');

    try {
      const membrane = findMesh(mounted.group, MEMBRANE_PART)!;
      const before = Float32Array.from(membrane.geometry.getAttribute('position').array);

      instance.update(frameAt(0.95, 'animal'));
      expect(equatorialExtent(membrane.geometry)).toBeLessThan(0.9);
      expect(envelope?.visible).toBe(false);
      expect(envelopeMaterial.opacity).toBeLessThan(ENVELOPE_OPACITY);

      instance.dispose();

      expect(Float32Array.from(membrane.geometry.getAttribute('position').array)).toEqual(before);
      expect(envelope?.visible).toBe(true);
      expect(envelopeMaterial.opacity).toBe(ENVELOPE_OPACITY);
    } finally {
      mounted.dispose();
    }
  });

  it('fades the nuclear envelope out before the chromatids leave it, and forms two at telophase', () => {
    const { mounted, instance, envelope } = setup('animal');

    try {
      instance.update(frameAt(0.05));
      expect(envelope?.visible).toBe(true);

      instance.update(frameAt(0.34));
      expect(envelope?.visible).toBe(false);
      expect(instance.extra?.groups).toBe(1);

      instance.update(frameAt(0.76));
      // Chromatids plus the two new nuclei that formed at the poles — and no ring yet, because the
      // cytokinesis band has not opened.
      expect(instance.extra?.groups).toBe(2);
      expect(visibleMeshes(instance)).toBe(3);
    } finally {
      instance.dispose();
      mounted.dispose();
    }
  });
});
