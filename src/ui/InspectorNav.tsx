import { useCallback, useEffect, useMemo } from 'react';
import { useAppStore } from '../app/store';
import { getRecord } from '../catalog/cells';
import { orderedSeparation } from '../catalog/separation';
import type { CellId } from '../catalog/types';
import { useT } from './i18n';

/**
 * The inspection's step control: previous part, next part, and where you are in the walk.
 *
 * ## Why it exists
 *
 * The inspection shows **one** part at a time. Without this, looking at another one meant leaving the
 * inspection, finding it in the arrangement and clicking it again — five parts, five round trips. The
 * step walks the **same order the arrangement opens in** (`orderedSeparation`), so the sequence you
 * see when the cell comes apart is the sequence you can read through.
 *
 * ## Why it is not a store key
 *
 * The step is a **computation over `selectedId`**, not new state. The inspected part already decides
 * everything, and its neighbour is derivable from the arrangement; a "cursor" in the store would be a
 * second source of truth that could disagree with the selection.
 *
 * ## Wrapping, and the parts that never separate
 *
 * It wraps, so stepping past the last part returns to the first. A selection that is **not** in the
 * sequence — the membrane, the cytoplasm, the cytoskeleton — enters it at the first part in whichever
 * direction you step, rather than being stuck.
 */
export function InspectorNav({ cell }: { cell: CellId }) {
  const selectedId = useAppStore((state) => state.selectedId);
  const setSelected = useAppStore((state) => state.setSelected);
  const t = useT();
  const ordered = useMemo(() => orderedSeparation(cell), [cell]);
  const index = ordered.findIndex((record) => record.id === selectedId);
  const selected = selectedId === null ? undefined : getRecord(selectedId);

  const step = useCallback(
    (delta: number) => {
      const count = ordered.length;

      if (count === 0 || selectedId === null) {
        return;
      }

      // From outside the sequence, either direction enters it at its own edge.
      const from = index === -1 ? (delta > 0 ? -1 : 0) : index;
      const next = ordered[(from + delta + count) % count];

      if (next) {
        setSelected(next.id);
      }
    },
    [index, ordered, selectedId, setSelected],
  );

  /*
   * The arrow keys are the same control, for the same reason the slider and the buttons share a
   * value: one decision, two affordances. `OrbitControls` is mounted with `keyEvents` off, so nothing
   * else claims them.
   */
  useEffect(() => {
    if (selected === undefined) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        step(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, step]);

  if (selected === undefined) {
    return null;
  }

  return (
    <div
      className="inspector-nav"
      data-inspector-nav={selected.id}
      role="group"
      aria-label={t('inspection.nav')}
    >
      <button
        type="button"
        className="inspector-nav__step"
        data-inspector-action="previous"
        aria-label={t('inspection.previous')}
        disabled={ordered.length === 0}
        onClick={() => step(-1)}
      >
        ‹
      </button>
      <span className="inspector-nav__count" data-inspector-position={index}>
        {index >= 0 ? index + 1 : '—'} / {ordered.length}
      </span>
      <button
        type="button"
        className="inspector-nav__step"
        data-inspector-action="next"
        aria-label={t('inspection.next')}
        disabled={ordered.length === 0}
        onClick={() => step(1)}
      >
        ›
      </button>
    </div>
  );
}
