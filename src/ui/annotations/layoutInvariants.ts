/**
 * Annotation layout invariants as pure measurements (task 4.14 / 4.19, design D17).
 *
 * The spec states four layout invariants — no leader crossings, no box overlaps, a minimum gap
 * between adjacent boxes, and nothing off screen — and the design's point is that they are
 * **committed metrics, not eyeballs**. This module is the measuring half: it takes the layout the
 * annotation layer wrote (or the mirror `__cellDebug.annotations` exposes) and reports violations.
 *
 * Nothing here imports three.js or touches the DOM, so the same functions run in the solver's unit
 * tests and inside the Playwright harness. They are deliberately strict: a shared endpoint counts
 * as an ending, but a T-junction and a collinear overlap both count as crossings, because that is
 * what a reader sees.
 */

export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The minimal shape these functions need. `AnnotationLayout` and the debug mirror both satisfy it. */
export interface LayoutLike {
  id: string;
  column: 'left' | 'right';
  box: LayoutBox;
  leader: [number, number][];
  /** Present on the debug mirror; the layer reports it separately from `leader`. */
  anchor?: [number, number];
}

export interface Segment {
  ownerId: string;
  index: number;
  a: [number, number];
  b: [number, number];
}

export interface SegmentPair {
  a: string;
  b: string;
}

const EPSILON = 1e-6;

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function within(value: number, endA: number, endB: number): boolean {
  return (
    value >= Math.min(endA, endB) - EPSILON && value <= Math.max(endA, endB) + EPSILON
  );
}

/** True when the point lies on the closed segment. */
function pointOnSegment(point: [number, number], a: [number, number], b: [number, number]): boolean {
  const d = cross(b[0] - a[0], b[1] - a[1], point[0] - a[0], point[1] - a[1]);

  return (
    Math.abs(d) <= EPSILON && within(point[0], a[0], b[0]) && within(point[1], a[1], b[1])
  );
}

/**
 * True when two segments meet anywhere.
 *
 * Handles the two cases a diagram reader calls a crossing and a naive orientation test misses: a
 * T-junction (an endpoint lying on the other segment's interior) and a collinear overlap.
 */
export function segmentsIntersect(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number],
): boolean {
  const d1 = cross(b2[0] - b1[0], b2[1] - b1[1], a1[0] - b1[0], a1[1] - b1[1]);
  const d2 = cross(b2[0] - b1[0], b2[1] - b1[1], a2[0] - b1[0], a2[1] - b1[1]);
  const d3 = cross(a2[0] - a1[0], a2[1] - a1[1], b1[0] - a1[0], b1[1] - a1[1]);
  const d4 = cross(a2[0] - a1[0], a2[1] - a1[1], b2[0] - a1[0], b2[1] - a1[1]);
  const straddles = (left: number, right: number): boolean =>
    (left > EPSILON && right < -EPSILON) || (left < -EPSILON && right > EPSILON);

  if (straddles(d1, d2) && straddles(d3, d4)) {
    return true;
  }

  return (
    pointOnSegment(a1, b1, b2) ||
    pointOnSegment(a2, b1, b2) ||
    pointOnSegment(b1, a1, a2) ||
    pointOnSegment(b2, a1, a2)
  );
}

function segmentLength(segment: Segment): number {
  return Math.hypot(segment.b[0] - segment.a[0], segment.b[1] - segment.a[1]);
}

/** Every leader's non-degenerate segments, tagged with the annotation that owns them. */
export function leaderSegments(layouts: readonly LayoutLike[]): Segment[] {
  const segments: Segment[] = [];

  for (const layout of layouts) {
    for (let index = 1; index < layout.leader.length; index += 1) {
      const segment: Segment = {
        ownerId: layout.id,
        index: index - 1,
        a: layout.leader[index - 1]!,
        b: layout.leader[index]!,
      };

      // A degenerate segment (an anchor sitting on its own elbow line) is a point, not a line, and
      // cannot cross anything. Filtering it keeps the metric about what is drawn.
      if (segmentLength(segment) > EPSILON) {
        segments.push(segment);
      }
    }
  }

  return segments;
}

/**
 * Every pair of segments belonging to **different** annotations that meet.
 *
 * Segments of one annotation share their elbow by construction, so pairs within one owner are not
 * crossings — the polyline is connected on purpose.
 */
export function crossingPairs(layouts: readonly LayoutLike[]): SegmentPair[] {
  const segments = leaderSegments(layouts);
  const crossings: SegmentPair[] = [];

  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const first = segments[i]!;
      const second = segments[j]!;

      if (first.ownerId === second.ownerId) {
        continue;
      }

      if (segmentsIntersect(first.a, first.b, second.a, second.b)) {
        crossings.push({ a: first.ownerId, b: second.ownerId });
      }
    }
  }

  return crossings;
}

function boxesOverlap(first: LayoutBox, second: LayoutBox, tolerance = 0): boolean {
  return (
    first.x < second.x + second.width - tolerance &&
    second.x < first.x + first.width - tolerance &&
    first.y < second.y + second.height - tolerance &&
    second.y < first.y + first.height - tolerance
  );
}

/** Every pair of label boxes that share area. */
export function boxOverlapPairs(layouts: readonly LayoutLike[]): SegmentPair[] {
  const overlaps: SegmentPair[] = [];

  for (let i = 0; i < layouts.length; i += 1) {
    for (let j = i + 1; j < layouts.length; j += 1) {
      if (boxesOverlap(layouts[i]!.box, layouts[j]!.box)) {
        overlaps.push({ a: layouts[i]!.id, b: layouts[j]!.id });
      }
    }
  }

  return overlaps;
}

/**
 * The smallest vertical gap between two boxes adjacent within one column.
 *
 * `null` when a column holds fewer than two boxes and there is no gap to measure. Columns are
 * measured separately because the gap invariant is about a reader scanning down one stack.
 */
export function minAdjacentGapPx(layouts: readonly LayoutLike[]): number | null {
  let minimum: number | null = null;

  for (const column of ['left', 'right'] as const) {
    const boxes = layouts
      .filter((layout) => layout.column === column)
      .map((layout) => layout.box)
      .sort((a, b) => a.y - b.y);

    for (let index = 1; index < boxes.length; index += 1) {
      const gap = boxes[index]!.y - (boxes[index - 1]!.y + boxes[index - 1]!.height);

      minimum = minimum === null ? gap : Math.min(minimum, gap);
    }
  }

  return minimum;
}

/** Ids of boxes that are not fully inside the viewport. */
export function boxesOutOfViewport(
  layouts: readonly LayoutLike[],
  viewport: { width: number; height: number },
  tolerance = 0.5,
): string[] {
  return layouts
    .filter(
      (layout) =>
        layout.box.x < -tolerance ||
        layout.box.y < -tolerance ||
        layout.box.x + layout.box.width > viewport.width + tolerance ||
        layout.box.y + layout.box.height > viewport.height + tolerance,
    )
    .map((layout) => layout.id);
}

export interface ColumnSample {
  id: string;
  column: 'left' | 'right';
}

/**
 * How many times each annotation changed column across an ordered sequence of observations.
 *
 * The spec's hysteresis scenario is "does not flip repeatedly", so this counts flips per id and
 * returns the worst one, plus a per-id breakdown for the log.
 */
export function columnFlipCounts(samples: readonly ColumnSample[]): {
  total: number;
  flips: Record<string, number>;
} {
  const last = new Map<string, 'left' | 'right'>();
  const flips: Record<string, number> = {};
  let total = 0;

  for (const sample of samples) {
    const previous = last.get(sample.id);

    if (previous !== undefined && previous !== sample.column) {
      flips[sample.id] = (flips[sample.id] ?? 0) + 1;
      total += 1;
    }

    last.set(sample.id, sample.column);
  }

  return { total, flips };
}

/** True when the leader starts at the anchor the mirror reports, so the two cannot drift. */
export function leaderStartsAtAnchor(layout: LayoutLike): boolean {
  const first = layout.leader[0];

  if (first === undefined) {
    return false;
  }

  if (layout.anchor === undefined) {
    return true;
  }

  return first[0] === layout.anchor[0] && first[1] === layout.anchor[1];
}

/** The first leader point, for a caller that only has the minimal shape. */
export function leaderOrigin(layout: LayoutLike): [number, number] | undefined {
  return layout.leader[0];
}
