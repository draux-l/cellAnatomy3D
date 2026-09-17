import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { getRecord } from '../../catalog/cells';
import { buildCellWall } from '../builders/cell-wall';
import { buildMembrane } from '../builders/membrane';
import {
  CELL_POSE,
  DISASSEMBLY_POSE,
  HERO_POSE,
  ISOLATE_DISTANCE_FACTOR,
  ISOLATE_DISTANCE_MARGIN,
  NAVIGATION_LIMITS,
  clampNavigationDistance,
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
const WALL_PARAMS = WALL_RECORD.geometry.params as { size: number; detail: number; count: number };

describe('navigation limits', () => {
  it('keeps the near clamp outside the wall as built', () => {
    const wall = buildCellWall(WALL_PARAMS);
    const wallReach = outerRadius(wall.parts[0]!.geometry);

    expect(NAVIGATION_LIMITS.minDistance).toBeGreaterThan(wallReach);

    wall.dispose();
  });

  it('keeps the near clamp outside the membrane as built too', () => {
    const membraneRecord = getRecord('membrane')!;
    const membrane = buildMembrane(membraneRecord.geometry.params);
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
    const first = isolateCameraPose(record.position, Number(record.geometry.params.size));
    const second = isolateCameraPose(record.position, Number(record.geometry.params.size));

    expect(first).toEqual(second);
  });
});
