import type { SpeedSetting } from './store';

/**
 * The transient process clock.
 *
 * It lives outside React on purpose: `useFrame` reads it, shaders and instances are
 * written from it, and nothing in the reactive store ever mirrors it. A component that
 * needs a smooth value reads `elapsed` inside `useFrame` — it does not subscribe.
 */

/** Ratified speed mapping: pause stops, slow is quarter speed, realtime is 1:1. */
export const SPEED_SCALE: Record<SpeedSetting, number> = {
  pause: 0,
  slow: 0.25,
  realtime: 1,
};

/**
 * Longest delta the clock will accept, in seconds. A backgrounded tab produces one
 * enormous rAF delta on return; without a clamp every animation would jump.
 */
export const MAX_FRAME_DELTA_SECONDS = 0.1;

export function speedToScale(speed: SpeedSetting): number {
  return SPEED_SCALE[speed];
}

export interface ProcessClock {
  /** Seconds accumulated at the current scale. */
  readonly elapsed: number;
  /** Current multiplier applied to every delta. */
  readonly scale: number;
  /** True while the clock is pinned by a fixture. */
  readonly frozen: boolean;
  setScale: (scale: number) => void;
  /** Advances the clock and returns the new elapsed time. */
  tick: (deltaSeconds: number) => number;
  /** Pins the clock at a fixed time and stops it (fixture determinism). */
  freezeAt: (seconds: number) => void;
  /** Leaves frozen mode, keeping the elapsed time it was pinned at. */
  resume: () => void;
  reset: () => void;
}

export function createProcessClock(): ProcessClock {
  let elapsed = 0;
  let scale = SPEED_SCALE.realtime;
  let frozen = false;

  return {
    get elapsed() {
      return elapsed;
    },
    get scale() {
      return scale;
    },
    get frozen() {
      return frozen;
    },

    setScale(nextScale) {
      scale = nextScale;
    },

    tick(deltaSeconds) {
      if (frozen) {
        return elapsed;
      }

      // Negative deltas are meaningless and a NaN would poison the clock permanently.
      const safeDelta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
      elapsed += Math.min(safeDelta, MAX_FRAME_DELTA_SECONDS) * scale;

      return elapsed;
    },

    freezeAt(seconds) {
      frozen = true;
      elapsed = seconds;
    },

    resume() {
      frozen = false;
    },

    reset() {
      elapsed = 0;
      frozen = false;
    },
  };
}

/** The single clock the app uses. `useFrame` ticks it once per frame. */
export const processClock = createProcessClock();
