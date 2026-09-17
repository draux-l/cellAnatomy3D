import { beforeEach, describe, expect, it } from 'vitest';
import {
  CLICK_SLOP_PX,
  clearPointerDown,
  isClick,
  isClickFromTrackedDown,
  lastPointerDownAt,
  recordPointerDown,
} from './pointer';

/**
 * The click-versus-drag rule (spec: `Drag orbits without selecting`).
 *
 * The threshold is the only thing standing between "I orbited the cell" and "I meant to isolate
 * that organelle", so both sides of it are asserted: a still pointer is a click, and anything past
 * 5 px is not.
 */

describe('isClick', () => {
  it('treats a still pointer as a click and any real travel as a drag', () => {
    const down = { x: 100, y: 100 };

    expect(isClick(down, { x: 100, y: 100 })).toBe(true);
    expect(isClick(down, { x: 104, y: 100 })).toBe(true);
    expect(isClick(down, { x: 100, y: 100 - (CLICK_SLOP_PX - 1) })).toBe(true);
    expect(isClick(down, { x: 100 + CLICK_SLOP_PX, y: 100 })).toBe(false);
    expect(isClick(down, { x: 100 + CLICK_SLOP_PX * 4, y: 100 + CLICK_SLOP_PX * 4 })).toBe(false);
  });

  it('measures travel diagonally, not per axis', () => {
    // 3 px on each axis is 4.24 px of travel: under the threshold, and a per-axis test would also
    // pass it — but 4 px on each axis is 5.66 px and a per-axis test would wrongly accept it.
    expect(isClick({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(true);
    expect(isClick({ x: 0, y: 0 }, { x: 4, y: 4 })).toBe(false);
  });

  it('refuses to call a pointerup a click when no pointerdown was recorded', () => {
    expect(isClick(null, { x: 0, y: 0 })).toBe(false);
  });
});

describe('the tracked pointerdown', () => {
  beforeEach(() => clearPointerDown());

  it('remembers the last press and answers for the release', () => {
    recordPointerDown({ clientX: 200, clientY: 150 });

    expect(lastPointerDownAt()).toEqual({ x: 200, y: 150 });
    expect(isClickFromTrackedDown({ clientX: 202, clientY: 151 })).toBe(true);
    expect(isClickFromTrackedDown({ clientX: 250, clientY: 150 })).toBe(false);
  });

  it('uses only the most recent press', () => {
    recordPointerDown({ clientX: 0, clientY: 0 });
    recordPointerDown({ clientX: 400, clientY: 400 });

    expect(isClickFromTrackedDown({ clientX: 401, clientY: 400 })).toBe(true);
  });
});
