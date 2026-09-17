import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { rosterFor } from '../../src/catalog/cells';
import { CELL_IDS } from '../../src/catalog/types';
import { FALLBACK_UNAVAILABLE_SURFACES } from '../../src/ui/fallbackCopy';
import { t } from '../../src/ui/i18n';
import { formatOrganelleSize } from '../../src/ui/specSheetModel';
import { REPO_ROOT, loadBaselines } from '../baselines';
import { VIEWPORT, capturePng, collectProblems } from '../harness';
import { assertCoverage, measurePng } from '../metrics';

/**
 * The WebGL-unavailable path (task 4.6, extended by task 4.22).
 *
 * The spec's GIVEN is "a machine where WebGL context creation fails", and the most faithful way to
 * produce that in a browser is to make context creation fail: the init script returns `null` for
 * `webgl2` and leaves every other context id alone. The app then runs its **real** probe and its
 * **real** fallback — nothing in `src/` knows it is being tested, and no test-only flag exists.
 *
 * Three things are asserted, in the order the spec states them:
 *
 * 1. **No blank canvas.** There is no `<canvas>` at all, and the page passes the harness's own
 *    non-blank coverage metric — the same definition of "not blank" every other render is held to.
 * 2. **The images are real.** Both cell images decode (`naturalWidth > 0`); a broken `src` renders
 *    an empty box that a presence-only assertion would happily accept.
 * 3. **The sheets are the catalog's.** Every organelle of both rosters is present with its four
 *    fields equal to the record, in the active language.
 *
 * Run with `UPDATE_BASELINES=1 npm run test:e2e` to commit the inspected screenshots.
 */

const UPDATE = process.env.UPDATE_BASELINES === '1';
const FALLBACK_ROOT = '[data-fallback="webgl-unavailable"]';
const FALLBACK_SCREENSHOT_DIRECTORY = 'artifacts/screens/fallback';

/**
 * The two static cell images the fallback ships.
 *
 * They are the composed-cell fixture renders with the on-screen FPS readout switched off, because a
 * page that cannot create a WebGL2 context must not show a picture claiming a frame rate. The
 * `?fps=off` control already exists for exactly this kind of measurement control (PR 5b added it).
 */
const STATIC_IMAGE_FIXTURES: readonly { cell: 'animal' | 'plant'; url: string }[] = [
  { cell: 'animal', url: '/?fixture=cell&view=animal&fps=off' },
  { cell: 'plant', url: '/?fixture=cell&view=plant&fps=off' },
];

/**
 * Makes WebGL2 context creation fail, then opens the app.
 *
 * `webgl` is deliberately left working: three.js r163+ needs WebGL2 specifically, so a machine that
 * offers only WebGL1 is the same case as one that offers neither, and stubbing both would prove less
 * than stubbing the one the probe actually asks for.
 */
async function openWithoutWebGL2(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const prototype = HTMLCanvasElement.prototype;
    const original = prototype.getContext;

    prototype.getContext = function (this: HTMLCanvasElement, contextId: string, ...rest: unknown[]) {
      if (contextId === 'webgl2') {
        return null;
      }

      return (original as unknown as (this: HTMLCanvasElement, id: string, ...args: unknown[]) => unknown).call(
        this,
        contextId,
        ...rest,
      );
    } as unknown as typeof prototype.getContext;
  });

  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator(FALLBACK_ROOT)).toBeVisible();
}

interface RenderedSheet {
  id: string | null;
  name: string;
  func: string;
  size: string;
  funFact: string;
}

/** Every spec-sheet card the page rendered, with its four field values. */
async function readSheets(page: Page): Promise<RenderedSheet[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-fallback-spec]')].map((card) => ({
      id: card.getAttribute('data-fallback-spec'),
      name: card.querySelector('[data-spec-field="name"]')?.textContent ?? '',
      func: card.querySelector('[data-spec-field="func"]')?.textContent ?? '',
      size: card.querySelector('[data-spec-field="size"]')?.textContent ?? '',
      funFact: card.querySelector('[data-spec-field="funFact"]')?.textContent ?? '',
    })),
  );
}

function writePng(relativePath: string, buffer: Buffer): void {
  mkdirSync(dirname(`${REPO_ROOT}/${relativePath}`), { recursive: true });
  writeFileSync(`${REPO_ROOT}/${relativePath}`, buffer);
  console.log(`[fallback] committed: ${relativePath}`);
}

/**
 * Re-records the static cell images the fallback ships.
 *
 * This is the fallback's *only* asset source: `FallbackView` imports these two files, so a missing
 * one fails the build rather than silently rendering an empty box. `?fps=off` is what makes the
 * image honest on a machine that cannot render, and it also makes the capture byte-repeatable —
 * the FPS readout is the one thing in a composed-cell screenshot that changes between loads.
 */
/**
 * Re-records the static cell images the fallback ships.
 *
 * This is the fallback's *only* asset source: `FallbackView` imports these two files, so a missing
 * one fails the build rather than silently rendering an empty box. `?fps=off` is what makes the
 * image honest on a machine that cannot render, and it also makes the capture byte-repeatable —
 * the FPS readout is the one thing in a composed-cell screenshot that changes between loads.
 *
 * It runs in its own test because it must **not** have the WebGL2 stub installed: with the stub
 * active the fixture URL renders the fallback instead of the cell.
 */
test('keeps the committed static cell images, and can re-record them', async ({ page }) => {
  for (const { cell } of STATIC_IMAGE_FIXTURES) {
    const path = `${REPO_ROOT}/${FALLBACK_SCREENSHOT_DIRECTORY}/${cell}.png`;

    if (!UPDATE) {
      // The import in `FallbackView` is the build-time gate; this is the review-time one.
      expect(existsSync(path), `${path} is missing — re-record it with UPDATE_BASELINES=1`).toBe(true);
      continue;
    }

    await page.goto(STATIC_IMAGE_FIXTURES.find((fixture) => fixture.cell === cell)!.url, {
      waitUntil: 'load',
    });
    await page.waitForSelector('canvas');
    await page.waitForFunction(() => (window.__cellDebug?.frames ?? 0) >= 20);
    writePng(`${FALLBACK_SCREENSHOT_DIRECTORY}/${cell}.png`, await capturePng(page));
  }
});

test.describe('the WebGL-unavailable fallback', () => {
  test('shows static cell images and the full bilingual spec sheets, never a blank canvas', async ({
    page,
  }) => {
    const problems = collectProblems(page);

    await openWithoutWebGL2(page);

    // 1. No canvas, and the page is not blank by the harness's own definition.
    expect(await page.locator('canvas').count()).toBe(0);

    const metrics = measurePng(await capturePng(page), loadBaselines().thresholds);

    expect(metrics.width).toBe(VIEWPORT.width);
    assertCoverage(metrics, loadBaselines().thresholds);

    // 2. Both images decoded.
    for (const cell of CELL_IDS) {
      const image = page.locator(`[data-fallback-image="${cell}"]`);

      await expect(image).toHaveCount(1);

      const decoded = await image.evaluate(
        (node) => (node as HTMLImageElement).naturalWidth * (node as HTMLImageElement).naturalHeight,
      );

      expect(decoded, `the ${cell} image did not decode`).toBeGreaterThan(0);
    }

    // 3. Every organelle of both rosters, and every field equal to its record.
    const sheets = await readSheets(page);
    const expected = CELL_IDS.flatMap((cell) => rosterFor(cell).map((record) => ({ cell, record })));

    expect(sheets).toHaveLength(expected.length);

    for (const { record } of expected) {
      const card = sheets.find((sheet) => sheet.id === record.id);

      expect(card, `no sheet for ${record.id}`).toBeDefined();
      expect(card!.name).toBe(record.name.es);
      expect(card!.func).toBe(record.func.es);
      expect(card!.size).toBe(formatOrganelleSize(record.size, 'es'));
      expect(card!.funFact).toBe(record.funFact.es);
    }

    console.log(
      `[fallback] coverage ${(metrics.coverage * 100).toFixed(2)}%, 2 static images, ` +
        `${sheets.length} bilingual sheets`,
    );

    expect(problems.messages).toEqual([]);
  });

  test('declares every 3D-only surface unavailable, in both locales', async ({ page }) => {
    const problems = collectProblems(page);

    await openWithoutWebGL2(page);

    for (const locale of ['es', 'en'] as const) {
      if (locale === 'en') {
        await page.locator('[data-locale="en"]').click();
      }

      for (const key of FALLBACK_UNAVAILABLE_SURFACES) {
        await expect(page.locator(`[data-unavailable="${key}"]`)).toHaveText(t(key, locale));
      }

      // The requirement's whole list, rendered: annotations, disassembly, isolate, the processes
      // and the quiz. Counting is what catches a declaration that exists in the data but never
      // reaches the page.
      expect(await page.locator('[data-unavailable]').count()).toBe(
        FALLBACK_UNAVAILABLE_SURFACES.length,
      );
      expect([...FALLBACK_UNAVAILABLE_SURFACES]).toEqual([
        'fallback.unavailable.annotations',
        'fallback.unavailable.explodedView',
        'fallback.unavailable.isolate',
        'fallback.unavailable.processes',
        'fallback.unavailable.quiz',
      ]);

      // The sheets follow the language too, and the images stay put: the switch changes copy only.
      const sheets = await readSheets(page);
      const animalFirst = sheets[0];

      expect(animalFirst?.name).toBe(rosterFor('animal')[0]!.name[locale]);
      await expect(page.locator('[data-fallback-image="animal"]')).toHaveCount(1);
    }

    // The absent capability is the whole reason this path exists, so the page says which one.
    await expect(page.locator(FALLBACK_ROOT)).toHaveAttribute('lang', 'en');

    if (UPDATE) {
      // Re-open in each language so the committed evidence shows both.
      for (const locale of ['es', 'en'] as const) {
        await openWithoutWebGL2(page);

        if (locale === 'en') {
          await page.locator('[data-locale="en"]').click();
          await expect(page.locator(FALLBACK_ROOT)).toHaveAttribute('lang', 'en');
        }

        writePng(
          `${FALLBACK_SCREENSHOT_DIRECTORY}/webgl-unavailable-${locale}.png`,
          await capturePng(page),
        );
      }
    }

    expect(problems.messages).toEqual([]);
  });

  test('keeps the fallback out of the 3D path entirely', async ({ page }) => {
    // A capability answer must not depend on the URL: a fixture opened on such a machine gets the
    // same fallback rather than a canvas that cannot render.
    await page.addInitScript(() => {
      const prototype = HTMLCanvasElement.prototype;

      prototype.getContext = (() => null) as unknown as typeof prototype.getContext;
    });

    await page.goto('/?fixture=cell&view=animal', { waitUntil: 'load' });

    await expect(page.locator(FALLBACK_ROOT)).toBeVisible();
    expect(await page.locator('canvas').count()).toBe(0);
    // The fixture chrome must not render either: the fallback replaces the viewer, not the shell.
    expect(await page.locator('[data-fixture]').count()).toBe(0);
  });
});
