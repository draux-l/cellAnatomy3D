import { expect, test } from '@playwright/test';
import { FPS_READOUT_MAX_HZ } from '../../src/ui/hud/fpsCadence';
import { VIEWPORT, collectProblems, openFixture, readCellDebug, readFpsTicks } from '../harness';

/**
 * The on-screen FPS readout (task 4.20, spec `On-Screen FPS Readout`).
 *
 * Two things are asserted, and both are the spec's own scenarios:
 *
 * 1. **The displayed value is the measurement.** The readout is compared against
 *    `__cellDebug.frameStats.p50Fps` — the object the harness itself reads. They are the same
 *    source, so the agreement is expected to be exact modulo the display's one-decimal rounding;
 *    the ±10% tolerance exists only to catch an implementation that forks the path.
 * 2. **The readout does not re-render the scene.** `__cellDebug.sceneRenders` counts the presented
 *    frames of the main scene, so a window's delta must equal the frame delta with the readout
 *    live and with it switched off (`?fps=off`), and the tick counter must stay inside the ratified
 *    2 Hz cadence.
 *
 * The measured performance today is below the ≥60 fps target and the readout shows that number.
 * That is the requirement working, not a failure: `hud.fps.agreement` below reports the displayed
 * value so a miss is visible in the run log rather than hidden.
 */

/** The reference target, used only to report whether the displayed value is below it. */
const FPS_TARGET = 60;

/** The agreement tolerance the spec ratifies. */
const AGREEMENT_TOLERANCE = 0.1;

/** How many frames a measurement window spans. Frame-bounded, so a slow machine still measures. */
const WINDOW_FRAMES = 120;

interface IdleWindow {
  frames: number;
  sceneRenders: number;
  ticks: number | null;
  durationMs: number;
}

/**
 * Measures one idle window.
 *
 * Bounded by **frames**, not by wall-clock: a software rasteriser delivers frames in bursts, and a
 * time-bounded window would compare different amounts of work between the two configurations.
 */
async function measureIdleWindow(
  page: Parameters<typeof openFixture>[0],
  search: Record<string, string>,
): Promise<IdleWindow> {
  await openFixture(page, 'cell', { view: 'animal', ...search });
  await page.waitForFunction(() => (window.__cellDebug?.frames ?? 0) >= 60);

  const before = await readCellDebug(page);
  const ticksBefore = await readFpsTicks(page);
  const startedAt = Date.now();

  await page.waitForFunction(
    (target) => (window.__cellDebug?.frames ?? 0) >= target,
    before!.frames + WINDOW_FRAMES,
    { timeout: 180_000 },
  );

  const after = await readCellDebug(page);
  const ticksAfter = await readFpsTicks(page);

  return {
    frames: after!.frames - before!.frames,
    sceneRenders: after!.sceneRenders - before!.sceneRenders,
    ticks: ticksBefore === null || ticksAfter === null ? null : ticksAfter - ticksBefore,
    durationMs: Date.now() - startedAt,
  };
}

test.describe('the fps readout', () => {
  test('shows the number the sampler measured, unclamped', async ({ page }) => {
    const problems = collectProblems(page);
    const debug = await openFixture(page, 'cell', { view: 'animal' });

    // The readout ticks at 2 Hz, so give it a tick before reading it.
    await page.waitForTimeout(600);

    const displayed = Number.parseFloat(
      (await page.textContent('[data-role="fps-value"]')) ?? 'NaN',
    );
    const sampled = debug.frameStats.p50Fps;

    expect(Number.isFinite(displayed), 'the readout is not a number').toBe(true);
    expect(sampled).toBeGreaterThan(0);

    const drift = Math.abs(displayed - sampled) / sampled;

    expect(
      drift,
      `readout ${displayed} vs sampler ${sampled.toFixed(2)} (${(drift * 100).toFixed(1)}%)`,
    ).toBeLessThanOrEqual(AGREEMENT_TOLERANCE);

    // A clamped readout would show the 60 target while the sampler disagrees. When the sampler is
    // below target the display must be too; when the machine is fast the assertion is vacuous.
    if (sampled < FPS_TARGET) {
      expect(displayed, `below-target value must be displayed as measured (${sampled.toFixed(1)})`)
        .toBeLessThan(FPS_TARGET);
    }

    expect(problems.messages).toEqual([]);

    console.log(
      `[hud.fps.agreement] displayed ${displayed} vs sampled ${sampled.toFixed(2)} ` +
        `(${(drift * 100).toFixed(2)}% drift, ${sampled < FPS_TARGET ? 'below' : 'at or above'} the ${FPS_TARGET} target)`,
    );
  });

  test('is present in the cell views and absent when switched off', async ({ page }) => {
    for (const view of ['animal', 'plant'] as const) {
      await openFixture(page, 'cell', { view });

      await expect(page.locator('[data-role="fps"]')).toHaveCount(1);
      await expect(page.locator('[data-role="fps-value"]')).toHaveText(/^\d+\.\d$/);
    }

    await openFixture(page, 'cell', { view: 'animal', fps: 'off' });

    await expect(page.locator('[data-role="fps"]')).toHaveCount(0);
  });

  test('does not re-render the scene, live versus disabled', async ({ page }) => {
    const live = await measureIdleWindow(page, {});
    const disabled = await measureIdleWindow(page, { fps: 'off' });

    // Every presented frame is one scene render. An extra render path — the shape a per-frame React
    // update would take — would break the equality.
    // Within one frame, `frames` is recorded before the render that counts as `sceneRenders`, so a
    // read landing between the two sees a skew of one. Anything larger is an extra render path.
    expect(
      Math.abs(live.sceneRenders - live.frames),
      `live: ${live.sceneRenders} renders for ${live.frames} frames`,
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(disabled.sceneRenders - disabled.frames),
      `disabled: ${disabled.sceneRenders} renders for ${disabled.frames} frames`,
    ).toBeLessThanOrEqual(1);

    expect(Math.abs(live.frames - disabled.frames)).toBeLessThanOrEqual(1);

    expect(live.ticks, 'the readout did not tick').not.toBeNull();
    expect(disabled.ticks, 'the disabled readout still ticked').toBeNull();

    const allowedTicks = Math.ceil((live.durationMs / 1000) * FPS_READOUT_MAX_HZ) + 1;

    expect(
      live.ticks!,
      `${live.ticks} ticks in ${live.durationMs}ms exceeds the ${FPS_READOUT_MAX_HZ} Hz bound`,
    ).toBeLessThanOrEqual(allowedTicks);

    console.log(
      `[hud.fps.idle] live ${live.sceneRenders}/${live.frames} renders in ${live.durationMs}ms ` +
        `with ${live.ticks} ticks (bound ${allowedTicks}) | disabled ${disabled.sceneRenders}/` +
        `${disabled.frames} renders`,
    );
  });

  test('never shows a placeholder before the first tick', async ({ page }) => {
    // The first render exists before the first tick does, so the initial text is rendered from the
    // same field. A blank or placeholder value there would be a substituted reading.
    await page.goto('/?fixture=cell&view=animal', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-role="fps-value"]')).toHaveText(/^\d+\.\d$/);
    expect(VIEWPORT.width).toBe(1280);
  });
});
