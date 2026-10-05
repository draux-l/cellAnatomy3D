import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-level gates for the HUD readout (task 4.20, spec `On-Screen FPS Readout`).
 *
 * The spec's hardest clauses are structural, not behavioural: "sourced from the same rAF frame
 * sampler the verification harness reads", "SHALL NOT drive it through React state", and "SHALL
 * NOT be hidden, clamped upward, or replaced". A browser test can only observe the behaviour those
 * clauses forbid; these assertions read the code that would have to exist for them to be violated.
 *
 * Text-level checks are a blunt instrument, so each one is written against a *fact* rather than a
 * style: there is one assignment of `p50Fps` in `src/`, the readout builds no React state, and no
 * threshold appears near it.
 */

const ROOT = process.cwd();
const READOUT = join(ROOT, 'src/ui/hud/FpsReadout.tsx');
const DEBUG = join(ROOT, 'src/app/debug.ts');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

/**
 * The file with its comments removed.
 *
 * These gates are about what the code does, and a doc comment explaining *why* a thing is absent
 * must not read as the thing being present — the layer's comments mention `createRoot` precisely
 * to say it does not use one.
 */
function code(path: string): string {
  return source(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

/** Every non-test TypeScript file under `src/`, as repository-relative paths. */
function sourceFiles(directory = join(ROOT, 'src')): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }

    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) {
      continue;
    }

    found.push(relative(ROOT, path).replace(/\\/g, '/'));
  }

  return found;
}

describe('the FPS readout reads the one sampler', () => {
  it('assigns p50Fps in exactly one source file', () => {
    const writers = sourceFiles().filter((file) => /^\s*p50Fps:/m.test(code(join(ROOT, file))));

    // `debug.ts` owns the ring buffer and writes the field; nothing else may compute it, or the
    // readout and the harness could disagree about the same frame.
    expect(writers).toEqual(['src/app/debug.ts']);
  });

  it('is the only reader of p50Fps outside the debug bridge', () => {
    const readers = sourceFiles().filter((file) => code(join(ROOT, file)).includes('p50Fps'));

    // `fpsCadence.ts` used to name the field in its parameter; it now formats whichever figure it is
    // handed, so what reads the sampler is the sampler and its one reader.
    expect(readers.sort()).toEqual(['src/app/debug.ts', 'src/ui/hud/FpsReadout.tsx']);
  });

  it('shows the worst of the window beside the median, so a hitch is visible', () => {
    const text = code(READOUT);

    // The median is deliberately insensitive to a short hitch, which is exactly why it looked like a
    // lie: a 200 ms frame among six hundred barely moves it. The p95 comes from the same ring buffer
    // and is the figure that answers "did it just stutter".
    expect(text).toContain('cellDebug.frameStats.p95Fps');
    expect(text.match(/data-role="fps-worst"/g)).toHaveLength(1);
  });

  it('reads the value on an interval instead of sampling it again', () => {
    const text = code(READOUT);

    expect(text.match(/setInterval\(/g)).toHaveLength(1);
    expect(text).toContain('FPS_READOUT_INTERVAL_MS');
    expect(text).toContain('cellDebug.frameStats.p50Fps');
    // No second rolling window: the readout must not keep its own samples.
    expect(text).not.toMatch(/\.push\(|percentile\(|frameDeltas|sampleFps/);
  });

  it('holds no React state and does no per-frame work', () => {
    const text = code(READOUT);

    expect(text).not.toContain('useState');
    expect(text).not.toContain('useFrame');
    expect(text).not.toContain('useSyncExternalStore');
  });

  it('cannot clamp, hide or substitute the value', () => {
    const text = code(READOUT);
    const body = text.slice(text.indexOf('export function formatFps'));

    // No threshold arithmetic anywhere: the ≥60 target is not a variable this file knows about.
    expect(body).not.toMatch(/Math\.(min|max)\b/);
    expect(body).not.toMatch(/\b60\b/);
    expect(body).not.toContain("'--'");
    expect(body).not.toContain('hidden');
  });

  it('holds the ratified cadence, declared once', () => {
    const text = code(READOUT);
    const cadence = code(join(ROOT, 'src/ui/hud/fpsCadence.ts'));

    expect(cadence).toContain('export const FPS_READOUT_INTERVAL_MS = 500');
    // The component imports it rather than restating a millisecond value of its own.
    expect(text).toContain("from './fpsCadence'");
    expect(text).not.toMatch(/setInterval\([^)]*,\s*\d/);
  });
});

describe('the debug bridge owns the render count', () => {
  it('increments sceneRenders only inside the render wrapper', () => {
    const text = code(DEBUG);

    expect(text.match(/sceneRenders \+= 1/g)).toHaveLength(1);
    expect(text).toContain('recordSceneRender');
    // The increment must be guarded by both the main scene and a presented frame.
    expect(text).toContain('scene === mainScene && presented');
    expect(text).toContain('getRenderTarget?.() ?? null) === null');
  });
});
