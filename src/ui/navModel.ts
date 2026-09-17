import { DISASSEMBLY_MIN, type ActiveView } from '../app/store';
import type { UiKey } from './i18n/messages';

/**
 * The navigation model (task 4.5).
 *
 * Two facts live here rather than inside `Nav.tsx`, so both are unit-testable in `node`:
 *
 * 1. **Which views exist, and which of them the app can actually render.** The proposal names
 *    three views; the comparison stage is milestone M6. Declaring `available: false` is what stops
 *    the navigation from being a false affordance — a button that switched to `comparison` today
 *    would keep rendering the animal cell under a "Comparison" label.
 * 2. **What "the landing view state" means.** The spec's `Back to selection returns to the landing
 *    state` is a statement about state, not about copy: no isolate, no disassembly, no running
 *    process. Naming it once here keeps the navigation's disabled state and
 *    `resetToSelection()` from drifting apart.
 */

export interface ViewOption {
  view: ActiveView;
  labelKey: UiKey;
  available: boolean;
}

/**
 * The view entries, in the order the proposal lists them.
 *
 * `comparison` is unavailable until M6 mounts `<ComparisonStage>`; its label key exists so the
 * entry is readable rather than a bare disabled box, and `nav.view.pending` explains why.
 */
export const VIEW_OPTIONS: readonly ViewOption[] = [
  { view: 'animal', labelKey: 'nav.view.animal', available: true },
  { view: 'plant', labelKey: 'nav.view.plant', available: true },
  { view: 'comparison', labelKey: 'nav.view.comparison', available: false },
];

/** The parts of the store the landing question is about. */
export interface LandingStateInput {
  selectedId: string | null;
  disassemblyTarget: number;
  processId: string | null;
}

/**
 * True when the viewer is in its landing (view-selection) state.
 *
 * All three conditions are the *same* question asked at different levels: is anything being
 * examined right now? An isolated organelle, a raised disassembly control and a running process are
 * each a departure from the landing state, and `resetToSelection()` clears exactly these three.
 */
export function isLandingState(state: LandingStateInput): boolean {
  return (
    state.selectedId === null &&
    state.disassemblyTarget === DISASSEMBLY_MIN &&
    state.processId === null
  );
}
