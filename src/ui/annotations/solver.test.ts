import { describe, expect, it } from 'vitest';
import {
  ANNOTATION_BOTTOM_INSET_PX,
  ANNOTATION_MARGIN_PX,
  ANNOTATION_MIN_GAP_PX,
  COLUMN_HYSTERESIS_FRACTION,
  DEFAULT_ANNOTATION_BOX,
  assignAnnotationColumn,
  createColumnAssignments,
  solveAnnotationLayout,
  type AnnotationProjection,
} from './solver';
import {
  boxOverlapPairs,
  boxesOutOfViewport,
  columnFlipCounts,
  crossingPairs,
  leaderSegments,
  leaderStartsAtAnchor,
  minAdjacentGapPx,
  segmentsIntersect,
} from './layoutInvariants';

/**
 * The layout solver (task 4.14, spec `Annotation Layout Does Not Cross Or Overlap`).
 *
 * Everything here runs in Node with no browser and no three.js. The spec's four invariants are
 * asserted over a synthetic projection matrix **and** over a seeded random sample, because a
 * handful of hand-written cases cannot show that a layout property holds in general.
 *
 * The last test in the solve block is the honest boundary: the non-crossing property depends on
 * every anchor sitting inboard of its own column, and the solver reports that clearance so the
 * dependency is measured rather than assumed.
 */

const VIEWPORT = { width: 1280, height: 800 };
const CENTRE_X = VIEWPORT.width / 2;
const BOX = { width: DEFAULT_ANNOTATION_BOX.width, height: DEFAULT_ANNOTATION_BOX.height };

function projection(id: string, x: number, y: number, box = BOX): AnnotationProjection {
  return { id, x, y, width: box.width, height: box.height };
}

/** Deterministic RNG so a failure is reproducible from the seed alone (no test dependency). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('assignAnnotationColumn', () => {
  it('assigns by projected side on first sight', () => {
    const columns = createColumnAssignments();

    expect(assignAnnotationColumn('a', CENTRE_X - 1, VIEWPORT.width, columns)).toBe('left');
    expect(assignAnnotationColumn('b', CENTRE_X + 1, VIEWPORT.width, columns)).toBe('right');
  });

  it('holds its column while the anchor sits inside the hysteresis band', () => {
    const columns = createColumnAssignments();
    const band = VIEWPORT.width * COLUMN_HYSTERESIS_FRACTION;

    columns.set('a', 'left');

    // The whole band, both sides of the centre: no flip anywhere inside it.
    expect(assignAnnotationColumn('a', CENTRE_X + band - 1, VIEWPORT.width, columns)).toBe('left');
    expect(assignAnnotationColumn('a', CENTRE_X, VIEWPORT.width, columns)).toBe('left');
    expect(assignAnnotationColumn('a', CENTRE_X - band - 1, VIEWPORT.width, columns)).toBe('left');
  });

  it('flips once the anchor exits the band on the other side', () => {
    const columns = createColumnAssignments();
    const band = VIEWPORT.width * COLUMN_HYSTERESIS_FRACTION;

    columns.set('a', 'left');
    columns.set('b', 'right');

    expect(assignAnnotationColumn('a', CENTRE_X + band + 1, VIEWPORT.width, columns)).toBe('right');
    expect(assignAnnotationColumn('b', CENTRE_X - band - 1, VIEWPORT.width, columns)).toBe('left');
  });

  it('flips at most once across a slow crossing of the centre', () => {
    const columns = createColumnAssignments();
    const samples: { id: string; column: 'left' | 'right' }[] = [];

    for (let x = 300; x <= 1000; x += 2) {
      samples.push({ id: 'nucleus', column: assignAnnotationColumn('nucleus', x, VIEWPORT.width, columns) });
    }

    expect(columnFlipCounts(samples).flips['nucleus']).toBe(1);
  });

  it('does not flip while the anchor jitters inside one label width of the centre', () => {
    const columns = createColumnAssignments();
    const samples: { id: string; column: 'left' | 'right' }[] = [];
    const jitter = [520, 610, 560, 630, 545, 600, 515];

    for (const x of jitter) {
      samples.push({ id: 'er', column: assignAnnotationColumn('er', x, VIEWPORT.width, columns) });
    }

    expect(columnFlipCounts(samples).total).toBe(0);
  });
});

describe('solveAnnotationLayout', () => {
  it('returns one layout per projection, in input order', () => {
    const columns = createColumnAssignments();
    const projections = [
      projection('a', 400, 200),
      projection('b', 900, 300),
      projection('c', 500, 400),
    ];
    const solution = solveAnnotationLayout(projections, VIEWPORT, columns);

    expect(solution.layouts.map((layout) => layout.id)).toEqual(['a', 'b', 'c']);
  });

  it('stacks a column with exactly the ratified minimum gap and no overlap', () => {
    const columns = createColumnAssignments();
    const projections = Array.from({ length: 6 }, (_, index) =>
      projection(`organelle-${index}`, 400, 100 + index * 8),
    );
    const solution = solveAnnotationLayout(projections, VIEWPORT, columns);

    expect(boxOverlapPairs(solution.layouts)).toEqual([]);
    expect(minAdjacentGapPx(solution.layouts)).toBe(ANNOTATION_MIN_GAP_PX);
    expect(solution.overflow).toBe(false);
  });

  it('keeps every box inside the viewport and clear of the bottom control panel', () => {
    const columns = createColumnAssignments();
    const projections = Array.from({ length: 11 }, (_, index) =>
      projection(`organelle-${index}`, index % 2 === 0 ? 400 : 900, 20 + index * 60),
    );
    const solution = solveAnnotationLayout(projections, VIEWPORT, columns);
    const lowest = Math.max(...solution.layouts.map((layout) => layout.box.y + layout.box.height));

    expect(boxesOutOfViewport(solution.layouts, VIEWPORT)).toEqual([]);
    expect(lowest).toBeLessThanOrEqual(VIEWPORT.height - ANNOTATION_BOTTOM_INSET_PX);
    expect(solution.layouts.every((layout, index) => layout.id === projections[index]!.id)).toBe(true);
  });

  it('attaches each leader to its own anchor and ends it on its own box edge', () => {
    const columns = createColumnAssignments();
    const projections = [
      projection('nucleus', 520, 180),
      projection('mitochondrion', 760, 420),
    ];
    const solution = solveAnnotationLayout(projections, VIEWPORT, columns);

    for (const layout of solution.layouts) {
      const edge = layout.leader[2]!;
      const boxEdge = layout.column === 'left' ? layout.box.x + layout.box.width : layout.box.x;

      expect(layout.leader).toHaveLength(3);
      expect(layout.leader[0]).toEqual([layout.anchor[0], layout.anchor[1]]);
      // The first segment is the horizontal run: it leaves at the anchor's own height.
      expect(layout.leader[1]![1]).toBe(layout.anchor[1]);
      expect(edge[0]).toBeCloseTo(boxEdge, 6);
      expect(edge[1]).toBeGreaterThanOrEqual(layout.box.y);
      expect(edge[1]).toBeLessThanOrEqual(layout.box.y + layout.box.height);
    }
  });

  it('places every annotation in the column its own anchor projected to', () => {
    const columns = createColumnAssignments();
    const projections = [
      projection('far-left', 60, 200),
      projection('left', 500, 300),
      projection('right', 800, 400),
      projection('far-right', 1240, 500),
    ];
    const solution = solveAnnotationLayout(projections, VIEWPORT, columns);

    for (const layout of solution.layouts) {
      const expected = layout.anchor[0] < CENTRE_X ? 'left' : 'right';

      expect(layout.column).toBe(expected);
      // A left box is flush to the left margin, a right box to the right one.
      expect(layout.column === 'left' ? layout.box.x : layout.box.x + layout.box.width).toBe(
        layout.column === 'left' ? ANNOTATION_MARGIN_PX : VIEWPORT.width - ANNOTATION_MARGIN_PX,
      );
    }
  });

  it('is deterministic: the same input and the same memory give the same layout', () => {
    const projections = Array.from({ length: 7 }, (_, index) =>
      projection(`organelle-${index}`, 300 + index * 110, 80 + index * 70),
    );
    const first = solveAnnotationLayout(projections, VIEWPORT, createColumnAssignments());
    const second = solveAnnotationLayout(projections, VIEWPORT, createColumnAssignments());

    expect(second.layouts).toEqual(first.layouts);
  });

  it('keeps zero crossings, zero overlaps, the minimum gap and every box on screen over a seeded random sample', () => {
    // 2000 configurations of 2–13 annotations in two generator families: anchors spread across the
    // side they belong to, and anchors clustered near the cell centre (the worst case for stacking,
    // because the boxes are then far from where their anchors project). Both families are the
    // evidence for the module header's crossing claim.
    let checked = 0;
    let worstGap = Number.POSITIVE_INFINITY;

    for (const family of ['spread', 'clustered'] as const) {
      for (let seed = 1; seed <= 1000; seed += 1) {
        const random = mulberry32(seed);
        const count = 2 + Math.floor(random() * 12);
        const projections = Array.from({ length: count }, (_, index) => {
          const left = random() < 0.5;
          const x =
            family === 'spread'
              ? left
                ? 260 + random() * 370
                : 660 + random() * 370
              : left
                ? 400 + random() * 220
                : 680 + random() * 220;
          const y = family === 'spread' ? 40 + random() * 700 : 320 + random() * 140;

          return projection(`organelle-${index}`, x, y);
        });
        const solution = solveAnnotationLayout(projections, VIEWPORT, createColumnAssignments());

        expect(crossingPairs(solution.layouts), `${family} seed ${seed} crossings`).toEqual([]);
        expect(boxOverlapPairs(solution.layouts), `${family} seed ${seed} overlaps`).toEqual([]);
        expect(boxesOutOfViewport(solution.layouts, VIEWPORT), `${family} seed ${seed} off screen`).toEqual([]);
        expect(solution.overflow, `${family} seed ${seed} overflow`).toBe(false);
        expect(solution.elbowClearancePx, `${family} seed ${seed} clearance`).toBeGreaterThan(0);

        const gap = minAdjacentGapPx(solution.layouts);

        if (gap !== null) {
          worstGap = Math.min(worstGap, gap);
        }

        checked += count;
      }
    }

    expect(checked).toBeGreaterThan(10_000);
    expect(worstGap).toBeGreaterThanOrEqual(ANNOTATION_MIN_GAP_PX - 1e-9);
  });

  /**
   * The boundary of the crossing claim, pinned rather than papered over.
   *
   * The horizontal run sits at the anchor's own height, so two annotations in one column whose
   * anchors project to *the same* height have collinear runs and overlap. Float projection makes
   * that pathological rather than routine, but it is a real limit of the shape that measured zero
   * crossings everywhere else, and a test that states it is worth more than a comment claiming it
   * away.
   */
  it('does not claim more than it proves: collinear runs at an identical anchor height overlap', () => {
    const columns = createColumnAssignments();
    const solution = solveAnnotationLayout(
      [projection('a', 400, 300), projection('b', 500, 300)],
      VIEWPORT,
      columns,
    );

    expect(solution.layouts.map((layout) => layout.column)).toEqual(['left', 'left']);
    // The metric reports segment pairs (it does not dedupe by owner), so this is a count of
    // crossings rather than a list of distinct annotations — which is what the harness asserts on.
    expect(crossingPairs(solution.layouts).length).toBeGreaterThan(0);
    expect(new Set(crossingPairs(solution.layouts).map((pair) => `${pair.a}:${pair.b}`))).toEqual(
      new Set(['a:b']),
    );

    // Two pixels of separation is enough for the metric to pass, which is why the real fixtures
    // (whose anchors differ by scene-unit offsets) are unaffected.
    const separated = solveAnnotationLayout(
      [projection('a', 400, 300), projection('b', 500, 302)],
      VIEWPORT,
      createColumnAssignments(),
    );

    expect(crossingPairs(separated.layouts)).toEqual([]);
  });

  it('reports the clearance the horizontal run depends on', () => {
    const columns = createColumnAssignments();

    // Every anchor inboard of its column's box edge: positive clearance.
    const clear = solveAnnotationLayout(
      [projection('a', 400, 100), projection('b', 900, 200)],
      VIEWPORT,
      columns,
    );

    expect(clear.elbowClearancePx).toBeGreaterThan(0);

    // An anchor projected outside its own column (an organelle at the screen edge): the solver
    // still lays it out, and reports the non-positive clearance instead of pretending the
    // precondition holds. The harness asserts this value per fixture step rather than assuming it.
    const degenerate = solveAnnotationLayout(
      [projection('edge', 4, 100), projection('b', 900, 200)],
      VIEWPORT,
      createColumnAssignments(),
    );

    expect(degenerate.elbowClearancePx).toBeLessThanOrEqual(0);
  });
});

describe('layoutInvariants', () => {
  it('detects a proper crossing, a T-junction and a collinear overlap', () => {
    expect(segmentsIntersect([0, 0], [10, 10], [0, 10], [10, 0])).toBe(true);
    expect(segmentsIntersect([0, 0], [10, 0], [5, 0], [5, 10])).toBe(true);
    expect(segmentsIntersect([0, 0], [10, 0], [4, 0], [6, 0])).toBe(true);
    expect(segmentsIntersect([0, 0], [10, 0], [0, 5], [10, 5])).toBe(false);
    expect(segmentsIntersect([0, 0], [10, 0], [10, 0], [20, 0])).toBe(true);
    expect(segmentsIntersect([0, 0], [10, 0], [11, 0], [20, 0])).toBe(false);
  });

  it('does not count two segments of one annotation as crossing each other', () => {
    const layout = {
      id: 'a',
      column: 'left' as const,
      box: { x: 16, y: 100, width: 152, height: 36 },
      leader: [
        [400, 200],
        [182, 118],
        [168, 118],
      ] as [number, number][],
    };

    expect(leaderSegments([layout])).toHaveLength(2);
    expect(crossingPairs([layout])).toEqual([]);
  });

  it('names the annotations whose leaders cross', () => {
    const first = {
      id: 'a',
      column: 'left' as const,
      box: { x: 16, y: 100, width: 152, height: 36 },
      leader: [
        [400, 100],
        [168, 100],
      ] as [number, number][],
    };
    const second = {
      id: 'b',
      column: 'left' as const,
      box: { x: 16, y: 300, width: 152, height: 36 },
      leader: [
        [400, 300],
        [168, 300],
        [240, 100],
      ] as [number, number][],
    };

    expect(crossingPairs([first, second])).toEqual([{ a: 'a', b: 'b' }]);
  });

  it('detects an overlap and a below-minimum gap', () => {
    const overlapping = [
      {
        id: 'a',
        column: 'left' as const,
        box: { x: 16, y: 100, width: 152, height: 36 },
        leader: [[400, 100]] as [number, number][],
      },
      {
        id: 'b',
        column: 'left' as const,
        box: { x: 16, y: 130, width: 152, height: 36 },
        leader: [[400, 200]] as [number, number][],
      },
    ];

    expect(boxOverlapPairs(overlapping)).toEqual([{ a: 'a', b: 'b' }]);
    expect(minAdjacentGapPx(overlapping)).toBe(-6);

    const touching = [
      { ...overlapping[0]!, box: { x: 16, y: 100, width: 152, height: 36 } },
      { ...overlapping[1]!, box: { x: 16, y: 138, width: 152, height: 36 } },
    ];

    expect(boxOverlapPairs(touching)).toEqual([]);
    expect(minAdjacentGapPx(touching)).toBe(2);
  });

  it('names an off-screen box and reports no violations for a placed box', () => {
    const inside = [
      {
        id: 'a',
        column: 'right' as const,
        box: { x: 1112, y: 100, width: 152, height: 36 },
        leader: [[900, 100]] as [number, number][],
      },
    ];
    const outside = [{ ...inside[0]!, box: { x: 1200, y: 100, width: 152, height: 36 } }];

    expect(boxesOutOfViewport(inside, VIEWPORT)).toEqual([]);
    expect(boxesOutOfViewport(outside, VIEWPORT)).toEqual(['a']);
  });

  it('counts column flips per annotation and holds the leader origin to its anchor', () => {
    const samples = [
      { id: 'a', column: 'left' as const },
      { id: 'a', column: 'left' as const },
      { id: 'a', column: 'right' as const },
      { id: 'b', column: 'right' as const },
    ];
    const counts = columnFlipCounts(samples);

    expect(counts.total).toBe(1);
    expect(counts.flips).toEqual({ a: 1 });

    expect(
      leaderStartsAtAnchor({
        id: 'a',
        column: 'left',
        box: { x: 0, y: 0, width: 1, height: 1 },
        leader: [
          [10, 20],
          [1, 20],
        ],
        anchor: [10, 20],
      }),
    ).toBe(true);

    expect(
      leaderStartsAtAnchor({
        id: 'a',
        column: 'left',
        box: { x: 0, y: 0, width: 1, height: 1 },
        leader: [
          [11, 20],
          [1, 20],
        ],
        anchor: [10, 20],
      }),
    ).toBe(false);
  });
});
