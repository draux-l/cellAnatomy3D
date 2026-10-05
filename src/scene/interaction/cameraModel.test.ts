import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { getRecord } from '../../catalog/cells';
import type { OrganelleRecord } from '../../catalog/types';
import {
  CELL_POSE,
  DISASSEMBLY_POSE,
  FOCUS_SNAP_EPSILON,
  HERO_POSE,
  ISOLATE_DISTANCE_FACTOR,
  ISOLATE_DISTANCE_CEILING,
  ISOLATE_DISTANCE_MARGIN,
  NAVIGATION_LIMITS,
  approachFocus,
  clampNavigationDistance,
  defaultFocus,
  focusForRecord,
  focusSettled,
  isolateCameraPose,
  type CameraPose,
} from './cameraModel';

/**
 * The camera contract (spec: `Scroll zoom is clamped`).
 *
 * The spec's own assertion is that the zoom clamp keeps the camera **outside the cell**. The
 * committed catalog is empty while the cell models are reset, so the "cell" the limit was measured
 * against is not available to build; what remains checkable is the limit contract itself — the
 * ordering, the clamps, and the relationship between the poses.
 */

/** A synthetic record with a placement, a size parameter and a plant override. */
const RECORD: OrganelleRecord = {
  id: 'golgi',
  name: { es: 'Aparato de Golgi', en: 'Golgi apparatus' },
  func: { es: 'Empaqueta.', en: 'Packages.' },
  size: { value: 1, unit: 'µm' },
  funFact: { es: 'Tiene dos caras.', en: 'It has two faces.' },
  paletteRole: 'organelles',
  position: [0.4, -0.2, 0.1],
  geometry: {
    kind: 'procedural',
    builder: 'golgi',
    params: { size: 0.3, detail: 1, count: 6 },
    seed: 'golgi/v1',
  },
  separates: true,
  perCell: { plant: { position: [-0.36, 0.52, 0.15] } },
  cells: ['animal', 'plant'],
  pickable: true,
};

describe('navigation limits', () => {
  it('keeps the near clamp outside the authored cell radius and inside the far clamp', () => {
    // The former cell wall reached ~1.27 scene units; the near clamp must clear a cell body while
    // still letting the camera approach an isolated organelle.
    expect(NAVIGATION_LIMITS.minDistance).toBeGreaterThan(1);
    expect(NAVIGATION_LIMITS.maxDistance).toBeGreaterThan(NAVIGATION_LIMITS.minDistance);
  });

  it('orders the limits and clamps both ends', () => {
    expect(clampNavigationDistance(0)).toBe(NAVIGATION_LIMITS.minDistance);
    expect(clampNavigationDistance(-5)).toBe(NAVIGATION_LIMITS.minDistance);
    expect(clampNavigationDistance(1000)).toBe(NAVIGATION_LIMITS.maxDistance);
    expect(clampNavigationDistance(4)).toBe(4);
    expect(clampNavigationDistance(Number.NaN)).toBe(NAVIGATION_LIMITS.minDistance);
  });

  it('frames the whole exploded view wider than the composed cell', () => {
    const halfHeight = (pose: typeof CELL_POSE): number => {
      const distance = Math.hypot(...pose.position);

      return Math.tan((pose.fov * Math.PI) / 360) * distance;
    };

    expect(halfHeight(DISASSEMBLY_POSE)).toBeGreaterThan(halfHeight(CELL_POSE));
    // The composed camera sits outside the near clamp, so the clamp never fights the pose.
    expect(Math.hypot(...CELL_POSE.position)).toBeGreaterThan(NAVIGATION_LIMITS.minDistance);
  });

  it('uses a composed pose distinct from the organelle hero pose', () => {
    // The organelle pose clips a whole cell; keeping them separate is what keeps the two viewers
    // from drifting into one another.
    expect(CELL_POSE).not.toEqual(HERO_POSE);
    expect(DISASSEMBLY_POSE).not.toEqual(CELL_POSE);
  });
});

/**
 * The composed pose is matched against a **plain glTF viewer**, so the assertion that matters is
 * that the pose is still the plain viewer's rule applied to this model — not that it equals a
 * number someone typed. Re-deriving it from the membrane record is what stops the constant from
 * drifting away from the model it frames.
 */
describe('the composed whole-cell pose', () => {
  /** The plain viewer's own margin: it keeps the half-diagonal 6 % inside the vertical field. */
  const PLAIN_VIEWER_MARGIN = 1.06;

  const membraneHalfDiagonal = (): number => {
    const geometry = getRecord('membrane')?.geometry;

    return geometry?.kind === 'mesh' ? geometry.extent : Number.NaN;
  };

  it('frames the membrane it is measured against, with the plain viewer margin', () => {
    const halfDiagonal = membraneHalfDiagonal();

    expect(Number.isFinite(halfDiagonal)).toBe(true);

    const expected =
      (halfDiagonal / Math.tan((CELL_POSE.fov * Math.PI) / 360)) * PLAIN_VIEWER_MARGIN;

    expect(Math.hypot(...CELL_POSE.position)).toBeCloseTo(expected, 3);
    // Outside the model's own reach: any closer and the camera renders the cell's interior, which is
    // exactly the defect this pose replaces.
    expect(Math.hypot(...CELL_POSE.position)).toBeGreaterThan(halfDiagonal);
  });

  it('keeps the plain viewer direction: near-frontal with a slight upward tilt', () => {
    const [x, y, z] = CELL_POSE.position;
    const distance = Math.hypot(x, y, z);
    const azimuth = (Math.atan2(x, z) * 180) / Math.PI;
    const elevation = (Math.asin(y / distance) * 180) / Math.PI;

    // The hero pose sat at ~25° of azimuth, which is the "from the side and below" reading. The
    // composed pose is the near-frontal one.
    expect(azimuth).toBeGreaterThan(5);
    expect(azimuth).toBeLessThan(20);
    expect(elevation).toBeGreaterThan(10);
    expect(elevation).toBeLessThan(25);
  });

  it('keeps the disassembly pose wider, and inside the far navigation clamp', () => {
    const distance = (pose: CameraPose): number => Math.hypot(...pose.position);

    expect(distance(DISASSEMBLY_POSE)).toBeGreaterThan(distance(CELL_POSE));
    expect(distance(DISASSEMBLY_POSE)).toBeLessThanOrEqual(NAVIGATION_LIMITS.maxDistance);
  });
});

describe('isolateCameraPose', () => {
  it('keeps the hero viewing direction and moves the camera along it', () => {
    const position: [number, number, number] = [0.4, -0.2, 0.1];
    const pose = isolateCameraPose(position, 0.3);
    const heroDirection = new Vector3(...HERO_POSE.position).normalize();
    const toCamera = new Vector3(...pose.position).sub(new Vector3(...position));

    expect(toCamera.clone().normalize().angleTo(heroDirection)).toBeLessThan(1e-6);
    expect(pose.target).toEqual([...position]);
  });

  it('backs off in proportion to the organelle size, up to a ceiling', () => {
    const small = isolateCameraPose([0, 0, 0], 0.2);
    const large = isolateCameraPose([0, 0, 0], 0.6);
    const distance = (pose: typeof small): number => Math.hypot(...pose.position);

    // Both sizes land on the near clamp, so the smaller one proves the clamp rather than the
    // formula; the 0.6-unit organelle proves the formula.
    expect(distance(small)).toBeCloseTo(NAVIGATION_LIMITS.minDistance, 9);
    expect(large.position[2]).toBeGreaterThan(small.position[2]);
    expect(distance(large)).toBeCloseTo(
      Math.min(ISOLATE_DISTANCE_CEILING, 0.6 * ISOLATE_DISTANCE_FACTOR + ISOLATE_DISTANCE_MARGIN),
      6,
    );

    // A record whose extent is that of a spread-out mesh — the ER, the ribosome clouds and the
    // mitochondrial envelopes all exceed this — is framed from the ceiling rather than from outside
    // the cell, so the isolated view stays inside the cell it belongs to.
    expect(Math.hypot(...isolateCameraPose([0, 0, 0], 1.5).position)).toBeCloseTo(
      ISOLATE_DISTANCE_CEILING,
      9,
    );
  });

  it('respects the navigation clamps', () => {
    // The ceiling is below the far clamp and above the near one, so it is the ceiling — not the far
    // clamp — that frames the largest parts.
    expect(ISOLATE_DISTANCE_CEILING).toBeLessThan(NAVIGATION_LIMITS.maxDistance);
    expect(ISOLATE_DISTANCE_CEILING).toBeGreaterThan(NAVIGATION_LIMITS.minDistance);
    expect(Math.hypot(...isolateCameraPose([0, 0, 0], 100).position)).toBeCloseTo(
      ISOLATE_DISTANCE_CEILING,
      9,
    );
    expect(Math.hypot(...isolateCameraPose([0, 0, 0], -5).position)).toBeCloseTo(
      NAVIGATION_LIMITS.minDistance,
      9,
    );
  });

  it('produces the same pose for every record, deterministically', () => {
    const size = Number(RECORD.geometry.kind === 'procedural' ? RECORD.geometry.params.size : 0.3);
    const first = isolateCameraPose(RECORD.position, size);
    const second = isolateCameraPose(RECORD.position, size);

    expect(first).toEqual(second);
  });
});

describe('the isolate framing tween', () => {
  it('rests on the cell centre at the composed distance', () => {
    const focus = defaultFocus();

    expect(focus.target).toEqual([...CELL_POSE.target]);
    expect(focus.distance).toBeCloseTo(Math.hypot(...CELL_POSE.position), 9);
  });

  it('frames a record at its own cell-specific placement', () => {
    const animal = focusForRecord(RECORD, 'animal');
    const plant = focusForRecord(RECORD, 'plant');

    expect(animal.target).not.toEqual(plant.target);
    expect(plant.target).toEqual([...RECORD.perCell!.plant!.position!]);
  });

  it('arrives exactly and then reports itself settled', () => {
    const desired = focusForRecord(RECORD, 'animal');
    let current = defaultFocus();

    for (let step = 0; step < 400; step += 1) {
      current = approachFocus(current, desired, 1 / 60);
    }

    expect(focusSettled(current, desired)).toBe(true);
    // The final value is the destination, not merely close to it: a screenshot must not depend on
    // how many frames the transition happened to take.
    expect(current.target).toEqual(desired.target);
    expect(current.distance).toBe(desired.distance);
  });

  it('is frame-rate independent', () => {
    const desired = focusForRecord(RECORD, 'animal');
    const start = defaultFocus();
    let atSixty = start;
    let atTwenty = start;

    for (let step = 0; step < 30; step += 1) {
      atSixty = approachFocus(atSixty, desired, 1 / 60);
    }

    for (let step = 0; step < 10; step += 1) {
      atTwenty = approachFocus(atTwenty, desired, 1 / 20);
    }

    expect(atSixty.distance).toBeCloseTo(atTwenty.distance, 3);
  });

  it('never overshoots and clamps an absurd delta', () => {
    const desired = focusForRecord(RECORD, 'animal');
    const start = defaultFocus();
    // A backgrounded tab delivers one enormous delta; the clamp keeps the step from jumping past
    // its destination, so the result stays between where it was and where it is going.
    const next = approachFocus(start, desired, 1e6);
    const low = Math.min(start.distance, desired.distance);
    const high = Math.max(start.distance, desired.distance);

    expect(next.distance).toBeGreaterThanOrEqual(low);
    expect(next.distance).toBeLessThanOrEqual(high);
    // The clamp is live: an unclamped 1e6 second delta would land exactly on the destination.
    expect(next.distance).not.toBe(desired.distance);
  });

  it('is already settled when it is asked for what it already has', () => {
    const focus = defaultFocus();

    expect(focusSettled(focus, focus)).toBe(true);
    expect(FOCUS_SNAP_EPSILON).toBeGreaterThan(0);
  });
});
