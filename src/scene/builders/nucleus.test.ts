import { describe, expect, it } from 'vitest';
import { countBoundaryEdges, hashGeometryPositions, hashPart } from './primitives';
import {
  NUCLEUS_NUCLEOLUS_OFFSET_RATIO,
  NUCLEUS_NUCLEOLUS_RADIUS_RATIO,
  NUCLEUS_PARAMS,
  buildNucleus,
  nucleolusOffset,
} from './nucleus';

const PER_ORGANELLE_TRIANGLE_BUDGET = 25_000;
const PER_CELL_DRAW_CALL_BUDGET = 150;

describe('nucleolusOffset', () => {
  it('is a clearly separated centre, not a subtle bump', () => {
    const offset = nucleolusOffset(1);

    expect(offset.length()).toBeCloseTo(NUCLEUS_NUCLEOLUS_OFFSET_RATIO, 6);
    expect(offset.length()).toBeGreaterThan(0.4);
  });

  it('leaves the nucleolus fully inside the envelope', () => {
    // offset + nucleolus radius (+ its displacement budget) must stay inside the envelope.
    expect(NUCLEUS_NUCLEOLUS_OFFSET_RATIO + NUCLEUS_NUCLEOLUS_RADIUS_RATIO * 1.12).toBeLessThan(1);
  });
});

describe('buildNucleus', () => {
  it('exposes the documented parameter defaults', () => {
    expect(NUCLEUS_PARAMS.seed).toBe('nucleus/v1');
    expect(NUCLEUS_PARAMS.poreCount).toBe(48);

    const build = buildNucleus();

    expect(build.params.poreCount).toBe(48);

    build.dispose();
  });

  it('separates envelope, nucleolus and pores into three isolatable layers', () => {
    const build = buildNucleus();
    const names = build.parts.map((part) => part.name);

    expect(names).toEqual(['nuclear-envelope', 'nucleolus', 'nuclear-pores']);
    expect(build.drawCalls).toBe(3);

    build.dispose();
  });

  it('draws every pore in exactly one instanced draw call', () => {
    const build = buildNucleus({ poreCount: 64 });
    const pores = build.parts.find((part) => part.name === 'nuclear-pores')!;

    expect(pores.kind).toBe('instanced');
    expect(build.parts.filter((part) => part.materialKey === 'nuclearPore')).toHaveLength(1);

    if (pores.kind === 'instanced') {
      expect(pores.instanceCount).toBe(64);
      expect(pores.matrices.length).toBe(64 * 16);
    }

    build.dispose();
  });

  it('omits the pore layer entirely when no pores are asked for', () => {
    const build = buildNucleus({ poreCount: 0 });

    expect(build.parts).toHaveLength(2);
    expect(build.drawCalls).toBe(2);

    build.dispose();
  });

  it('keeps the nucleolus inside the envelope', () => {
    const build = buildNucleus({ size: 1 });
    const envelope = build.parts[0]!.geometry;
    const nucleolus = build.parts[1]!.geometry;

    envelope.computeBoundingSphere();
    nucleolus.computeBoundingSphere();

    const envelopeSphere = envelope.boundingSphere!;
    const nucleolusSphere = nucleolus.boundingSphere!;

    expect(nucleolusSphere.center.length() + nucleolusSphere.radius).toBeLessThan(
      envelopeSphere.radius,
    );

    build.dispose();
  });

  it('makes the nucleolus big enough to read through the envelope', () => {
    const build = buildNucleus({ size: 1 });
    const envelope = build.parts[0]!.geometry;
    const nucleolus = build.parts[1]!.geometry;

    envelope.computeBoundingSphere();
    nucleolus.computeBoundingSphere();

    const ratio =
      nucleolus.boundingSphere!.radius / envelope.boundingSphere!.radius;

    expect(ratio).toBeGreaterThan(NUCLEUS_NUCLEOLUS_RADIUS_RATIO);
    expect(ratio).toBeLessThan(0.55);

    build.dispose();
  });

  it('places every pore on the envelope surface', () => {
    const build = buildNucleus({ size: 1, poreCount: 12 });
    const envelope = build.parts[0]!.geometry;
    const pores = build.parts[2]!;

    envelope.computeBoundingSphere();
    const radius = envelope.boundingSphere!.radius;

    if (pores.kind !== 'instanced') {
      throw new Error('expected an instanced pore part');
    }

    for (let index = 0; index < pores.instanceCount; index += 1) {
      const offset = index * 16;
      const x = pores.matrices[offset + 12]!;
      const y = pores.matrices[offset + 13]!;
      const z = pores.matrices[offset + 14]!;

      expect(Math.hypot(x, y, z)).toBeCloseTo(radius, 1);
    }

    build.dispose();
  });

  it('makes the nucleolus a closed, smooth body rather than a torn one', () => {
    const build = buildNucleus();
    const nucleolus = build.parts[1]!;
    const { boundary, nonManifold } = countBoundaryEdges(nucleolus.geometry);

    // The envelope is a revolved profile, so its poles are seams by construction; the nucleolus
    // is a welded polyhedron and must be closed, or the displacement tears cracks into it.
    expect(boundary).toBe(0);
    expect(nonManifold).toBe(0);

    build.dispose();
  });

  it('rebuilds identical geometry and identical pore transforms from one seed', () => {
    const first = buildNucleus();
    const second = buildNucleus();

    expect(first.parts.map(hashPart)).toEqual(second.parts.map(hashPart));

    first.dispose();
    second.dispose();
  });

  it('rebuilds different geometry from a different seed', () => {
    const first = buildNucleus();
    const second = buildNucleus({ seed: 'nucleus/v2' });

    expect(hashGeometryPositions(first.parts[0]!.geometry)).not.toBe(
      hashGeometryPositions(second.parts[0]!.geometry),
    );
    expect(first.parts.map(hashPart)).not.toEqual(second.parts.map(hashPart));

    first.dispose();
    second.dispose();
  });

  it('stays inside the per-organelle triangle and per-cell draw-call budgets', () => {
    const build = buildNucleus();

    expect(build.triangles).toBeLessThanOrEqual(PER_ORGANELLE_TRIANGLE_BUDGET);
    expect(build.drawCalls).toBeLessThanOrEqual(PER_CELL_DRAW_CALL_BUDGET);

    build.dispose();
  });
});
