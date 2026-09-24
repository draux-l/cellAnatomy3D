import { expect, test, type Page } from '@playwright/test';
import { collectProblems, openApp } from '../harness';

/**
 * The shell panels: the view navigation (task 4.5).
 *
 * These are DOM surfaces in the entry chunk, so they are asserted through real gestures on the
 * unfrozen app — no fixture, no metrics. The claim that matters here is that **the navigation is
 * honest**: the comparison entry is declared and disabled, the enabled views really switch the cell
 * that is composed, and the language switch leaves the view untouched.
 *
 * The isolate/spec-sheet surfaces this spec used to cover are gone with the catalog: with no records
 * there is nothing to isolate, so the spec-sheet and annotation tests were removed rather than
 * asserted vacuously.
 */

const CELL_VIEW = '.cell-view';
const NAV = '.nav';

/** Frames to observe before interacting, so the first gesture is measured against a settled scene. */
const SETTLE_FRAMES = 20;

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    (minimum) => (window.__cellDebug?.frames ?? 0) >= minimum,
    SETTLE_FRAMES,
  );
}

test.describe('the view navigation', () => {
  test('switches the composed cell and reports the landing state', async ({ page }) => {
    const problems = collectProblems(page);

    await openApp(page);
    await settle(page);

    const nav = page.locator(NAV);

    // The landing state at load: nothing isolated, nothing disassembled.
    await expect(nav).toHaveAttribute('data-nav-view', 'animal');
    await expect(nav).toHaveAttribute('data-landing', 'true');
    await expect(page.locator(CELL_VIEW)).toHaveAttribute('data-cell', 'animal');

    // Comparison is declared and explained, not offered: M6 mounts its stage.
    await expect(page.locator('[data-view="comparison"]')).toBeDisabled();
    await expect(page.locator('[data-view="comparison"]')).toHaveAttribute(
      'title',
      'Se añade en una etapa posterior',
    );

    await page.locator('[data-view="plant"]').click();
    await expect(nav).toHaveAttribute('data-nav-view', 'plant');
    await expect(page.locator(CELL_VIEW)).toHaveAttribute('data-cell', 'plant');

    await page.locator('[data-view="animal"]').click();
    await expect(page.locator(CELL_VIEW)).toHaveAttribute('data-cell', 'animal');

    // Back to selection is a no-op in the landing state, so it stays disabled.
    await expect(page.locator('[data-nav-action="back-to-selection"]')).toBeDisabled();

    expect(problems.messages).toEqual([]);
  });
});

/**
 * The spec's `Language Switch Is Non-Destructive` (task 4.7), on the surface a unit test cannot
 * reach: the mounted app.
 *
 * The scene-level part of the claim (the camera and the organelles do not move) needs a roster to
 * measure and is not asserted here; what is asserted is that the same `<canvas>` node stays mounted
 * and the discrete view survives the switch.
 */
test.describe('the language switch is non-destructive', () => {
  test('keeps the view and the canvas across the switch', async ({ page }) => {
    const problems = collectProblems(page);

    await openApp(page);
    await settle(page);

    await page.locator('[data-view="plant"]').click();
    await expect(page.locator(CELL_VIEW)).toHaveAttribute('data-cell', 'plant');
    await settle(page);

    await page.evaluate(() => {
      document.querySelector('canvas')?.setAttribute('data-marker', 'kept');
    });

    await page.locator('[data-locale="en"]').click();

    // The scene is the same object: no remount, no rebuild.
    expect(await page.locator('canvas[data-marker="kept"]').count()).toBe(1);
    await expect(page.locator(NAV)).toHaveAttribute('data-nav-view', 'plant');
    await expect(page.locator(CELL_VIEW)).toHaveAttribute('data-cell', 'plant');

    await page.locator('[data-locale="es"]').click();
    await expect(page.locator(NAV)).toHaveAttribute('data-nav-view', 'plant');
    expect(await page.locator('canvas[data-marker="kept"]').count()).toBe(1);

    expect(problems.messages).toEqual([]);
  });
});
