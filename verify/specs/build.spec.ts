import { expect, test } from '@playwright/test';
import { collectProblems, fixtureUrl } from '../harness';

/**
 * Build-level runtime checks for the `build-verify` capability.
 *
 * The spec's scenario is "no application backend request is made and every dependency is a
 * static file", so the harness records every request the built bundle makes and fails on any
 * origin that is not its own.
 */

const LOCAL_ORIGINS = ['http://localhost:4173', 'http://127.0.0.1:4173'];

test('contacts no origin other than its own', async ({ page }) => {
  const requested: string[] = [];

  page.on('request', (request) => requested.push(request.url()));

  await page.goto(fixtureUrl('cell', { view: 'animal' }), { waitUntil: 'load' });
  await page.waitForSelector('canvas', { state: 'attached' });

  const external = requested.filter((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      return false;
    }

    return !LOCAL_ORIGINS.some((origin) => url.startsWith(origin));
  });

  expect(requested.length).toBeGreaterThan(0);
  expect(external).toEqual([]);
});

test('starts up with no page errors and no failed requests', async ({ page }) => {
  const problems = collectProblems(page);
  const failed: string[] = [];

  page.on('requestfailed', (request) => failed.push(`${request.url()} ${request.failure()?.errorText ?? ''}`));

  await page.goto(fixtureUrl('cell', { view: 'animal' }), { waitUntil: 'load' });
  await page.waitForSelector('canvas', { state: 'attached' });

  expect(problems.messages).toEqual([]);
  expect(failed).toEqual([]);
});
