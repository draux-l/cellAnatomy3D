import { describe, expect, it } from 'vitest';
import { buildCellWall } from './cell-wall';
import { buildChloroplast } from './chloroplast';
import { buildCytoplasm } from './cytoplasm';
import { buildMembrane } from './membrane';
import { buildMitochondrion } from './mitochondrion';
import { buildNucleus } from './nucleus';
import { countSurfaceBoundaryEdges, type OrganelleBuild } from './primitives';
import { buildVacuole } from './vacuole';

/**
 * Every boundary shell is a closed surface, and the renderer relies on that.
 *
 * `src/scene/materials.ts` renders the shells **single-sided**: `DoubleSide` on a transparent,
 * depth-write-free surface shades each covered pixel twice, which measured ~35% of the frame
 * (44.1 -> 59.5 fps p50 on the composed animal cell, `verify/perf-probe.mjs`).
 *
 * Dropping the back faces is only safe while the surface stays closed — the back faces of a closed
 * shell can never reach the silhouette, but the back faces of an *open* one can. This test is what
 * turns that precondition into something the build checks, so a future shell that is generated as an
 * open patch fails here instead of rendering a hole on screen.
 *
 * Closure is measured by vertex *position*, not by vertex index: a `SphereGeometry` duplicates its
 * wrap column and its poles, so the index-keyed `countBoundaryEdges` reports a sealed sphere as torn.
 */
describe('boundary shell closure', () => {
  const shells: [string, () => OrganelleBuild][] = [
    ['membrane', () => buildMembrane()],
    ['cytoplasm', () => buildCytoplasm()],
    ['nucleus', () => buildNucleus()],
    ['mitochondrion', () => buildMitochondrion()],
    ['chloroplast', () => buildChloroplast()],
    ['vacuole', () => buildVacuole()],
    ['cell-wall', () => buildCellWall()],
  ];

  /** The material keys `materials.ts` renders single-sided. */
  const SINGLE_SIDED_KEYS = [
    'outerMembrane',
    'membrane',
    'cytoplasm',
    'nuclearEnvelope',
    'chloroplast',
    'cellWall',
    'vacuole',
  ];

  const singleSidedParts = shells.flatMap(([label, build]) =>
    build()
      .parts.filter((part) => SINGLE_SIDED_KEYS.includes(part.materialKey))
      .map((part) => ({ label, part })),
  );

  it('covers exactly the seven shell surfaces', () => {
    // A vacuous test is worse than no test: if the builders above stopped producing these keys, the
    // closure assertions below would silently stop checking anything. Six is the roster today —
    // membrane, cytoplasm, nuclear envelope, mitochondrial outer membrane, chloroplast envelope,
    // vacuole, wall. A new shell is expected to fail here and update this number on purpose.
    expect(singleSidedParts.length).toBe(7);
  });

  it.each(singleSidedParts.map(({ label, part }) => [label, part.name, part] as const))(
    'renders %s/%s single-sided, so it must be a closed surface',
    (_label, _name, part) => {
      expect(countSurfaceBoundaryEdges(part.geometry)).toBe(0);
    },
  );
});
