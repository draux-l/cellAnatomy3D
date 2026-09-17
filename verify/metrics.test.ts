import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  assertAreaWithinBand,
  assertCoverage,
  assertRegionColor,
  colorDistance,
  describeMetrics,
  hexToRgb,
  hueDistance,
  luminanceDeltaPct,
  measurePng,
  relativeLuminance,
  rgbToHex,
  rgbToHue,
  type Rgb,
} from './metrics';

const BACKGROUND: Rgb = { r: 7, g: 9, b: 12 };

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  color: Rgb;
}

function renderPng(width: number, height: number, rects: Rect[] = [], strayPixels: Array<[number, number]> = []): Buffer {
  const png = new PNG({ width, height });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      png.data[index] = BACKGROUND.r;
      png.data[index + 1] = BACKGROUND.g;
      png.data[index + 2] = BACKGROUND.b;
      png.data[index + 3] = 255;
    }
  }

  const paint = (x: number, y: number, color: Rgb) => {
    const index = (y * width + x) * 4;
    png.data[index] = color.r;
    png.data[index + 1] = color.g;
    png.data[index + 2] = color.b;
    png.data[index + 3] = 255;
  };

  for (const rect of rects) {
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        paint(x, y, rect.color);
      }
    }
  }

  for (const [x, y] of strayPixels) {
    paint(x, y, { r: 255, g: 255, b: 255 });
  }

  return PNG.sync.write(png);
}

describe('colour maths', () => {
  it('converts hex to rgb and back', () => {
    expect(hexToRgb('#b4694a')).toEqual({ r: 180, g: 105, b: 74 });
    expect(rgbToHex({ r: 180, g: 105, b: 74 })).toBe('#b4694a');
    expect(rgbToHex({ r: 300, g: -5, b: 12.6 })).toBe('#ff000d');
  });

  it('rejects a malformed hex colour', () => {
    expect(() => hexToRgb('#fff')).toThrow(/6-digit hex/);
  });

  it('sums per-channel distance', () => {
    expect(colorDistance({ r: 0, g: 0, b: 0 }, { r: 10, g: 20, b: 30 })).toBe(60);
  });

  it('computes WCAG relative luminance at the extremes', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 6);
  });

  it('computes hue and wraps the distance around the wheel', () => {
    expect(rgbToHue({ r: 255, g: 0, b: 0 })).toBeCloseTo(0);
    expect(rgbToHue({ r: 0, g: 255, b: 0 })).toBeCloseTo(120);
    expect(rgbToHue({ r: 0, g: 0, b: 255 })).toBeCloseTo(240);
    expect(rgbToHue({ r: 128, g: 128, b: 128 })).toBe(0);

    expect(hueDistance(350, 10)).toBeCloseTo(20);
    expect(hueDistance(10, 350)).toBeCloseTo(20);
    expect(hueDistance(0, 90)).toBeCloseTo(90);
  });

  it('reports relative-luminance drift as a percentage', () => {
    const base: Rgb = { r: 100, g: 100, b: 100 };
    expect(luminanceDeltaPct(base, base)).toBeCloseTo(0);
    expect(luminanceDeltaPct({ r: 200, g: 200, b: 200 }, base)).toBeGreaterThan(20);
    expect(luminanceDeltaPct({ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 })).toBe(0);
  });
});

describe('measurePng', () => {
  it('reports an empty canvas as zero coverage with no subject', () => {
    const metrics = measurePng(renderPng(320, 200));

    expect(metrics.width).toBe(320);
    expect(metrics.height).toBe(200);
    expect(metrics.background).toEqual(BACKGROUND);
    expect(metrics.coverage).toBe(0);
    expect(metrics.occupiedAreaPx).toBe(0);
    expect(metrics.regionColor).toEqual(BACKGROUND);
  });

  it('measures a single subject rectangle', () => {
    const metrics = measurePng(
      renderPng(200, 200, [{ x: 50, y: 50, width: 100, height: 100, color: { r: 180, g: 105, b: 74 } }]),
    );

    expect(metrics.coverage).toBeCloseTo(0.25, 6);
    expect(metrics.occupiedAreaPx).toBe(10_000);
    expect(rgbToHex(metrics.regionColor)).toBe('#b4694a');
  });

  it('counts only the largest region as the subject', () => {
    const metrics = measurePng(
      renderPng(200, 200, [
        { x: 10, y: 10, width: 20, height: 20, color: { r: 200, g: 60, b: 60 } },
        { x: 100, y: 100, width: 40, height: 40, color: { r: 60, g: 200, b: 60 } },
      ]),
    );

    expect(metrics.occupiedAreaPx).toBe(1600);
    expect(rgbToHex(metrics.regionColor)).toBe('#3cc83c');
    // Coverage still counts every non-background pixel.
    expect(metrics.coverage).toBeCloseTo((400 + 1600) / 40_000, 6);
  });

  it('is not fooled by scattered stray pixels', () => {
    const metrics = measurePng(
      renderPng(
        100,
        100,
        [{ x: 40, y: 40, width: 10, height: 10, color: { r: 200, g: 60, b: 60 } }],
        Array.from({ length: 40 }, (_, i) => [i * 2, 90] as [number, number]),
      ),
    );

    expect(metrics.occupiedAreaPx).toBe(100);
    expect(metrics.coverage).toBeGreaterThan(100 / 10_000);
  });

  it('still finds the background when the subject covers the corner', () => {
    const metrics = measurePng(
      renderPng(100, 100, [{ x: 0, y: 0, width: 100, height: 40, color: { r: 180, g: 105, b: 74 } }]),
    );

    expect(metrics.background).toEqual(BACKGROUND);
    expect(metrics.occupiedAreaPx).toBe(4000);
    expect(rgbToHex(metrics.regionColor)).toBe('#b4694a');
  });
});

describe('assertions', () => {
  it('fails coverage for a blank render, naming the metric', () => {
    const blank = measurePng(renderPng(200, 200));

    expect(() => assertCoverage(blank)).toThrow(/coverage/i);
    expect(() => assertCoverage(blank)).toThrow(/rendered nothing/);
  });

  it('passes coverage for a visible subject', () => {
    const visible = measurePng(
      renderPng(200, 200, [{ x: 40, y: 40, width: 60, height: 60, color: { r: 180, g: 105, b: 74 } }]),
    );

    expect(() => assertCoverage(visible)).not.toThrow();
  });

  it('enforces the ±25% area band', () => {
    const metrics = measurePng(
      renderPng(200, 200, [{ x: 0, y: 0, width: 10, height: 10, color: { r: 180, g: 105, b: 74 } }]),
    );

    expect(() => assertAreaWithinBand(metrics, 100)).not.toThrow();
    expect(() => assertAreaWithinBand(metrics, 80)).not.toThrow();
    expect(() => assertAreaWithinBand(metrics, 70)).toThrow(/outside the ±25% band/);
  });

  it('enforces the hue and luminance tolerances on the region colour', () => {
    const metrics = measurePng(
      renderPng(200, 200, [{ x: 0, y: 0, width: 20, height: 20, color: { r: 180, g: 105, b: 74 } }]),
    );

    expect(() => assertRegionColor(metrics, { r: 180, g: 105, b: 74 })).not.toThrow();
    // Same hue, much darker: inside the hue tolerance of a hue-preserving tone mapper, but the
    // luminance band is what catches it.
    expect(() => assertRegionColor(metrics, { r: 90, g: 52, b: 37 })).toThrow(/luminance/);
    // A hue rotation beyond 5° is reported as a tone-mapping defect.
    expect(() => assertRegionColor(metrics, { r: 190, g: 74, b: 105 })).toThrow(/tone-mapping defect/);
  });

  it('documents the thresholds it uses', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({
      backgroundDistance: 24,
      coverageMin: 0.01,
      areaBandPct: 25,
      hueToleranceDeg: 5,
      luminanceTolerancePct: 20,
    });
  });
});

describe('describeMetrics', () => {
  it('summarises a measurement in one line', () => {
    const metrics = measurePng(renderPng(100, 100));
    const summary = describeMetrics(metrics);

    expect(summary).toContain('100x100');
    expect(summary).toContain('coverage 0.00%');
  });
});
