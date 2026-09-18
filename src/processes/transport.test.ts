import { describe, expect, it } from 'vitest';
import { createProcessTransport } from './transport';

/**
 * The process transport (task 6.3).
 *
 * The scrub bar is a shell control and the timeline is a 3D-chunk object, so the transport is the
 * only place they meet. Its contract is small and every clause is load-bearing:
 *
 * - A request is consumed **once**. If it stayed pending, every frame would re-apply the same time
 *   and the sequence could never play again.
 * - Values are clamped, because the request arrives from a DOM control and from a URL.
 * - The published playhead is the timeline's own, so the readout can never claim a phase the
 *   animation is not holding.
 */

describe('the process transport', () => {
  it('starts idle, at the beginning, with nothing to report', () => {
    const transport = createProcessTransport();

    expect(transport.consume()).toBeNull();
    expect(transport.progress).toBe(0);
    expect(transport.label).toBeNull();
    expect(transport.scrubbing).toBe(false);
  });

  it('hands a seek over exactly once', () => {
    const transport = createProcessTransport();

    transport.seek('anaphase');

    expect(transport.consume()).toEqual({ progress: null, label: 'anaphase' });
    expect(transport.consume()).toBeNull();
  });

  it('hands a scrub over exactly once, clamped to the sequence', () => {
    const transport = createProcessTransport();

    transport.scrub(0.42);
    expect(transport.consume()).toEqual({ progress: 0.42, label: null });

    transport.scrub(4);
    expect(transport.consume()).toEqual({ progress: 1, label: null });

    transport.scrub(-2);
    expect(transport.consume()).toEqual({ progress: 0, label: null });

    transport.scrub(Number.NaN);
    expect(transport.consume()).toEqual({ progress: 0, label: null });
  });

  it('keeps only the most recent request, so a fast drag does not replay every step', () => {
    const transport = createProcessTransport();

    transport.scrub(0.2);
    transport.scrub(0.5);
    transport.scrub(0.9);

    expect(transport.consume()).toEqual({ progress: 0.9, label: null });
    expect(transport.consume()).toBeNull();
  });

  it('publishes the timeline\'s own playhead, clamped', () => {
    const transport = createProcessTransport();

    transport.publish(0.62, 'telophase');

    expect(transport.progress).toBeCloseTo(0.62, 9);
    expect(transport.label).toBe('telophase');

    transport.publish(2, null);
    expect(transport.progress).toBe(1);
    expect(transport.label).toBeNull();

    transport.publish(Number.NaN, 'prophase');
    expect(transport.progress).toBe(0);
  });

  it('tracks whether a pointer owns the control', () => {
    const transport = createProcessTransport();

    transport.setScrubbing(true);
    expect(transport.scrubbing).toBe(true);
    transport.setScrubbing(false);
    expect(transport.scrubbing).toBe(false);
  });

  it('clears everything on reset, so a new process never inherits an old request', () => {
    const transport = createProcessTransport();

    transport.scrub(0.8);
    transport.setScrubbing(true);
    transport.publish(0.8, 'cytokinesis');
    transport.reset();

    expect(transport.consume()).toBeNull();
    expect(transport.progress).toBe(0);
    expect(transport.label).toBeNull();
    expect(transport.scrubbing).toBe(false);
  });
});
