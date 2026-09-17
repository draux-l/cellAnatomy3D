import { expect, test } from '@playwright/test';
import { rosterFor } from '../../src/catalog/cells';
import type { CellId } from '../../src/catalog/types';
import {
  boxOverlapPairs,
  boxesOutOfViewport,
  columnFlipCounts,
  crossingPairs,
  leaderStartsAtAnchor,
  minAdjacentGapPx,
} from '../../src/ui/annotations/layoutInvariants';
import { ANNOTATION_MIN_GAP_PX } from '../../src/ui/annotations/solver';
import { loadBaselines, writeBaselines, type AnnotationMatrixStep } from '../baselines';
import { VIEWPORT, capturePng, collectProblems, openFixture, readAnnotations } from '../harness';
import { nearestSubjectDistance } from '../metrics';

/**
 * The annotation layout matrix (task 4.19, spec `Annotation Layout Does Not Cross Or Overlap`).
 *
 * Five scenarios in the spec, and the design's rule is that all of them are **committed metrics
 * rather than eyeballs**. Each step of the matrix renders one URL — an orbit yaw crossed with a
 * disassembly value — reads the layout the layer actually wrote from `__cellDebug.annotations`, and
 * runs the same `layoutInvariants` functions the solver's unit tests use. There is no second
 * definition of "crossing" between the two.
 *
 * The anchor attachment check is deliberately independent: the mirror says where the layer *thinks*
 * the anchor is, so the assertion also samples the rendered frame and fails when a leader points at
 * empty space.
 *
 * Run with `UPDATE_BASELINES=1 npm run test:e2e` to re-record the committed matrix.
 */

const UPDATE = process.env.UPDATE_BASELINES === '1';

interface MatrixStep {
  cell: CellId;
  yaw: number;
  disassembly: number;
}

/**
 * The committed matrix: an orbit sweep crossed with disassembly steps.
 *
 * Deliberately compact — 15 page loads — because each step is a fresh deterministic render. The
 * plant cell gets its own sweep: its roster is larger (11 annotations against 8) and its cell body
 * is a different shape, so the two are not interchangeable.
 *
 * The yaw groups run **increasing**, because the hysteresis assertion reads the sweep as a slow
 * orbit: a step order that went back and forth across the centre would measure the fixture's step
 * order rather than the solver's stability.
 */
const MATRIX: readonly MatrixStep[] = (['animal', 'plant'] as const).flatMap((cell) =>
  [-40, 0, 40].flatMap((yaw) =>
    (cell === 'animal' ? [0, 57, 100] : [0, 57]).map((disassembly) => ({
      cell,
      yaw,
      disassembly,
    })),
  ),
);

/** How far a rendered pixel may sit from an anchor before the leader is pointing into space. */
const ANCHOR_SEARCH_RADIUS_PX = 26;

interface StepResult {
  step: MatrixStep;
  annotations: Awaited<ReturnType<typeof readAnnotations>>;
  buffer: Buffer;
}

async function measureStep(
  page: Parameters<typeof openFixture>[0],
  step: MatrixStep,
): Promise<StepResult> {
  await openFixture(page, 'disassembly', {
    value: String(step.disassembly),
    view: step.cell,
    yaw: String(step.yaw),
  });

  const buffer = await capturePng(page);
  const annotations = await readAnnotations(page);

  return { step, annotations, buffer };
}

test.describe('the annotation layout matrix', () => {
  test('holds every layout invariant at every orbit and disassembly step', async ({ page }) => {
    const problems = collectProblems(page);
    const results: StepResult[] = [];
    const recorded: AnnotationMatrixStep[] = [];
    const samples: { id: string; column: 'left' | 'right' }[] = [];

    for (const step of MATRIX) {
      const result = await measureStep(page, step);

      results.push(result);

      const layouts = result.annotations;

      // Every roster organelle is annotated — the spec's "annotated at rest" scenario, checked at
      // every step rather than only at rest.
      expect(
        layouts.length,
        `${step.cell} yaw ${step.yaw} disassembly ${step.disassembly}: annotation count`,
      ).toBe(rosterFor(step.cell).length);

      expect(crossingPairs(layouts), `crossings at ${JSON.stringify(step)}`).toEqual([]);
      expect(boxOverlapPairs(layouts), `box overlaps at ${JSON.stringify(step)}`).toEqual([]);
      expect(boxesOutOfViewport(layouts, VIEWPORT), `off-screen boxes at ${JSON.stringify(step)}`).toEqual([]);

      const gap = minAdjacentGapPx(layouts);

      expect(gap, `min gap at ${JSON.stringify(step)}`).toBeGreaterThanOrEqual(
        ANNOTATION_MIN_GAP_PX - 1e-9,
      );

      for (const layout of layouts) {
        expect(leaderStartsAtAnchor(layout), `${layout.id} leader origin`).toBe(true);
        // The precondition the horizontal-run shape depends on: the anchor is inboard of its column.
        const boxEdge =
          layout.column === 'left' ? layout.box.x + layout.box.width : layout.box.x;
        const clearance =
          layout.column === 'left' ? layout.anchor[0] - boxEdge : boxEdge - layout.anchor[0];

        expect(clearance, `${layout.id} anchor outside its column`).toBeGreaterThan(0);
        // Keyed by cell as well as id: the same organelle is annotated in both cells, and merging
        // them would manufacture flips that neither cell's sweep produced.
        samples.push({ id: `${step.cell}:${layout.id}`, column: layout.column });
      }

      recorded.push({
        cell: step.cell,
        yaw: step.yaw,
        disassembly: step.disassembly,
        annotations: layouts.length,
        minGapPx: gap,
        crossings: 0,
        overlaps: 0,
        offScreen: 0,
        elbowClearancePx: Number(
          Math.min(
            ...layouts.map((layout) => {
              const boxEdge =
                layout.column === 'left' ? layout.box.x + layout.box.width : layout.box.x;

              return layout.column === 'left'
                ? layout.anchor[0] - boxEdge
                : boxEdge - layout.anchor[0];
            }),
          ).toFixed(2),
        ),
        measuredAt: new Date().toISOString().slice(0, 10),
      });

      console.log(
        `[annotations:${step.cell}:yaw ${step.yaw}:dis ${step.disassembly}] ` +
          `${layouts.length} annotations, min gap ${gap}px, 0 crossings, 0 overlaps`,
      );
    }

    // Column hysteresis: over a monotone orbit sweep, no annotation may change column more than
    // once — the ratified ±5% band exists so a box straddling the centre does not thrash.
    const flips = columnFlipCounts(samples);
    const worstFlip = Math.max(0, ...Object.values(flips.flips));

    expect(worstFlip, `column flips per annotation ${JSON.stringify(flips.flips)}`).toBeLessThanOrEqual(1);
    console.log(`[annotations] column flips over the sweep: ${flips.total}`);

    expect(problems.messages).toEqual([]);

    if (UPDATE) {
      const baselines = loadBaselines();

      baselines.annotationMatrix = recorded;
      writeBaselines(baselines);
      console.log(`[annotations] matrix re-recorded: ${recorded.length} steps`);
    }
  });

  test('keeps every anchor attached to rendered cell pixels', async ({ page }) => {
    // Two steps are enough for the pixel probe: it is a per-anchor fact about the projection, and
    // the layout invariants above already cover every step. Rest and a fully separated cell are the
    // two extremes the spec names.
    for (const step of [
      { cell: 'animal' as const, yaw: 0, disassembly: 0 },
      { cell: 'animal' as const, yaw: 0, disassembly: 100 },
      { cell: 'plant' as const, yaw: 0, disassembly: 0 },
    ]) {
      const result = await measureStep(page, step);

      expect(result.annotations.length).toBeGreaterThan(0);

      for (const annotation of result.annotations) {
        const distance = nearestSubjectDistance(
          result.buffer,
          annotation.anchor[0],
          annotation.anchor[1],
          ANCHOR_SEARCH_RADIUS_PX,
        );

        expect(
          distance,
          `${annotation.id} anchor (${annotation.anchor.join(', ')}) at ${JSON.stringify(step)} ` +
            `points at empty space`,
        ).not.toBeNull();
      }

      console.log(
        `[anchors:${step.cell}:dis ${step.disassembly}] ${result.annotations.length} anchors land on ` +
          `rendered pixels within ${ANCHOR_SEARCH_RADIUS_PX}px`,
      );
    }
  });

  test('states occlusion instead of hiding it', async ({ page }) => {
    // The animal cell at rest: some anchors are behind another organelle's hit volume, and the
    // requirement is that those read as de-emphasized rather than disappearing.
    await openFixture(page, 'disassembly', { value: '0', view: 'animal' });
    const annotations = await readAnnotations(page);

    expect(annotations.length).toBeGreaterThan(0);

    const occluded = annotations.filter((annotation) => annotation.occluded);

    expect(occluded.length, 'no occluded anchor in the rest pose').toBeGreaterThan(0);
    expect(occluded.length).toBeLessThan(annotations.length);

    for (const annotation of annotations) {
      expect(annotation.opacity, `${annotation.id} ink opacity`).toBe(annotation.occluded ? 0.5 : 1);
    }

    // The whole annotation stays on screen: the ink is de-emphasized, the label is not removed.
    for (const annotation of occluded) {
      await expect(page.locator(`[data-annotation="${annotation.id}"]`)).toHaveCount(1);
    }

    console.log(
      `[occlusion] ${occluded.length}/${annotations.length} anchors occluded: ` +
        `${occluded.map((annotation) => annotation.id).join(', ')}`,
    );
  });
});
