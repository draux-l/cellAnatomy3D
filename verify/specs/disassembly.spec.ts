import { expect, test } from '@playwright/test';
import { PERFORMANCE_BUDGETS } from '../budgets.mjs';
import {
  baselineKey,
  loadBaselines,
  writeBaselines,
  writeScreenshot,
  type FixtureBaseline,
} from '../baselines';
import { capturePng, collectProblems, openApp, openFixture } from '../harness';
import {
  assertCoverage,
  describeMetrics,
  measurePng,
  rgbToHex,
  type ScreenshotMetrics,
} from '../metrics';

/**
 * Disassembly (tasks 4.9–4.12).
 *
 * The spec's scenarios are continuity, a live percentage, reversibility and the handoff with
 * isolation. Continuity is asserted as a *metric* — the fraction of the frame the cell occupies
 * grows as the parts separate — because "the motion is animated rather than snapping" is not
 * something a single screenshot can say, and the property that actually matters is that every step
 * is a different arrangement and that they are ordered.
 *
 * Run with `UPDATE_BASELINES=1 npm run test:e2e` to re-record the committed screenshots.
 */

const UPDATE = process.env.UPDATE_BASELINES === '1';
const CELL_VIEW = '.cell-view';
const STEPS = [0, 25, 57, 100] as const;

interface StepMeasurement {
  value: number;
  metrics: ScreenshotMetrics;
  buffer: Buffer;
  drawCalls: number;
}

async function measureStep(
  page: Parameters<typeof openFixture>[0],
  value: number,
  view: 'animal' | 'plant' = 'animal',
): Promise<StepMeasurement> {
  const debug = await openFixture(page, 'disassembly', { value: String(value), view });
  const buffer = await capturePng(page);

  return {
    value,
    buffer,
    drawCalls: debug.drawCalls,
    metrics: measurePng(buffer, loadBaselines().thresholds),
  };
}

/**
 * Waits until the animated readout stops moving.
 *
 * The readout is written by the frame loop from the *damped* value, while React writes the
 * control's target on every step. So immediately after `fill()` the DOM can show the destination
 * for a frame before the loop catches up — which is correct behaviour, and exactly why a test that
 * asserts the readout has to wait for the motion to finish rather than for the DOM to stop
 * changing on its own.
 */
/** How long the readout must hold the control's value before the damping counts as finished. */
const HOLD_MS = 1500;

/**
 * Waits until the animated readout has reached the control's value **and stayed there**.
 *
 * Neither a wall-clock nor a frame-count stability window is enough on its own. React writes the
 * control's target on every step, so the DOM shows the destination for a moment before the frame
 * loop catches up; and a software rasteriser delivers frames in bursts with near-zero deltas, so
 * the damped value can sit still for several frames while it is still converging. The honest wait
 * is therefore "the readout equals the target and has held it long enough that no in-flight write
 * can still be coming" — and its failure mode is a timeout, never a false pass.
 */
async function waitForReadoutToReach(
  page: Parameters<typeof openFixture>[0],
  target: number,
): Promise<void> {
  const expected = `${target}%`;
  let heldSince = 0;
  let last = '';

  for (let attempt = 0; attempt < 400; attempt += 1) {
    const value = (await page.textContent('[data-role="percent"]')) ?? '';

    last = value;

    if (value === expected) {
      heldSince = heldSince === 0 ? Date.now() : heldSince;

      if (Date.now() - heldSince >= HOLD_MS) {
        return;
      }
    } else {
      heldSince = 0;
    }

    await page.waitForTimeout(120);
  }

  throw new Error(`the disassembly readout never reached ${expected} (last value "${last}")`);
}

function record(key: string, screenshot: string, measurement: StepMeasurement, notes: string): void {
  const baselines = loadBaselines();
  const baseline: FixtureBaseline = {
    screenshot,
    coverage: Number(measurement.metrics.coverage.toFixed(6)),
    occupiedAreaPx: measurement.metrics.occupiedAreaPx,
    regionColor: rgbToHex(measurement.metrics.regionColor),
    measuredAt: new Date().toISOString().slice(0, 10),
    measuredWith: 'playwright chromium 153 / three 0.186.0',
    notes,
  };

  writeScreenshot(baseline, measurement.buffer);
  baselines.fixtures[key] = baseline;
  writeBaselines(baselines);

  console.log(`[${key}] baseline updated: ${describeMetrics(measurement.metrics)}`);
}

test.describe('disassembly fixtures', () => {
  test('separates monotonically and keeps the render cost flat', async ({ page }) => {
    const problems = collectProblems(page);
    const measurements: StepMeasurement[] = [];

    for (const value of STEPS) {
      measurements.push(await measureStep(page, value));
    }

    expect(problems.messages).toEqual([]);

    // Coverage grows with the value: the parts occupy more of the frame as they leave the centre.
    for (let index = 1; index < measurements.length; index += 1) {
      const previous = measurements[index - 1]!;
      const current = measurements[index]!;

      expect(
        current.metrics.coverage,
        `${current.value}% coverage ${current.metrics.coverage.toFixed(4)} must exceed ` +
          `${previous.value}% coverage ${previous.metrics.coverage.toFixed(4)}`,
      ).toBeGreaterThan(previous.metrics.coverage);
    }

    // Disassembly is transform-only: no geometry is created, so the cost cannot grow with the
    // value — and since task 4.13 the sample is exact, because a render is only counted when it
    // presents the frame (drei's contact-shadow pass renders the main scene into a render target
    // and used to win the 1 Hz sample on some ticks). The spread is therefore asserted at zero.
    const drawCalls = measurements.map((measurement) => measurement.drawCalls);
    const spread = Math.max(...drawCalls) - Math.min(...drawCalls);

    expect(spread, `draw calls across steps: ${drawCalls.join(', ')}`).toBe(0);
    expect(Math.max(...drawCalls)).toBeLessThanOrEqual(PERFORMANCE_BUDGETS.drawCallsPerCell);

    for (const measurement of measurements) {
      assertCoverage(measurement.metrics, loadBaselines().thresholds);
      console.log(
        `[disassembly:${measurement.value}] coverage ${(measurement.metrics.coverage * 100).toFixed(2)}% ` +
          `area ${measurement.metrics.occupiedAreaPx}px calls ${measurement.drawCalls}`,
      );
    }
  });

  test('commits a baseline and a screenshot for every step', async ({ page }) => {
    const baselines = loadBaselines();

    for (const value of STEPS) {
      const key = baselineKey('disassembly', String(value));
      const screenshot = `artifacts/screens/disassembly/${value}.png`;

      if (!UPDATE) {
        if (!baselines.fixtures[key]) {
          throw new Error(`No committed baseline for "${key}". Record one with UPDATE_BASELINES=1.`);
        }

        continue;
      }

      record(key, screenshot, await measureStep(page, value), `Disassembly frozen at ${value}%.`);
    }

    // The plant cell gets its own step: its silhouette is the one that differs.
    const plantKey = baselineKey('disassembly', '57-plant');

    if (UPDATE) {
      record(
        plantKey,
        'artifacts/screens/disassembly/57-plant.png',
        await measureStep(page, 57, 'plant'),
        'Disassembly frozen at 57% in the plant cell.',
      );
      return;
    }

    expect(baselines.fixtures[plantKey]).toBeDefined();
  });

  test('writes the frozen percentage into the readout', async ({ page }) => {
    // Under a fixture the app renders no chrome, so this asserts the readout the frame loop owns;
    // the localized state word is covered on the live app below, where the language selector exists.
    for (const value of STEPS) {
      await openFixture(page, 'disassembly', { value: String(value), view: 'animal' });

      expect(await page.textContent('[data-role="percent"]')).toBe(`${value}%`);
    }
  });

  test('presents the control as a view control, not a process', async ({ page }) => {
    await openFixture(page, 'disassembly', { value: '57', view: 'animal' });

    // The control has its own group...
    expect(await page.locator('[data-view-control="disassembly"]').count()).toBe(1);
    // ...and nothing anywhere claims it is one of the vital processes.
    expect(await page.locator('[data-process-id]').count()).toBe(0);
    expect(await page.locator('[data-process-id="disassembly"]').count()).toBe(0);

    const copy = await page.textContent('[data-view-control="disassembly"]');

    expect(copy?.toLowerCase()).toContain('no es algo que la célula haga');
    expect(copy?.toLowerCase()).not.toContain('proceso');
  });
});

test.describe('disassembly on the live app', () => {
  test('shows the localized state word and follows the language switch in place', async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => (window.__cellDebug?.frames ?? 0) >= 20);

    await page.locator('[data-role="control"]').fill('57');
    await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-disassembly')).toBe('57');
    await waitForReadoutToReach(page, 57);

    expect(await page.textContent('[data-role="percent"]')).toBe('57%');
    expect(await page.textContent('[data-role="state"]')).toBe('Parcialmente separada');

    await page.locator('.lang__option[data-locale="en"]').click();

    // The readout is written by the frame loop from the store's locale, so the switch has to reach
    // it without a reload and without a second source of truth for the number.
    await expect.poll(() => page.textContent('[data-role="state"]')).toBe('Partially separated');
    expect(await page.textContent('[data-role="percent"]')).toBe('57%');
  });

  test('returns an identical 0% arrangement after a 100% round trip', async ({ page }) => {
    const problems = collectProblems(page);

    await openApp(page);
    await page.waitForFunction(() => (window.__cellDebug?.frames ?? 0) >= 20);
    const before = await capturePng(page);

    const slider = page.locator('[data-role="control"]');

    await slider.fill('100');
    await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-disassembly')).toBe('100');
    // Let the damping actually arrive before coming back, so the round trip is a real one and not
    // a comparison of two mid-motion frames.
    await waitForReadoutToReach(page, 100);

    await slider.fill('0');
    await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-disassembly')).toBe('0');
    await waitForReadoutToReach(page, 0);

    const after = await capturePng(page);
    const baselines = loadBaselines();
    const beforeMetrics = measurePng(before, baselines.thresholds);
    const afterMetrics = measurePng(after, baselines.thresholds);

    // The arrangement is a pure function of the progress, so the two frames are the same scene.
    // Frame timing and the animated readout make byte equality the wrong gate; the area band is the
    // honest one, and it is tight enough to catch a part left behind.
    const driftPct =
      ((afterMetrics.occupiedAreaPx - beforeMetrics.occupiedAreaPx) / beforeMetrics.occupiedAreaPx) *
      100;

    expect(Math.abs(driftPct), `area drifted ${driftPct.toFixed(2)}%`).toBeLessThanOrEqual(
      baselines.thresholds.areaBandPct,
    );

    expect(problems.messages).toEqual([]);

    console.log(
      `[round-trip] ${beforeMetrics.occupiedAreaPx}px -> ${afterMetrics.occupiedAreaPx}px (${driftPct.toFixed(2)}%)`,
    );
  });

  test('hands off to isolation: isolating reassembles the cell', async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => (window.__cellDebug?.frames ?? 0) >= 20);

    await page.locator('[data-role="control"]').fill('60');
    await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-disassembly')).toBe('60');
    await page.waitForTimeout(1200);

    const box = await page.locator('canvas').boundingBox();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.up();

    await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-selected')).not.toBe('');
    expect(await page.getAttribute(CELL_VIEW, 'data-disassembly')).toBe('0');
  });

  test('hands off the other way: raising disassembly clears the isolate', async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => (window.__cellDebug?.frames ?? 0) >= 20);

    const box = await page.locator('canvas').boundingBox();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.up();

    await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-selected')).not.toBe('');

    await page.locator('[data-role="control"]').fill('40');

    await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-selected')).toBe('');
    expect(await page.getAttribute(CELL_VIEW, 'data-disassembly')).toBe('40');
  });

  test('reassembles on back to selection', async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => (window.__cellDebug?.frames ?? 0) >= 20);

    await page.locator('[data-role="control"]').fill('80');
    await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-disassembly')).toBe('80');

    await page.keyboard.press('Escape');

    await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-disassembly')).toBe('0');
    await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-selected')).toBe('');
  });
});
