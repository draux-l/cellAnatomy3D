import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { collectProblems } from '../harness';

/**
 * The payload-budget contract, checked against the built bundle the browser actually loads
 * (task 2.6 / design D18, spec: `Payload Budget`).
 *
 * The scenario is "the shell becomes visible before the 3D module blocks the first paint". A
 * size assertion alone cannot prove that, so this test delays every JS request that is *not*
 * referenced by `dist/index.html` and asserts what the user sees while the 3D chunk is still in
 * flight: the real landing copy, and no canvas.
 *
 * Reading the entry list out of the built `index.html` keeps the test independent of chunk
 * names — the same reason `size-audit.mjs` reads the HTML rather than guessing.
 */

const DIST_DIRECTORY = join(process.cwd(), 'dist');
const LAZY_CHUNK_DELAY_MS = 3000;

/** The scripts the HTML itself references: the entry graph, i.e. what must paint first. */
function entryScriptPaths(): string[] {
  const html = readFileSync(join(DIST_DIRECTORY, 'index.html'), 'utf8');

  return [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((match) => match[1]!.replace(/^\//, ''));
}

test('paints the shell before the 3D chunk loads', async ({ page }) => {
  const entryScripts = entryScriptPaths();

  expect(entryScripts.length, 'dist/index.html must reference at least one entry script').toBeGreaterThan(0);

  const problems = collectProblems(page);
  const delayed: string[] = [];

  await page.route('**/*.js', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, '');

    if (entryScripts.includes(path)) {
      await route.continue();
      return;
    }

    delayed.push(path);
    await new Promise((resolve) => setTimeout(resolve, LAZY_CHUNK_DELAY_MS));
    await route.continue();
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const title = page.locator('h1.app__title');

  // The shell has painted: real copy, the selector, and the measurement bridge — all of which
  // live in the entry chunk.
  await expect(title).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => delayed.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(await page.locator('canvas').count()).toBe(0);
  expect(await page.evaluate(() => typeof window.__cellDebug)).toBe('object');

  // Then the lazy chunk arrives and the 3D module mounts.
  await expect(page.locator('canvas')).toHaveCount(1, { timeout: 60_000 });
  expect(problems.messages).toEqual([]);
});

test('lands in Spanish and switches language without reloading', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const title = page.locator('h1.app__title');

  // The spec's default language is Spanish, and its copy comes from the message table — the
  // shell renders it before the 3D chunk exists.
  await expect(title).toHaveText(/Explorador de anatomía celular 3D/i);

  const selector = page.locator('.lang__option');
  await expect(selector).toHaveCount(2);
  await expect(page.locator('[data-locale="es"]')).toHaveAttribute('aria-pressed', 'true');

  // Tag the canvas so "the switch changed nothing else" is a fact about the same DOM node
  // rather than a claim: a reload or a remount would lose the marker.
  await expect(page.locator('canvas')).toHaveCount(1, { timeout: 60_000 });
  await page.evaluate(() => {
    document.querySelector('canvas')?.setAttribute('data-marker', 'kept');
  });

  await page.locator('[data-locale="en"]').click();
  await expect(title).toHaveText(/3D Cell Anatomy Explorer/i);
  await expect(page.locator('[data-locale="en"]')).toHaveAttribute('aria-pressed', 'true');

  // The switch is non-destructive: the same canvas is still mounted (spec: Language Switch Is
  // Non-Destructive). The other preserved values arrive with their own milestones.
  expect(await page.locator('canvas[data-marker="kept"]').count()).toBe(1);
});
