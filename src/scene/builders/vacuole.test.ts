import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { hashGeometryPositions } from './primitives';
import {
  VACUOLE_PARAMS,
  VACUOLE_PROFILE_SEGMENTS_PER_DETAIL,
  VACUOLE_RADIAL_SEGMENTS_PER_DETAIL,
  buildVacuole,
  vacuoleProfile,
} from './vacuole';

const PER_ORGANELLE_TRIANGLE_BUDGET = 25_000;

function outerRadius(build: ReturnType<typeof buildVacuole>): number {
  const position = build.parts[0]!.geometry.getAttribute('position');
  const vertex = new Vector3();
  let widest = 0;

  for (let i = 0; i < position.count; i += 1) {
    vertex.set(position.getX(i), position.getY(i), position.getZ(i));
    widest = Math.max(widest, vertex.length());
  }

  return widest;
}

describe('vacuoleProfile', () => {
  it('spans pole to pole with the radius on the equator', () => {
    const profile = vacuoleProfile(1, 1, 24, 0, 'vacuole/v1');
    const ys = profile.map((point) => point.y);
    const widest = Math.max(...profile.map((point) => point.x));

    expect(Math.min(...ys)).toBeCloseTo(-1, 6);
    expect(Math.max(...ys)).toBeCloseTo(1, 6);
    expect(widest).toBeCloseTo(1, 6);
    expect(profile[0]?.x).toBeCloseTo(0);
    expect(profile.at(-1)?.x).toBeCloseTo(0);
  });

  it('flattens the body along its vertical axis', () => {
    const sphere = vacuoleProfile(1, 1, 24, 0, 'vacuole/v1');
    const flat = vacuoleProfile(1, 0.9, 24, 0, 'vacuole/v1');
    const sphereHeight = Math.max(...sphere.map((point) => point.y)) - Math.min(...sphere.map((point) => point.y));
    const flatHeight = Math.max(...flat.map((point) => point.y)) - Math.min(...flat.map((point) => point.y));

    expect(flatHeight).toBeLessThan(sphereHeight);
    expect(flatHeight).toBeCloseTo(sphereHeight * 0.9, 6);
  });

  it('wavers the profile without leaving the documented band', () => {
    const wobble = 0.02;
    const profile = vacuoleProfile(1, 1, 24, wobble, 'vacuole/v1');
    const widest = Math.max(...profile.map((point) => point.x));

    expect(widest).toBeGreaterThan(1 - wobble);
    expect(widest).toBeLessThan(1 + wobble);
  });
});

describe('buildVacuole', () => {
  it('exposes the documented parameter defaults', () => {
    expect(VACUOLE_PARAMS.seed).toBe('vacuole/v1');
    expect(VACUOLE_PARAMS.size).toBe(1);

    const build = buildVacuole();

    expect(build.seed).toBe('vacuole/v1');
    expect(build.drawCalls).toBe(1);
    expect(build.parts).toHaveLength(1);

    build.dispose();
  });

  it('builds one large rounded body', () => {
    const build = buildVacuole();

    expect(build.parts[0]?.name).toBe('vacuole');
    expect(build.parts[0]?.materialKey).toBe('vacuole');
    expect(outerRadius(build)).toBeGreaterThan(0.97);
    expect(outerRadius(build)).toBeLessThan(1.03);

    build.dispose();
  });

  it('scales with size without changing the tessellation', () => {
    const small = buildVacuole({ size: 0.72 });
    const large = buildVacuole({ size: 1 });
    const wobble = VACUOLE_PARAMS.wobble;

    // The waver is bounded, so each body lands inside its size's band.
    expect(outerRadius(large)).toBeGreaterThan(1 - wobble);
    expect(outerRadius(large)).toBeLessThan(1 + wobble);
    expect(outerRadius(small)).toBeGreaterThan(0.72 * (1 - wobble));
    expect(outerRadius(small)).toBeLessThan(0.72 * (1 + wobble));
    expect(small.parts[0]!.geometry.getAttribute('position').count).toBe(
      large.parts[0]!.geometry.getAttribute('position').count,
    );

    small.dispose();
    large.dispose();
  });

  it('honours the record parameters and stays inside the triangle budget', () => {
    // The record ships `{ size: 0.72, detail: 1, count: 0 }`.
    const build = buildVacuole({ size: 0.72, detail: 1, count: 0 });
    const segments =
      VACUOLE_PROFILE_SEGMENTS_PER_DETAIL * VACUOLE_RADIAL_SEGMENTS_PER_DETAIL * 2;

    expect(build.triangles).toBeGreaterThan(0);
    expect(build.triangles).toBeLessThanOrEqual(segments);
    expect(build.triangles).toBeLessThanOrEqual(PER_ORGANELLE_TRIANGLE_BUDGET);

    build.dispose();
  });

  it('rebuilds identical geometry from the same seed and different geometry from another', () => {
    const first = buildVacuole();
    const second = buildVacuole();
    const other = buildVacuole({ seed: 'vacuole/v2' });

    expect(first.parts.map((part) => hashGeometryPositions(part.geometry))).toEqual(
      second.parts.map((part) => hashGeometryPositions(part.geometry)),
    );
    expect(first.parts.map((part) => hashGeometryPositions(part.geometry))).not.toEqual(
      other.parts.map((part) => hashGeometryPositions(part.geometry)),
    );

    first.dispose();
    second.dispose();
    other.dispose();
  });

  it('disposes the geometry it created', () => {
    const build = buildVacuole();
    const spy = vi.spyOn(build.parts[0]!.geometry, 'dispose');

    build.dispose();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
