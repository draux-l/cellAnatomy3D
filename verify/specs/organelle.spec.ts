import { expect, test } from '@playwright/test';
import { PERFORMANCE_BUDGETS } from '../budgets.mjs';
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
 * The metric-assertion gate for the organelle fixture.
 *
 * One entry per builder the app can render **today**. M1b (PR 3) adds the seven shared
 * organelles; M1c (PR 4) adds the plant three. The list is explicit rather than derived from the
 * catalog on purpose: the catalog also declares builders that are not registered yet, and a
 * missing-screenshot *coverage gate* over the catalog is task 3.11's job, not this spec's.
 *
 * Run with `UPDATE_BASELINES=1 npm run test:e2e` to re-record the committed screenshots and
 * baselines — that is what a deliberate visual change does, in the same commit as the change.
 */

const FIXTURE = 'organelle';
const ORGANELLES = [
  'membrane',
  'nucleus',
  'mitochondrion',
  'endoplasmic-reticulum',
  'golgi',
  'ribosome',
  'lysosome',
] as const;

/** The organelle the byte-identical determinism check runs on. */
const REPEAT_SUBJECT = 'mitochondrion';
const UPDATE = process.env.UPDATE_BASELINES === '1';

interface Measurement {
  buffer: Buffer;
  metrics: ScreenshotMetrics;
}

async function measure(
  page: Parameters<typeof openFixture>[0],
  organelle: string,
): Promise<Measurement> {
  await openFixture(page, FIXTURE, { id: organelle });
  const buffer = await capturePng(page);

  return { buffer, metrics: measurePng(buffer, loadBaselines().thresholds) };
}

test.describe('organelle metric fixtures', () => {
  for (const organelle of ORGANELLES) {
    test(`renders ${organelle} inside its committed metric band`, async ({ page }) => {
      const key = baselineKey(FIXTURE, organelle);
      const screenshot = `artifacts/screens/${FIXTURE}/${organelle}.png`;
      const problems = collectProblems(page);
      const debug = await openFixture(page, FIXTURE, { id: organelle });
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
          screenshot,
          coverage: Number(metrics.coverage.toFixed(6)),
          occupiedAreaPx: metrics.occupiedAreaPx,
          regionColor: rgbToHex(metrics.regionColor),
          measuredAt: new Date().toISOString().slice(0, 10),
          measuredWith: 'playwright chromium 153 / three 0.186.0',
          notes:
            `Frozen organelle fixture (M1b). Draw calls ${debug.drawCalls}, ` +
            `triangles ${debug.triangles}; the per-organelle cost report lives in ` +
            `artifacts/perf/report.json.`,
        };

        writeScreenshot(baseline, buffer);
        baselines.fixtures[key] = baseline;
        writeBaselines(baselines);

        console.log(
          `[${organelle}] baseline updated: ${describeMetrics(metrics)} -> ${screenshotAbsolutePath(baseline)}`,
        );

        return;
      }

      const baseline = baselines.fixtures[key];

      if (!baseline) {
        throw new Error(
          `No committed baseline for "${key}". Record one with UPDATE_BASELINES=1 npm run test:e2e`,
        );
      }

      assertCoverage(metrics, baselines.thresholds);
      assertAreaWithinBand(metrics, baseline.occupiedAreaPx, baselines.thresholds);
      assertRegionColor(metrics, hexToRgb(baseline.regionColor), baselines.thresholds);

      console.log(`[${organelle}] ${describeMetrics(metrics)}`);
      console.log(
        `[${organelle}] draw calls ${debug.drawCalls} | triangles ${debug.triangles} | ` +
          `first render ${debug.firstRenderAtMs?.toFixed(0)}ms`,
      );
    });
  }

  test('keeps every organelle inside its draw-call and triangle budgets', async ({ page }) => {
    for (const organelle of ORGANELLES) {
      const debug = await openFixture(page, FIXTURE, { id: organelle });

      // Deterministic and hardware-independent, so this is a hard gate rather than a report line.
      expect(debug.drawCalls, `${organelle} draw calls`).toBeGreaterThan(0);
      expect(debug.drawCalls, `${organelle} draw calls`).toBeLessThanOrEqual(
        PERFORMANCE_BUDGETS.drawCallsPerCell,
      );
      expect(debug.triangles, `${organelle} triangles`).toBeLessThanOrEqual(
        PERFORMANCE_BUDGETS.trianglesPerOrganelle,
      );
      expect(debug.triangles, `${organelle} triangles`).toBeLessThanOrEqual(
        PERFORMANCE_BUDGETS.trianglesPerCell,
      );
    }
  });

  test('repeats the same frame across two independent loads', async ({ page }) => {
    const first = await measure(page, REPEAT_SUBJECT);
    const second = await measure(page, REPEAT_SUBJECT);

    expect(first.metrics.coverage).toBeCloseTo(second.metrics.coverage, 4);
    expect(second.metrics.occupiedAreaPx).toBe(first.metrics.occupiedAreaPx);
    expect(colorDistance(first.metrics.regionColor, second.metrics.regionColor)).toBeLessThanOrEqual(3);
    expect(first.buffer.equals(second.buffer)).toBe(true);

    console.log(`[${REPEAT_SUBJECT}] repeatable: ${describeMetrics(first.metrics)}`);
    console.log(`[${REPEAT_SUBJECT}] two loads produced byte-identical PNGs (${first.buffer.length} bytes)`);
  });

  test('fails the coverage assertion when the canvas paints nothing', async ({ page }) => {
    await openFixture(page, FIXTURE, { id: REPEAT_SUBJECT });

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
