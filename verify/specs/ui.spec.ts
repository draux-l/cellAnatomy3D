import { expect, test, type Page } from '@playwright/test';
import { getRecord } from '../../src/catalog/cells';
import { formatOrganelleSize } from '../../src/ui/specSheetModel';
import { collectProblems, openApp } from '../harness';

/**
 * The shell panels: the view navigation and the spec sheet (task 4.5).
 *
 * These are DOM surfaces in the entry chunk, so they are asserted through real gestures on the
 * unfrozen app — no fixture, no metrics. The two claims that matter are:
 *
 * 1. **The navigation is honest.** The comparison entry is declared and disabled; the enabled
 *    views really switch the cell that is composed.
 * 2. **The sheet is a view of the catalog record, not a copy of it.** Every field is compared
 *    against `getRecord(id)`, and the organelle's annotation is compared against the *same*
 *    record — one edit to one record has to move both surfaces, and this is what proves it.
 */

const CELL_VIEW = '.cell-view';
const NAV = '.nav';

/** Frames to observe before interacting, so the first pointer move is measured against a settled scene. */
const SETTLE_FRAMES = 20;

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    (minimum) => (window.__cellDebug?.frames ?? 0) >= minimum,
    SETTLE_FRAMES,
  );
}

/**
 * Clicks the organelle under the centre of the canvas and returns its id.
 *
 * The empty-corner move first is deliberate: `hoveredId` is a discrete value that survives a
 * camera change, so a stale hover from a previous gesture would otherwise be read as this one's.
 */
async function isolateCentreOrganelle(page: Page): Promise<string> {
  const box = await page.locator('canvas').boundingBox();

  if (!box) {
    throw new Error('the canvas has no layout box');
  }

  await page.mouse.move(box.x + 6, box.y + 6);
  await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-hovered')).toBe('');

  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;

  await page.mouse.move(centreX, centreY);
  await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-hovered')).not.toBe('');

  const hovered = (await page.getAttribute(CELL_VIEW, 'data-hovered')) ?? '';

  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-selected')).toBe(hovered);

  return hovered;
}

test.describe('the view navigation', () => {
  test('switches the composed cell and returns to the landing state', async ({ page }) => {
    const problems = collectProblems(page);

    await openApp(page);
    await settle(page);

    const nav = page.locator(NAV);

    // The landing state at load: nothing isolated, nothing disassembled, no process running.
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
    await settle(page);

    const isolated = await isolateCentreOrganelle(page);

    await expect(nav).toHaveAttribute('data-landing', 'false');
    await expect(page.locator(`[data-spec="${isolated}"]`)).toBeVisible();

    await page.locator('[data-nav-action="back-to-selection"]').click();

    await expect(nav).toHaveAttribute('data-landing', 'true');
    await expect(page.locator(CELL_VIEW)).toHaveAttribute('data-selected', '');
    await expect(page.locator('[data-spec]')).toHaveCount(0);

    expect(problems.messages).toEqual([]);
  });
});

test.describe('the spec sheet', () => {
  test('opens from a click and reads every field from the catalog record', async ({ page }) => {
    const problems = collectProblems(page);

    await openApp(page);
    await settle(page);

    const isolated = await isolateCentreOrganelle(page);
    const record = getRecord(isolated);

    expect(record, `the viewer isolated "${isolated}", which is not a catalog record`).toBeDefined();

    const sheet = page.locator(`[data-spec="${isolated}"]`);

    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute('lang', 'es');
    await expect(sheet.locator('[data-spec-field="name"]')).toHaveText(record!.name.es);
    await expect(sheet.locator('[data-spec-field="func"]')).toHaveText(record!.func.es);
    await expect(sheet.locator('[data-spec-field="size"]')).toHaveText(
      formatOrganelleSize(record!.size, 'es'),
    );
    await expect(sheet.locator('[data-spec-field="funFact"]')).toHaveText(record!.funFact.es);

    // The label and the sheet are two views of one record: the same `name` value, one source.
    await expect(
      page.locator(`[data-annotation="${isolated}"] [data-annotation-line="primary"]`),
    ).toHaveText(record!.name.es);

    // The sheet is bilingual content, not a Spanish-only copy: switching language re-renders the
    // same sheet, for the same organelle, from the record's other locale.
    await page.locator('[data-locale="en"]').click();

    await expect(sheet).toHaveAttribute('lang', 'en');
    await expect(sheet.locator('[data-spec-field="name"]')).toHaveText(record!.name.en);
    await expect(sheet.locator('[data-spec-field="func"]')).toHaveText(record!.func.en);
    await expect(sheet.locator('[data-spec-field="size"]')).toHaveText(
      formatOrganelleSize(record!.size, 'en'),
    );
    await expect(sheet.locator('[data-spec-field="funFact"]')).toHaveText(record!.funFact.en);
    await expect(page.locator(CELL_VIEW)).toHaveAttribute('data-selected', isolated);

    console.log(`[spec-sheet] ${isolated}: four fields matched the record in both locales`);

    expect(problems.messages).toEqual([]);
  });

  test('closes when the user asks for it and when empty space is clicked', async ({ page }) => {
    await openApp(page);
    await settle(page);

    const isolated = await isolateCentreOrganelle(page);

    await page.locator('[data-spec-action="close"]').click();
    await expect(page.locator('[data-spec]')).toHaveCount(0);
    await expect(page.locator(CELL_VIEW)).toHaveAttribute('data-selected', '');

    const again = await isolateCentreOrganelle(page);

    expect(again).toBe(isolated);

    // Empty space clears the selection, which is the same path the sheet closes on.
    const box = await page.locator('canvas').boundingBox();

    await page.mouse.move(box!.x + 6, box!.y + 6);
    await page.mouse.down();
    await page.mouse.up();

    await expect(page.locator('[data-spec]')).toHaveCount(0);
    await expect(page.locator(CELL_VIEW)).toHaveAttribute('data-selected', '');
  });
});
