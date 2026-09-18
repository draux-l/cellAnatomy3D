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

/**
 * One annotation, as the solver laid it out and the layer wrote it (design D14/D17).
 *
 * This is the mirror the harness reads to make the layout invariants **committed metrics instead
 * of eyeballs**: `leader` carries the two-segment elbow, `box` the label rectangle, and `opacity`
 * the ink the layer actually wrote. It is a measurement of the render, never an input to it.
 */
export interface AnnotationMirrorEntry {
  /** The catalog record id the annotation belongs to. */
  id: string;
  /** The column the hysteresis assigned it to. */
  column: 'left' | 'right';
  /** The label box in CSS pixels, viewport-relative. */
  box: { x: number; y: number; width: number; height: number };
  /** The elbow leader in CSS pixels: anchor, elbow, box edge. */
  leader: [number, number][];
  /** Where the anchor attached, in CSS pixels. Always `leader[0]`. */
  anchor: [number, number];
  /** Ink opacity written for the leader and anchor (1 at rest, 0.5 when occluded). */
  opacity: number;
  /** True when another organelle's hit volume stood between the camera and the anchor. */
  occluded: boolean;
  /** True while this annotation is the hovered one. */
  hovered: boolean;
}

/**
 * One running process instance, mirrored for the harness (task 5.5).
 *
 * The `time`/`rate` pair is what makes the light requirement *measurable* rather than visible: the
 * rate of a process is the derivative of its own clock, so a window's delta answers "did the slider
 * change the rate?" and "did pausing stop it?" with a number. `uniformWrites` is the strongest
 * available proof that respiration and photosynthesis are not conflated — it counts the writes of
 * the one `uLightIntensity` uniform in the app, and respiration's stays at zero at every slider
 * position.
 */
export interface ProcessMirrorEntry {
  /** The sub-process id: `respiration` or `photosynthesis`. */
  id: string;
  processId: string;
  cell: 'animal' | 'plant';
  /** The organelle the animation happens inside. */
  organelleId: string;
  /** True when a GSAP timeline drives it. */
  scripted: boolean;
  /** True when its motion depends on light. */
  lightDriven: boolean;
  /** Seconds this instance has advanced at its own rate. The measurable process clock. */
  time: number;
  /** This frame's rate multiplier. Zero while paused or with no light. */
  rate: number;
  /** The active scripted label, or null. */
  label: string | null;
  /** Phase within the current cycle, 0..1, or null for a continuous process. */
  progress: number | null;
  /** True when the process is stopped for lack of light. */
  lightRequired: boolean;
  /** Light-uniform writes since the instance was built. Respiration must stay at 0. */
  uniformWrites: number;
  /** Completed emissions since the instance was built. */
  emitted: { atp: number; oxygen: number; glucose: number };
}

export interface CellDebug {
  /** Active `?fixture=` name, or null for the real app. */
  fixture: string | null;
  /** True while the clock is pinned by a fixture. */
  frozen: boolean;
  /** Total frames rendered since load. */
  frames: number;
  /**
   * Renders of the **presented frame** since load: the main scene, drawn with no render target
   * bound (design D15, task 4.13).
   *
   * The `no-per-frame-re-render` contract is measured through this: HUD ticks and annotation
   * writes must leave it equal to `frames`. It is a render *count*, not a sample, so the harness
   * compares a window's delta rather than a single reading.
   */
  sceneRenders: number;
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
  /** The per-frame solver output the annotation layer wrote, mirrored for the harness. */
  annotations: AnnotationMirrorEntry[];
  /**
   * The running processes, mirrored every frame (task 5.5).
   *
   * The nutrition capability's claims are about *rates* and about an *absence*: the light slider
   * must change photosynthesis's rate measurably, respiration's must not change at all, and a
   * paused process must hold. None of those are readable from a static value, so each instance
   * publishes its own clock, its rate, its active timeline label and how many light-uniform writes
   * it has made. It is a measurement of the animation, never an input to it.
   */
  processes: ProcessMirrorEntry[];
  /**
   * The quality tier the renderer is actually running (task 4.8).
   *
   * Recorded rather than derived: the perf report has to state what was applied, and a fixture
   * pins the tier so a screenshot cannot depend on the host's core count.
   */
  qualityTier: 'high' | 'reduced';
  /** Read-only mirror of the transient clock, for the perf report. */
  clock: { elapsed: number; scale: number };
  /** Records one rendered frame. Both timestamps are injected so tests are deterministic. */
  recordFrame: (deltaMs: number, nowMs: number) => void;
  /** Records one presented-frame render. Called by the wrapped `renderer.render`. */
  recordSceneRender: () => void;
  /** Replaces the annotation mirror with this frame's solver output. */
  setAnnotations: (entries: readonly AnnotationMirrorEntry[]) => void;
  /** Replaces the process mirror with this frame's instances. */
  setProcesses: (entries: readonly ProcessMirrorEntry[]) => void;
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
    sceneRenders: 0,
    drawCalls: 0,
    triangles: 0,
    drawCallSampleTimesMs: [],
    firstRenderAtMs: null,
    frameStats: emptyFrameStats(),
    qualityTier: 'high',
    annotations: [],
    processes: [],
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

    recordSceneRender() {
      debug.sceneRenders += 1;
    },

    setAnnotations(entries) {
      debug.annotations = entries.map((entry) => ({
        id: entry.id,
        column: entry.column,
        box: { ...entry.box },
        leader: entry.leader.map((point) => [point[0], point[1]] as [number, number]),
        anchor: [entry.anchor[0], entry.anchor[1]],
        opacity: entry.opacity,
        occluded: entry.occluded,
        hovered: entry.hovered,
      }));
    },

    setProcesses(entries) {
      debug.processes = entries.map((entry) => ({
        id: entry.id,
        processId: entry.processId,
        cell: entry.cell,
        organelleId: entry.organelleId,
        scripted: entry.scripted,
        lightDriven: entry.lightDriven,
        time: entry.time,
        rate: entry.rate,
        label: entry.label,
        progress: entry.progress,
        lightRequired: entry.lightRequired,
        uniformWrites: entry.uniformWrites,
        emitted: { ...entry.emitted },
      }));
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
      debug.sceneRenders = 0;
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
  /**
   * The bound render target, or null when the render presents the frame.
   *
   * Optional so a test double can omit it: absent means "presented", which is the pre-existing
   * behaviour and keeps the sampling contract testable without a WebGL context.
   */
  getRenderTarget?: () => unknown;
}

/**
 * Counts the draw calls of the **cell scene** alone, and counts the presented frames.
 *
 * Two facts about `renderer.info.render` drove this wrapper, and the second one took a second
 * pass to see:
 *
 * 1. It is reset by **every** top-level render, so reading it from a frame callback reports
 *    whichever pass ran last. `renderer.render` is therefore wrapped and the counter is read
 *    immediately after the app's own scene renders.
 * 2. **A pass can render the main scene into a render target.** drei's `<ContactShadows>` calls
 *    `gl.render(scene, shadowCamera)` with the scene from `useThree` — the *main* scene — after
 *    setting an override material, and it runs in a `useFrame` subscriber, i.e. *before* the
 *    presenting render. So `scene === mainScene` is not sufficient to identify the frame the
 *    budget is about. With only that test, the 1 Hz draw-call sample recorded the depth pass
 *    whenever it happened to be the first main-scene render in the interval: the depth camera
 *    sees a slightly different subset of the cell, which is exactly the documented ±1 call /
 *    ±2 triangle jitter (a shadow-pass quad caught in the sample).
 *
 * The fix is structural rather than a tolerance: a render is counted **only when it presents the
 * frame**, i.e. when the main scene is drawn with no render target bound. The jitter disappears
 * and the harness's comparisons can be exact.
 */
export function attachRendererSampling<Scene, Camera, Result>(
  renderer: SampledRenderer<Scene, Camera, Result>,
  mainScene: Scene,
  debug: Pick<CellDebug, 'sampleRenderer' | 'recordSceneRender'>,
  now: () => number,
): () => void {
  const original = renderer.render;

  renderer.render = (scene, camera) => {
    const result = original.call(renderer, scene, camera);
    const presented = (renderer.getRenderTarget?.() ?? null) === null;

    if (scene === mainScene && presented) {
      debug.recordSceneRender();

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
