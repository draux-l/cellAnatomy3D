import { expect, test, type Page } from '@playwright/test';
import { getRecord } from '../../src/catalog/cells';
import { t } from '../../src/ui/i18n';
import { disassemblyStateKey } from '../../src/ui/hud/disassemblyCopy';
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
 * The **selection is the ground truth**, not the hover: `hoveredId` is a discrete value that a
 * previous gesture can leave set (the plant cell's wall reaches the canvas corner, so "move
 * somewhere empty first" is not available in both views), while `selectedId` is written by this
 * click alone. The hover is still polled first, as the precondition that a pick ran at all.
 */
async function isolateCentreOrganelle(page: Page): Promise<string> {
  const box = await page.locator('canvas').boundingBox();

  if (!box) {
    throw new Error('the canvas has no layout box');
  }

  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;

  await page.mouse.move(centreX, centreY);
  await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-hovered')).not.toBe('');

  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => page.getAttribute(CELL_VIEW, 'data-selected')).not.toBe('');

  return (await page.getAttribute(CELL_VIEW, 'data-selected')) ?? '';
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

/** Every annotation's anchor, keyed by organelle id, in roster order. */
async function readAnchors(page: Page): Promise<Record<string, [number, number]>> {
  const entries = await page.evaluate(() =>
    (window.__cellDebug?.annotations ?? []).map((annotation) => ({
      id: annotation.id,
      anchor: [annotation.anchor[0], annotation.anchor[1]] as [number, number],
    })),
  );
  const anchors: Record<string, [number, number]> = {};

  for (const entry of entries) {
    anchors[entry.id] = entry.anchor;
  }

  return anchors;
}

/**
 * Waits until the annotation anchors stop moving and returns them.
 *
 * The real app tweens the isolate camera, so the first frames after a click are still in motion and
 * a comparison taken then would measure the tween rather than the language switch. The settle
 * condition is **sustained stillness**, not a momentary plateau: the Playwright environment starves
 * the render loop in bursts (measured: `frames+0` for 750 ms, then ~10 frames per 250 ms), so a
 * single quiet window is a fact about frame delivery rather than about the tween.
 */
const STABLE_READINGS_REQUIRED = 5;
const SETTLE_ATTEMPTS = 40;

async function waitForStableAnchors(page: Page): Promise<Record<string, [number, number]>> {
  let previous = await readAnchors(page);
  let stable = 0;

  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt += 1) {
    await page.waitForTimeout(250);

    const current = await readAnchors(page);

    if (Object.keys(current).length > 0 && JSON.stringify(current) === JSON.stringify(previous)) {
      stable += 1;

      if (stable >= STABLE_READINGS_REQUIRED) {
        return current;
      }
    } else {
      stable = 0;
    }

    previous = current;
  }

  throw new Error('the annotation anchors never settled after isolating an organelle');
}

/**
 * The spec's `Language Switch Is Non-Destructive` (task 4.7), on the one surface a unit test cannot
 * reach: the rendered annotation layer.
 *
 * What is asserted and why it is the honest form of each claim:
 *
 * - **The anchors are byte-identical, not merely close.** An anchor is the projection of one world
 *   point through the camera, so identical anchors across the switch mean the camera did not move
 *   and the organelles did not move. That is the framing claim, measured where it is observable —
 *   there is no camera channel on the debug bridge, and a whole-frame comparison would be dominated
 *   by the copy that is *supposed* to change.
 * - **The selection, the view and the disassembly value are unchanged**, and the same `<canvas>`
 *   node is still mounted.
 * - **The copy did change**: the sheet, the HUD's localized state word and the annotation's
 *   primary/secondary lines all follow the new language, and the annotation is the *same node*.
 */
test.describe('the language switch is non-destructive', () => {
  test('keeps the isolate, the view, the disassembly value and every anchor', async ({ page }) => {
    const problems = collectProblems(page);

    await openApp(page);
    await settle(page);

    // A distinctive state: the plant view (a different roster), an isolated organelle, and a hover.
    await page.locator('[data-view="plant"]').click();
    await expect(page.locator(CELL_VIEW)).toHaveAttribute('data-cell', 'plant');
    await settle(page);

    const isolated = await isolateCentreOrganelle(page);
    const record = getRecord(isolated);

    expect(record).toBeDefined();

    const before = await waitForStableAnchors(page);

    expect(Object.keys(before).length).toBeGreaterThan(0);

    await page.evaluate(() => {
      document.querySelector('canvas')?.setAttribute('data-marker', 'kept');
    });

    const annotationNode = page.locator(`[data-annotation="${isolated}"]`);

    await expect(annotationNode.locator('[data-annotation-line="primary"]')).toHaveText(
      record!.name.es,
    );

    await page.locator('[data-locale="en"]').click();

    // The scene and the layer are the same objects, and nothing about the arrangement moved.
    const after = await waitForStableAnchors(page);

    expect(Object.keys(after)).toEqual(Object.keys(before));
    expect(after).toEqual(before);

    await expect(page.locator(CELL_VIEW)).toHaveAttribute('data-selected', isolated);
    await expect(page.locator(CELL_VIEW)).toHaveAttribute('data-cell', 'plant');
    await expect(page.locator(CELL_VIEW)).toHaveAttribute('data-disassembly', '0');
    expect(await page.locator('canvas[data-marker="kept"]').count()).toBe(1);

    // The copy is what changed, and it changed in place: the bilingual order swaps, the sheet
    // follows, and the imperative HUD text (written by the frame loop, not by React) is relocalized.
    await expect(annotationNode.locator('[data-annotation-line="primary"]')).toHaveText(
      record!.name.en,
    );
    await expect(annotationNode.locator('[data-annotation-line="secondary"]')).toHaveText(
      record!.name.es,
    );
    await expect(page.locator(`[data-spec="${isolated}"] [data-spec-field="name"]`)).toHaveText(
      record!.name.en,
    );
    await expect(page.locator('.view-control__state')).toHaveText(
      t(disassemblyStateKey(0), 'en'),
    );

    console.log(
      `[i18n] ${isolated} stayed isolated on the plant view across the switch; ` +
        `${Object.keys(before).length} anchors identical`,
    );

    // And back: the switch is symmetric, and the anchors are still the same projections.
    await page.locator('[data-locale="es"]').click();

    expect(await waitForStableAnchors(page)).toEqual(before);
    await expect(annotationNode.locator('[data-annotation-line="primary"]')).toHaveText(
      record!.name.es,
    );
    await expect(page.locator('.view-control__state')).toHaveText(
      t(disassemblyStateKey(0), 'es'),
    );

    expect(problems.messages).toEqual([]);
  });
});
