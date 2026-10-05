import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { HOVER_LABEL_ENABLED } from '../app/structureTools';
import { useAppStore } from '../app/store';
import { getRecord } from '../catalog/cells';

/**
 * The hover name popup.
 *
 * Hovering a part shows a small popup with **only its name**, in the active locale. That is the
 * whole surface: no description, no fact, no leader line. The part's identity comes from the same
 * `hoveredId` the pick controller already writes (`scene/interaction/Picking.tsx`), so this file
 * changes *how the name is presented*, never how a part is resolved.
 *
 * Three properties it inherits from the codebase's rules:
 *
 * 1. **No per-frame value in React state.** The pointer position lives in a ref and is written
 *    straight to the node's `transform`; the only React re-renders are a hover change and a locale
 *    change. A popup that re-rendered per pointermove would be the exact frame-rate trap
 *    `app/store.ts` warns about.
 * 2. **Non-blocking.** `pointer-events: none` (in the stylesheet) means the popup never steals the
 *    click that opens the spec sheet, nor an orbit drag.
 * 3. **Gated by its own flag.** `HOVER_LABEL_ENABLED` (`app/structureTools.ts`) is independent of
 *    both `DISPERSION_ENABLED` and `ANNOTATIONS_ENABLED`: this popup draws no leader lines, does not
 *    re-enable the annotation layer, and does not depend on the model being taken apart.
 *
 * It is plain DOM beside the canvas rather than a portal from inside it, for the same reason the
 * annotation overlay is: React Three Fiber's reconciler owns the canvas subtree and would read DOM
 * JSX there as three.js objects.
 */

/** How far from the pointer the popup sits, in CSS pixels. */
const POINTER_OFFSET_X = 16;
const POINTER_OFFSET_Y = 18;
/** The margin kept between the popup and the viewport edge. */
const VIEWPORT_MARGIN = 8;

/** The flag gate, kept outside the hook body so hook order stays unconditional. */
export function HoverLabel() {
  return HOVER_LABEL_ENABLED ? <HoverLabelPopup /> : null;
}

function HoverLabelPopup() {
  const hoveredId = useAppStore((state) => state.hoveredId);
  const locale = useAppStore((state) => state.locale);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const pointer = useRef({ x: 0, y: 0 });

  /**
   * Writes the popup's position from the latest pointer sample.
   *
   * Clamped to the viewport so a part near the right or bottom edge does not push the name off
   * screen. All of this is direct DOM work — no React render.
   */
  const place = useCallback(() => {
    const node = nodeRef.current;

    if (!node) {
      return;
    }

    const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - node.offsetWidth - VIEWPORT_MARGIN);
    const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - node.offsetHeight - VIEWPORT_MARGIN);
    const x = Math.min(Math.max(VIEWPORT_MARGIN, pointer.current.x + POINTER_OFFSET_X), maxX);
    const y = Math.min(Math.max(VIEWPORT_MARGIN, pointer.current.y + POINTER_OFFSET_Y), maxY);

    node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent): void => {
      pointer.current = { x: event.clientX, y: event.clientY };
      place();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });

    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [place]);

  const record = hoveredId === null ? undefined : getRecord(hoveredId);

  // The node only exists once a record does, so position it on the render that first shows it.
  useLayoutEffect(() => {
    if (record) {
      place();
    }
  }, [record, locale, place]);

  if (!record) {
    return null;
  }

  return (
    <div
      ref={nodeRef}
      className="hover-label"
      data-hover-label={record.id}
      role="status"
      aria-live="polite"
    >
      {record.name[locale]}
    </div>
  );
}
