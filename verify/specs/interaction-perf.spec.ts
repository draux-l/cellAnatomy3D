import { expect, test, type Page } from '@playwright/test';
import { collectProblems, openApp, readCellDebug } from '../harness';

/**
 * The interaction-cost probe.
 *
 * The complaint is specific: **the exploded view and hovering the parts stutter**. This spec turns
 * that into numbers by measuring the frame-delta distribution of one interaction at a time, against
 * an idle window on the same load. A frame delta is the wall time between two `requestAnimationFrame`
 * callbacks, so it captures *everything* the frame did — the React commit, the scene-graph work and
 * the GPU — which is exactly what "it lags" means.
 *
 * It reports, for each phase: p50/p95/max delta, how many frames exceeded 33 ms (>2 frames at 60 Hz)
 * and 50 ms, and the worst pick raycast (`__cellDebug.pickMs`) seen. The pair
 * `idle -> interaction` is the signal: a hover that only adds ~1 ms of picking shows in `maxPickMs`
 * with a flat delta, while a hover that re-renders the tree shows as a fatter p95 with a small
 * `maxPickMs`. That is how the spec separates the two suspects the code review named.
 *
 * The assertions are deliberately weak — this is a measurement, and the numbers vary with the host
 * GPU. Failure modes worth gating are real ones: the probe collected no frames, or the page threw.
 */

const MIN_FRAMES = 60;
const IDLE_WINDOW_MS = 2500;
const SETTLE_MS = 2500;
const HOVER_COLS = 8;
const HOVER_ROWS = 5;
const HOVER_STEP_WAIT_MS = 25;
const SLIDER_STEP_WAIT_MS = 18;
const OVER_FRAME_MS = 33.4;
const VERY_OVER_FRAME_MS = 50;

interface ProbeSample {
  dt: number;
  pickMs: number;
}

interface LongTask {
  duration: number;
  startTime: number;
}

interface PhaseStats {
  phase: string;
  frames: number;
  p50: number;
  p95: number;
  max: number;
  over33: number;
  over50: number;
  maxPickMs: number;
  pickCount: number;
  /** Main-thread tasks >50 ms: JS work, not GPU. The React commit shows up here. */
  longTasks: number;
  longTaskTotalMs: number;
  longTaskMaxMs: number;
  durationMs: number;
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const lowValue = sorted[low] ?? 0;
  const highValue = sorted[high] ?? lowValue;

  return lowValue + (highValue - lowValue) * (rank - low);
}

/**
 * Installs a page-side rAF sampler and a Long Task observer.
 *
 * The rAF deltas are what the user feels; the Long Task entries say **who** paid. A task longer than
 * 50 ms is, by the spec, a blocking task on the main thread — JS, not the compositor and not the GPU.
 * If the frame stalls and the long tasks agree, the cost is main-thread work (a React commit, the R3F
 * reconciler, a shader compile). If the stalls have no matching long task, the frame was waiting on
 * the GPU. That split is the whole point of recording both.
 */
async function installFrameSampler(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __probe?: { samples: ProbeSample[]; active: boolean; longTasks: LongTask[] };
      __cellDebug?: { pickMs: number };
    };

    w.__probe = { samples: [], active: false, longTasks: [] };

    const supported = (PerformanceObserver as unknown as { supportedEntryTypes?: string[] })
      .supportedEntryTypes;

    (w as unknown as { __probeSupport?: { longtask: boolean } }).__probeSupport = {
      longtask: Array.isArray(supported) ? supported.includes('longtask') : false,
    };

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          w.__probe?.longTasks.push({ duration: entry.duration, startTime: entry.startTime });
        }
      });

      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      // No long-task support: the frame deltas still measure the stall.
    }

    let last = performance.now();

    const tick = (now: number): void => {
      const probe = w.__probe!;

      if (probe.active) {
        probe.samples.push({ dt: now - last, pickMs: w.__cellDebug?.pickMs ?? 0 });
      }

      last = now;
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
}

async function startWindow(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = (window as unknown as { __probe?: { samples: ProbeSample[]; active: boolean; longTasks: LongTask[] } }).__probe!;

    probe.samples = [];
    probe.longTasks = [];
    probe.active = true;
  });
}

async function stopWindow(page: Page): Promise<{ samples: ProbeSample[]; longTasks: LongTask[] }> {
  return page.evaluate(() => {
    const probe = (window as unknown as { __probe?: { samples: ProbeSample[]; active: boolean; longTasks: LongTask[] } }).__probe!;

    probe.active = false;

    return { samples: probe.samples, longTasks: probe.longTasks };
  });
}

async function pickCounter(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __cellDebug?: { pickCount: number } }).__cellDebug?.pickCount ?? 0);
}

function summarize(
  phase: string,
  samples: readonly ProbeSample[],
  longTasks: readonly LongTask[],
  durationMs: number,
): PhaseStats {
  const deltas = samples.map((sample) => sample.dt);
  const longTaskDurations = longTasks.map((task) => task.duration);

  return {
    phase,
    frames: samples.length,
    p50: Number(percentile(deltas, 50).toFixed(2)),
    p95: Number(percentile(deltas, 95).toFixed(2)),
    max: Number((deltas.length === 0 ? 0 : Math.max(...deltas)).toFixed(2)),
    over33: deltas.filter((dt) => dt > OVER_FRAME_MS).length,
    over50: deltas.filter((dt) => dt > VERY_OVER_FRAME_MS).length,
    maxPickMs: Number(Math.max(0, ...samples.map((sample) => sample.pickMs)).toFixed(2)),
    pickCount: 0,
    longTasks: longTasks.length,
    longTaskTotalMs: Number(longTaskDurations.reduce((sum, duration) => sum + duration, 0).toFixed(2)),
    longTaskMaxMs: Number(Math.max(0, ...longTaskDurations).toFixed(2)),
    durationMs,
  };
}

async function measure(page: Page, phase: string, action: () => Promise<void>): Promise<PhaseStats> {
  const before = await pickCounter(page);
  const startedAt = Date.now();

  await startWindow(page);
  await action();
  const { samples, longTasks } = await stopWindow(page);
  const durationMs = Date.now() - startedAt;
  const stats = summarize(phase, samples, longTasks, durationMs);

  stats.pickCount = (await pickCounter(page)) - before;

  return stats;
}

/**
 * Moves the pointer over a grid of points across the middle of the canvas, slowly enough to paint.
 *
 * The region is a fraction of the canvas box. The cell sweep crosses part boundaries, so the hovered
 * id changes; the empty sweep stays over the top-left corner, where no part is under the cursor and
 * the store value never changes. The contrast between the two is what separates "pointermove itself
 * costs" (the raycast and the label placement) from "a hover **transition** costs" (the React commit).
 */
async function sweepRegion(
  page: Page,
  region: { x0: number; y0: number; x1: number; y1: number },
): Promise<void> {
  const canvas = await page.locator('canvas').boundingBox();

  if (!canvas) {
    throw new Error('the canvas has no bounding box');
  }

  for (let row = 0; row < HOVER_ROWS; row += 1) {
    for (let col = 0; col < HOVER_COLS; col += 1) {
      const fx = region.x0 + (region.x1 - region.x0) * (col / (HOVER_COLS - 1));
      const fy = region.y0 + (region.y1 - region.y0) * (row / (HOVER_ROWS - 1));

      await page.mouse.move(canvas.x + canvas.width * fx, canvas.y + canvas.height * fy);
      await page.waitForTimeout(HOVER_STEP_WAIT_MS);
    }
  }
}

const CELL_REGION = { x0: 0.2, y0: 0.25, x1: 0.8, y1: 0.75 };
const EMPTY_REGION = { x0: 0.01, y0: 0.01, x1: 0.06, y1: 0.06 };

/** Sets the range control through its React `onChange`, one whole step at a time. */
async function dragSlider(page: Page): Promise<void> {
  for (let value = 0; value <= 100; value += 2) {
    await page.evaluate((next) => {
      const input = document.querySelector<HTMLInputElement>('[data-role="control"]');

      if (!input) {
        throw new Error('the disassembly control is not mounted');
      }

      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

      setter?.call(input, String(next));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);

    await page.waitForTimeout(SLIDER_STEP_WAIT_MS);
  }
}

async function setDisassembly(page: Page, value: number): Promise<void> {
  await page.evaluate((next) => {
    const input = document.querySelector<HTMLInputElement>('[data-role="control"]');

    if (!input) {
      throw new Error('the disassembly control is not mounted');
    }

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

    setter?.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

  await page.locator(`.cell-view[data-disassembly="${value}"]`).waitFor({ timeout: 10_000 });
  // Let the damped arrangement settle at the destination before the next window.
  await page.waitForTimeout(1200);
}

test.describe('the interaction cost', () => {
  test('splits idle, hover, dispersion and isolate into per-frame cost', async ({ page }, testInfo) => {
    test.slow();
    /*
     * Advisory, not a gate. The budgets file states frame timing is measured locally because shared
     * CI runners jitter; this probe is the same kind of measurement, so it does not run on CI where
     * a noisy neighbour would turn a report into a false failure.
     */
    test.skip(Boolean(process.env.CI), 'interaction cost is measured locally; CI runners jitter');

    const problems = collectProblems(page);

    await openApp(page);
    await page.waitForFunction((min) => (window.__cellDebug?.frames ?? 0) >= min, MIN_FRAMES, {
      timeout: 120_000,
    });
    await installFrameSampler(page);

    const phases: PhaseStats[] = [];

    phases.push(await measure(page, 'idle-rest', async () => {
      await page.waitForTimeout(IDLE_WINDOW_MS);
    }));

    // Pointer moves that never change the hovered part: no store write, no React commit.
    phases.push(await measure(page, 'pointer-empty', async () => {
      await sweepRegion(page, EMPTY_REGION);
    }));

    phases.push(await measure(page, 'hover-rest', async () => {
      await sweepRegion(page, CELL_REGION);
    }));

    phases.push(await measure(page, 'drag-dispersion', async () => {
      await dragSlider(page);
    }));

    await setDisassembly(page, 100);
    // Let the damped arrangement fully settle before measuring the exploded state on its own.
    await page.waitForTimeout(SETTLE_MS);

    phases.push(await measure(page, 'idle-exploded', async () => {
      await page.waitForTimeout(IDLE_WINDOW_MS);
    }));

    phases.push(await measure(page, 'hover-exploded', async () => {
      await sweepRegion(page, CELL_REGION);
    }));

    const canvas = await page.locator('canvas').boundingBox();

    phases.push(await measure(page, 'click-isolate', async () => {
      await page.mouse.click(canvas!.x + canvas!.width / 2, canvas!.y + canvas!.height / 2);
      await page.waitForTimeout(1200);
    }));

    // Back to the landing state, so the last window measures the release too.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    const debug = await readCellDebug(page);
    const support = await page.evaluate(
      () => (window as unknown as { __probeSupport?: { longtask: boolean } }).__probeSupport ?? null,
    );
    const report = {
      viewport: testInfo.project.use.viewport,
      probeSupport: support,
      scene: debug
        ? { drawCalls: debug.drawCalls, triangles: debug.triangles, modelStatus: debug.modelStatus }
        : null,
      phases,
    };

    await testInfo.attach('interaction-perf.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });

    console.log(`[interaction-perf] ${JSON.stringify(report, null, 2)}`);

    for (const phase of phases) {
      expect(phase.frames, `${phase.phase} collected no frames`).toBeGreaterThan(0);
    }

    expect(problems.messages).toEqual([]);
  });
});
