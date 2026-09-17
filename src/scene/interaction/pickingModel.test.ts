import { describe, expect, it } from 'vitest';
import { PICK_LAYER, PICK_PROXY_INFLATION, pickProxyTransform } from './pickingModel';

/**
 * The hit-volume arithmetic.
 *
 * The proxy's only job is to *contain* the organelle and be hittable, so both are asserted: the
 * box must cover every bound, and a sheet-like organelle (a crista, a Golgi cisterna) must still
 * get a usable thickness.
 */

const BOUNDS = { min: [-1, -0.5, -0.25] as const, max: [1, 0.5, 0.25] as const };

describe('pickProxyTransform', () => {
  it('sits on the bounds centre and covers them with the inflation applied', () => {
    const transform = pickProxyTransform({ min: [...BOUNDS.min], max: [...BOUNDS.max] });

    expect(transform.center).toEqual([0, 0, 0]);
    expect(transform.size).toEqual([2 * PICK_PROXY_INFLATION, 1 * PICK_PROXY_INFLATION, 0.5 * PICK_PROXY_INFLATION]);
  });

  it('offsets the centre for an asymmetric build', () => {
    const transform = pickProxyTransform({ min: [0, 0, 0], max: [2, 4, 6] });

    expect(transform.center).toEqual([1, 2, 3]);
  });

  it('gives a flat organelle a hittable thickness on the flat axis', () => {
    const transform = pickProxyTransform({ min: [-1, 0, -1], max: [1, 0, 1] });

    expect(transform.size[1]).toBeGreaterThan(0);
    expect(transform.size[1]).toBeGreaterThanOrEqual(0.02);
  });

  it('never returns a zero-size box, whatever the bounds', () => {
    const transform = pickProxyTransform({ min: [0, 0, 0], max: [0, 0, 0] });

    for (const extent of transform.size) {
      expect(extent).toBeGreaterThan(0);
    }
  });

  it('declares a pick layer that is not the render layer', () => {
    // The camera renders layer 0; the proxies render nowhere and are only ever raycast.
    expect(PICK_LAYER).toBe(1);
  });
});
