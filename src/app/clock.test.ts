import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_FRAME_DELTA_SECONDS,
  SPEED_SCALE,
  createProcessClock,
  processClock,
  speedToScale,
} from './clock';

describe('speedToScale', () => {
  it('maps the ratified speed settings', () => {
    expect(speedToScale('pause')).toBe(0);
    expect(speedToScale('slow')).toBe(0.25);
    expect(speedToScale('realtime')).toBe(1);
    expect(Object.keys(SPEED_SCALE).sort()).toEqual(['pause', 'realtime', 'slow']);
  });
});

describe('createProcessClock', () => {
  let clock: ReturnType<typeof createProcessClock>;

  beforeEach(() => {
    clock = createProcessClock();
  });

  it('accumulates scaled deltas', () => {
    expect(clock.tick(0.016)).toBeCloseTo(0.016);
    expect(clock.tick(0.016)).toBeCloseTo(0.032);
    expect(clock.elapsed).toBeCloseTo(0.032);
  });

  it('stops advancing while paused', () => {
    clock.tick(0.05);
    clock.setScale(speedToScale('pause'));
    clock.tick(0.05);
    clock.tick(0.05);

    expect(clock.elapsed).toBeCloseTo(0.05);
  });

  it('advances at a quarter rate on slow motion', () => {
    clock.setScale(speedToScale('slow'));
    clock.tick(0.04);

    expect(clock.elapsed).toBeCloseTo(0.01);
  });

  it('clamps a backgrounded-tab delta so animation cannot jump', () => {
    clock.tick(5);

    expect(clock.elapsed).toBeCloseTo(MAX_FRAME_DELTA_SECONDS);
  });

  it('ignores negative and non-finite deltas', () => {
    clock.tick(-1);
    clock.tick(Number.NaN);
    clock.tick(Number.POSITIVE_INFINITY);

    expect(clock.elapsed).toBe(0);
  });

  it('pins the clock while frozen and resumes from the pinned time', () => {
    clock.freezeAt(2.5);

    expect(clock.frozen).toBe(true);
    expect(clock.tick(1)).toBe(2.5);
    expect(clock.elapsed).toBe(2.5);

    clock.resume();
    clock.tick(0.05);

    expect(clock.frozen).toBe(false);
    expect(clock.elapsed).toBeCloseTo(2.55);
  });

  it('resets elapsed time and unfreezes', () => {
    clock.freezeAt(4);
    clock.reset();

    expect(clock.elapsed).toBe(0);
    expect(clock.frozen).toBe(false);
  });

  it('keeps the app singleton independent from a fresh instance', () => {
    const fresh = createProcessClock();

    processClock.reset();
    fresh.tick(0.05);

    expect(processClock.elapsed).toBe(0);
    expect(fresh.elapsed).toBeCloseTo(0.05);
  });
});
