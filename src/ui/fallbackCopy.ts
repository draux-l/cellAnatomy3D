import type { UiKey } from './i18n/messages';

/**
 * What the WebGL-unavailable path cannot offer (tasks 4.6 and 4.22, spec: `WebGL-Unavailable
 * Fallback`).
 *
 * The fallback is a real path, not a stub, and the honest half of a real path is saying what is
 * missing. The rule the list follows is the project's own: **nothing is faked**. The 3D inspector
 * teaches by letting the learner hover, isolate and disassemble; without a renderer none of that
 * exists, so the app states it rather than offering a control that does nothing.
 *
 * The list is a data value rather than JSX so the parity of every declaration is asserted by a unit
 * test in both languages (`fallbackCopy.test.ts`), alongside the spec sheets and the static images
 * that DO remain.
 */
/**
 * The list is ordered by what the learner reaches for: the three ways of examining the model, then
 * the processes, then the quiz.
 */
export const FALLBACK_UNAVAILABLE_SURFACES: readonly UiKey[] = [
  'fallback.unavailable.annotations',
  'fallback.unavailable.disassembly',
  'fallback.unavailable.isolate',
  'fallback.unavailable.processes',
  'fallback.unavailable.quiz',
];
