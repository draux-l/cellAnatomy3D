import { bandProgress, clamp01 } from '../curve';

/**
 * The mitosis timeline's shape, as data (tasks 6.1–6.6).
 *
 * Three consumers must not disagree about it: the GSAP timeline that inserts the labels, the pure
 * keyframe functions that decide what the cell looks like at a phase, and the UI model that turns
 * the active label into localized copy. Putting it here — with **no three.js and no GSAP import** —
 * is what lets the app shell read the phase vocabulary without pulling the 3D chunk into the entry
 * graph (same reason `nutrition/targets.ts` exists beside `nutrition/index.ts`).
 *
 * **The biology this encodes**, from the spec's own sentences and nothing else: mitosis proceeds
 * through prophase, metaphase, anaphase and telophase, followed by cytokinesis; the phases are
 * strictly ordered. The five bands below tile `[0, 1]` in that order, so no progress value can
 * place the sequence outside it and the order is structural rather than a promise.
 */

/** The phases, in the spec's order. The order of this tuple *is* the sequence (spec: no phase out of order). */
export const MITOSIS_PHASE_ORDER = [
  'prophase',
  'metaphase',
  'anaphase',
  'telophase',
  'cytokinesis',
] as const;

export type MitosisPhase = (typeof MITOSIS_PHASE_ORDER)[number];

export function isMitosisPhase(value: string): value is MitosisPhase {
  return (MITOSIS_PHASE_ORDER as readonly string[]).includes(value);
}

/** One full sequence, in seconds at real speed. */
export const MITOSIS_DURATION_SECONDS = 14;

/**
 * Each phase's own interval, as a fraction of the sequence.
 *
 * Anaphase is the longest band on purpose: it is the one phase whose *motion* — the sisters leaving
 * the equator for opposite poles — is the thing the spec asks a viewer to see, and a band too short
 * to read would make the chromosomes appear to teleport. Prophase and metaphase are shorter because
 * their content is a shape (condensed chromosomes; an aligned plate) rather than a journey.
 */
export const MITOSIS_BANDS: Readonly<Record<MitosisPhase, { start: number; end: number }>> = {
  prophase: { start: 0, end: 0.18 },
  metaphase: { start: 0.18, end: 0.38 },
  anaphase: { start: 0.38, end: 0.6 },
  telophase: { start: 0.6, end: 0.8 },
  cytokinesis: { start: 0.8, end: 1 },
};

/** Label → phase within the sequence. What `ProcessInstance.phases` reports and the timeline inserts. */
export const MITOSIS_PHASES: Readonly<Record<MitosisPhase, number>> = {
  prophase: MITOSIS_BANDS.prophase.start,
  metaphase: MITOSIS_BANDS.metaphase.start,
  anaphase: MITOSIS_BANDS.anaphase.start,
  telophase: MITOSIS_BANDS.telophase.start,
  cytokinesis: MITOSIS_BANDS.cytokinesis.start,
};

/** The phase a progress value falls in. The last band is closed at 1, so `1` is still cytokinesis. */
export function phaseAt(progress: number): MitosisPhase {
  const value = clamp01(progress);

  for (const phase of MITOSIS_PHASE_ORDER) {
    const band = MITOSIS_BANDS[phase];

    if (value >= band.start && value < band.end) {
      return phase;
    }
  }

  return 'cytokinesis';
}

/**
 * The timeline time a phase label sits at, or `null` for a label the sequence does not have.
 *
 * The `?fixture=` route pins a phase by name (`&label=cytokinesis`) rather than by a raw second
 * count, so a committed screenshot is readable in the URL. This is the one conversion between the
 * two, and it lives beside the table it reads.
 */
export function mitosisLabelTime(label: string): number | null {
  if (!isMitosisPhase(label)) {
    return null;
  }

  return MITOSIS_PHASES[label] * MITOSIS_DURATION_SECONDS;
}

/**
 * The timeline time a fraction of the sequence sits at.
 *
 * A phase *label* pins the moment a phase begins, which is what a seek needs; a screenshot of a
 * mechanism needs a moment *inside* the phase, where the mechanism is expressed. Both controls exist
 * because they answer different questions, and this is the conversion for the second.
 */
export function mitosisProgressTime(progress: number): number | null {
  return Number.isFinite(progress) ? clamp01(progress) * MITOSIS_DURATION_SECONDS : null;
}

/**
 * How far into a phase a progress value is, as `[0, 1]`. The counterpart of `phaseAt` for the
 * animations that have to build up *within* one band.
 */
export function phaseProgress(phase: MitosisPhase, progress: number): number {
  const band = MITOSIS_BANDS[phase];

  return bandProgress(band.start, band.end, progress);
}

/**
 * Which cytokinesis mechanism the single-cell view is showing (task 6.5).
 *
 * `auto` is the default and means "the mechanism of the cell you are looking at" — an animal cell
 * pinches, a plant cell builds a plate. `animal` and `plant` are the explicit override the phase
 * toggle writes, which is what lets the contrast be taught **inside one view** before comparison
 * mode exists (spec: `Contrast Teaches Before Comparison Mode Exists`).
 */
export type CytokinesisMechanism = 'auto' | 'animal' | 'plant';

/** The two mechanisms a viewer can toggle between. `auto` is not a mechanism, it is the default. */
export const CYTOKINESIS_MECHANISMS = ['animal', 'plant'] as const;

/** The mechanism actually rendered: the override when there is one, otherwise the cell's own. */
export function activeMechanism(cell: string, setting: CytokinesisMechanism): 'animal' | 'plant' {
  if (setting === 'animal' || setting === 'plant') {
    return setting;
  }

  return cell === 'plant' ? 'plant' : 'animal';
}
