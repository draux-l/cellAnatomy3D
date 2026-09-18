// gsap's timeline is reached through its ambient `gsap.core` namespace: the package exports the
// `gsap` object, not the `Timeline` class, so this empty type import is the documented way to bring
// the namespace in without a runtime import of the library here.
import type {} from 'gsap';
import type { Object3D } from 'three';
import type { CellId } from '../catalog/types';
import type { ProcessId } from './ids';

/**
 * The process contract (task 5.1, design D5).
 *
 * One contract serves all three vital processes, and it has exactly two animation paradigms:
 * **scripted** (a paused, labeled GSAP timeline) and **continuous** (a `useFrame` step that writes
 * uniforms or instance transforms from the shared clock). A process is one or the other, never
 * both, and no third animation library exists (skill Hard Rule).
 *
 * Three properties of this contract are load-bearing and easy to erode:
 *
 * 1. **Nothing here is React state.** An instance is built imperatively, owns its `Object3D`, and
 *    is advanced from a frame loop. `ProcessInstance` has no setter a component could subscribe to.
 * 2. **A fixture can pin the clock.** `ProcessFrame.frozen` is the fixture's pinned time, and every
 *    instance must be a pure function of it — otherwise a screenshot would depend on how long the
 *    page had been open, which is exactly what the harness cannot allow (design D10).
 * 3. **The light invariant is a declared property, not a convention.** `lightDriven` says whether
 *    the instance's motion depends on light, and `uniformWrites` counts the light uniform writes it
 *    made. Respiration must report zero at any light intensity (spec: `The Two Processes Are Not
 *    Conflated`), and the number is asserted rather than promised.
 */

/**
 * One frame, as every instance receives it.
 *
 * The values are read once per frame by the driver and passed down, so an instance never touches
 * the store, the clock or the light state directly.
 */
export interface ProcessFrame {
  /** Seconds on the shared `ProcessClock`, already scaled by the shared speed setting. */
  readonly elapsed: number;
  /** The shared speed scale in force: 0 paused, 0.25 slow, 1 real time. */
  readonly scale: number;
  /** Unscaled frame delta in seconds, clamped by the clock against a backgrounded tab. */
  readonly delta: number;
  /** Light intensity, 0..1, from the transient light state. */
  readonly light: number;
  /** The time a fixture pinned the clock at, or null while the clock is running. */
  readonly frozen: number | null;
}

/** What one instance has emitted since it was built. Counted from completed cycles, not sampled. */
export interface EmittedCounts {
  atp: number;
  oxygen: number;
  glucose: number;
}

/**
 * One running process inside one organelle.
 *
 * `time` and `rate` are the measurable pair the harness uses: `time` is the instance's own clock,
 * advanced by `delta × scale × rate`, so the rate of a light-driven process is the derivative of
 * `time` and is exactly zero when the light is off. `rate` is reported as well so a stopped process
 * is distinguishable from a slow one without differencing two samples.
 */
export interface ProcessInstance {
  /** Stable sub-process id, e.g. `respiration`. Unique inside one process. */
  readonly id: string;
  readonly processId: ProcessId;
  readonly cell: CellId;
  /** The organelle the animation happens inside. */
  readonly organelleId: string;
  /** True when a GSAP timeline drives it, false when `update` writes the frame itself. */
  readonly scripted: boolean;
  /** True when its motion depends on light. Respiration is false, photosynthesis is true. */
  readonly lightDriven: boolean;
  /** The object this instance owns. The driver parents it to its organelle's root. */
  readonly object: Object3D;
  /** The scripted timeline, or null for a continuous process. Always `paused` at build time. */
  readonly timeline: gsap.core.Timeline | null;
  /** Label → phase within one cycle. Empty for a continuous process. */
  readonly phases: Readonly<Record<string, number>>;
  /** This frame's rate multiplier: 1 at real speed, 0 when paused or with no light. */
  readonly rate: number;
  /** Seconds this instance has advanced at its own rate. The measurable process clock. */
  readonly time: number;
  /** The active scripted label, or null. */
  readonly label: string | null;
  /** Phase inside the current cycle, 0..1, or null for a continuous process. */
  readonly progress: number | null;
  /** True when the process is stopped for lack of light (spec: `Zero light is honest`). */
  readonly lightRequired: boolean;
  /** Light-uniform writes this instance has made since it was built. Respiration stays at 0. */
  readonly uniformWrites: number;
  readonly emitted: EmittedCounts;
  /** Advances and writes exactly one frame. Called once per instance per frame. */
  update(frame: ProcessFrame): void;
  /** Kills the timeline and disposes every geometry and material the instance created. */
  dispose(): void;
}

/** One sub-process a definition runs in one cell. */
export interface ProcessTarget {
  /** Stable sub-process id, e.g. `respiration`. */
  readonly id: string;
  /** The organelle it happens inside. */
  readonly organelleId: string;
  /** True when the light slider drives this sub-process's rate. */
  readonly lightDriven: boolean;
}

/** Everything a build needs: where it is, what it animates inside, and its deterministic seed. */
export interface ProcessContext {
  readonly cell: CellId;
  readonly target: ProcessTarget;
  /**
   * The organelle root the instance animates inside.
   *
   * It is the same `Object3D` every other consumer follows — the disassembly loop writes its
   * `position`, the annotation anchor reads its `matrixWorld`, the pick volume is its child — so a
   * process that parents itself here inherits all three for free and needs no synchronisation.
   */
  readonly root: Object3D;
  /** Deterministic seed for every pseudo-random placement inside the animation. */
  readonly seed: string;
}

/**
 * A process, as the registry holds it.
 *
 * `targets(cell)` is the whole per-cell difference: the animal cell offers respiration in its
 * mitochondrion, the plant cell offers that **and** photosynthesis in its chloroplast. Nothing else
 * about the two cells' nutrition differs, and the copy is data rather than a branch.
 */
export interface ProcessDefinition {
  readonly id: ProcessId;
  /** Every sub-process this definition runs in one cell, in build order. */
  targets(cell: CellId): readonly ProcessTarget[];
  build(context: ProcessContext): ProcessInstance;
}
