import { describe, expect, it } from 'vitest';
import { bandProgress, clamp01, mix, smoothstep, wrap01 } from './curve';

/**
 * The maths the two nutrition animations are built from (tasks 5.2/5.3).
 *
 * All four functions are pure and both animations depend on them being *exactly* what their names
 * say: a `wrap01` that returned 1 would put a molecule into the next cycle's first band for one
 * frame, and a `smoothstep` with reversed edges is undefined in GLSL — which is why the shader code
 * never expresses one.
 */

describe('clamp01', () => {
  it('clamps, and treats a non-number as zero', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.25)).toBeCloseTo(0.25);
    expect(clamp01(4)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('wrap01', () => {
  it('never returns 1, so a phase always lands inside its cycle', () => {
    for (const value of [0, 0.5, 0.999999, 1, 1.5, 3, 7.25]) {
      const wrapped = wrap01(value);

      expect(wrapped).toBeGreaterThanOrEqual(0);
      expect(wrapped).toBeLessThan(1);
    }

    expect(wrap01(1)).toBe(0);
    expect(wrap01(1.25)).toBeCloseTo(0.25);
    expect(wrap01(7.25)).toBeCloseTo(0.25);
  });

  it('wraps negatives forward rather than leaving the cycle', () => {
    expect(wrap01(-0.25)).toBeCloseTo(0.75);
    expect(wrap01(-1.25)).toBeCloseTo(0.75);
    expect(wrap01(Number.NaN)).toBe(0);
  });
});

describe('smoothstep', () => {
  it('is 0 at the first edge, 1 at the second, and monotonic between them', () => {
    expect(smoothstep(0.2, 0.8, 0.2)).toBe(0);
    expect(smoothstep(0.2, 0.8, 0.8)).toBe(1);
    expect(smoothstep(0.2, 0.8, 0.1)).toBe(0);
    expect(smoothstep(0.2, 0.8, 0.9)).toBe(1);

    let previous = -1;

    for (let step = 0; step <= 20; step += 1) {
      const value = smoothstep(0.2, 0.8, 0.2 + (step / 20) * 0.6);

      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('degenerates to a step rather than dividing by zero', () => {
    expect(smoothstep(0.5, 0.5, 0.4)).toBe(0);
    expect(smoothstep(0.5, 0.5, 0.5)).toBe(1);
    expect(smoothstep(0.5, 0.5, 0.6)).toBe(1);
  });
});

describe('bandProgress', () => {
  it('maps a value across its band and clamps outside it', () => {
    expect(bandProgress(0.25, 0.75, 0.5)).toBeCloseTo(0.5);
    expect(bandProgress(0.25, 0.75, 0.25)).toBe(0);
    expect(bandProgress(0.25, 0.75, 0.75)).toBe(1);
    expect(bandProgress(0.25, 0.75, 0.1)).toBe(0);
    expect(bandProgress(0.25, 0.75, 0.9)).toBe(1);
  });

  it('treats an empty band as zero rather than as a division by zero', () => {
    expect(bandProgress(0.5, 0.5, 0.5)).toBe(0);
    expect(bandProgress(0.7, 0.2, 0.5)).toBe(0);
  });
});

describe('mix', () => {
  it('interpolates both ways', () => {
    expect(mix(2, 4, 0)).toBe(2);
    expect(mix(2, 4, 1)).toBe(4);
    expect(mix(2, 4, 0.5)).toBe(3);
  });
});
