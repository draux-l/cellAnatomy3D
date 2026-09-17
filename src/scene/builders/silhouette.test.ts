import { describe, expect, it } from 'vitest';
import { polygonRadiusAt, roundedPolygonPoints } from './silhouette';

/**
 * The shared silhouette generator, tested on its own.
 *
 * `polygonRadiusAt` is what lets the membrane reuse the wall's outline: it answers "how far out
 * is the boundary in this direction", which is the scale factor that morphs a round shell onto
 * the polygon. If it were wrong, the membrane and the wall would silently disagree — the exact
 * defect this slice exists to fix — so it is asserted against the outline's defining numbers
 * rather than against a snapshot.
 */

const SIDES = 8;
const INRADIUS = 1;

describe('polygonRadiusAt', () => {
  it('reaches the inradius on the flat sides and the circumradius at the sharp vertices', () => {
    const sharp = roundedPolygonPoints(SIDES, INRADIUS, 0, 4);
    const circumradius = INRADIUS / Math.cos(Math.PI / SIDES);

    // The generator starts a vertex at angle 0, so vertices sit at multiples of 2π/n and each
    // flat side's normal sits half a sector between two of them.
    expect(polygonRadiusAt(sharp, 0)).toBeCloseTo(circumradius, 6);
    expect(polygonRadiusAt(sharp, (2 * Math.PI) / SIDES)).toBeCloseTo(circumradius, 6);
    expect(polygonRadiusAt(sharp, Math.PI / SIDES)).toBeCloseTo(INRADIUS, 6);
    expect(polygonRadiusAt(sharp, (3 * Math.PI) / SIDES)).toBeCloseTo(INRADIUS, 6);
  });

  it('repeats with the polygon symmetry', () => {
    const outline = roundedPolygonPoints(SIDES, INRADIUS, 0.4, 6);
    const sector = (Math.PI * 2) / SIDES;

    for (const angle of [0.12, 0.5, 1.1]) {
      expect(polygonRadiusAt(outline, angle + sector)).toBeCloseTo(
        polygonRadiusAt(outline, angle),
        6,
      );
    }
  });

  it('pulls a rounded corner strictly inside the sharp polygon', () => {
    const sharp = roundedPolygonPoints(SIDES, INRADIUS, 0, 6);
    const rounded = roundedPolygonPoints(SIDES, INRADIUS, 0.4, 6);

    expect(polygonRadiusAt(rounded, 0)).toBeLessThan(polygonRadiusAt(sharp, 0));
    // The flats are untouched: rounding only ever eats into a corner.
    expect(polygonRadiusAt(rounded, Math.PI / SIDES)).toBeCloseTo(INRADIUS, 6);
  });

  it('is angular, and measurably more angular with fewer sides', () => {
    const ratio = (sides: number): number => {
      const outline = roundedPolygonPoints(sides, INRADIUS, 0.4, 8);
      const flats = polygonRadiusAt(outline, Math.PI / sides);
      const corners = polygonRadiusAt(outline, 0);

      return flats / corners;
    };

    expect(ratio(8)).toBeLessThan(1);
    expect(ratio(4)).toBeLessThan(ratio(8));
  });

  it('returns Infinity when the ray cannot reach the loop', () => {
    // A guard, not an expected case: an outline that does not contain the origin would otherwise
    // produce a silent NaN scale factor in the morph.
    const farAway = roundedPolygonPoints(4, 1, 0, 2).map(
      ([x, y]): [number, number] => [x + 10, y + 10],
    );

    expect(polygonRadiusAt(farAway, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('roundedPolygonPoints', () => {
  it('produces one rounded corner per side', () => {
    const segments = 4;

    expect(roundedPolygonPoints(SIDES, INRADIUS, 0.4, segments)).toHaveLength(
      SIDES * (segments + 1),
    );
  });

  it('never returns fewer than three sides', () => {
    expect(roundedPolygonPoints(1, 1, 0, 2).length).toBeGreaterThanOrEqual(3 * 3);
  });
});
