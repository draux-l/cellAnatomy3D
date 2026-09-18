import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { processLight } from '../light';
import { mountOrganelle } from '../partMount';
import { findGrana } from '../structure';
import type { ProcessFrame, ProcessInstance } from '../types';
import {
  CARRIERS_PER_GRANUM,
  GLUCOSE_PER_CYCLE,
  OXYGEN_PER_CYCLE,
  PHOTOSYNTHESIS_CYCLE_SECONDS,
} from './stages';
import { PHOTOSYNTHESIS_TARGET } from './targets';
import {
  PARTICLE_KIND,
  buildPhotosynthesis,
  granumSites,
  particleColour,
  photosynthesisParticles,
} from './photosynthesis';

/**
 * Photosynthesis (task 5.3/5.4, spec: `Photosynthesis Animates Inside The Chloroplast`,
 * `Light-Intensity Slider Drives The Process Rate`).
 *
 * Three things are asserted here and only two of them are about the animation:
 *
 * 1. **The flow is placed on the built grana** — centres, axes and radii read back out of the
 *    chloroplast builder's own instance buffer, because "on the grana" is a claim about geometry.
 * 2. **The rate is a measurably different function of the slider at its two ends**, which is the
 *    spec's scenario stated as arithmetic: at zero light the process's clock does not move at all.
 * 3. **It is the process that writes the light uniform**, counted, so the respiration half of the
 *    invariant has something to be compared against.
 */

const PHOTOSYNTHESIS_SOURCE = readFileSync(
  join(process.cwd(), 'src/processes/nutrition/photosynthesis.ts'),
  'utf8',
);

function runningFrame(delta: number, light: number, scale = 1): ProcessFrame {
  return { elapsed: 0, scale, delta, light, cytokinesis: 'auto', frozen: null };
}

function withPhotosynthesis(run: (instance: ProcessInstance) => void): void {
  const mounted = mountOrganelle(PHOTOSYNTHESIS_TARGET.organelleId, 'plant');

  try {
    const instance = buildPhotosynthesis({
      cell: 'plant',
      target: PHOTOSYNTHESIS_TARGET,
      root: mounted.root,
      seed: `${mounted.build.seed}/nutrition`,
    });

    try {
      run(instance);
    } finally {
      instance.dispose();
    }
  } finally {
    mounted.dispose();
  }
}

/** Runs `frames` frames and returns the instance clock's advance over them. */
function advance(instance: ProcessInstance, light: number, frames: number): number {
  const before = instance.time;

  for (let frame = 0; frame < frames; frame += 1) {
    instance.update(runningFrame(1 / 60, light));
  }

  return instance.time - before;
}

describe('grana placement', () => {
  it('reads every granum out of the built chloroplast', () => {
    const mounted = mountOrganelle(PHOTOSYNTHESIS_TARGET.organelleId, 'plant');

    try {
      const sites = granumSites(mounted.root, findGrana(mounted.root));

      expect(sites).toHaveLength(5);

      for (const site of sites) {
        expect(site.axis.length()).toBeCloseTo(1, 5);
        expect(site.radial.length()).toBeCloseTo(1, 5);
        // The shader builds its helix from a radial perpendicular to the axis: if these are not
        // perpendicular the orbit tilts out of the disc plane and the flow leaves the granum.
        expect(site.axis.dot(site.radial)).toBeCloseTo(0, 5);
        expect(site.outerRadius).toBeGreaterThan(0);
        expect(site.halfHeight).toBeGreaterThan(0);
      }

      // The grana are spread along the organelle, not stacked on top of each other.
      const centres = sites.map((site) => site.centre);
      const spread = Math.max(...centres.map((centre) => centre.y)) - Math.min(...centres.map((centre) => centre.y));

      expect(spread).toBeGreaterThan(0.3);
    } finally {
      mounted.dispose();
    }
  });

  it('places a granum\'s flow around that granum and not somewhere else in the organelle', () => {
    const mounted = mountOrganelle(PHOTOSYNTHESIS_TARGET.organelleId, 'plant');

    try {
      const sites = granumSites(mounted.root, findGrana(mounted.root));
      const particles = photosynthesisParticles(sites, `${mounted.build.seed}/nutrition`);

      expect(particles).toHaveLength(sites.length * (CARRIERS_PER_GRANUM + OXYGEN_PER_CYCLE + GLUCOSE_PER_CYCLE));

      const carriers = particles.filter((particle) => particle.kind === PARTICLE_KIND.carrier);

      expect(carriers).toHaveLength(sites.length * CARRIERS_PER_GRANUM);

      for (const carrier of carriers) {
        // One of the five grana, exactly — not the organelle's centre.
        const nearest = sites.reduce(
          (best, site) => Math.min(best, site.centre.distanceTo(carrier.centre)),
          Number.POSITIVE_INFINITY,
        );

        expect(nearest).toBeCloseTo(0, 6);
        // The orbit hugs the discs, and the travel spans the pile.
        expect(carrier.radius).toBeGreaterThan(0);
        expect(carrier.radius).toBeLessThan(0.15);
        expect(carrier.travel).toBeGreaterThan(0);
      }
    } finally {
      mounted.dispose();
    }
  });

  it('emits the stoichiometric ratio of oxygen to glucose', () => {
    const mounted = mountOrganelle(PHOTOSYNTHESIS_TARGET.organelleId, 'plant');

    try {
      const sites = granumSites(mounted.root, findGrana(mounted.root));
      const particles = photosynthesisParticles(sites, `${mounted.build.seed}/nutrition`);
      const oxygen = particles.filter((particle) => particle.kind === PARTICLE_KIND.oxygen);
      const glucose = particles.filter((particle) => particle.kind === PARTICLE_KIND.glucose);

      // 6 CO2 + 6 H2O -> C6H12O6 + 6 O2: six oxygens per sugar, per granum.
      expect(oxygen).toHaveLength(sites.length * OXYGEN_PER_CYCLE);
      expect(glucose).toHaveLength(sites.length * GLUCOSE_PER_CYCLE);
      expect(oxygen.length / glucose.length).toBe(OXYGEN_PER_CYCLE / GLUCOSE_PER_CYCLE);
    } finally {
      mounted.dispose();
    }
  });

  it('gives each kind its own ink', () => {
    expect(particleColour(PARTICLE_KIND.carrier)).not.toEqual(particleColour(PARTICLE_KIND.oxygen));
    expect(particleColour(PARTICLE_KIND.oxygen)).not.toEqual(particleColour(PARTICLE_KIND.glucose));
    expect(particleColour(PARTICLE_KIND.glucose).getHexString()).toBe(
      // The palette seam: the colour is data, read from one table.
      'f0c8ff',
    );
  });
});

describe('the light-rate mapping', () => {
  beforeEach(() => {
    processLight.reset();
  });

  it('is a continuous process inside the chloroplast, with no timeline to scrub', () => {
    withPhotosynthesis((instance) => {
      expect(instance.id).toBe('photosynthesis');
      expect(instance.organelleId).toBe('chloroplast');
      expect(instance.scripted).toBe(false);
      expect(instance.lightDriven).toBe(true);
      expect(instance.timeline).toBeNull();
      expect(instance.label).toBeNull();
      expect(instance.progress).toBeNull();
    });
  });

  it('runs measurably faster at maximum light than at minimum', () => {
    const rates = [0, 0.25, 1].map((light) => {
      let measured = 0;

      withPhotosynthesis((instance) => {
        measured = advance(instance, light, 60);
      });

      return measured;
    });

    expect(rates[0]).toBe(0);
    expect(rates[1]).toBeGreaterThan(rates[0]!);
    expect(rates[2]).toBeGreaterThan(rates[1]!);
    // The mapping is linear by design, so the ratios are exact rather than merely ordered.
    expect(rates[1]).toBeCloseTo(rates[2]! * 0.25, 5);
  });

  it('stops completely at zero light and says so', () => {
    withPhotosynthesis((instance) => {
      for (let frame = 0; frame < 120; frame += 1) {
        instance.update(runningFrame(1 / 60, 1));
      }

      const lit = instance.time;

      expect(lit).toBeGreaterThan(0);
      expect(instance.lightRequired).toBe(false);

      for (let frame = 0; frame < 120; frame += 1) {
        instance.update(runningFrame(1 / 60, 0));
      }

      // Not "slower": stopped. The spec's honesty requirement is about exactly this difference.
      expect(instance.time).toBeCloseTo(lit, 10);
      expect(instance.rate).toBe(0);
      expect(instance.lightRequired).toBe(true);
    });
  });

  it('holds its clock while the shared speed control is paused, whatever the light', () => {
    withPhotosynthesis((instance) => {
      for (let frame = 0; frame < 30; frame += 1) {
        instance.update(runningFrame(1 / 60, 1));
      }

      const held = instance.time;

      for (let frame = 0; frame < 60; frame += 1) {
        instance.update(runningFrame(1 / 60, 1, 0));
      }

      expect(instance.time).toBeCloseTo(held, 10);
      expect(instance.rate).toBe(0);
      expect(instance.lightRequired).toBe(false);
    });
  });

  it('is a pure function of a pinned clock', () => {
    const trace = (): number[] => {
      const times: number[] = [];

      withPhotosynthesis((instance) => {
        for (const time of [0, 0.8, 3.2, 9.6]) {
          instance.update({ elapsed: time, scale: 1, delta: 0, light: 1, cytokinesis: 'auto', frozen: time });
          times.push(instance.time);
        }
      });

      return times;
    };

    expect(trace()).toEqual([0, 0.8, 3.2, 9.6]);
    expect(trace()).toEqual(trace());
  });

  it('counts emissions from completed cycles, never ahead of the animation', () => {
    withPhotosynthesis((instance) => {
      expect(instance.emitted.oxygen).toBe(0);

      advance(instance, 1, 60);
      expect(instance.emitted.oxygen).toBe(0);

      for (let frame = 0; frame < 600; frame += 1) {
        instance.update(runningFrame(1 / 60, 1));
      }

      const cycles = Math.floor(instance.time / PHOTOSYNTHESIS_CYCLE_SECONDS);

      expect(cycles).toBeGreaterThan(0);
      expect(instance.emitted.oxygen).toBe(cycles * OXYGEN_PER_CYCLE * 5);
      expect(instance.emitted.glucose).toBe(cycles * GLUCOSE_PER_CYCLE * 5);
      expect(instance.emitted.atp).toBe(0);
    });
  });

  it('writes the light uniform once per frame, through the one counter', () => {
    const before = processLight.uniformWrites;

    withPhotosynthesis((instance) => {
      for (let frame = 0; frame < 40; frame += 1) {
        instance.update(runningFrame(1 / 60, 1));
      }

      expect(instance.uniformWrites).toBe(40);
      expect(processLight.uniformWrites - before).toBe(40);
    });
  });
});

describe('the photosynthesis module as source', () => {
  it('writes the light uniform through the counted path', () => {
    expect(PHOTOSYNTHESIS_SOURCE).toContain('processLight.recordUniformWrite()');
    expect(PHOTOSYNTHESIS_SOURCE).toContain("import { processLight } from '../light'");
  });

  it('drives the flow from the clock rather than from React', () => {
    // The whole cost argument is "one uniform per frame". A `useState`, an interval or a frame
    // subscription here would be the defect this asserts against.
    expect(PHOTOSYNTHESIS_SOURCE).not.toContain('useState');
    expect(PHOTOSYNTHESIS_SOURCE).not.toContain('setInterval');
    expect(PHOTOSYNTHESIS_SOURCE).toContain('uTime');
  });
});
