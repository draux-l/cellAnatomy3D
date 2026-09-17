import { chromium } from '@playwright/test';

/**
 * Reproducible frame-timing probe.
 *
 * `perf-report.mjs` records the milestone baseline: one page load, three 2 s windows, the median
 * of the three. That is enough to write a report and not enough to *compare* two builds: a single
 * load inherits whatever the machine was doing for the previous minute, and the M0 record already
 * contains the evidence — three back-to-back windows in one run disagreed by 61%, and separate
 * runs on an identical build ranged from 7.7 to 37.9 fps p50.
 *
 * This probe exists for the remediation slice, where the question is "did this change help?" and
 * a number that cannot be reproduced is not an answer. It differs from `perf-report.mjs` in three
 * ways that matter for comparison:
 *
 * 1. **Several independent runs, not several windows in one run.** Each run is a fresh page load,
 *    so a slow first run cannot contaminate the second.
 * 2. **It reports the spread**, not a single median. If the run-to-run spread is wider than the
 *    change being measured, the probe says so instead of implying a difference.
 * 3. **It can sweep viewports.** A resolution sweep is the cheapest way to tell a fill-rate bound
 *    renderer from a scene-graph bound one, and it needs no code change at all.
 *
 * Usage:
 *   node verify/perf-probe.mjs --url "/?fixture=cell&view=animal" --runs 5 --label baseline
 *   node verify/perf-probe.mjs --url "/?fixture=cell&view=plant" --viewport 1280x800
 *   node verify/perf-probe.mjs --url "/?fixture=cell&view=animal" --viewport 640x400
 *
 * The app must already be served (for example `npm run preview -- --port 4173`).
 */

const WARM_UP_MS = 1500;
const STEADY_STATE_WINDOW_MS = 2000;
const STEADY_STATE_WINDOWS = 3;
const MIN_FRAMES = 30;

function parseArgs(argv) {
  const args = {
    url: '/?fixture=cell&view=animal',
    runs: 5,
    viewport: '1280x800',
    dsf: 1,
    label: 'probe',
    out: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === '--url') args.url = value;
    else if (key === '--runs') args.runs = Number(value);
    else if (key === '--viewport') args.viewport = value;
    else if (key === '--dsf') args.dsf = Number(value);
    else if (key === '--label') args.label = value;
    else if (key === '--out') args.out = value;
  }

  return args;
}

function parseViewport(spec) {
  const [width, height] = spec.split('x').map(Number);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`--viewport must be WxH, received "${spec}"`);
  }

  return { width, height };
}

function median(values) {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

const BASE_URL = process.env.CELL_BASE_URL ?? 'http://localhost:4173';

async function measureRun(browser, { url, viewport, dsf }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dsf });
  const errors = [];

  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto(`${BASE_URL}${url}`, { waitUntil: 'load' });
  await page.waitForFunction((min) => (window.__cellDebug?.frames ?? 0) >= min, MIN_FRAMES, {
    timeout: 90_000,
  });

  await page.waitForTimeout(WARM_UP_MS);

  const windows = [];

  for (let index = 0; index < STEADY_STATE_WINDOWS; index += 1) {
    await page.evaluate(() => window.__cellDebug?.reset());
    await page.waitForTimeout(STEADY_STATE_WINDOW_MS);

    const reading = await page.evaluate(() => {
      const stats = window.__cellDebug?.frameStats;

      return stats ? { samples: stats.samples, fpsP50: stats.p50Fps, fpsP95: stats.p95Fps } : null;
    });

    if (reading) {
      windows.push(reading);
    }
  }

  const scene = await page.evaluate(() => {
    const debug = window.__cellDebug;

    return debug
      ? {
          drawCalls: debug.drawCalls,
          triangles: debug.triangles,
          qualityTier: debug.qualityTier,
          frozen: debug.frozen,
        }
      : null;
  });

  await page.close();

  const p50Values = windows.map((window) => window.fpsP50);
  const p95Values = windows.map((window) => window.fpsP95);

  return {
    windows,
    p50: median(p50Values),
    p95: median(p95Values),
    scene,
    errors,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const viewport = parseViewport(args.viewport);
  const browser = await chromium.launch({ channel: 'chromium' });
  const runs = [];

  try {
    for (let index = 0; index < args.runs; index += 1) {
      runs.push(await measureRun(browser, { url: args.url, viewport, dsf: args.dsf }));
    }
  } finally {
    await browser.close();
  }

  const p50Values = runs.map((run) => run.p50);
  const p95Values = runs.map((run) => run.p95);
  const med = median(p50Values);
  const spread = med > 0 ? ((Math.max(...p50Values) - Math.min(...p50Values)) / med) * 100 : 0;
  const scene = runs.at(-1)?.scene ?? null;

  const summary = {
    label: args.label,
    url: args.url,
    viewport: args.viewport,
    deviceScaleFactor: args.dsf,
    runs: runs.length,
    fpsP50: {
      perRun: p50Values.map((value) => Number(value.toFixed(1))),
      median: Number(med.toFixed(1)),
      min: Number(Math.min(...p50Values).toFixed(1)),
      max: Number(Math.max(...p50Values).toFixed(1)),
      spreadPct: Number(spread.toFixed(1)),
    },
    fpsP95: {
      perRun: p95Values.map((value) => Number(value.toFixed(1))),
      median: Number(median(p95Values).toFixed(1)),
    },
    scene,
    pageErrors: runs.flatMap((run) => run.errors),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (args.out) {
    const { appendFileSync } = await import('node:fs');

    appendFileSync(args.out, `${JSON.stringify(summary)}\n`, 'utf8');
  }

  // A spread wider than a quarter of the median means the probe cannot resolve a small change.
  if (summary.fpsP50.spreadPct > 25) {
    console.log(
      `\nWARNING: p50 spread is ${summary.fpsP50.spreadPct}% of the median — this probe cannot resolve a change smaller than that.`,
    );
  }
}

await main();
