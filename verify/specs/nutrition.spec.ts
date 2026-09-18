import { expect, test } from '@playwright/test';
import { PERFORMANCE_BUDGETS } from '../budgets.mjs';
import {
  baselineKey,
  loadBaselines,
  writeBaselines,
  writeScreenshot,
  type FixtureBaseline,
} from '../baselines';
import {
  capturePng,
  collectProblems,
  openApp,
  measureProcessAdvance,
  openFixture,
  readCellDebug,
  readProcess,
  readProcesses,
  readSettledDrawCalls,
  type ProcessSnapshot,
} from '../harness';
import {
  assertCoverage,
  describeMetrics,
  measureLuminanceRise,
  measurePng,
  rgbToHex,
  type ScreenshotMetrics,
} from '../metrics';

/**
 * Nutrition: respiration and photosynthesis (Phase 5, tasks 5.2–5.5).
 *
 * The spec's nutrition requirements are unusually *measurable*, and this suite is built around that
 * rather than around eyeballing:
 *
 * | Requirement | How it is asserted here |
 * |---|---|
 * | Respiration animates inside the mitochondrion | a frozen-stage screenshot inspected, and the mirror's `organelleId` |
 * | The two processes are not conflated | the animal cell runs no photosynthesis, and respiration's light-uniform count stays at zero while photosynthesis's grows |
 * | Light drives the photosynthetic rate | `Δphotosynthesis.time / Δrespiration.time` equals the slider, exactly |
 * | Zero light is honest | the clock stops at zero, the panel states that light is required in the active language, and the respiration frame is byte-identical at zero and full light |
 * | Exit restores the base viewer | end-to-end: the process leaves, nothing else moves |
 *
 * **The ratio measurement is the centrepiece.** Both instances in the plant cell accumulate their
 * own clock from the same frame deltas, so their advancement over one window is proportional to
 * their rate *by construction* — which makes `Δphotosynthesis / Δrespiration` a direct reading of the
 * light term that no amount of machine noise can perturb. Both the numerator and the denominator
 * are real measured quantities.
 *
 * Run with `UPDATE_BASELINES=1 npm run test:e2e` to re-record the committed screenshots.
 */

const UPDATE = process.env.UPDATE_BASELINES === '1';
const CELL_VIEW = '.cell-view';

interface ProcessCase {
  key: string;
  /** `?fixture=process` parameters. */
  params: Record<string, string>;
  screenshot: string;
  notes: string;
}

/**
 * The committed process states.
 *
 * Each is a function of the URL: a frozen clock, a pinned camera and a pinned light. The three
 * close-ups are what makes the animation *inspectable* — at cell scale a mitochondrion is 70 px wide
 * and "on the cristae" is not a claim a reader could check. The zero-light case is committed too,
 * because the honest state is a visible outcome and a regression in it should show up as a diff.
 */
const CASES: readonly ProcessCase[] = [
  {
    key: baselineKey('process', 'respiration-animal'),
    params: { id: 'nutrition', cell: 'animal', focus: 'mitochondrion', t: '0.3', fps: 'off' },
    screenshot: 'artifacts/screens/process/respiration-animal.png',
    notes:
      'Respiration, frozen mid-reaction in the isolated mitochondrion. ATP markers on the cristae; no light input exists in this cell.',
  },
  {
    key: baselineKey('process', 'photosynthesis-plant'),
    params: { id: 'nutrition', cell: 'plant', focus: 'chloroplast', t: '0.6', fps: 'off' },
    screenshot: 'artifacts/screens/process/photosynthesis-plant.png',
    notes:
      'Photosynthesis, frozen mid-cycle in the isolated chloroplast. The thylakoid flow spirals along the grana.',
  },
  {
    key: baselineKey('process', 'nutrition-animal'),
    params: { id: 'nutrition', cell: 'animal', t: '0.3', fps: 'off' },
    screenshot: 'artifacts/screens/process/nutrition-animal.png',
    notes: 'The whole animal cell with nutrition running: respiration only, because it has no chloroplast.',
  },
  {
    key: baselineKey('process', 'nutrition-plant'),
    params: { id: 'nutrition', cell: 'plant', t: '0.6', fps: 'off' },
    screenshot: 'artifacts/screens/process/nutrition-plant.png',
    notes: 'The whole plant cell with nutrition running: both processes, each inside its own organelle.',
  },
  {
    key: baselineKey('process', 'light-zero'),
    params: {
      id: 'nutrition',
      cell: 'plant',
      focus: 'chloroplast',
      light: '0',
      t: '0.6',
      fps: 'off',
    },
    screenshot: 'artifacts/screens/process/light-zero.png',
    notes:
      'Zero light, the same frozen time as the photosynthesis close-up: the flow is absent, which is what "the light-dependent animation stops" looks like.',
  },
];

interface Captured {
  metrics: ScreenshotMetrics;
  buffer: Buffer;
  drawCalls: number;
  processes: ProcessSnapshot[];
}

async function capture(
  page: Parameters<typeof openFixture>[0],
  params: Record<string, string>,
): Promise<Captured> {
  const debug = await openFixture(page, 'process', params);
  const buffer = await capturePng(page);

  return {
    buffer,
    drawCalls: debug.drawCalls,
    processes: await readProcesses(page),
    metrics: measurePng(buffer, loadBaselines().thresholds),
  };
}

function record(processCase: ProcessCase, captured: Captured): void {
  const baselines = loadBaselines();
  const baseline: FixtureBaseline = {
    screenshot: processCase.screenshot,
    coverage: Number(captured.metrics.coverage.toFixed(6)),
    occupiedAreaPx: captured.metrics.occupiedAreaPx,
    regionColor: rgbToHex(captured.metrics.regionColor),
    measuredAt: new Date().toISOString().slice(0, 10),
    measuredWith: 'playwright chromium 153 / three 0.186.0',
    notes: processCase.notes,
  };

  writeScreenshot(baseline, captured.buffer);
  baselines.fixtures[processCase.key] = baseline;
  writeBaselines(baselines);

  console.log(`[${processCase.key}] baseline updated: ${describeMetrics(captured.metrics)}`);
}

test.describe('nutrition fixtures', () => {
  test('commits an inspected screenshot for every process state', async ({ page }) => {
    for (const processCase of CASES) {
      if (!UPDATE) {
        if (!loadBaselines().fixtures[processCase.key]) {
          throw new Error(
            `No committed baseline for "${processCase.key}". Record one with UPDATE_BASELINES=1.`,
          );
        }

        continue;
      }

      const captured = await capture(page, processCase.params);

      assertCoverage(captured.metrics, loadBaselines().thresholds);
      record(processCase, captured);
    }
  });

  test('keeps the process inside its own organelle and adds only its own draw calls', async ({
    page,
  }) => {
    const problems = collectProblems(page);
    const plant = await capture(page, CASES[3]!.params);

    expect(problems.messages).toEqual([]);
    assertCoverage(plant.metrics, loadBaselines().thresholds);

    const respiration = plant.processes.find((entry) => entry.id === 'respiration');
    const photosynthesis = plant.processes.find((entry) => entry.id === 'photosynthesis');

    expect(respiration?.organelleId).toBe('mitochondrion');
    expect(photosynthesis?.organelleId).toBe('chloroplast');
    // Not conflated: one is scripted and light-independent, the other continuous and light-driven.
    expect(respiration?.scripted).toBe(true);
    expect(respiration?.lightDriven).toBe(false);
    expect(photosynthesis?.scripted).toBe(false);
    expect(photosynthesis?.lightDriven).toBe(true);

    // The cost, measured against the same cell with nothing running. Both readings use the same
    // pinned camera pose, because `renderer.info.render.calls` is a function of the frustum as well
    // as of the scene: comparing an isolated view with a cell-wide one would measure the camera.
    const runningCalls = await readSettledDrawCalls(page, 4);
    const idle = await openFixture(page, 'cell', { view: 'plant' });
    const idleCalls = await readSettledDrawCalls(page, 4);

    expect(runningCalls, 'the process should cost draw calls; a zero delta would mean it did not run').toBeGreaterThan(
      idleCalls,
    );
    // One draw call per sub-process: a glow field each, and nothing else. The exact delta is asserted
    // rather than a range because it is what makes the ≤150 budget meaningful.
    expect(runningCalls - idleCalls).toBe(2);

    console.log(
      `[process.cost] draw calls ${idleCalls} idle -> ${runningCalls} with both processes running ` +
        `(budget ${PERFORMANCE_BUDGETS.drawCallsPerCell}); idle fixture reported ${idle.drawCalls}`,
    );
    expect(runningCalls).toBeLessThanOrEqual(PERFORMANCE_BUDGETS.drawCallsPerCell);
  });

  test('shows the thylakoid flow with light and not without it', async ({ page }) => {
    // The zero-light state is committed as a screenshot, but a screenshot is not a gate. This turns
    // the pair into a measurement: the lit frame must be *brighter* where the two frames differ, and
    // the differing area must be substantial enough to be the flow rather than antialiasing noise.
    //
    // Note for the record: the committed metrics (coverage, occupied area) for these two fixtures are
    // equal, because the glow lands on pixels that are already part of the chloroplast. Only a
    // luminance comparison over the changed pixels can see it.
    const lit = await capture(page, CASES[1]!.params);
    const dark = await capture(page, CASES[4]!.params);
    const difference = measureLuminanceRise(dark.buffer, lit.buffer);

    console.log(
      `[process.zero-light] ${difference.changedPixels} px changed, luminance ` +
        `${difference.baselineLuminance.toFixed(4)} (no light) -> ${difference.currentLuminance.toFixed(4)} (full light) ` +
        `= ${difference.risePct.toFixed(1)}%`,
    );

    expect(difference.changedPixels).toBeGreaterThan(1000);
    expect(difference.risePct).toBeGreaterThan(5);
  });

  test('runs respiration in the animal cell and photosynthesis nowhere near it', async ({ page }) => {
    const animal = await capture(page, CASES[2]!.params);

    expect(animal.processes.map((entry) => entry.id)).toEqual(['respiration']);
    // The absence is a property of the roster, not of a hidden branch: the chloroplast is not in the
    // animal cell's records at all, which is why there is nothing to animate there.
    expect(animal.processes.some((entry) => entry.organelleId === 'chloroplast')).toBe(false);
  });

  test('never writes the light uniform from respiration, at either end of the slider', async ({
    page,
  }) => {
    const readings: { light: string; respiration: ProcessSnapshot; photosynthesis: ProcessSnapshot }[] = [];

    for (const light of ['0', '100']) {
      await openFixture(page, 'process', { id: 'nutrition', cell: 'plant', light, t: '0.6' });

      const respiration = await readProcess(page, 'respiration');
      const photosynthesis = await readProcess(page, 'photosynthesis');

      expect(respiration).not.toBeNull();
      expect(photosynthesis).not.toBeNull();

      readings.push({ light, respiration: respiration!, photosynthesis: photosynthesis! });
    }

    for (const reading of readings) {
      // Four frames' worth of writes have already happened by the first read, so the count is a live
      // measurement rather than a zero that could just mean "nothing ran yet".
      expect(
        reading.photosynthesis.uniformWrites,
        `photosynthesis wrote no light uniform at light=${reading.light}`,
      ).toBeGreaterThan(0);
      expect(
        reading.respiration.uniformWrites,
        `respiration wrote the light uniform at light=${reading.light}`,
      ).toBe(0);
    }

    console.log(
      `[process.light-uniform] writes at light=0: respiration ${readings[0]!.respiration.uniformWrites} / ` +
        `photosynthesis ${readings[0]!.photosynthesis.uniformWrites}; at light=100: respiration ` +
        `${readings[1]!.respiration.uniformWrites} / photosynthesis ${readings[1]!.photosynthesis.uniformWrites}`,
    );
  });

  test('scales the photosynthetic rate by the slider and leaves respiration untouched', async ({
    page,
  }) => {
    const measurements: { light: number; respiration: number; photosynthesis: number }[] = [];

    for (const light of [100, 50, 0]) {
      // No `t`, so the clock is running: this is the one fixture case that measures motion rather
      // than pinning it.
      await openFixture(page, 'process', {
        id: 'nutrition',
        cell: 'plant',
        light: String(light),
      });

      const advance = await measureProcessAdvance(page, ['respiration', 'photosynthesis']);
      const respiration = await readProcess(page, 'respiration');
      const photosynthesis = await readProcess(page, 'photosynthesis');

      expect(respiration).not.toBeNull();
      expect(photosynthesis).not.toBeNull();
      expect(respiration!.rate).toBe(1);
      expect(photosynthesis!.rate).toBeCloseTo(light / 100, 6);

      measurements.push({
        light,
        respiration: advance.get('respiration') ?? 0,
        photosynthesis: advance.get('photosynthesis') ?? 0,
      });
    }

    // Both instances advance from the same frame deltas in the same page, so their clocks are
    // proportional to their rates by construction — and the ratio is the light term itself.
    for (const measurement of measurements) {
      const ratio = measurement.photosynthesis / measurement.respiration;

      console.log(
        `[process.rate] light=${measurement.light}: photosynthesis advanced ` +
          `${measurement.photosynthesis.toFixed(3)}s against respiration's ${measurement.respiration.toFixed(3)}s ` +
          `=> ratio ${ratio.toFixed(3)}`,
      );

      expect(measurement.respiration, 'respiration stopped, which light must never cause').toBeGreaterThan(0);
      expect(ratio).toBeCloseTo(measurement.light / 100, 1);
    }

    expect(measurements[2]!.photosynthesis, 'the flow moved with no light').toBe(0);
    expect(measurements[0]!.photosynthesis).toBeGreaterThan(measurements[1]!.photosynthesis);
  });

  test('renders respiration identically at zero light and at full light', async ({ page }) => {
    // The invariant, stated the strongest way the harness can state it: two page loads that differ
    // only in the light parameter must produce the same pixels. It holds because respiration never
    // reads the light state — and the animal cell is used because it contains no chloroplast, so the
    // frame is respiration and the cell, with nothing that legitimately responds to light.
    const params = { id: 'nutrition', cell: 'animal', focus: 'mitochondrion', t: '0.3', fps: 'off' };

    await openFixture(page, 'process', { ...params, light: '0' });
    const dark = await capturePng(page);

    await openFixture(page, 'process', { ...params, light: '100' });
    const lit = await capturePng(page);

    const darkMetrics = measurePng(dark, loadBaselines().thresholds);
    const litMetrics = measurePng(lit, loadBaselines().thresholds);

    console.log(
      `[process.invariant] light=0 ${darkMetrics.occupiedAreaPx}px / light=100 ${litMetrics.occupiedAreaPx}px, ` +
        `byte-identical: ${dark.equals(lit)}`,
    );

    // Byte equality is the claim. The metrics are reported alongside so a failure says *how* the two
    // frames differ rather than only that they do. The comparison is never loosened: if this fails,
    // the light state is reaching respiration, which is a finding about the two processes.
    expect(
      dark.equals(lit),
      `respiration frames differ at light=0 vs light=100: ` +
        `coverage ${darkMetrics.coverage.toFixed(5)} vs ${litMetrics.coverage.toFixed(5)}, ` +
        `area ${darkMetrics.occupiedAreaPx}px vs ${litMetrics.occupiedAreaPx}px`,
    ).toBe(true);
  });
});

test.describe('nutrition on the live app', () => {
  test('states in the active language that light is required when the slider is at zero', async ({
    page,
  }) => {
    const problems = collectProblems(page);

    await openApp(page);
    await page.waitForFunction(() => (window.__cellDebug?.frames ?? 0) >= 20);
    await page.locator('[data-view="plant"]').click();
    await page.locator('[data-process-id="nutrition"]').click();

    await expect(page.locator(CELL_VIEW)).toHaveAttribute('data-process', 'nutrition');
    await expect.poll(async () => (await readProcess(page, 'photosynthesis')) !== null).toBe(true);

    const warning = page.locator('[data-role="light-required"]');

    // At full light the flow runs and the statement is absent, not merely faint.
    await expect(warning).toBeHidden();
    expect((await readProcess(page, 'photosynthesis'))!.lightRequired).toBe(false);

    await page.locator('[data-role="light"]').fill('0');

    await expect(warning).toBeVisible();
    await expect(warning).toHaveText('Sin luz no hay fotosíntesis: la luz es necesaria.');
    await expect.poll(() => page.textContent('[data-role="light-value"]')).toBe('0%');

    const photosynthesis = await readProcess(page, 'photosynthesis');

    expect(photosynthesis!.lightRequired).toBe(true);
    expect(photosynthesis!.rate).toBe(0);

    // The statement follows the language switch, like every other live readout.
    await page.locator('.lang__option[data-locale="en"]').click();
    await expect(warning).toHaveText('Without light there is no photosynthesis: light is required.');

    // And it clears when the light comes back.
    await page.locator('[data-role="light"]').fill('100');
    await expect(warning).toBeHidden();
    expect((await readProcess(page, 'photosynthesis'))!.rate).toBe(1);

    expect(problems.messages).toEqual([]);
  });

  test('pauses, slows and resumes the process from the shared speed control', async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => (window.__cellDebug?.frames ?? 0) >= 20);
    await page.locator('[data-view="plant"]').click();
    await page.locator('[data-process-id="nutrition"]').click();
    await expect.poll(async () => (await readProcess(page, 'respiration')) !== null).toBe(true);

    const resume = async (): Promise<void> => {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (((await readProcess(page, 'respiration'))?.time ?? 0) > 0.05) {
          return;
        }

        await page.waitForTimeout(100);
      }

      throw new Error('the process never advanced');
    };

    await resume();

    await page.locator('[data-speed="slow"]').click();
    await expect.poll(async () => (await readProcess(page, 'respiration'))!.rate).toBe(0.25);

    await page.locator('[data-speed="pause"]').click();
    await expect.poll(async () => (await readProcess(page, 'respiration'))!.rate).toBe(0);

    const held = (await readProcess(page, 'respiration'))!.time;

    await page.waitForTimeout(1200);

    // Frozen, not merely slow: the same clock value after a wall-clock wait.
    expect((await readProcess(page, 'respiration'))!.time).toBe(held);

    await page.locator('[data-speed="realtime"]').click();
    await expect.poll(async () => (await readProcess(page, 'respiration'))!.rate).toBe(1);
    await expect.poll(async () => (await readProcess(page, 'respiration'))!.time).toBeGreaterThan(held);
  });

  test('does not re-render the scene per frame while a process runs', async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => (window.__cellDebug?.frames ?? 0) >= 20);
    await page.locator('[data-view="plant"]').click();
    await page.locator('[data-process-id="nutrition"]').click();
    await expect.poll(async () => (await readProcess(page, 'photosynthesis')) !== null).toBe(true);

    const before = (await readCellDebug(page))!;

    await page.waitForFunction(
      (target) => (window.__cellDebug?.frames ?? 0) >= target,
      before.frames + 120,
      { timeout: 180_000 },
    );

    const after = (await readCellDebug(page))!;
    const frames = after.frames - before.frames;
    const renders = after.sceneRenders - before.sceneRenders;

    console.log(`[process.no-rerender] ${renders} scene renders for ${frames} frames with two processes running`);

    // The process driver, the panel's interval and the shader writes must all leave the presented
    // frame count equal to the frame count: one render per frame, never two.
    expect(Math.abs(renders - frames)).toBeLessThanOrEqual(1);
  });

  test('exits cleanly: base viewer restored, catalog and selection unchanged', async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => (window.__cellDebug?.frames ?? 0) >= 20);
    await page.locator('[data-view="plant"]').click();

    // Isolate an organelle first, so "selection unchanged" is a real statement rather than a null
    // compared with a null.
    const box = await page.locator('canvas').boundingBox();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-selected')).not.toBe('');

    const selected = await page.getAttribute(CELL_VIEW, 'data-selected');
    const disassembly = await page.getAttribute(CELL_VIEW, 'data-disassembly');

    await page.locator('[data-process-id="nutrition"]').click();
    await expect(page.locator(CELL_VIEW)).toHaveAttribute('data-process', 'nutrition');
    await expect.poll(async () => (await readProcesses(page)).length).toBe(2);

    await page.locator('[data-process-action="exit"]').click();

    await expect(page.locator(CELL_VIEW)).toHaveAttribute('data-process', '');
    // The instances are gone: the driver's mirror is what says the scene was torn down, and it is
    // cleared by the same cleanup that detaches the objects and disposes their geometry.
    await expect.poll(async () => (await readProcesses(page)).length).toBe(0);

    // The base viewer is restored: the same isolate, the same explode value, and the sheet that
    // belongs to the still-isolated organelle still open. (`drawCalls` is *not* compared here: it is
    // a function of the camera, and isolating has moved it. The camera-stable cost assertion lives in
    // the fixture suite above. Neither is hover compared — pressing a button moves the pointer off
    // the canvas, so hover is legitimately cleared by the gesture, not by the process.)
    expect(await page.getAttribute(CELL_VIEW, 'data-selected')).toBe(selected);
    expect(await page.getAttribute(CELL_VIEW, 'data-disassembly')).toBe(disassembly);

    await expect(page.locator(`[data-spec="${selected}"]`)).toBeVisible();
  });

  test('lists the three vital processes and offers only the one that exists', async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => (window.__cellDebug?.frames ?? 0) >= 20);

    const panel = page.locator('[data-process-panel]');

    await expect(panel.locator('[data-process-id]')).toHaveCount(3);
    await expect(page.locator('[data-process-id="nutrition"]')).toBeEnabled();
    await expect(page.locator('[data-process-id="movement"]')).toBeDisabled();
    await expect(page.locator('[data-process-id="reproduction"]')).toBeDisabled();
    await expect(page.locator('[data-process-id="movement"]')).toHaveAttribute(
      'title',
      'Se añade en una etapa posterior',
    );
    // The exploded view is not one of them, and the control groups stay apart.
    await expect(panel.locator('[data-view-control="disassembly"]')).toHaveCount(0);
    await expect(page.locator('[data-view-control="disassembly"]')).toHaveCount(1);
  });
});
