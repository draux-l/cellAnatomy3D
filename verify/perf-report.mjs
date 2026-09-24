import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { PERFORMANCE_BUDGETS } from './budgets.mjs';
import { BUDGETS, auditEntries, collectDistEntries, formatBytes } from './size-audit.mjs';

/**
 * Records the measured performance baseline into `artifacts/perf/report.json`.
 *
 * Design D8 is explicit about what can be gated: draw calls and payload sizes are deterministic
 * and hard-fail CI, while frame timing depends on the machine and is advisory. So this script
 * measures everything, marks each dimension `hard` or `advisory-local`, and lists every miss
 * instead of dropping it.
 *
 * The `ratification` block is **not** written by this script. It is owned by the people
 * reviewing the milestone: a miss produces a miss, and re-ratifying a target is a deliberate,
 * committed act. Rewriting the report preserves any existing ratification text.
 *
 * The catalog is empty while the cell models are reset, so the only render fixture left is the
 * composed cell — and it renders the lighting rig and mechanisms with no cell body until a model is
 * composed in. The measurement harness is unchanged; the numbers will move once a model ships.
 */

const BASE_URL = process.env.CELL_BASE_URL ?? 'http://localhost:4173';
/**
 * The composed animal cell.
 *
 * The per-cell budgets are measured on an assembled cell rather than summed over isolated
 * fixtures, which is what the ≤150 draw-call number was always about.
 */
const CELL_FIXTURE_PATH = '/?fixture=cell&view=animal';
const REPORT_PATH = 'artifacts/perf/report.json';

const WARM_UP_MS = 1500;
const STEADY_STATE_WINDOW_MS = 2000;
const STEADY_STATE_WINDOWS = 3;
const MIN_FRAMES = 30;

const TARGETS = PERFORMANCE_BUDGETS;

function isSoftwareRasteriser(renderer) {
  return /swiftshader|llvmpipe|software/i.test(renderer ?? '');
}

async function measureBrowser() {
  const browser = await chromium.launch({ channel: 'chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

  const problems = [];
  page.on('pageerror', (error) => problems.push(String(error)));

  await page.goto(`${BASE_URL}${CELL_FIXTURE_PATH}`, { waitUntil: 'load' });
  await page.waitForFunction((min) => (window.__cellDebug?.frames ?? 0) >= min, MIN_FRAMES, {
    timeout: 90_000,
  });

  const rasteriser = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));

    if (!gl) {
      return 'none';
    }

    const info = gl.getExtension('WEBGL_debug_renderer_info');

    return info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.VERSION));
  });

  /**
   * Three short steady-state windows on the page that is currently loaded.
   *
   * Several short windows rather than one long one, because frame timing on a shared machine is not
   * stable between runs: recording every window makes the number's own reliability visible instead of
   * hiding a large spread behind a single average.
   */
  const steadyStateWindows = async () => {
    const readings = [];

    for (let index = 0; index < STEADY_STATE_WINDOWS; index += 1) {
      await page.evaluate(() => window.__cellDebug?.reset());
      await page.waitForTimeout(STEADY_STATE_WINDOW_MS);

      const reading = await page.evaluate(() => {
        const stats = window.__cellDebug?.frameStats;

        return stats ? { samples: stats.samples, fpsP50: stats.p50Fps, fpsP95: stats.p95Fps } : null;
      });

      if (reading) {
        readings.push(reading);
      }
    }

    return readings;
  };

  const firstPaint = await page.evaluate(() => window.__cellDebug?.firstRenderAtMs ?? null);

  // Warm up, then measure only the steady state: the first seconds after load include shader
  // compilation and first-paint costs, which would dominate a percentile over one second.
  await page.waitForTimeout(WARM_UP_MS);

  const windows = await steadyStateWindows();

  const cell = await page.evaluate(() => {
    const d = window.__cellDebug;

    return d
      ? {
          drawCalls: d.drawCalls,
          triangles: d.triangles,
          frames: d.frames,
          qualityTier: d.qualityTier,
          fixture: d.fixture,
        }
      : null;
  });

  await browser.close();

  if (!cell) {
    throw new Error('window.__cellDebug was unavailable; cannot record a performance baseline');
  }

  if (windows.length === 0) {
    throw new Error('no steady-state windows were measured');
  }

  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const p50Values = windows.map((window) => window.fpsP50);
  const p95Values = windows.map((window) => window.fpsP95);

  const stability = {
    windows,
    windowMs: STEADY_STATE_WINDOW_MS,
    fpsP50SpreadPct: Number(
      (((Math.max(...p50Values) - Math.min(...p50Values)) / median(p50Values)) * 100).toFixed(1),
    ),
  };

  return {
    rasteriser,
    firstPaint,
    cell: {
      ...cell,
      frameStats: {
        p50Fps: median(p50Values),
        p95Fps: median(p95Values),
        p95Ms: Number((1000 / median(p95Values)).toFixed(2)),
        samples: windows.reduce((total, window) => total + window.samples, 0),
      },
      fpsP50SpreadPct: stability.fpsP50SpreadPct,
    },
    stability,
    problems,
  };
}

function buildBudgetRows({ cell, firstPaint, sizes }) {
  const software = isSoftwareRasteriser(cell.rasteriser);

  return [
    {
      id: 'draw-calls-per-cell',
      target: `<= ${TARGETS.drawCallsPerCell} calls`,
      measured: cell.drawCalls,
      unit: 'calls',
      gate: 'hard',
      status: cell.drawCalls <= TARGETS.drawCallsPerCell ? 'pass' : 'fail',
      source: `window.__cellDebug on ${CELL_FIXTURE_PATH} (renderer.info for the cell scene, 1 Hz)`,
    },
    {
      id: 'triangles-per-cell',
      target: `<= ${TARGETS.trianglesPerCell} triangles`,
      measured: cell.triangles,
      unit: 'triangles',
      gate: 'hard',
      status: cell.triangles <= TARGETS.trianglesPerCell ? 'pass' : 'fail',
      source: `window.__cellDebug on ${CELL_FIXTURE_PATH} (renderer.info for the cell scene, 1 Hz)`,
    },
    {
      id: 'first-3d-paint',
      target: `<= ${TARGETS.first3dPaintMs} ms`,
      measured: firstPaint === null ? null : Math.round(firstPaint),
      unit: 'ms',
      gate: 'advisory-local',
      status: firstPaint === null ? 'unmeasured' : firstPaint <= TARGETS.first3dPaintMs ? 'pass' : 'miss',
      source: 'window.__cellDebug.firstRenderAt',
    },
    {
      id: 'steady-state-fps-p50',
      target: `>= ${TARGETS.steadyStateFps} fps`,
      measured: Number(cell.frameStats.p50Fps.toFixed(1)),
      unit: 'fps',
      gate: 'advisory-local',
      status: software ? 'not-comparable' : cell.frameStats.p50Fps >= TARGETS.steadyStateFps ? 'pass' : 'miss',
      source: `rAF delta ring buffer, ${STEADY_STATE_WINDOW_MS} ms windows`,
    },
    {
      id: 'steady-state-fps-p95',
      target: `>= ${TARGETS.p95Fps} fps`,
      measured: Number(cell.frameStats.p95Fps.toFixed(1)),
      unit: 'fps',
      gate: 'advisory-local',
      status: software ? 'not-comparable' : cell.frameStats.p95Fps >= TARGETS.p95Fps ? 'pass' : 'miss',
      source: `rAF delta ring buffer, ${STEADY_STATE_WINDOW_MS} ms windows`,
    },
    {
      id: 'shell-gzip',
      target: `<= ${formatBytes(BUDGETS.shellGzipBytes)} gzipped`,
      measured: sizes.totals.shellGzipBytes,
      unit: 'bytes',
      gate: 'hard',
      status: sizes.totals.shellGzipBytes <= BUDGETS.shellGzipBytes ? 'pass' : 'fail',
      source: 'verify/size-audit.mjs over dist/',
    },
    {
      id: 'initial-payload-gzip',
      target: `<= ${formatBytes(BUDGETS.initialGzipBytes)} gzipped`,
      measured: sizes.totals.initialGzipBytes,
      unit: 'bytes',
      gate: 'hard',
      status: sizes.totals.initialGzipBytes <= BUDGETS.initialGzipBytes ? 'pass' : 'fail',
      source: 'verify/size-audit.mjs over dist/',
    },
    {
      id: 'single-file-cap',
      target: `<= ${formatBytes(BUDGETS.maxFileBytes)} per file`,
      measured: sizes.totals.largestFile ? sizes.totals.largestFile.rawBytes : 0,
      unit: 'bytes',
      gate: 'hard',
      status: sizes.totals.largestFile && sizes.totals.largestFile.rawBytes > BUDGETS.maxFileBytes ? 'fail' : 'pass',
      source: 'verify/size-audit.mjs over dist/',
    },
  ];
}

function preserveRatification() {
  try {
    const previous = JSON.parse(readFileSync(REPORT_PATH, 'utf8'));

    return previous.ratification ?? { status: 'pending', note: 'No re-ratification recorded yet.' };
  } catch {
    return { status: 'pending', note: 'No re-ratification recorded yet.' };
  }
}

async function main() {
  const entries = collectDistEntries('dist');
  const sizes = auditEntries(entries);
  const { rasteriser, firstPaint, cell, stability, problems } = await measureBrowser();

  const budgets = buildBudgetRows({
    cell: { ...cell, rasteriser },
    firstPaint,
    sizes,
  });
  const misses = budgets
    .filter((row) => row.status === 'fail' || row.status === 'miss')
    .map((row) => `${row.id}: measured ${row.measured}${row.unit === 'fps' ? 'fps' : ''} against ${row.target}`);

  const report = {
    milestone: 'rebuilt base (no cell model)',
    measuredAt: new Date().toISOString(),
    fixture: CELL_FIXTURE_PATH,
    environment: {
      platform: `${process.platform} ${process.arch}`,
      node: process.version,
      browser: 'playwright chromium',
      rasteriser,
      hardwareAccelerated: !isSoftwareRasteriser(rasteriser),
      viewport: '1280x800',
      deviceScaleFactor: 1,
    },
    measurement: {
      warmUpMs: WARM_UP_MS,
      steadyStateWindowMs: STEADY_STATE_WINDOW_MS,
      steadyStateWindows: STEADY_STATE_WINDOWS,
      frameSamples: cell.frameStats.samples,
      framesObserved: cell.frames,
    },
    // The composed cell: the per-cell budgets are measured here, not summed over fixtures.
    cell: {
      fixture: CELL_FIXTURE_PATH,
      cell: 'animal',
      triangles: cell.triangles,
      drawCalls: cell.drawCalls,
      qualityTier: cell.qualityTier,
      fpsP50: Number(cell.frameStats.p50Fps.toFixed(1)),
      fpsP95: Number(cell.frameStats.p95Fps.toFixed(1)),
      frameTimeP95Ms: cell.frameStats.p95Ms,
      fpsP50SpreadPct: cell.fpsP50SpreadPct,
      note: 'The pick hit volumes are not counted: they live on a non-rendered layer and cost no draw calls.',
    },
    sizes: entries.map((entry) => ({
      file: entry.file,
      role: entry.role,
      rawBytes: entry.rawBytes,
      gzipBytes: entry.gzipBytes,
    })),
    budgets,
    misses,
    stability,
    pageErrors: problems,
    ratification: preserveRatification(),
    notes: [
      'Draw calls, payload sizes and file sizes hard-fail CI: they are deterministic.',
      'Frame timing is advisory by design — CI runners share GPUs and jitter — so p50/p95 are recorded here and reviewed locally.',
      'The catalog is empty while the cell models are reset, so the composed cell renders its lighting rig and mechanisms with no cell body. Re-run this report once a model is composed in.',
      'The quality tier is read from the running app rather than inferred. Under a fixture it is pinned to high so a screenshot cannot depend on the host core count; the adaptive path is unit-tested and only runs in the real app.',
    ],
  };

  mkdirSync(join('artifacts', 'perf'), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`perf-report: wrote ${REPORT_PATH}`);
  console.log(`  rasteriser       ${rasteriser}`);
  console.log(`  hardware         ${report.environment.hardwareAccelerated ? 'yes' : 'no (software — fps is not comparable to a laptop target)'}`);
  console.log(`  first 3D paint   ${firstPaint === null ? 'unmeasured' : `${Math.round(firstPaint)} ms`}`);
  console.log(
    `  steady state     p50 ${cell.frameStats.p50Fps.toFixed(1)} fps / p95 ${cell.frameStats.p95Fps.toFixed(1)} fps (median of ${stability.windows.length} x ${STEADY_STATE_WINDOW_MS}ms windows, p50 spread ${stability.fpsP50SpreadPct}%)`,
  );
  console.log(`                    windows: ${stability.windows.map((w) => w.fpsP50.toFixed(1)).join(' / ')} fps p50`);
  console.log(`  quality tier     ${cell.qualityTier} (dpr cap + contact shadows)`);
  console.log(`  cell draw calls  ${cell.drawCalls} (budget ${TARGETS.drawCallsPerCell})`);
  console.log(`  cell triangles   ${cell.triangles} (budget ${TARGETS.trianglesPerCell})`);
  console.log(`  shell gzip       ${formatBytes(sizes.totals.shellGzipBytes)} (budget ${formatBytes(BUDGETS.shellGzipBytes)})`);
  console.log(
    `  initial gzip     ${formatBytes(sizes.totals.initialGzipBytes)} (budget ${formatBytes(BUDGETS.initialGzipBytes)})`,
  );

  if (misses.length > 0) {
    console.log('\nperf-report: misses to re-ratify:');
    for (const miss of misses) {
      console.log(`  - ${miss}`);
    }
  } else {
    console.log('\nperf-report: every measured dimension is inside its target.');
  }
}

await main();
