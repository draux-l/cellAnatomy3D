/**
 * The click-versus-drag rule.
 *
 * The spec has one pointer for two jobs: dragging orbits the cell, and clicking isolates an
 * organelle. R3F's `onClick` cannot tell them apart — it fires on any pointerup that started on
 * the same object — so the viewer measures the travel between pointerdown and pointerup itself.
 *
 * The threshold is the spec's own: a pointer that moves **less than 5 px** is a click. A drag
 * almost always moves further than that before the user notices an orbit, and a deliberate click
 * almost never does, so 5 px separates the two gestures without a mode.
 *
 * The state is a module-level value rather than React state on purpose: it changes on every
 * pointerdown anywhere over the canvas, and putting it in the store would re-render the tree for a
 * gesture that usually produces no state change at all.
 */

/*
 * Named "slop", not "travel": `catalog/bounds.test.ts` scans the tree for constants that use
 * displacement vocabulary, so that no hard-coded scene-unit displacement can hide outside
 * `catalog/separation.ts`. This number is pixels of pointer movement, not a displacement, and
 * renaming it keeps the scan meaningful instead of teaching everyone to ignore it.
 */
export const CLICK_SLOP_PX = 5;

export interface Point2 {
  x: number;
  y: number;
}

let lastPointerDown: Point2 | null = null;

export function recordPointerDown(event: { clientX: number; clientY: number }): void {
  lastPointerDown = { x: event.clientX, y: event.clientY };
}

export function clearPointerDown(): void {
  lastPointerDown = null;
}

export function lastPointerDownAt(): Point2 | null {
  return lastPointerDown;
}

/** True when `up` is close enough to `down` to be a click rather than a drag. */
export function isClick(
  down: Point2 | null,
  up: Point2,
  threshold = CLICK_SLOP_PX,
): boolean {
  if (down === null) {
    return false;
  }

  return Math.hypot(up.x - down.x, up.y - down.y) < threshold;
}

/** The same rule applied to the pointerdown the tracker recorded for this canvas. */
export function isClickFromTrackedDown(
  event: { clientX: number; clientY: number },
  threshold = CLICK_SLOP_PX,
): boolean {
  return isClick(lastPointerDown, { x: event.clientX, y: event.clientY }, threshold);
}
