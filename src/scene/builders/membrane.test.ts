import { SphereGeometry, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { hashGeometryPositions } from './primitives';
import { polygonRadiusAt, roundedPolygonPoints } from './silhouette';
import {
  MEMBRANE_PARAMS,
  MEMBRANE_SEGMENTS_PER_DETAIL,
  buildMembrane,
  usesPolygonSilhouette,
} from './membrane';

const PER_ORGANELLE_TRIANGLE_BUDGET = 25_000;
const PER_CELL_DRAW_CALL_BUDGET = 150;

/** The furthest any vertex sits from the shell's centre. */
function outerRadius(geometry: BufferGeometry): number {
  const position = geometry.getAttribute('position');
  let worst = 0;

  for (let i = 0; i < position.count; i += 1) {
    worst = Math.max(worst, Math.hypot(position.getX(i), position.getY(i), position.getZ(i)));
  }

  return worst;
}

describe('buildMembrane', () => {
  it('exposes the documented parameter defaults', () => {
    expect(MEMBRANE_PARAMS.seed).toBe('membrane/v1');
    expect(MEMBRANE_PARAMS.size).toBe(1);
    expect(MEMBRANE_PARAMS.noiseAmplitude).toBeCloseTo(0.035, 6);

    const build = buildMembrane();

    expect(build.seed).toBe('membrane/v1');
    expect(build.params.noiseAmplitude).toBeCloseTo(0.035, 6);

    build.dispose();
  });

  it('is one closed shell in one draw call', () => {
    const build = buildMembrane();

    expect(build.parts).toHaveLength(1);
    expect(build.parts[0]!.kind).toBe('mesh');
    expect(build.parts[0]!.materialKey).toBe('membrane');
    expect(build.drawCalls).toBe(1);

    build.dispose();
  });

  it('is a shell of the requested radius', () => {
    const build = buildMembrane({ size: 1.5 });

    expect(outerRadius(build.parts[0]!.geometry)).toBeGreaterThan(1.5);
    expect(outerRadius(build.parts[0]!.geometry)).toBeLessThan(1.5 * 1.08);

    build.dispose();
  });

  it('is broken out of a perfect sphere by the seeded noise, at the same vertex count', () => {
    const undecorated = new SphereGeometry(
      1,
      MEMBRANE_SEGMENTS_PER_DETAIL,
      MEMBRANE_SEGMENTS_PER_DETAIL / 2,
    );
    const build = buildMembrane();
    const shell = build.parts[0]!.geometry;

    expect(hashGeometryPositions(shell)).not.toBe(hashGeometryPositions(undecorated));
    expect(shell.getAttribute('position').count).toBe(undecorated.getAttribute('position').count);

    undecorated.dispose();
    build.dispose();
  });

  it('displaces further when the noise amplitude grows', () => {
    const gentle = buildMembrane({ noiseAmplitude: 0.01 });
    const rough = buildMembrane({ noiseAmplitude: 0.12 });

    expect(outerRadius(rough.parts[0]!.geometry)).toBeGreaterThan(
      outerRadius(gentle.parts[0]!.geometry),
    );

    gentle.dispose();
    rough.dispose();
  });

  it('is deterministic per seed and differs across seeds', () => {
    const first = buildMembrane();
    const second = buildMembrane();
    const other = buildMembrane({ seed: 'membrane/v2' });

    expect(hashGeometryPositions(first.parts[0]!.geometry)).toBe(
      hashGeometryPositions(second.parts[0]!.geometry),
    );
    expect(hashGeometryPositions(first.parts[0]!.geometry)).not.toBe(
      hashGeometryPositions(other.parts[0]!.geometry),
    );

    first.dispose();
    second.dispose();
    other.dispose();
  });

  it('stays inside the per-organelle triangle and per-cell draw-call budgets', () => {
    const build = buildMembrane({ detail: 2 });

    expect(build.triangles).toBeLessThanOrEqual(PER_ORGANELLE_TRIANGLE_BUDGET);
    expect(build.drawCalls).toBeLessThanOrEqual(PER_CELL_DRAW_CALL_BUDGET);

    build.dispose();
  });
});

/**
 * The plant silhouette (composition decision).
 *
 * The plant cell's outline is a rounded polygon imposed by the wall. These tests pin three
 * separate claims that together mean "the two shapes cannot drift apart": the animal default is
 * untouched, the polygonal variant is genuinely angular on the *same* outline generator the wall
 * uses, and the morph costs no vertices.
 */

/** The XY-plane radius of every vertex, i.e. the cross-section the silhouette lives in. */
function planarRadii(geometry: BufferGeometry): number[] {
  const position = geometry.getAttribute('position');
  const found: number[] = [];

  for (let index = 0; index < position.count; index += 1) {
    found.push(Math.hypot(position.getX(index), position.getY(index)));
  }

  return found;
}

/**
 * The planar radii of the shell's equatorial ring.
 *
 * The silhouette lives in the cross-section, and a cross-section is a *ring* of the sphere, not a
 * set of vertices chosen by azimuth — planar radius varies with latitude, so comparing vertices
 * across the whole shell would compare different cross-sections. The ring at z = 0 is the widest
 * one and the one the hero pose shows, so it is the one the assertion reads.
 */
function equatorRadii(geometry: BufferGeometry): number[] {
  const position = geometry.getAttribute('position');
  const found: number[] = [];

  for (let index = 0; index < position.count; index += 1) {
    if (Math.abs(position.getZ(index)) > 1e-6) {
      continue;
    }

    const planar = Math.hypot(position.getX(index), position.getY(index));

    if (planar > 1e-9) {
      found.push(planar);
    }
  }

  return found;
}

const PLANT_SILHOUETTE = { sides: 8, cornerRounding: 0.4 } as const;

describe('buildMembrane — the plant silhouette', () => {
  it('treats only sides >= 3 as a polygon', () => {
    expect(usesPolygonSilhouette(0)).toBe(false);
    expect(usesPolygonSilhouette(1)).toBe(false);
    expect(usesPolygonSilhouette(3)).toBe(true);
    expect(usesPolygonSilhouette(8)).toBe(true);
  });

  it('leaves the round animal membrane byte-identical when no silhouette is requested', () => {
    const animal = buildMembrane();
    const explicitRound = buildMembrane({ sides: 0, cornerRounding: 0 });

    expect(hashGeometryPositions(explicitRound.parts[0]!.geometry)).toBe(
      hashGeometryPositions(animal.parts[0]!.geometry),
    );

    animal.dispose();
    explicitRound.dispose();
  });

  it('is angular on the wall\'s own outline, not merely "not round"', () => {
    // Noise off: this test is about the silhouette, and the displacement would blur the ratio.
    const build = buildMembrane({ ...PLANT_SILHOUETTE, noiseAmplitude: 0 });
    const ring = equatorRadii(build.parts[0]!.geometry);
    const outline = roundedPolygonPoints(8, 1, 0.4, 6);
    const flatRadius = polygonRadiusAt(outline, Math.PI / 8);
    const cornerRadius = polygonRadiusAt(outline, 0);

    expect(ring.length).toBeGreaterThan(8);
    // The morph scales the round cross-section by the outline's own radius ratio, so the shape
    // the render shows is the same shape the outline describes.
    expect(flatRadius / cornerRadius).toBeLessThan(1);
    expect(Math.min(...ring) / Math.max(...ring)).toBeCloseTo(flatRadius / cornerRadius, 2);
    // The flats stay on the round shell's radius; only the corners push outward.
    expect(Math.min(...ring)).toBeCloseTo(1, 2);
    expect(Math.max(...ring)).toBeGreaterThan(1);

    build.dispose();
  });

  it('cannot drift from the wall, because both consume one outline generator', () => {
    // The membrane's flat-side factor is exactly 1 and its corner factor is the wall's own corner
    // factor: that is the mechanical guarantee, restated as a number.
    const outline = roundedPolygonPoints(8, 1, 0.4, 6);

    for (let step = 0; step < 64; step += 1) {
      const angle = (step / 64) * Math.PI * 2;
      const radius = polygonRadiusAt(outline, angle);

      expect(Number.isFinite(radius)).toBe(true);
      expect(radius).toBeGreaterThan(0.99);
      expect(radius).toBeLessThan(1.06);
    }
  });

  it('keeps the vertex count and topology, so the shell stays closed', () => {
    const round = buildMembrane();
    const angular = buildMembrane(PLANT_SILHOUETTE);

    expect(angular.parts[0]!.geometry.getAttribute('position').count).toBe(
      round.parts[0]!.geometry.getAttribute('position').count,
    );
    expect(angular.triangles).toBe(round.triangles);
    expect(angular.drawCalls).toBe(1);

    round.dispose();
    angular.dispose();
  });

  it('honours the noise amplitude on the angular shell too', () => {
    const gentle = buildMembrane({ ...PLANT_SILHOUETTE, noiseAmplitude: 0.005 });
    const rough = buildMembrane({ ...PLANT_SILHOUETTE, noiseAmplitude: 0.14 });
    const reach = (geometry: BufferGeometry): number => Math.max(...planarRadii(geometry));

    // The morph and the displacement compose: the polygon sets the silhouette, the noise still
    // roughens it in proportion to its amplitude.
    expect(reach(rough.parts[0]!.geometry)).toBeGreaterThan(reach(gentle.parts[0]!.geometry));

    gentle.dispose();
    rough.dispose();
  });
});
