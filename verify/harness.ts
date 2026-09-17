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
