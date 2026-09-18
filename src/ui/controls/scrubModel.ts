import {
  MITOSIS_PHASE_ORDER,
  isMitosisPhase,
  type MitosisPhase,
} from '../../processes/reproduction/stages';
import type { UiKey } from '../i18n/messages';

/**
 * The scrub bar's model (task 6.3).
 *
 * Same shape and same reason as `speedModel.ts`: the control is DOM in the app shell and the facts it
 * needs are data a unit test can check without a browser. The phase vocabulary itself lives in
 * `processes/reproduction/stages.ts` — the module the timeline builds its labels from — so the
 * buttons, the label copy and the animation cannot disagree about what the five phases are or in
 * what order they come.
 */

/** The phases, in the spec's order. The scrub bar's buttons are this list and nothing else. */
export const REPRODUCTION_PHASE_ORDER: readonly MitosisPhase[] = MITOSIS_PHASE_ORDER;

/**
 * One UI key per phase, written out rather than assembled from the phase name.
 *
 * Assembled keys are invisible to `t()`'s compile-time check and to the i18n parity test — a typo
 * would ship an untranslated string. The table makes a missing phase a type error.
 */
export const REPRODUCTION_PHASE_KEYS: Readonly<Record<MitosisPhase, UiKey>> = {
  prophase: 'process.reproduction.phase.prophase',
  metaphase: 'process.reproduction.phase.metaphase',
  anaphase: 'process.reproduction.phase.anaphase',
  telophase: 'process.reproduction.phase.telophase',
  cytokinesis: 'process.reproduction.phase.cytokinesis',
};

/**
 * The copy for a timeline label.
 *
 * The last band is closed, so a completed sequence still reports `cytokinesis`; a frame with no label
 * at all (before the first seek) reports the sequence's own first phase rather than a blank line.
 */
export function reproductionPhaseKey(label: string | null): UiKey {
  return label !== null && isMitosisPhase(label)
    ? REPRODUCTION_PHASE_KEYS[label]
    : REPRODUCTION_PHASE_KEYS.prophase;
}

/** The mechanism toggle's copy, one key per mechanism. */
export const CYTOKINESIS_MECHANISM_KEYS: Readonly<Record<'animal' | 'plant', UiKey>> = {
  animal: 'process.reproduction.cytokinesis.animal',
  plant: 'process.reproduction.cytokinesis.plant',
};

/**
 * The statement of the difference (spec: `Contrast Teaches Before Comparison Mode Exists`).
 *
 * One key, always rendered while reproduction runs, because "their difference is stated in the
 * active language" is a requirement about the view rather than about a hover.
 */
export const CYTOKINESIS_DIFFERENCE_KEY: UiKey = 'process.reproduction.cytokinesis.difference';

export function cytokinesisMechanismKey(mechanism: 'animal' | 'plant'): UiKey {
  return CYTOKINESIS_MECHANISM_KEYS[mechanism];
}

/** The scrub readout: a whole percent, like every other control in the app. */
export function formatProgress(progress: number): string {
  if (!Number.isFinite(progress)) {
    return '0%';
  }

  return `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;
}

/**
 * Which instance rows a panel should show for a running process.
 *
 * A static list was enough while nutrition was the only process; reproduction runs one instance
 * called `mitosis`, and rendering two permanently-inactive nutrition rows beside it would be a lie
 * about what the process contains. Empty means "this process has no per-instance rows".
 */
export function processRowsFor(processId: string | null): readonly string[] {
  if (processId === 'nutrition') {
    return ['respiration', 'photosynthesis'];
  }

  if (processId === 'reproduction') {
    return ['mitosis'];
  }

  return [];
}
