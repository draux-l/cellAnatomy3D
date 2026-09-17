import { PNG } from 'pngjs';

/**
 * Metric maths for the screenshot harness.
 *
 * The design's rule is metric assertions, never pixel diffs: animated WebGL makes image
 * equality fragile across machines and rasterisers. So a screenshot is reduced to three
 * numbers, each answering a different question:
 *
 * - `coverage`      did anything render at all? (the blank-render gate)
 * - `occupiedAreaPx` how big is the subject? (the regression band, ±25% of the baseline)
 * - `regionColor`   is it the colour the palette says? (hue ≤5°, luminance ±20%)
 *
 * Everything here is a pure function over a PNG buffer, so it is unit-testable without a browser.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface MetricsThresholds {
  /** Summed per-channel distance from the background colour before a pixel counts as subject. */
  backgroundDistance: number;
  /** Non-background fraction below which the canvas is considered blank. */
  coverageMin: number;
  /** Allowed drift of the subject's pixel area, as a percentage of the baseline. */
  areaBandPct: number;
  /** Allowed hue rotation of the subject region, in degrees. */
  hueToleranceDeg: number;
  /** Allowed relative-luminance drift of the subject region, as a percentage. */
  luminanceTolerancePct: number;
}

export const DEFAULT_THRESHOLDS: MetricsThresholds = {
  backgroundDistance: 24,
  coverageMin: 0.01,
  areaBandPct: 25,
  hueToleranceDeg: 5,
  luminanceTolerancePct: 20,
};

export interface ScreenshotMetrics {
  width: number;
  height: number;
  /**
   * Background reference colour: the per-channel median of the frame's border ring.
   *
   * A single corner pixel is not safe — a subject that reaches the corner would redefine the
   * background as the subject, inverting every metric downstream.
   */
  background: Rgb;
  /** Non-background pixels over the whole canvas, as a fraction of it. */
  coverage: number;
  /** Pixels of the largest connected subject region — the organelle itself. */
  occupiedAreaPx: number;
  /** Mean colour of that region. */
  regionColor: Rgb;
  /** Mean WCAG relative luminance of the whole canvas, for context in the report. */
  meanLuminance: number;
}

export function readPng(buffer: Buffer): PNG {
  return PNG.sync.read(buffer);
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
    : (sorted[middle] ?? 0);
}

/** Per-channel median of the frame's border ring, used as the background reference. */
export function sampleBackground(png: PNG, thickness = 2): Rgb {
  const { width, height, data } = png;
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];

  const collect = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    reds.push(data[index] ?? 0);
    greens.push(data[index + 1] ?? 0);
    blues.push(data[index + 2] ?? 0);
  };

  const band = Math.max(1, Math.min(thickness, Math.floor(Math.min(width, height) / 2)));

  for (let offset = 0; offset < band; offset += 1) {
    for (let x = 0; x < width; x += 1) {
      collect(x, offset);
      collect(x, height - 1 - offset);
    }

    for (let y = 0; y < height; y += 1) {
      collect(offset, y);
      collect(width - 1 - offset, y);
    }
  }

  return { r: median(reds), g: median(greens), b: median(blues) };
}

export function colorDistance(a: Rgb, b: Rgb): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

export function hexToRgb(hex: string): Rgb {
  const normalised = hex.replace('#', '');

  if (!/^[0-9a-f]{6}$/i.test(normalised)) {
    throw new Error(`Expected a 6-digit hex colour, received "${hex}"`);
  }

  return {
    r: Number.parseInt(normalised.slice(0, 2), 16),
    g: Number.parseInt(normalised.slice(2, 4), 16),
    b: Number.parseInt(normalised.slice(4, 6), 16),
  };
}

export function rgbToHex(color: Rgb): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');

  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(color: Rgb): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}

/** Hue angle in degrees, 0..360. Returns 0 for greys, which have no hue. */
export function rgbToHue(color: Rgb): number {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta === 0) {
    return 0;
  }

  let hue: number;

  if (max === r) {
    hue = ((g - b) / delta) % 6;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }

  return (hue * 60 + 360) % 360;
}

/** Smallest circular distance between two hue angles, in degrees. */
export function hueDistance(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360;

  return delta > 180 ? 360 - delta : delta;
}

export function luminanceDeltaPct(current: Rgb, baseline: Rgb): number {
  const base = relativeLuminance(baseline);

  if (base === 0) {
    return relativeLuminance(current) === 0 ? 0 : Infinity;
  }

  return ((relativeLuminance(current) - base) / base) * 100;
}

interface RegionStats {
  size: number;
  sumR: number;
  sumG: number;
  sumB: number;
}

/**
 * Flood-fills the subject mask and returns the largest 4-connected region.
 *
 * The largest region — not the raw non-background count — is the organelle's area: an isolated
 * stray pixel or a DOM artefact can inflate a naive count, and a regression that *adds* garbage
 * would then read as a pass. The region's mean colour is accumulated during the same pass.
 */
function largestRegion(
  mask: Uint8Array,
  width: number,
  height: number,
  pixel: (x: number, y: number) => Rgb,
): RegionStats | null {
  const visited = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  let best: RegionStats | null = null;

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0 || visited[start] === 1) {
      continue;
    }

    let top = 0;
    stack[top] = start;
    visited[start] = 1;

    const region: RegionStats = { size: 0, sumR: 0, sumG: 0, sumB: 0 };

    while (top >= 0) {
      const index = stack[top]!;
      top -= 1;

      const x = index % width;
      const y = (index - x) / width;
      const color = pixel(x, y);

      region.size += 1;
      region.sumR += color.r;
      region.sumG += color.g;
      region.sumB += color.b;

      // Neighbours: left, right, up, down.
      if (x > 0 && mask[index - 1] === 1 && visited[index - 1] === 0) {
        top += 1;
        stack[top] = index - 1;
        visited[index - 1] = 1;
      }
      if (x < width - 1 && mask[index + 1] === 1 && visited[index + 1] === 0) {
        top += 1;
        stack[top] = index + 1;
        visited[index + 1] = 1;
      }
      if (y > 0 && mask[index - width] === 1 && visited[index - width] === 0) {
        top += 1;
        stack[top] = index - width;
        visited[index - width] = 1;
      }
      if (y < height - 1 && mask[index + width] === 1 && visited[index + width] === 0) {
        top += 1;
        stack[top] = index + width;
        visited[index + width] = 1;
      }
    }

    if (best === null || region.size > best.size) {
      best = region;
    }
  }

  return best;
}

export function measurePng(
  buffer: Buffer,
  thresholds: MetricsThresholds = DEFAULT_THRESHOLDS,
): ScreenshotMetrics {
  const png = readPng(buffer);
  const { width, height, data } = png;

  const pixel = (x: number, y: number): Rgb => {
    const index = (y * width + x) * 4;
    return { r: data[index] ?? 0, g: data[index + 1] ?? 0, b: data[index + 2] ?? 0 };
  };

  const background = sampleBackground(png);
  const mask = new Uint8Array(width * height);
  let nonBackground = 0;
  let luminanceSum = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = pixel(x, y);

      if (colorDistance(color, background) > thresholds.backgroundDistance) {
        mask[y * width + x] = 1;
        nonBackground += 1;
      }

      luminanceSum += relativeLuminance(color);
    }
  }

  const region = largestRegion(mask, width, height, pixel);
  const regionColor: Rgb =
    region && region.size > 0
      ? {
          r: region.sumR / region.size,
          g: region.sumG / region.size,
          b: region.sumB / region.size,
        }
      : background;

  return {
    width,
    height,
    background,
    coverage: nonBackground / (width * height),
    occupiedAreaPx: region ? region.size : 0,
    regionColor,
    meanLuminance: luminanceSum / (width * height),
  };
}

export interface RegionLuminanceDiff {
  /** Pixels that differ between the two frames beyond the background distance. */
  changedPixels: number;
  /** Mean WCAG relative luminance of those pixels in the baseline frame. */
  baselineLuminance: number;
  /** Mean WCAG relative luminance of the same pixels in the changed frame. */
  currentLuminance: number;
  /** How much brighter the changed region became, as a percentage of the baseline. */
  risePct: number;
}

/**
 * How much brighter the *changed* pixels became between two frames.
 *
 * The hover requirement is stated on the organelle's region, and finding that region by projection
 * would need the camera matrices. This measures it without them: take the pixels that actually
 * changed, and compare their mean luminance. On the hover fixture exactly one organelle's materials
 * change, so the changed pixels *are* the organelle region — and the metric stays honest because a
 * hover that changed nothing would report zero changed pixels rather than a passing ratio.
 */
export function measureLuminanceRise(
  baseline: Buffer,
  current: Buffer,
  threshold = DEFAULT_THRESHOLDS.backgroundDistance,
): RegionLuminanceDiff {
  const before = readPng(baseline);
  const after = readPng(current);

  if (before.width !== after.width || before.height !== after.height) {
    throw new Error('measureLuminanceRise needs two frames of the same size');
  }

  const pixel = (png: PNG, index: number): Rgb => ({
    r: png.data[index] ?? 0,
    g: png.data[index + 1] ?? 0,
    b: png.data[index + 2] ?? 0,
  });

  let changedPixels = 0;
  let baselineSum = 0;
  let currentSum = 0;

  for (let index = 0; index < before.data.length; index += 4) {
    const beforeColor = pixel(before, index);
    const afterColor = pixel(after, index);

    if (colorDistance(beforeColor, afterColor) <= threshold) {
      continue;
    }

    changedPixels += 1;
    baselineSum += relativeLuminance(beforeColor);
    currentSum += relativeLuminance(afterColor);
  }

  const baselineLuminance = changedPixels > 0 ? baselineSum / changedPixels : 0;
  const currentLuminance = changedPixels > 0 ? currentSum / changedPixels : 0;

  return {
    changedPixels,
    baselineLuminance,
    currentLuminance,
    risePct:
      baselineLuminance > 0
        ? ((currentLuminance - baselineLuminance) / baselineLuminance) * 100
        : currentLuminance > 0
          ? Infinity
          : 0,
  };
}

/**
 * How far the nearest rendered pixel is from a point, in CSS pixels, or `null` if none is within
 * `radius`.
 *
 * This is the independent half of "the anchor is attached to its part" (task 4.19). The layout
 * mirror says where the layer *thinks* the anchor is; this asks the rendered frame whether anything
 * was actually drawn there. A leader pointing at empty space fails it, and no projection detail has
 * to be trusted for the check to mean something.
 *
 * It searches a radius rather than the exact pixel because an anchor sits on the *top* of an
 * organelle's bounds — for a sparse build (the ribosome cloud) the single pixel under the marker
 * can legitimately be background between two granules.
 */
export function nearestSubjectDistance(
  buffer: Buffer,
  x: number,
  y: number,
  radius: number,
  threshold = DEFAULT_THRESHOLDS.backgroundDistance,
): number | null {
  const png = readPng(buffer);
  const background = sampleBackground(png);
  const centreX = Math.round(x);
  const centreY = Math.round(y);
  let best: number | null = null;

  for (let dy = -radius; dy <= radius; dy += 1) {
    const py = centreY + dy;

    if (py < 0 || py >= png.height) {
      continue;
    }

    for (let dx = -radius; dx <= radius; dx += 1) {
      const px = centreX + dx;

      if (px < 0 || px >= png.width) {
        continue;
      }

      const distance = Math.hypot(dx, dy);

      if (best !== null && distance >= best) {
        continue;
      }

      const index = (py * png.width + px) * 4;
      const color: Rgb = {
        r: png.data[index] ?? 0,
        g: png.data[index + 1] ?? 0,
        b: png.data[index + 2] ?? 0,
      };

      if (colorDistance(color, background) > threshold) {
        best = distance;
      }
    }
  }

  return best;
}

export function assertCoverage(metrics: ScreenshotMetrics, thresholds = DEFAULT_THRESHOLDS): void {
  if (metrics.coverage < thresholds.coverageMin) {
    throw new Error(
      `Non-blank canvas coverage ${(metrics.coverage * 100).toFixed(2)}% is below the ` +
        `${(thresholds.coverageMin * 100).toFixed(2)}% gate — the canvas rendered nothing.`,
    );
  }
}

export function assertAreaWithinBand(
  metrics: ScreenshotMetrics,
  baselineAreaPx: number,
  thresholds = DEFAULT_THRESHOLDS,
): void {
  const driftPct = ((metrics.occupiedAreaPx - baselineAreaPx) / baselineAreaPx) * 100;

  if (Math.abs(driftPct) > thresholds.areaBandPct) {
    throw new Error(
      `Occupied area ${metrics.occupiedAreaPx}px drifted ${driftPct.toFixed(1)}% from the ` +
        `${baselineAreaPx}px baseline, outside the ±${thresholds.areaBandPct}% band.`,
    );
  }
}

export function assertRegionColor(
  metrics: ScreenshotMetrics,
  baseline: Rgb,
  thresholds = DEFAULT_THRESHOLDS,
): void {
  const hueDrift = hueDistance(rgbToHue(metrics.regionColor), rgbToHue(baseline));
  const luminanceDrift = luminanceDeltaPct(metrics.regionColor, baseline);

  if (hueDrift > thresholds.hueToleranceDeg) {
    throw new Error(
      `Region hue ${rgbToHue(metrics.regionColor).toFixed(1)}° drifted ${hueDrift.toFixed(1)}° ` +
        `from the baseline ${rgbToHue(baseline).toFixed(1)}° — beyond the ` +
        `${thresholds.hueToleranceDeg}° tolerance. A hue shift is a tone-mapping defect.`,
    );
  }

  if (Math.abs(luminanceDrift) > thresholds.luminanceTolerancePct) {
    throw new Error(
      `Region luminance drifted ${luminanceDrift.toFixed(1)}% from the baseline, beyond the ` +
        `±${thresholds.luminanceTolerancePct}% tolerance.`,
    );
  }
}

export function describeMetrics(metrics: ScreenshotMetrics): string {
  return (
    `${metrics.width}x${metrics.height} coverage ${(metrics.coverage * 100).toFixed(2)}% ` +
    `area ${metrics.occupiedAreaPx}px region ${rgbToHex(metrics.regionColor)} ` +
    `(hue ${rgbToHue(metrics.regionColor).toFixed(1)}°, mean luminance ${metrics.meanLuminance.toFixed(2)})`
  );
}
