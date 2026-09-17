import { expect, test } from '@playwright/test';
import { PERFORMANCE_BUDGETS } from '../budgets.mjs';
import {
  baselineKey,
  loadBaselines,
  writeBaselines,
  writeScreenshot,
  type FixtureBaseline,
} from '../baselines';
import { capturePng, collectProblems, openApp, openFixture, VIEWPORT } from '../harness';
import {
  assertAreaWithinBand,
  assertCoverage,
  assertRegionColor,
  describeMetrics,
  hexToRgb,
  measureLuminanceRise,
  measurePng,
  rgbToHex,
} from '../metrics';

/**
 * The composed cell, and the pointer that acts on it (tasks 4.1–4.4).
 *
 * Two kinds of check live here and they are deliberately different:
 *
 * - **Metric assertions** on frozen fixtures — coverage, area band, region colour — so a regression
 *   in composition is caught without pixel-diffing across rasterisers.
 * - **Real gestures** on the unfrozen app, because "a drag orbits and does not select" is a fact
 *   about pointer events that no fixture can assert.
 *
 * Run with `UPDATE_BASELINES=1 npm run test:e2e` to re-record the committed screenshots.
 */

const UPDATE = process.env.UPDATE_BASELINES === '1';
const CELL_VIEW = '.cell-view';
const HOVER_SUBJECT = 'mitochondrion';
const ISOLATE_SUBJECT = 'golgi';

interface Measurement {
  buffer: Buffer;
  debug: Awaited<ReturnType<typeof openFixture>>;
}

async function measureCell(
  page: Parameters<typeof openFixture>[0],
  view: 'animal' | 'plant',
): Promise<Measurement> {
  const debug = await openFixture(page, 'cell', { view });
  const buffer = await capturePng(page);

  return { buffer, debug };
}

function record(key: string, screenshot: string, buffer: Buffer, notes: string): void {
  const baselines = loadBaselines();
  const metrics = measurePng(buffer, baselines.thresholds);
  const baseline: FixtureBaseline = {
    screenshot,
    coverage: Number(metrics.coverage.toFixed(6)),
    occupiedAreaPx: metrics.occupiedAreaPx,
    regionColor: rgbToHex(metrics.regionColor),
    measuredAt: new Date().toISOString().slice(0, 10),
    measuredWith: 'playwright chromium 153 / three 0.186.0',
    notes,
  };

  writeScreenshot(baseline, buffer);
  baselines.fixtures[key] = baseline;
  writeBaselines(baselines);

  console.log(`[${key}] baseline updated: ${describeMetrics(metrics)}`);
}

test.describe('the composed cell', () => {
  for (const view of ['animal', 'plant'] as const) {
    test(`renders the ${view} cell inside its committed metric band`, async ({ page }) => {
      const key = baselineKey('cell', view);
      const screenshot = `artifacts/screens/cell/${view}.png`;
      const problems = collectProblems(page);
      const { buffer, debug } = await measureCell(page, view);
      const baselines = loadBaselines();
      const metrics = measurePng(buffer, baselines.thresholds);

      expect(problems.messages).toEqual([]);
      expect(debug.fixture).toBe('cell');
      expect(debug.frozen).toBe(true);
      expect(metrics.width).toBe(VIEWPORT.width);
      expect(metrics.height).toBe(VIEWPORT.height);

      if (UPDATE) {
        record(
          key,
          screenshot,
          buffer,
          `Composed ${view} cell, frozen fixture. Draw calls ${debug.drawCalls}, triangles ${debug.triangles}.`,
        );
        return;
      }

      const baseline = baselines.fixtures[key];

      if (!baseline) {
        throw new Error(`No committed baseline for "${key}". Record one with UPDATE_BASELINES=1.`);
      }

      assertCoverage(metrics, baselines.thresholds);
      assertAreaWithinBand(metrics, baseline.occupiedAreaPx, baselines.thresholds);
      assertRegionColor(metrics, hexToRgb(baseline.regionColor), baselines.thresholds);

      console.log(`[${key}] ${describeMetrics(metrics)}`);
      console.log(`[${key}] draw calls ${debug.drawCalls} | triangles ${debug.triangles}`);
    });
  }

  test('keeps a composed cell inside the per-cell draw-call and triangle budgets', async ({
    page,
  }) => {
    // The real measurement: an assembled cell renders 22 (animal) / 26 (plant) calls, not a sum
    // over ten isolated fixtures.
    for (const view of ['animal', 'plant'] as const) {
      const debug = await openFixture(page, 'cell', { view });

      expect(debug.drawCalls, `${view} draw calls`).toBeGreaterThan(0);
      expect(debug.drawCalls, `${view} draw calls`).toBeLessThanOrEqual(
        PERFORMANCE_BUDGETS.drawCallsPerCell,
      );
      expect(debug.triangles, `${view} triangles`).toBeLessThanOrEqual(
        PERFORMANCE_BUDGETS.trianglesPerCell,
      );

      console.log(`[cell:${view}] draw calls ${debug.drawCalls} | triangles ${debug.triangles}`);
    }
  });

  test('resolves more than one organelle across the cell, so the roster is really mounted', async ({
    page,
  }) => {
    const problems = collectProblems(page);

    await openApp(page);
    await page.waitForFunction(() => (window.__cellDebug?.frames ?? 0) >= 20);

    const box = await page.locator('canvas').boundingBox();
    const found = new Set<string>();

    // Sweep a grid and collect what the ray resolves to. One hit volume would yield one id; a
    // mounted roster yields several, which is the cheapest proof that the cell is composed rather
    // than a single organelle wearing a wall.
    for (const fx of [0.35, 0.45, 0.55, 0.65]) {
      for (const fy of [0.35, 0.45, 0.55, 0.65]) {
        const debug = await page.evaluate(async () => {
          await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

          return null;
        });

        void debug;

        await page.mouse.move(box!.x + box!.width * fx, box!.y + box!.height * fy);
        await page.waitForTimeout(120);

        const id = await page.getAttribute(CELL_VIEW, 'data-hovered');

        if (id) {
          found.add(id);
        }
      }
    }

    expect(found.size, `hovered ids seen: ${[...found].join(', ')}`).toBeGreaterThanOrEqual(2);
    expect(problems.messages).toEqual([]);

    console.log(`[proxies] resolved ${found.size} organelles: ${[...found].join(', ')}`);
  });
});

test.describe('hover', () => {
  test('raises the hovered organelle region at least 10% and creates no extra label', async ({
    page,
  }) => {
    const baseline = await openFixture(page, 'cell', { view: 'animal' });
    const baselineFrame = await capturePng(page);

    const hovered = await openFixture(page, 'hover', { organelle: HOVER_SUBJECT });
    const hoveredFrame = await capturePng(page);

    expect(
      Math.abs(hovered.drawCalls - baseline.drawCalls),
      `hover ${hovered.drawCalls} vs baseline ${baseline.drawCalls}`,
    ).toBe(0);

    const diff = measureLuminanceRise(baselineFrame, hoveredFrame);

    expect(diff.changedPixels).toBeGreaterThan(0);
    expect(diff.risePct, `hover luminance rise ${diff.risePct.toFixed(1)}%`).toBeGreaterThanOrEqual(10);

    // Hover emphasizes an existing annotation; it must not add a label node (spec, MODIFIED).
    expect(await page.getAttribute(CELL_VIEW, 'data-hovered')).toBe(HOVER_SUBJECT);
    expect(await page.locator('[data-annotation]').count()).toBe(0);

    console.log(
      `[hover:${HOVER_SUBJECT}] +${diff.risePct.toFixed(1)}% over ${diff.changedPixels} px`,
    );
  });

  test('leaves the cell render untouched by the hovered state', async ({ page }) => {
    // Emphasis is a material write on a discrete change, so it must not add a draw call.
    const baseline = await openFixture(page, 'cell', { view: 'animal' });
    const hovered = await openFixture(page, 'hover', { organelle: HOVER_SUBJECT });

    // Exact, not tolerant: since task 4.13 the sample counts only the presented frame of the main
    // scene, so `renderer.info` no longer reports the contact-shadow depth pass on some ticks.
    expect(hovered.drawCalls).toBe(baseline.drawCalls);
    expect(hovered.triangles, `hover ${hovered.triangles} vs baseline ${baseline.triangles}`).toBe(
      baseline.triangles,
    );
  });
});

test.describe('isolate', () => {
  test(`frames the ${ISOLATE_SUBJECT} and de-emphasizes the rest`, async ({ page }) => {
    const key = baselineKey('interaction', `isolate-${ISOLATE_SUBJECT}`);
    const screenshot = `artifacts/screens/interaction/isolate-${ISOLATE_SUBJECT}.png`;
    const problems = collectProblems(page);
    const debug = await openFixture(page, 'isolate', { organelle: ISOLATE_SUBJECT });
    const buffer = await capturePng(page);
    const baselines = loadBaselines();
    const metrics = measurePng(buffer, baselines.thresholds);

    expect(problems.messages).toEqual([]);
    expect(await page.getAttribute(CELL_VIEW, 'data-selected')).toBe(ISOLATE_SUBJECT);

    if (UPDATE) {
      record(
        key,
        screenshot,
        buffer,
        `Isolated ${ISOLATE_SUBJECT} fixture, camera framed from the catalog. Draw calls ${debug.drawCalls}.`,
      );
      return;
    }

    const baseline = baselines.fixtures[key];

    if (!baseline) {
      throw new Error(`No committed baseline for "${key}". Record one with UPDATE_BASELINES=1.`);
    }

    assertCoverage(metrics, baselines.thresholds);
    assertAreaWithinBand(metrics, baseline.occupiedAreaPx, baselines.thresholds);

    console.log(`[${key}] ${describeMetrics(metrics)}`);
  });
});

test.describe('pointer gestures on the live app', () => {
  test('orbits without selecting, selects on a click, and clears on empty space', async ({
    page,
  }) => {
    const problems = collectProblems(page);

    await openApp(page);
    await page.waitForFunction(() => (window.__cellDebug?.frames ?? 0) >= 20);

    const box = await page.locator('canvas').boundingBox();
    const centreX = box!.x + box!.width / 2;
    const centreY = box!.y + box!.height / 2;

    // Hovering the middle of the cell resolves to an inner organelle, not the envelope: the
    // hit-volume priority rule is what makes the cell clickable at all.
    await page.mouse.move(centreX, centreY);
    await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-hovered'), { timeout: 5000 }).not.toBe(
      '',
    );
    const hovered = await page.getAttribute(CELL_VIEW, 'data-hovered');

    expect(hovered).not.toBe('membrane');

    // A drag is an orbit, and the spec says it selects nothing.
    await page.mouse.move(centreX, centreY);
    await page.mouse.down();
    await page.mouse.move(centreX + 90, centreY + 40, { steps: 8 });
    await page.mouse.up();

    expect(await page.getAttribute(CELL_VIEW, 'data-selected')).toBe('');

    // A click on the same organelle isolates it.
    await page.mouse.move(centreX, centreY);
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-selected')).toBe(hovered!);

    // A click on empty space clears the selection.
    await page.mouse.move(box!.x + 8, box!.y + 8);
    await page.mouse.down();
    await page.mouse.up();

    await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-selected')).toBe('');

    expect(problems.messages).toEqual([]);
  });

  test('clamps the zoom so the camera never enters the cell', async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => (window.__cellDebug?.frames ?? 0) >= 20);

    const box = await page.locator('canvas').boundingBox();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

    for (let step = 0; step < 20; step += 1) {
      await page.mouse.wheel(0, -400);
    }

    // The cell is still visible as a whole: the near clamp is asserted against the built wall by
    // the camera-model unit test, and this proves the control path actually honours it.
    const metrics = measurePng(await capturePng(page), loadBaselines().thresholds);

    assertCoverage(metrics, loadBaselines().thresholds);
    expect(metrics.coverage).toBeLessThan(1);
  });

  test('returns to the view-selection state on demand', async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => (window.__cellDebug?.frames ?? 0) >= 20);

    const box = await page.locator('canvas').boundingBox();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.up();

    await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-selected')).not.toBe('');

    await page.keyboard.press('Escape');

    await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-selected')).toBe('');
    await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-disassembly')).toBe('0');
  });
});
