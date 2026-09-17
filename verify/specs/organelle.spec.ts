import { expect, test } from '@playwright/test';
import {
  baselineKey,
  loadBaselines,
  screenshotAbsolutePath,
  writeBaselines,
  writeScreenshot,
  type FixtureBaseline,
} from '../baselines';
import { collectProblems, capturePng, openFixture, VIEWPORT } from '../harness';
import {
  assertAreaWithinBand,
  assertCoverage,
  assertRegionColor,
  colorDistance,
  describeMetrics,
  hexToRgb,
  measurePng,
  rgbToHex,
  type ScreenshotMetrics,
} from '../metrics';

/**
 * The metric-assertion gate for the M0 organelle fixture.
 *
 * Run with `UPDATE_BASELINES=1` to re-record the committed screenshot and baseline — that is what
 * a deliberate visual change does, in the same commit as the change itself.
 */

const FIXTURE = 'organelle';
const SUBJECT = 'mitochondrion';
const KEY = baselineKey(FIXTURE, SUBJECT);
const UPDATE = process.env.UPDATE_BASELINES === '1';
const SCREENSHOT = `artifacts/screens/${FIXTURE}/${SUBJECT}.png`;

interface Measurement {
  buffer: Buffer;
  metrics: ScreenshotMetrics;
}

async function measure(page: Parameters<typeof openFixture>[0]): Promise<Measurement> {
  await openFixture(page, FIXTURE, { id: SUBJECT });
  const buffer = await capturePng(page);

  return { buffer, metrics: measurePng(buffer, loadBaselines().thresholds) };
}

test.describe('organelle metric fixture', () => {
  test('renders the mitochondrion inside its committed metric band', async ({ page }) => {
    const problems = collectProblems(page);
    const debug = await openFixture(page, FIXTURE, { id: SUBJECT });
    const buffer = await capturePng(page);
    const baselines = loadBaselines();
    const metrics = measurePng(buffer, baselines.thresholds);

    // The fixture's entire job is determinism: a frozen clock and no page errors.
    expect(problems.messages).toEqual([]);
    expect(debug.fixture).toBe(FIXTURE);
    expect(debug.frozen).toBe(true);
    expect(debug.clock.elapsed).toBe(0);
    expect(metrics.width).toBe(VIEWPORT.width);
    expect(metrics.height).toBe(VIEWPORT.height);

    if (UPDATE) {
      const baseline: FixtureBaseline = {
        screenshot: SCREENSHOT,
        coverage: Number(metrics.coverage.toFixed(6)),
        occupiedAreaPx: metrics.occupiedAreaPx,
        regionColor: rgbToHex(metrics.regionColor),
        measuredAt: new Date().toISOString().slice(0, 10),
        measuredWith: 'playwright chromium 153 / three 0.186.0',
        notes:
          'Frozen organelle fixture: M0’s only organelle. Draw calls and triangles are recorded ' +
          'in artifacts/perf/report.json.',
      };

      writeScreenshot(baseline, buffer);
      baselines.fixtures[KEY] = baseline;
      writeBaselines(baselines);

      console.log(`[organelle] baseline updated: ${describeMetrics(metrics)} -> ${screenshotAbsolutePath(baseline)}`);

      return;
    }

    const baseline = baselines.fixtures[KEY];

    if (!baseline) {
      throw new Error(
        `No committed baseline for "${KEY}". Record one with UPDATE_BASELINES=1 npm run test:e2e`,
      );
    }

    assertCoverage(metrics, baselines.thresholds);
    assertAreaWithinBand(metrics, baseline.occupiedAreaPx, baselines.thresholds);
    assertRegionColor(metrics, hexToRgb(baseline.regionColor), baselines.thresholds);

    console.log(`[organelle] ${describeMetrics(metrics)}`);
    console.log(
      `[organelle] draw calls ${debug.drawCalls} | triangles ${debug.triangles} | ` +
        `first render ${debug.firstRenderAtMs?.toFixed(0)}ms`,
    );
  });

  test('repeats the same frame across two independent loads', async ({ page }) => {
    const first = await measure(page);
    const second = await measure(page);

    expect(first.metrics.coverage).toBeCloseTo(second.metrics.coverage, 4);
    expect(second.metrics.occupiedAreaPx).toBe(first.metrics.occupiedAreaPx);
    expect(colorDistance(first.metrics.regionColor, second.metrics.regionColor)).toBeLessThanOrEqual(3);
    expect(first.buffer.equals(second.buffer)).toBe(true);

    console.log(`[organelle] repeatable: ${describeMetrics(first.metrics)}`);
    console.log(`[organelle] two loads produced byte-identical PNGs (${first.buffer.length} bytes)`);
  });

  test('fails the coverage assertion when the canvas paints nothing', async ({ page }) => {
    await openFixture(page, FIXTURE, { id: SUBJECT });

    // A deliberately blank render through the real pipeline: the compositor still produces a
    // frame, it just contains no scene.
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');

      if (canvas instanceof HTMLElement) {
        canvas.style.visibility = 'hidden';
      }
    });

    const metrics = measurePng(await capturePng(page), loadBaselines().thresholds);

    expect(metrics.coverage).toBeLessThan(loadBaselines().thresholds.coverageMin);
    expect(metrics.occupiedAreaPx).toBe(0);
    expect(() => assertCoverage(metrics)).toThrow(/rendered nothing/);
  });
});
