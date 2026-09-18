import type { Page } from '@playwright/test';

/**
 * Shared harness helpers: deterministic navigation and capture.
 *
 * Everything the metric assertions need is reached through `?fixture=` routes, so a screenshot
 * is a function of the URL rather than of whatever the app happened to be doing.
 */

export const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1 } as const;

/** Frames to observe before capturing, so `renderer.info` has settled. */
export const MIN_FRAMES_BEFORE_CAPTURE = 20;

/**
 * The first capture on a software rasteriser costs ~30 s: the compositor has to produce a full
 * surface frame while the WebGL canvas keeps invalidating it. Later captures in the same page
 * cost ~5 s, and a GPU-backed run costs well under a second. The timeout is generous on purpose.
 */
export const CAPTURE_TIMEOUT_MS = 180_000;

export const FRAME_TIMEOUT_MS = 90_000;

export interface FrameStatsSnapshot {
  samples: number;
  lastMs: number;
  p50Ms: number;
  p95Ms: number;
  p50Fps: number;
  p95Fps: number;
}

export interface CellDebugSnapshot {
  fixture: string | null;
  frozen: boolean;
  frames: number;
  /** Renders of the presented frame of the main scene (task 4.13). */
  sceneRenders: number;
  drawCalls: number;
  triangles: number;
  firstRenderAtMs: number | null;
  frameStats: FrameStatsSnapshot;
  clock: { elapsed: number; scale: number };
}

/** One annotation as the layer wrote it (the `__cellDebug.annotations` mirror). */
export interface AnnotationSnapshot {
  id: string;
  column: 'left' | 'right';
  box: { x: number; y: number; width: number; height: number };
  leader: [number, number][];
  anchor: [number, number];
  opacity: number;
  occluded: boolean;
  hovered: boolean;
}

export function fixtureUrl(fixture: string, params: Record<string, string> = {}): string {
  const search = new URLSearchParams({ fixture, ...params });

  return `/?${search.toString()}`;
}

/** The rendered annotation layout, as the harness reads it. */
export async function readAnnotations(page: Page): Promise<AnnotationSnapshot[]> {
  return page.evaluate(() => (window.__cellDebug?.annotations ?? []).map((entry) => ({
    id: entry.id,
    column: entry.column,
    box: { ...entry.box },
    leader: entry.leader.map((point) => [point[0], point[1]] as [number, number]),
    anchor: [entry.anchor[0], entry.anchor[1]] as [number, number],
    opacity: entry.opacity,
    occluded: entry.occluded,
    hovered: entry.hovered,
  })));
}

/**
 * The readout's tick counter, or null when the readout is not mounted.
 *
 * Read through `evaluate` rather than a locator: a locator would *wait* for a node that is
 * deliberately absent in the disabled configuration, turning an assertion into a timeout.
 */
export async function readFpsTicks(page: Page): Promise<number | null> {
  const raw = await page.evaluate(
    () => document.querySelector('[data-role="fps"]')?.getAttribute('data-ticks') ?? null,
  );

  return raw === null ? null : Number.parseInt(raw, 10);
}

/** One running process, as the driver mirrored it (the `__cellDebug.processes` surface). */
export interface ProcessSnapshot {
  id: string;
  processId: string;
  cell: 'animal' | 'plant';
  organelleId: string;
  scripted: boolean;
  lightDriven: boolean;
  time: number;
  rate: number;
  label: string | null;
  progress: number | null;
  lightRequired: boolean;
  uniformWrites: number;
  /**
   * Process-specific scalar readouts (M3).
   *
   * Reproduction publishes the chromosome groups and the two cytokinesis mechanisms here, so a spec
   * can assert "no sisters separate before metaphase", "two condensed groups after" and "the two
   * mechanisms are different" against what the frame drew rather than against a screenshot.
   */
  extra: Record<string, number>;
  emitted: { atp: number; oxygen: number; glucose: number };
}

/** The running processes, as the harness reads them. Empty when no process is entered. */
export async function readProcesses(page: Page): Promise<ProcessSnapshot[]> {
  return page.evaluate(() => (window.__cellDebug?.processes ?? []).map((entry) => ({
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
    extra: { ...entry.extra },
    emitted: { ...entry.emitted },
  })));
}

/** One process by id, or null. A sub-process that is not running is not an error. */
export async function readProcess(page: Page, id: string): Promise<ProcessSnapshot | null> {
  const processes = await readProcesses(page);

  return processes.find((entry) => entry.id === id) ?? null;
}

/**
 * Measures one frame-bounded window and returns how far each named process advanced in it.
 *
 * **Every process must be measured in the same window, and this is why the helper takes a list
 * rather than an id.** The rate measurement compares photosynthesis's clock with respiration's, and
 * two sequential measurements would be two different windows — which is exactly the kind of
 * difference that would make a noisy comparison look like a signal.
 *
 * A frame-bounded window rather than a wall-clock one, because a slow machine delivers fewer frames
 * and the processes advance with the frames.
 */
export async function measureProcessAdvance(
  page: Page,
  ids: readonly string[],
  frames = 120,
): Promise<Map<string, number>> {
  const before = new Map<string, number>();
  const startFrame = (await readCellDebug(page))!.frames;

  for (const id of ids) {
    const entry = await readProcess(page, id);

    if (!entry) {
      throw new Error(`no running process "${id}" to measure`);
    }

    before.set(id, entry.time);
  }

  await page.waitForFunction(
    (target) => (window.__cellDebug?.frames ?? 0) >= target,
    startFrame + frames,
    { timeout: FRAME_TIMEOUT_MS },
  );

  const advance = new Map<string, number>();

  for (const id of ids) {
    const entry = await readProcess(page, id);

    if (!entry) {
      throw new Error(`the running process "${id}" disappeared mid-window`);
    }

    advance.set(id, entry.time - (before.get(id) ?? 0));
  }

  return advance;
}

/**
 * The draw-call sample, once it has been taken **after** the scene reached its final shape.
 *
 * Draw calls are sampled at 1 Hz (`DRAW_CALL_SAMPLE_INTERVAL_MS`), so the field can hold a reading
 * from up to a second ago — long enough for a fixture that enters a process in an effect to be
 * reported at its pre-process cost. Requiring a few samples makes the reading a measurement of what
 * is on screen now.
 */
export async function readSettledDrawCalls(page: Page, minSamples = 3): Promise<number> {
  await page.waitForFunction(
    (minimum) => (window.__cellDebug?.drawCallSampleTimesMs.length ?? 0) >= minimum,
    minSamples,
    { timeout: FRAME_TIMEOUT_MS },
  );

  return (await readCellDebug(page))!.drawCalls;
}

export interface PageProblems {
  readonly messages: string[];
}

/** Collects page-level errors so a broken render cannot pass silently. */
export function collectProblems(page: Page): PageProblems {
  const messages: string[] = [];

  page.on('pageerror', (error) => messages.push(`pageerror: ${String(error)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      messages.push(`console: ${message.text()}`);
    }
  });

  return { messages };
}

export async function readCellDebug(page: Page): Promise<CellDebugSnapshot | null> {
  return page.evaluate(() => {
    const debug = window.__cellDebug;

    if (!debug) {
      return null;
    }

    return {
      fixture: debug.fixture,
      frozen: debug.frozen,
      frames: debug.frames,
      sceneRenders: debug.sceneRenders,
      drawCalls: debug.drawCalls,
      triangles: debug.triangles,
      firstRenderAtMs: debug.firstRenderAtMs,
      frameStats: debug.frameStats,
      clock: debug.clock,
    };
  });
}

/** Navigates to a fixture and waits until it has rendered enough frames to be measurable. */
export async function openFixture(
  page: Page,
  fixture: string,
  params: Record<string, string> = {},
): Promise<CellDebugSnapshot> {
  await page.goto(fixtureUrl(fixture, params), { waitUntil: 'load' });

  await page.waitForSelector('canvas', { state: 'attached', timeout: FRAME_TIMEOUT_MS });
  await page.waitForFunction(
    (minFrames) => (window.__cellDebug?.frames ?? 0) >= minFrames,
    MIN_FRAMES_BEFORE_CAPTURE,
    { timeout: FRAME_TIMEOUT_MS },
  );

  const debug = await readCellDebug(page);

  if (!debug) {
    throw new Error('window.__cellDebug was not installed — the debug bridge is missing');
  }

  return debug;
}

export async function openApp(page: Page, path = '/'): Promise<void> {
  await page.goto(path, { waitUntil: 'load' });
  await page.waitForSelector('canvas', { state: 'attached', timeout: FRAME_TIMEOUT_MS });
}

export async function capturePng(page: Page): Promise<Buffer> {
  return page.screenshot({
    timeout: CAPTURE_TIMEOUT_MS,
    animations: 'disabled',
    caret: 'hide',
  });
}
