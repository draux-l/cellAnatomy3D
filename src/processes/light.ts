/**
 * The transient light intensity (task 5.4, design D5).
 *
 * The light slider is the one control whose value must never reach React state. It is written by
 * the slider's `input` event and by the `?light=` fixture, read once per frame by the process
 * driver, and written into the photosynthesis shader's `uLightIntensity` uniform — and the motion
 * stops when it is zero. A `useState` anywhere on that path would be a re-render per pointer move
 * *and* a second source of truth for a value the shader already owns.
 *
 * **The write counter is the invariant's measurement, not decoration.** `uniformWrites` counts every
 * `uLightIntensity` write in the app, and there is exactly one call site that can make one
 * (`recordUniformWrite`). Respiration never calls it, which is what the harness asserts at both
 * ends of the slider — the runtime half of the requirement that the two processes are not
 * conflated. The static half is a source scan that the respiration module mentions no light uniform
 * at all.
 *
 * This module has no three.js import, so the shell's process panel can read and write the control
 * value without pulling the 3D chunk into the entry graph.
 */

/** The control's units are whole percents, like the disassembly control's. */
export const LIGHT_MIN = 0;
export const LIGHT_MAX = 100;

/**
 * The shipped default: full light.
 *
 * Chosen so photosynthesis is visibly running the first time a user enters the process. Starting at
 * zero would make the honest zero-light state the *default* experience, which would read as a
 * broken feature rather than as a statement about light.
 */
export const LIGHT_DEFAULT = LIGHT_MAX;

/** Rounds a control value to a whole percent inside the range. */
export function clampLightPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return LIGHT_DEFAULT;
  }

  return Math.round(Math.min(LIGHT_MAX, Math.max(LIGHT_MIN, value)));
}

export function percentToIntensity(percent: number): number {
  return clampLightPercent(percent) / LIGHT_MAX;
}

export interface LightState {
  /** The control value, 0..100 in whole steps. */
  readonly percent: number;
  /** The same value as the shader consumes it, 0..1. */
  readonly intensity: number;
  /** How many `uLightIntensity` uniform writes have happened since the last `reset()`. */
  readonly uniformWrites: number;
  /** The control write: the slider and the fixture both come through here, neither is a uniform write. */
  setPercent(value: number): void;
  /**
   * Records one write of the `uLightIntensity` uniform and returns the value written.
   *
   * Every writer in the app goes through this, so "how many times was the light uniform written?"
   * is answerable without grepping, and a process that must not write it can be proven not to.
   */
  recordUniformWrite(): number;
  reset(): void;
}

export function createLightState(percent = LIGHT_DEFAULT): LightState {
  let current = clampLightPercent(percent);
  let uniformWrites = 0;

  return {
    get percent() {
      return current;
    },
    get intensity() {
      return percentToIntensity(current);
    },
    get uniformWrites() {
      return uniformWrites;
    },

    setPercent(value) {
      current = clampLightPercent(value);
    },

    recordUniformWrite() {
      uniformWrites += 1;

      return percentToIntensity(current);
    },

    reset() {
      current = LIGHT_DEFAULT;
      uniformWrites = 0;
    },
  };
}

/** The one light state the app uses. Never in React state, never in the store. */
export const processLight = createLightState();
