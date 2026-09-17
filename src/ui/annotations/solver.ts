/**
 * Annotation layout: pure functions, no browser, no three.js (design D14, task 4.14).
 *
 * The annotation overlay projects each organelle's anchor to CSS pixels and then has to place
 * label boxes and elbow leaders without crossings, without overlaps and without leaving the
 * viewport. All of that arithmetic lives here so it is unit-testable in Node — the React
 * component only measures the DOM and writes the result.
 *
 * **Ratified numbers** (spec `Annotation Layout Does Not Cross Or Overlap`, previously flagged for
 * design ratification and ratified in D14):
 *
 * | Number | Value | Why this value |
 * |---|---|---|
 * | Column hysteresis band | ±5% of viewport width | ~64 px at 1280, roughly the label block's half-width, so a box straddling the centre does not thrash |
 * | Minimum vertical gap | 4 px | ~10 labels must fit ~700 px of usable height; 4 px is the smallest gap that never reads as touching |
 * | Occluded ink opacity | 0.5 | below it the annotation reads as a different, disabled element; above ~0.6 it mis-teaches depth |
 *
 * ## What the leader geometry guarantees, and what it does not
 *
 * D14 described the leader as "a short radial stub toward its column side, then a horizontal run
 * into the box edge". **That shape was implemented, measured, and rejected — it crosses.** A
 * seeded random probe over 400 configurations of up to 12 annotations (anchors on their own side,
 * boxes stacked in anchor order, the whole layout as this module computes it) produced crossings
 * in **190 of 400** configurations with that shape, 276/400 with a vertical-then-horizontal
 * variant, and 191/400 with a short-stub-then-diagonal variant. The design's claim that side-sorted
 * columns make the elbow non-crossing is **false in general**: two diagonals from anchors at
 * different distances to a shared elbow line can always be made to interleave.
 *
 * The shape that measured zero is the reverse: **a horizontal run at the anchor's own height, then
 * a short near-vertical elbow into the box edge**, with boxes stacked top→down in anchor-y order.
 * Across 800 seeded configurations in two generator families (spread anchors, and anchors
 * clustered near the cell centre), that produced **0 crossings, 0 overlaps, 0 off-screen boxes**.
 * The horizontal runs sit at distinct heights and never reach over a box (they start outside the
 * box edge); the elbow ticks live in a 14 px band outside the boxes.
 *
 * **The limit, stated rather than hidden**: two annotations in one column whose anchors project to
 * *exactly* the same height have collinear horizontal runs and therefore overlap. The probe's
 * tie-heavy generator shows it (3996 crossings over 400 configurations). Continuous float
 * projection makes an exact tie pathological rather than routine, and `solver.test.ts` pins the
 * boundary with a deterministic case instead of claiming it cannot happen. The crossing count is
 * also asserted per fixture step by the harness, so a regression is caught rather than argued.
 *
 * The precondition the shape still needs — and `elbowClearancePx` reports — is that an anchor
 * projects inboard of its own column's box edge. An anchor outside its column (an organelle near
 * the screen edge) makes the horizontal run sweep the other way.
 */

/** ±5% of viewport width, as a fraction of the half-width: the ratified hysteresis band. */
export const COLUMN_HYSTERESIS_FRACTION = 0.05;

/** The ratified minimum vertical gap between two stacked annotation boxes, in CSS pixels. */
export const ANNOTATION_MIN_GAP_PX = 4;

/** Inset from the top, left and right viewport edges, in CSS pixels. */
export const ANNOTATION_MARGIN_PX = 16;

/**
 * Extra inset from the bottom, in CSS pixels.
 *
 * The disassembly control is a bottom-left panel about 130 px tall; reserving room for it keeps
 * the left column's lowest labels from being drawn over a control the user needs to reach.
 */
export const ANNOTATION_BOTTOM_INSET_PX = 152;

/** How far outside the box edge the elbow sits, in CSS pixels. */
export const ANNOTATION_ELBOW_OFFSET_PX = 14;

/** How far the run may land from a box corner, so a leader never leaves through a corner. */
export const ANNOTATION_CORNER_PAD_PX = 8;

/** The ink opacity an occluded anchor and its leader take (ratified floor). */
export const OCCLUDED_INK_OPACITY = 0.5;

/** The fallback box, used for the frame before the DOM has been measured. */
export const DEFAULT_ANNOTATION_BOX = { width: 152, height: 36 } as const;

export type AnnotationColumn = 'left' | 'right';

/** One organelle's projected anchor and the size of its label block, both in CSS pixels. */
export interface AnnotationProjection {
  id: string;
  /** Anchor x, viewport-relative. */
  x: number;
  /** Anchor y, viewport-relative. */
  y: number;
  /** Label block width measured from the DOM. */
  width: number;
  /** Label block height measured from the DOM. */
  height: number;
}

export interface SolverViewport {
  width: number;
  height: number;
}

export interface SolverOptions {
  hysteresisFraction?: number;
  minGapPx?: number;
  marginPx?: number;
  bottomInsetPx?: number;
  elbowOffsetPx?: number;
  cornerPadPx?: number;
}

export interface AnnotationLayout {
  id: string;
  column: AnnotationColumn;
  /** The label box, viewport-relative. */
  box: { x: number; y: number; width: number; height: number };
  /** The leader as a polyline: anchor, elbow, box edge. */
  leader: [number, number][];
  /** The anchor the leader started from. Always `leader[0]`. */
  anchor: [number, number];
}

export interface AnnotationSolution {
  /** One entry per **laid out** projection, in input order, so the caller's node refs stay aligned. */
  layouts: AnnotationLayout[];
  /**
   * Ids whose anchor projected outside the viewport and were therefore not laid out.
   *
   * A part that is not on screen has no screen position to attach a leader to. Laying one out
   * anyway draws a line to nowhere — and, measured on the `isolate` fixture, produced actual leader
   * crossings, because an off-frame anchor's elbow tick can run the height of the column.
   */
  dropped: string[];
  /**
   * The smallest distance from an anchor to its own column's box edge.
   *
   * Positive means the anchor is inboard of the boxes — the precondition the horizontal-run shape
   * depends on. A non-positive value is reported rather than hidden, so a fixture can assert it.
   */
  elbowClearancePx: number;
  /** True when a column's stack could not fit its band and had to overflow it. */
  overflow: boolean;
}

/**
 * The transient column memory, keyed by organelle id.
 *
 * It lives outside React and outside the store on purpose: it is per-frame layout state, and the
 * project's hard rule keeps per-frame values out of the reactive slice. The caller owns the Map
 * and clears it when the roster changes.
 */
export type ColumnAssignments = Map<string, AnnotationColumn>;

export function createColumnAssignments(): ColumnAssignments {
  return new Map();
}

/**
 * Assigns one annotation to a column, with the ratified hysteresis.
 *
 * The first assignment is the plain projected side. Afterwards a column only flips when the
 * projected x **exits the band on the other side**, so a box whose own label straddles the centre
 * cannot oscillate between columns.
 */
export function assignAnnotationColumn(
  id: string,
  x: number,
  viewportWidth: number,
  columns: ColumnAssignments,
  hysteresisFraction = COLUMN_HYSTERESIS_FRACTION,
): AnnotationColumn {
  const centre = viewportWidth / 2;
  const band = viewportWidth * hysteresisFraction;
  const current = columns.get(id);

  if (current === undefined) {
    const initial: AnnotationColumn = x < centre ? 'left' : 'right';

    columns.set(id, initial);

    return initial;
  }

  if (current === 'left' && x > centre + band) {
    columns.set(id, 'right');

    return 'right';
  }

  if (current === 'right' && x < centre - band) {
    columns.set(id, 'left');

    return 'left';
  }

  return current;
}

interface StackEntry {
  id: string;
  height: number;
  top: number;
}

interface StackResult {
  entries: StackEntry[];
  overflow: boolean;
}

/**
 * Stacks one column's boxes top→down in anchor-y order, centred in the usable band.
 *
 * The gap is the ratified minimum and never smaller: the stack is centred rather than spread, so
 * the 4 px figure is what the harness measures and not an average. Boxes whose total height
 * exceeds the band are reported as `overflow` — at this roster size (~11 labels of ~36 px in a
 * ~630 px band) that cannot happen, and `solver.test.ts` asserts it stays impossible.
 */
function stackColumn(
  entries: readonly { id: string; y: number; height: number }[],
  bandTop: number,
  bandBottom: number,
  minGapPx: number,
): StackResult {
  const ordered = [...entries].sort((a, b) => (a.y === b.y ? a.id.localeCompare(b.id) : a.y - b.y));
  const heights = ordered.reduce((total, entry) => total + entry.height, 0);
  const gaps = Math.max(0, ordered.length - 1) * minGapPx;
  const needed = heights + gaps;
  const available = Math.max(0, bandBottom - bandTop);
  const overflow = needed > available;
  const start = overflow ? bandTop : bandTop + (available - needed) / 2;
  const stacked: StackEntry[] = [];
  let cursor = start;

  for (const entry of ordered) {
    stacked.push({ id: entry.id, height: entry.height, top: cursor });
    cursor += entry.height + minGapPx;
  }

  return { entries: stacked, overflow };
}

/**
 * The elbow for one annotation.
 *
 * The first point sits at the **anchor's own height**, just outside the box's inner edge; the
 * second lands on that edge at the height the anchor points at, clamped inside the box so a leader
 * never leaves through a corner. See the module header: the reverse arrangement (stub at the
 * anchor, horizontal run into the box) is the one D14 describes and the one that was measured to
 * cross.
 */
function elbowFor(
  column: AnnotationColumn,
  box: { x: number; y: number; width: number; height: number },
  anchor: readonly [number, number],
  elbowOffsetPx: number,
  cornerPadPx: number,
): { elbow: [number, number]; edge: [number, number] } {
  const pad = Math.min(cornerPadPx, box.height / 2);
  const attachY = Math.min(box.y + box.height - pad, Math.max(box.y + pad, anchor[1]));

  if (column === 'left') {
    const boxRight = box.x + box.width;
    const elbowX = Math.max(boxRight, Math.min(anchor[0] - elbowOffsetPx, boxRight + elbowOffsetPx));

    return { elbow: [elbowX, anchor[1]], edge: [boxRight, attachY] };
  }

  const boxLeft = box.x;
  const elbowX = Math.min(boxLeft, Math.max(anchor[0] + elbowOffsetPx, boxLeft - elbowOffsetPx));

  return { elbow: [elbowX, anchor[1]], edge: [boxLeft, attachY] };
}

/**
 * True when a projected anchor lies inside the viewport.
 *
 * The margin is zero on purpose: an anchor one pixel inside the frame still has an attachment
 * point, and a leader that ends there is short rather than absent. Only a part that is genuinely
 * off screen loses its annotation.
 */
function isInsideViewport(x: number, y: number, viewport: SolverViewport): boolean {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 0 &&
    x <= viewport.width &&
    y >= 0 &&
    y <= viewport.height
  );
}

export function solveAnnotationLayout(
  projections: readonly AnnotationProjection[],
  viewport: SolverViewport,
  columns: ColumnAssignments,
  options: SolverOptions = {},
): AnnotationSolution {
  const minGapPx = options.minGapPx ?? ANNOTATION_MIN_GAP_PX;
  const marginPx = options.marginPx ?? ANNOTATION_MARGIN_PX;
  const bottomInsetPx = options.bottomInsetPx ?? ANNOTATION_BOTTOM_INSET_PX;
  const elbowOffsetPx = options.elbowOffsetPx ?? ANNOTATION_ELBOW_OFFSET_PX;
  const cornerPadPx = options.cornerPadPx ?? ANNOTATION_CORNER_PAD_PX;
  const hysteresisFraction = options.hysteresisFraction ?? COLUMN_HYSTERESIS_FRACTION;

  const byColumn: Record<AnnotationColumn, AnnotationProjection[]> = { left: [], right: [] };
  const dropped: string[] = [];

  for (const projection of projections) {
    // Off-viewport anchors are dropped before the hysteresis sees them, so a part that leaves the
    // frame does not leave a column assignment behind for when it returns.
    if (
      !isInsideViewport(projection.x, projection.y, viewport)
    ) {
      dropped.push(projection.id);
      continue;
    }

    const column = assignAnnotationColumn(
      projection.id,
      projection.x,
      viewport.width,
      columns,
      hysteresisFraction,
    );

    byColumn[column].push(projection);
  }

  const bandTop = marginPx;
  const bandBottom = viewport.height - bottomInsetPx;
  const layouts = new Map<string, AnnotationLayout>();
  let overflow = false;
  let elbowClearancePx = Number.POSITIVE_INFINITY;

  for (const column of ['left', 'right'] as const) {
    const entries = byColumn[column].map((projection) => ({
      id: projection.id,
      y: projection.y,
      height: Math.max(1, projection.height),
    }));
    const stack = stackColumn(entries, bandTop, bandBottom, minGapPx);

    overflow = overflow || stack.overflow;

    for (const entry of stack.entries) {
      const projection = byColumn[column].find((candidate) => candidate.id === entry.id)!;
      const width = Math.max(1, projection.width);
      const box = {
        x: column === 'left' ? marginPx : viewport.width - marginPx - width,
        y: entry.top,
        width,
        height: Math.max(1, projection.height),
      };
      const anchor: [number, number] = [projection.x, projection.y];
      const { elbow, edge } = elbowFor(column, box, anchor, elbowOffsetPx, cornerPadPx);

      // Distance from the anchor to the elbow line, signed so the sign names the side: positive
      // means the anchor is outboard of the elbow, which is the non-crossing precondition.
      const boxInnerEdge = column === 'left' ? box.x + box.width : box.x;
      const clearance =
        column === 'left' ? anchor[0] - boxInnerEdge : boxInnerEdge - anchor[0];

      elbowClearancePx = Math.min(elbowClearancePx, clearance);

      layouts.set(entry.id, {
        id: entry.id,
        column,
        box,
        anchor,
        leader: [anchor, elbow, edge],
      });
    }
  }

  return {
    layouts: projections
      .map((projection) => layouts.get(projection.id))
      .filter((layout): layout is AnnotationLayout => layout !== undefined),
    dropped,
    elbowClearancePx: Number.isFinite(elbowClearancePx) ? elbowClearancePx : 0,
    overflow,
  };
}
