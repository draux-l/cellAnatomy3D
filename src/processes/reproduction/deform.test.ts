import { SphereGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import {
  BULGE_DEPTH,
  PINCH_DEPTH,
  captureRestPose,
  equatorialRadius,
  pinchFactor,
  restoreRestPose,
  writeEquatorialPinch,
} from './deform';

/**
 * The equatorial pinch (task 6.4).
 *
 * The animal mechanism is a vertex deformation of the cell's own boundary, so two things have to be
 * true or the mechanism is either invisible or destructive: the shape must actually narrow at the
 * equator (and only there), and the borrow must be **exactly** reversible — the base viewer is put
 * back, not rebuilt, and a half-closed waist left behind would be a visible regression in every
 * later screenshot.
 */

function ball(radius = 1, width = 48, height = 24): SphereGeometry {
  return new SphereGeometry(radius, width, height);
}

/** The largest `x` among vertices within `band` of the equator. */
function equatorialExtent(geometry: SphereGeometry, band = 0.05): number {
  const attribute = geometry.getAttribute('position');
  let extent = 0;

  for (let index = 0; index < attribute.count; index += 1) {
    if (Math.abs(attribute.getY(index)) > band) {
      continue;
    }

    extent = Math.max(extent, Math.abs(attribute.getX(index)));
  }

  return extent;
}

describe('pinchFactor', () => {
  it('is the identity when nothing is pinched', () => {
    for (const height of [-1, -0.4, 0, 0.3, 0.9]) {
      expect(pinchFactor(height, 0)).toBe(1);
    }
  });

  it('is narrowest at the equator, by at least the declared depth', () => {
    // The bulge's Gaussian has a small tail at the equator, so the waist lands a ten-thousandth
    // inside `pinchDepth` rather than exactly on it.
    expect(1 - pinchFactor(0, 1)).toBeCloseTo(PINCH_DEPTH, 3);

    for (const height of [0.2, 0.4, 0.6, 0.8]) {
      expect(pinchFactor(height, 1)).toBeGreaterThan(pinchFactor(0, 1));
    }
  });

  it('bulges the daughter lobes rather than only thinning the middle', () => {
    // Somewhere away from the equator the surface is wider than at rest, which is what a cell about
    // to divide actually does.
    expect(Math.max(pinchFactor(0.62, 1), pinchFactor(0.7, 0.9))).toBeGreaterThan(1);
    expect(BULGE_DEPTH).toBeGreaterThan(0);
  });

  it('scales with the amount, and clamps at full depth without overshooting the waist', () => {
    let previous = 1;

    for (const amount of [0, 0.25, 0.5, 0.75, 1]) {
      const factor = pinchFactor(0, amount);

      expect(factor).toBeLessThanOrEqual(previous + 1e-12);
      previous = factor;
    }

    expect(pinchFactor(0, 4)).toBeCloseTo(pinchFactor(0, 1), 9);
  });
});

describe('the rest pose', () => {
  it('restores a geometry byte-exactly after a pinch', () => {
    const geometry = ball();
    const rest = captureRestPose(geometry);
    const before = Float32Array.from(rest.positions);

    writeEquatorialPinch(rest, 1);
    expect(Float32Array.from(rest.positions)).toEqual(before);

    restoreRestPose(rest);
    expect(Float32Array.from(geometry.getAttribute('position').array)).toEqual(before);
  });

  it('restores instead of leaving a half-closed waist when the amount goes back to zero', () => {
    const geometry = ball();
    const rest = captureRestPose(geometry);
    const before = Float32Array.from(rest.positions);

    writeEquatorialPinch(rest, 1);
    // The band is ±0.05 in height, where the pinch profile is still near its deepest; the point of
    // the assertion is that the equatorial extent collapses, not that it hits the exact minimum.
    expect(equatorialExtent(geometry)).toBeLessThan(0.6);

    writeEquatorialPinch(rest, 0);
    expect(Float32Array.from(geometry.getAttribute('position').array)).toEqual(before);
  });

  it('keeps every vertex at its own height: the furrow narrows, it does not squash', () => {
    const geometry = ball();
    const rest = captureRestPose(geometry);
    const attribute = geometry.getAttribute('position');
    const heights: number[] = [];

    for (let index = 0; index < attribute.count; index += 1) {
      heights.push(attribute.getY(index));
    }

    writeEquatorialPinch(rest, 1);

    for (let index = 0; index < attribute.count; index += 1) {
      expect(attribute.getY(index)).toBe(heights[index]);
    }
  });

  it('measures the cell\'s equatorial radius from the geometry it was given', () => {
    const rest = captureRestPose(ball(1));
    // A sphere of radius 1: the equatorial band's radial extent is its radius.
    expect(equatorialRadius(rest)).toBeCloseTo(1, 6);
    expect(equatorialRadius(captureRestPose(ball(0.7)))).toBeCloseTo(0.7, 6);
  });
});
