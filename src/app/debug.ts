import { processClock } from './clock';

/**
 * `window.__cellDebug` — the bridge the verification harness reads.
 *
 * Everything here is a measurement, never a behaviour: the app renders exactly the
 * same with or without it. Design D8 makes three numbers machine-readable from M0:
 * draw calls (sampled at 1 Hz), rAF frame deltas (p50/p95 ring buffer), and the
 * first-render timestamp used for the "first meaningful 3D paint" budget.
 *
 * The core is framework-free on purpose so it is unit-testable in Node; the R3F
 * sampler that feeds it lives in `src/scene/useDebugSampler.ts`.
 */

/** Draw-call samples are taken once per second, not once per frame. */
export const DRAW_CALL_SAMPLE_INTERVAL_MS = 1000;

/** Ring-buffer capacity: 600 frames is ~10 s at 60 fps, the design's measurement window. */
export const FRAME_SAMPLE_CAPACITY = 600;

export interface FrameStats {
  /** How many deltas the ring buffer currently holds. */
  samples: number;
  lastMs: number;
  p50Ms: number;
  p95Ms: number;
  p50Fps: number;
  p95Fps: number;
}

export interface CellDebug {
  /** Active `?fixture=` name, or null for the real app. */
  fixture: string | null;
  /** True while the clock is pinned by a fixture. */
  frozen: boolean;
  /** Total frames rendered since load. */
  frames: number;
  /** Most recent 1 Hz draw-call sample. */
  drawCalls: number;
  /** Most recent 1 Hz triangle-count sample. */
  triangles: number;
  /** Millisecond timestamps (since navigation start) of the draw-call samples. */
  drawCallSampleTimesMs: number[];
  /** `performance.now()` at the first rendered frame — the first-3D-paint metric. */
  firstRenderAtMs: number | null;
  /** rAF delta statistics over the ring buffer. */
  frameStats: FrameStats;
  /** Read-only mirror of the transient clock, for the perf report. */
  clock: { elapsed: number; scale: number };
  /** Records one rendered frame. Both timestamps are injected so tests are deterministic. */
  recordFrame: (deltaMs: number, nowMs: number) => void;
  /** Records a draw-call/triangle sample, throttled to 1 Hz. */
  sampleRenderer: (calls: number, triangles: number, nowMs: number) => boolean;
  /** Clears measurements without touching the app. */
  reset: () => void;
}

export interface CellDebugOptions {
  fixture?: string | null;
  capacity?: number;
  sampleIntervalMs?: number;
}

/** Linear-interpolated percentile over an ascending copy of the values. */
export function computePercentile(values: readonly number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const rank = (percentile / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const lowValue = sorted[low] ?? 0;
  const highValue = sorted[high] ?? lowValue;

  return lowValue + (highValue - lowValue) * (rank - low);
}

export function msToFps(ms: number): number {
  return ms > 0 ? 1000 / ms : 0;
}

function emptyFrameStats(): FrameStats {
  return { samples: 0, lastMs: 0, p50Ms: 0, p95Ms: 0, p50Fps: 0, p95Fps: 0 };
}

export function createCellDebug(options: CellDebugOptions = {}): CellDebug {
  const capacity = options.capacity ?? FRAME_SAMPLE_CAPACITY;
  const sampleIntervalMs = options.sampleIntervalMs ?? DRAW_CALL_SAMPLE_INTERVAL_MS;
  const deltas: number[] = [];

  const debug: CellDebug = {
    fixture: options.fixture ?? null,
    frozen: false,
    frames: 0,
    drawCalls: 0,
    triangles: 0,
    drawCallSampleTimesMs: [],
    firstRenderAtMs: null,
    frameStats: emptyFrameStats(),
    clock: { elapsed: 0, scale: processClock.scale },

    recordFrame(deltaMs, nowMs) {
      debug.frames += 1;

      if (debug.firstRenderAtMs === null) {
        debug.firstRenderAtMs = nowMs;
      }

      deltas.push(deltaMs);

      if (deltas.length > capacity) {
        deltas.splice(0, deltas.length - capacity);
      }

      const p50Ms = computePercentile(deltas, 50);
      const p95Ms = computePercentile(deltas, 95);

      debug.frameStats = {
        samples: deltas.length,
        lastMs: deltaMs,
        p50Ms,
        p95Ms,
        p50Fps: msToFps(p50Ms),
        p95Fps: msToFps(p95Ms),
      };

      debug.frozen = processClock.frozen;
      debug.clock = { elapsed: processClock.elapsed, scale: processClock.scale };
    },

    sampleRenderer(calls, triangles, nowMs) {
      const lastSample = debug.drawCallSampleTimesMs.at(-1);

      if (lastSample !== undefined && nowMs - lastSample < sampleIntervalMs) {
        return false;
      }

      debug.drawCalls = calls;
      debug.triangles = triangles;
      debug.drawCallSampleTimesMs.push(nowMs);

      return true;
    },

    reset() {
      deltas.length = 0;
      debug.frames = 0;
      debug.drawCalls = 0;
      debug.triangles = 0;
      debug.drawCallSampleTimesMs = [];
      debug.firstRenderAtMs = null;
      debug.frameStats = emptyFrameStats();
    },
  };

  return debug;
}

/** The process-wide debug object. Installed on `window` by `main.tsx`. */
export const cellDebug = createCellDebug();

export interface RenderCounter {
  readonly calls: number;
  readonly triangles: number;
}

export interface SampledRenderer<Scene, Camera, Result> {
  render: (scene: Scene, camera: Camera) => Result;
  info: { render: RenderCounter };
}

/**
 * Counts the draw calls of the **cell scene** alone.
 *
 * `renderer.info.render` is reset by every top-level render, and three-based helpers run their
 * own auxiliary passes — drei's `<ContactShadows>` and `<Environment>` both do. Reading the
 * counter from a frame callback therefore reports whichever pass ran last, which in practice is
 * a shadow pass with one draw call and two triangles. Wrapping `render` and reading the counter
 * immediately after the app's own scene renders reports the number the budget cares about.
 */
export function attachRendererSampling<Scene, Camera, Result>(
  renderer: SampledRenderer<Scene, Camera, Result>,
  mainScene: Scene,
  debug: Pick<CellDebug, 'sampleRenderer'>,
  now: () => number,
): () => void {
  const original = renderer.render;

  renderer.render = (scene, camera) => {
    const result = original.call(renderer, scene, camera);

    if (scene === mainScene) {
      const { calls, triangles } = renderer.info.render;
      debug.sampleRenderer(calls, triangles, now());
    }

    return result;
  };

  return () => {
    renderer.render = original;
  };
}

export interface DebugTarget {
  __cellDebug?: CellDebug;
}

declare global {
  interface Window {
    /** Installed by `main.tsx`; read by the Playwright harness. */
    __cellDebug?: CellDebug;
  }
}

export function installCellDebug(debug: CellDebug, target: DebugTarget): CellDebug {
  target.__cellDebug = debug;
  return debug;
}
