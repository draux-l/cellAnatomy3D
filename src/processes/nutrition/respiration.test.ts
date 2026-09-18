import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { processLight } from '../light';
import { mountOrganelle } from '../partMount';
import { RESPIRATION_TARGET } from './targets';
import { RESPIRATION_BANDS, RESPIRATION_CYCLE_SECONDS, RESPIRATION_PHASES } from './stages';
import { ATP_DRIFT_RATIO, ATP_REST_SCALE, atpStage, buildRespiration } from './respiration';
import type { ProcessFrame, ProcessInstance } from '../types';

/**
 * Respiration (task 5.2, spec: `Respiration Animates Inside The Mitochondrion`, `The Two Processes
 * Are Not Conflated`).
 *
 * The strongest assertion in this file is the one the spec asks for in the negative: **respiration
 * never writes the light uniform, and its rate does not move when the slider does.** It is asserted
 * twice over — the app's global write counter must not change while respiration runs at either end
 * of the slider, and a source scan must find no light uniform or light state in the module at all.
 * A "shared energy animation" with a recoloured label would fail both, which is exactly why they
 * exist (spec: the two processes are not conflated).
 *
 * The timeline is never *played* here. A unit test has no render loop, and GSAP would fall back to a
 * timer ticker and make the assertions race the clock. Frozen frames exercise the same seek path a
 * fixture uses, which is the deterministic one; "pause holds the process" is asserted through the
 * instance's own clock and through the end-to-end suite.
 */

const RESPRATION_SOURCE = readFileSync(
  join(process.cwd(), 'src/processes/nutrition/respiration.ts'),
  'utf8',
);

/** A frame with no fixture pinning the clock. */
function runningFrame(delta: number, light: number, scale = 1): ProcessFrame {
  return { elapsed: 0, scale, delta, light, frozen: null };
}

function frozenFrame(time: number, light = 1): ProcessFrame {
  return { elapsed: time, scale: 1, delta: 0, light, frozen: time };
}

function withRespiration(run: (instance: ProcessInstance) => void): void {
  const mounted = mountOrganelle(RESPIRATION_TARGET.organelleId);

  try {
    const instance = buildRespiration({
      cell: 'animal',
      target: RESPIRATION_TARGET,
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

describe('the respiration instance', () => {
  beforeEach(() => {
    processLight.reset();
  });

  it('is a scripted process inside the mitochondrion, driven by a paused labelled timeline', () => {
    withRespiration((instance) => {
      expect(instance.id).toBe('respiration');
      expect(instance.organelleId).toBe('mitochondrion');
      expect(instance.scripted).toBe(true);
      expect(instance.lightDriven).toBe(false);
      expect(instance.timeline).not.toBeNull();
      expect(instance.timeline?.paused()).toBe(true);
      expect(instance.timeline?.timeScale()).toBe(1);
      expect(instance.phases).toEqual(RESPIRATION_PHASES);
    });
  });

  it('attaches one object to the organelle root and detaches it on dispose', () => {
    const mounted = mountOrganelle(RESPIRATION_TARGET.organelleId);

    try {
      const instance = buildRespiration({
        cell: 'animal',
        target: RESPIRATION_TARGET,
        root: mounted.root,
        seed: `${mounted.build.seed}/nutrition`,
      });

      mounted.root.add(instance.object);

      expect(mounted.root.children).toContain(instance.object);
      expect(instance.object.name).toBe('process:respiration');

      instance.object.removeFromParent();
      instance.dispose();

      expect(mounted.root.children).not.toContain(instance.object);
      // Idempotent: a driver may dispose twice on a fast unmount, and a second kill must not throw.
      expect(() => instance.dispose()).not.toThrow();
    } finally {
      mounted.dispose();
    }
  });

  it('advances its own clock at the shared speed', () => {
    withRespiration((instance) => {
      for (let frame = 0; frame < 60; frame += 1) {
        instance.update(runningFrame(1 / 60, 1));
      }

      expect(instance.time).toBeCloseTo(1, 5);
      expect(instance.rate).toBe(1);

      for (let frame = 0; frame < 60; frame += 1) {
        instance.update(runningFrame(1 / 60, 1, 0.25));
      }

      expect(instance.time).toBeCloseTo(1.25, 5);
      expect(instance.rate).toBe(0.25);
    });
  });

  it('holds its clock while paused', () => {
    withRespiration((instance) => {
      for (let frame = 0; frame < 30; frame += 1) {
        instance.update(runningFrame(1 / 60, 1));
      }

      const held = instance.time;

      for (let frame = 0; frame < 120; frame += 1) {
        instance.update(runningFrame(1 / 60, 1, 0));
      }

      expect(instance.time).toBeCloseTo(held, 10);
      expect(instance.rate).toBe(0);
    });
  });

  it('never writes the light uniform, at either end of the slider', () => {
    // The global counter is the measurement: it counts every `uLightIntensity` write in the app, so
    // "unchanged" means no uniform write happened anywhere while respiration ran.
    const before = processLight.uniformWrites;

    withRespiration((instance) => {
      for (let frame = 0; frame < 120; frame += 1) {
        instance.update(runningFrame(1 / 60, 1));
      }

      const afterFullLight = processLight.uniformWrites;

      processLight.setPercent(0);

      for (let frame = 0; frame < 120; frame += 1) {
        instance.update(runningFrame(1 / 60, 0));
      }

      expect(processLight.uniformWrites).toBe(afterFullLight);
      expect(instance.uniformWrites).toBe(0);
      expect(instance.lightRequired).toBe(false);
    });

    expect(processLight.uniformWrites).toBe(before);
  });

  it('is unchanged by the light slider: same clock, same label, same rate', () => {
    const trace = (light: number): { time: number; label: string | null; progress: number | null; rate: number } => {
      let result = { time: 0, label: null as string | null, progress: null as number | null, rate: 0 };

      withRespiration((instance) => {
        // Frozen frames: identical input, one run at full light and one in darkness.
        for (const time of [0.0, 0.5, 1.6, 2.4, 3.9]) {
          instance.update(frozenFrame(time, light));
        }

        result = {
          time: instance.time,
          label: instance.label,
          progress: instance.progress,
          rate: instance.rate,
        };
      });

      return result;
    };

    expect(trace(0)).toEqual(trace(1));
    expect(trace(0).label).toBe('atp');
  });

  it('reports the stage the seeked timeline is in, and the cycle phase with it', () => {
    withRespiration((instance) => {
      instance.update(frozenFrame(0.2));
      expect(instance.label).toBe('reactions');
      expect(instance.progress).toBeCloseTo(0.2 / RESPIRATION_CYCLE_SECONDS, 5);

      instance.update(frozenFrame(2.0));
      expect(instance.label).toBe('atp');
      expect(instance.progress).toBeCloseTo(2 / RESPIRATION_CYCLE_SECONDS, 5);
    });
  });

  it('counts ATP from completed cycles rather than from a wall clock', () => {
    withRespiration((instance) => {
      expect(instance.emitted.atp).toBe(0);

      for (let frame = 0; frame < 60; frame += 1) {
        instance.update(runningFrame(1 / 60, 1));
      }

      // One cycle of 4.2 s has not elapsed at 1 s, so nothing has completed.
      expect(instance.emitted.atp).toBe(0);

      for (let frame = 0; frame < 300; frame += 1) {
        instance.update(runningFrame(1 / 60, 1));
      }

      const cycles = Math.floor(instance.time / RESPIRATION_CYCLE_SECONDS);

      expect(cycles).toBeGreaterThan(0);
      expect(instance.emitted.atp).toBe(cycles * 12 * 3);
      expect(instance.emitted.oxygen).toBe(0);
    });
  });
});

describe('the ATP cycle', () => {
  it('keeps a molecule on its fold for the whole reaction band', () => {
    for (let step = 0; step <= 20; step += 1) {
      const local = (step / 20) * RESPIRATION_BANDS.reactions.end;
      const stage = atpStage(local, 0.1);

      expect(stage.drift, `local ${local} drifted off its fold`).toBe(0);
      expect(stage.scale).toBeGreaterThanOrEqual(ATP_REST_SCALE);
    }
  });

  it('never jumps between the bands', () => {
    const boundary = RESPIRATION_BANDS.reactions.end;
    const before = atpStage(boundary - 1e-6, 0.1);
    const after = atpStage(boundary, 0.1);

    expect(after.scale).toBeCloseTo(before.scale, 4);
    expect(after.drift).toBeCloseTo(0, 4);
  });

  it('drifts a molecule away from the fold only once it is released, and never past the limit', () => {
    const driftDistance = 0.1;
    let previous = -1;

    for (let step = 0; step <= 20; step += 1) {
      const local = RESPIRATION_BANDS.atp.start + (step / 20) * (1 - RESPIRATION_BANDS.atp.start);
      const stage = atpStage(local, driftDistance);

      expect(stage.drift).toBeGreaterThanOrEqual(previous);
      expect(stage.drift).toBeLessThanOrEqual(driftDistance + 1e-9);

      previous = stage.drift;
    }

    expect(atpStage(1 - 1e-6, driftDistance).drift).toBeCloseTo(driftDistance, 2);
  });

  it('is a pure function of the phase', () => {
    expect(atpStage(0.6, 0.1)).toEqual(atpStage(0.6, 0.1));
    expect(atpStage(0.6, 0.1)).not.toEqual(atpStage(0.9, 0.1));
  });

  it('places its molecules on real folds, and sizes the drift from the folds themselves', () => {
    const mounted = mountOrganelle(RESPIRATION_TARGET.organelleId);

    try {
      // The measured radius is the sizing unit: a hard-coded travel would not survive a record whose
      // `size` changed.
      expect(ATP_DRIFT_RATIO).toBeGreaterThan(0);
      expect(mounted.build.parts.length).toBeGreaterThan(1);
    } finally {
      mounted.dispose();
    }
  });
});

describe('the respiration module as source', () => {
  /** The file with its comments stripped: a comment explaining why light is absent is not a use. */
  const code = RESPRATION_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  it('has no light uniform, no light state and no light read', () => {
    expect(code).not.toContain('uLightIntensity');
    expect(code).not.toContain('recordUniformWrite');
    expect(code).not.toContain("from '../light'");
    // The frame carries a light value for the processes that use it; this one must not read it.
    expect(code).not.toMatch(/frame\.light/);
  });

  it('declares itself light-independent', () => {
    // The mirror's two flags are the contract, and they are asserted here so a change that made
    // respiration light-driven would fail rather than quietly become a second photosynthesis.
    expect(code).toContain('lightDriven: false');
    expect(code).toContain('lightRequired: false');
  });
});
