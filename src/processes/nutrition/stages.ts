/**
 * The nutrition timeline's shape, as data (tasks 5.2–5.4).
 *
 * These constants are shared by three consumers that must not disagree: the GSAP timeline that
 * inserts the labels, the per-particle stage function that decides what each ATP molecule is doing,
 * and the UI model that turns the active label into localized copy. Putting them here rather than
 * in the animation module keeps the UI side free of three.js — the process panel lives in the app
 * shell, which must not pull the 3D chunk into the entry graph (task 2.6 / design D18).
 *
 * **The biology this encodes**, from the spec's own statement of the fact: cellular respiration
 * releases energy from glucose in the mitochondrion, and the cristae — the folded inner membrane —
 * are where the reactions producing most of the ATP happen. So one cycle has two beats and only two:
 * the folds react, and ATP is released. There is no third stage, because there is no third thing
 * the requirement licenses this app to claim.
 */

/** One complete ATP-production cycle, in seconds at real speed. */
export const RESPIRATION_CYCLE_SECONDS = 4.2;

/**
 * The two beats of one cycle, as fractions of it.
 *
 * `reactions` covers the fold releasing and `atp` the product drifting into the matrix. The bands
 * are half-open intervals that tile `[0, 1)`, so every particle is always in exactly one of them
 * and the timeline labels cannot point at a moment no particle is in.
 */
export const RESPIRATION_BANDS = {
  reactions: { start: 0, end: 0.38 },
  atp: { start: 0.38, end: 1 },
} as const;

export type RespirationStage = keyof typeof RESPIRATION_BANDS;

/** The beats in cycle order. The timeline inserts one label per entry, at its `start`. */
export const RESPIRATION_STAGE_ORDER = ['reactions', 'atp'] as const satisfies readonly RespirationStage[];

/** The timeline labels, as label → phase within one cycle. What `ProcessInstance.phases` reports. */
export const RESPIRATION_PHASES: Readonly<Record<RespirationStage, number>> = {
  reactions: RESPIRATION_BANDS.reactions.start,
  atp: RESPIRATION_BANDS.atp.start,
};

/**
 * ATP molecules sampled per crista.
 *
 * Three is a legibility count, not a biology count: a fold is a sheet, and one marker per sheet
 * reads as a decoration rather than as a surface that is producing something. A dozen folds then
 * give a wave that travels along the organelle, which is what makes "the cristae are where this
 * happens" visible at a glance.
 */
export const ATP_PER_CRISTA = 3;

/**
 * Photosynthesis emits one glucose and six oxygens per completed cycle.
 *
 * That is the actual stoichiometry of photosynthesis (6 CO₂ + 6 H₂O → C₆H₁₂O₆ + 6 O₂), and the
 * spec's requirement is only that the animation happens on the grana — so the ratio is stated
 * rather than invented. The counter in the process mirror is derived from completed cycles, so it
 * can never report an emission that the animation did not run.
 */
export const OXYGEN_PER_CYCLE = 6;
export const GLUCOSE_PER_CYCLE = 1;

/** One emission cycle of the chloroplast, in seconds at real speed. */
export const PHOTOSYNTHESIS_CYCLE_SECONDS = 3.2;

/** Thylakoid carriers per granum: the flow that never stops while there is light. */
export const CARRIERS_PER_GRANUM = 12;
