import { beforeEach, describe, expect, it } from 'vitest';
import {
  createCellDebug,
  computePercentile,
  installCellDebug,
  msToFps,
  type CellDebug,
} from './debug';
import { processClock } from './clock';

describe('computePercentile', () => {
  it('returns zero for an empty sample set', () => {
    expect(computePercentile([], 50)).toBe(0);
    expect(computePercentile([], 95)).toBe(0);
  });

  it('interpolates between neighbours', () => {
    const values = [10, 20, 30, 40];

    expect(computePercentile(values, 50)).toBeCloseTo(25);
    expect(computePercentile(values, 95)).toBeCloseTo(38.5);
    expect(computePercentile(values, 100)).toBe(40);
  });

  it('does not mutate the caller array', () => {
    const values = [3, 1, 2];
    computePercentile(values, 50);

    expect(values).toEqual([3, 1, 2]);
  });
});

describe('msToFps', () => {
  it('converts a frame delta to frames per second', () => {
    expect(msToFps(16.6667)).toBeCloseTo(60, 2);
    expect(msToFps(0)).toBe(0);
  });
});

describe('createCellDebug', () => {
  let debug: CellDebug;

  beforeEach(() => {
    debug = createCellDebug({ fixture: 'organelle', capacity: 4 });
    processClock.reset();
  });

  it('records the fixture name it was created for', () => {
    expect(debug.fixture).toBe('organelle');
    expect(createCellDebug().fixture).toBeNull();
  });

  it('captures the first render time once and never overwrites it', () => {
    debug.recordFrame(16, 820);
    debug.recordFrame(16, 900);

    expect(debug.firstRenderAtMs).toBe(820);
    expect(debug.frames).toBe(2);
  });

  it('keeps a bounded ring buffer of frame deltas', () => {
    for (const delta of [10, 20, 30, 40, 50]) {
      debug.recordFrame(delta, 0);
    }

    expect(debug.frameStats.samples).toBe(4);
    expect(debug.frameStats.lastMs).toBe(50);
    expect(debug.frameStats.p50Ms).toBeCloseTo(35);
  });

  it('derives p50 and p95 frames per second', () => {
    for (let i = 0; i < 100; i += 1) {
      debug.recordFrame(16, 0);
    }
    debug.recordFrame(1000 / 30, 0);

    expect(debug.frameStats.p50Fps).toBeCloseTo(62.5);
    expect(debug.frameStats.p95Fps).toBeLessThan(debug.frameStats.p50Fps);
  });

  it('throttles draw-call sampling to once per second', () => {
    expect(debug.sampleRenderer(48, 6100, 0)).toBe(true);
    expect(debug.sampleRenderer(50, 6100, 400)).toBe(false);
    expect(debug.sampleRenderer(52, 6200, 999)).toBe(false);
    expect(debug.sampleRenderer(53, 6200, 1000)).toBe(true);

    expect(debug.drawCalls).toBe(53);
    expect(debug.triangles).toBe(6200);
    expect(debug.drawCallSampleTimesMs).toEqual([0, 1000]);
  });

  it('mirrors the transient clock without owning it', () => {
    processClock.freezeAt(3.5);
    debug.recordFrame(16, 10);

    expect(debug.frozen).toBe(true);
    expect(debug.clock.elapsed).toBe(3.5);
  });

  it('clears every measurement on reset', () => {
    debug.recordFrame(16, 500);
    debug.sampleRenderer(60, 9000, 0);
    debug.reset();

    expect(debug.frames).toBe(0);
    expect(debug.firstRenderAtMs).toBeNull();
    expect(debug.drawCalls).toBe(0);
    expect(debug.triangles).toBe(0);
    expect(debug.frameStats).toEqual({
      samples: 0,
      lastMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p50Fps: 0,
      p95Fps: 0,
    });
  });
});

describe('installCellDebug', () => {
  it('exposes the debug object on the given target', () => {
    const debug = createCellDebug();
    const target: { __cellDebug?: CellDebug } = {};

    installCellDebug(debug, target);

    expect(target.__cellDebug).toBe(debug);
  });
});
