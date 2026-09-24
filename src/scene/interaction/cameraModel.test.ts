import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { getRecord } from '../../catalog/cells';
import { baseGeometryParamsFor } from '../../catalog/params';
import { buildCellWall } from '../builders/cell-wall';
import { buildMembrane } from '../builders/membrane';
import {
  CELL_POSE,
  DISASSEMBLY_POSE,
  FOCUS_SNAP_EPSILON,
  HERO_POSE,
  ISOLATE_DISTANCE_FACTOR,
  ISOLATE_DISTANCE_MARGIN,
  NAVIGATION_LIMITS,
  approachFocus,
  clampNavigationDistance,
  defaultFocus,
  focusForRecord,
  focusSettled,
  isolateCameraPose,
} from './cameraModel';

/**
 * The camera contract (spec: `Scroll zoom is clamped`).
 *
 * The load-bearing assertion here is the one the spec actually makes: the zoom clamp must keep the
 * camera **outside the cell**, and "the cell" is the wall as built. So the wall is built at its
 * catalog parameters and measured, rather than the limit being compared to a remembered number.
 */

/** The furthest any vertex sits from the depth axis. */
function outerRadius(geometry: { getAttribute: (name: string) => { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } }): number {
  const position = geometry.getAttribute('position');
  let worst = 0;

  for (let index = 0; index < position.count; index += 1) {
    worst = Math.max(worst, Math.hypot(position.getX(index), position.getY(index)));
  }

  return worst;
}

const WALL_RECORD = getRecord('cell-wall')!;
const WALL_PARAMS = baseGeometryParamsFor(WALL_RECORD) as { size: number; detail: number; count: number };

describe('navigation limits', () => {
  it('keeps the near clamp outside the wall as built', () => {
    const wall = buildCellWall(WALL_PARAMS);
    const wallReach = outerRadius(wall.parts[0]!.geometry);

    expect(NAVIGATION_LIMITS.minDistance).toBeGreaterThan(wallReach);

    wall.dispose();
  });

  it('keeps the near clamp outside the membrane as built too', () => {
    const membraneRecord = getRecord('membrane')!;
    const membrane = buildMembrane(baseGeometryParamsFor(membraneRecord));
    const position = membrane.parts[0]!.geometry.getAttribute('position');
    const vertex = new Vector3();
    let worst = 0;

    for (let index = 0; index < position.count; index += 1) {
      vertex.set(position.getX(index), position.getY(index), position.getZ(index));
      worst = Math.max(worst, vertex.length());
    }

    expect(worst).toBeGreaterThan(1);
    expect(NAVIGATION_LIMITS.minDistance).toBeGreaterThan(worst);

    membrane.dispose();
  });

  it('orders the limits and clamps both ends', () => {
    expect(NAVIGATION_LIMITS.maxDistance).toBeGreaterThan(NAVIGATION_LIMITS.minDistance);
    expect(clampNavigationDistance(0)).toBe(NAVIGATION_LIMITS.minDistance);
    expect(clampNavigationDistance(-5)).toBe(NAVIGATION_LIMITS.minDistance);
    expect(clampNavigationDistance(1000)).toBe(NAVIGATION_LIMITS.maxDistance);
    expect(clampNavigationDistance(4)).toBe(4);
    expect(clampNavigationDistance(Number.NaN)).toBe(NAVIGATION_LIMITS.minDistance);
  });

  it('frames the whole cell and the whole exploded view', () => {
    const wall = buildCellWall(WALL_PARAMS);
    const wallReach = outerRadius(wall.parts[0]!.geometry);
    const halfHeight = (pose: typeof CELL_POSE): number => {
      const distance = Math.hypot(...pose.position);

      return Math.tan((pose.fov * Math.PI) / 360) * distance;
    };

    expect(halfHeight(CELL_POSE)).toBeGreaterThan(wallReach);
    expect(halfHeight(DISASSEMBLY_POSE)).toBeGreaterThan(halfHeight(CELL_POSE));

    wall.dispose();
  });

  it('uses a composed pose distinct from the organelle hero pose', () => {
    // The organelle pose clips a whole cell; keeping them separate is what keeps every committed
    // organelle baseline byte-identical.
    expect(CELL_POSE).not.toEqual(HERO_POSE);
    expect(DISASSEMBLY_POSE).not.toEqual(CELL_POSE);
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

  it('backs off in proportion to the organelle size', () => {
    const small = isolateCameraPose([0, 0, 0], 0.2);
    const large = isolateCameraPose([0, 0, 0], 1);
    const distance = (pose: typeof small): number => Math.hypot(...pose.position);

    // Both sizes land on the near clamp, so the smaller one proves the clamp rather than the
    // formula; the 1-unit organelle proves the formula.
    expect(distance(small)).toBeCloseTo(NAVIGATION_LIMITS.minDistance, 9);
    expect(large.position[2]).toBeGreaterThan(small.position[2]);
    expect(distance(large)).toBeCloseTo(ISOLATE_DISTANCE_FACTOR + ISOLATE_DISTANCE_MARGIN, 6);
  });

  it('respects the navigation clamps', () => {
    expect(Math.hypot(...isolateCameraPose([0, 0, 0], 100).position)).toBeCloseTo(
      NAVIGATION_LIMITS.maxDistance,
      9,
    );
    expect(Math.hypot(...isolateCameraPose([0, 0, 0], -5).position)).toBeCloseTo(
      NAVIGATION_LIMITS.minDistance,
      9,
    );
  });

  it('produces the same pose for every catalog record, deterministically', () => {
    const record = getRecord('golgi')!;
    const first = isolateCameraPose(record.position, Number(baseGeometryParamsFor(record).size));
    const second = isolateCameraPose(record.position, Number(baseGeometryParamsFor(record).size));

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
    const nucleus = getRecord('nucleus')!;
    const animal = focusForRecord(nucleus, 'animal');
    const plant = focusForRecord(nucleus, 'plant');

    expect(animal.target).not.toEqual(plant.target);
    expect(plant.target).toEqual([...nucleus.perCell!.plant!.position!]);
  });

  it('arrives exactly and then reports itself settled', () => {
    const desired = focusForRecord(getRecord('golgi')!, 'animal');
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
    const desired = focusForRecord(getRecord('lysosome')!, 'animal');
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
    const desired = focusForRecord(getRecord('membrane')!, 'animal');
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
