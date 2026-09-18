/**
 * The four functions the two nutrition animations are built from.
 *
 * Both processes are pure functions of a phase in `[0, 1)`, so the maths is shared, tiny, and
 * unit-testable without a renderer. Keeping it in one module is what stops the ATP burst and the
 * thylakoid flow from growing subtly different versions of "smoothstep" that fade in at different
 * rates.
 */

export function clamp01(value: number): number {
  // `NaN` is the only value with no position on the interval, so it is the only one that needs a
  // fallback. `±Infinity` clamps like any other out-of-range number, which is what a caller that
  // accidentally divided by a zero delta would want: a full band, not an empty one.
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

/** Wraps any real number into `[0, 1)`. The cycle primitive: a phase offset never leaves the cycle. */
export function wrap01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const wrapped = value % 1;

  return wrapped < 0 ? wrapped + 1 : wrapped;
}

/** Hermite ease between two edges. Returns 0 below `edge0`, 1 above `edge1`, smooth in between. */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 === edge0) {
    return value < edge0 ? 0 : 1;
  }

  const t = clamp01((value - edge0) / (edge1 - edge0));

  return t * t * (3 - 2 * t);
}

export function mix(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** How far `value` is through the half-open band `[start, end)`, as `[0, 1]`. */
export function bandProgress(start: number, end: number, value: number): number {
  if (end <= start) {
    return 0;
  }

  return clamp01((value - start) / (end - start));
}
