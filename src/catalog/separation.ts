import { rosterFor } from './cells';
import { extentFor, positionForRecord } from './params';
import type { CellId, OrganelleRecord } from './types';

/**
 * The exploded view as a rule: the exit order, the two scatter layouts, and the stagger.
 *
 * ## What a record declares, and what it does not
 *
 * A record declares only `separates`. **Where** a part travels is decided here, because the product
 * has two views of the same control and a per-record vector cannot express either of them honestly:
 * two layouts would need two sets of authored numbers (twenty-eight hand-kept values), and a third
 * view would need a third. Both layouts derive from `position` and `geometry.extent` instead — data
 * the catalog already measures — and both answer to one invariant:
 *
 * > every slot clears the membrane by the part's own radius.
 *
 * ## The two layouts
 *
 * - **`ordered`** puts one slot per separable part evenly around a ring in the plane of the default
 *   view, each at a radius that grows with the part's own `extent`. It is predictable and legible,
 *   and it answers *what parts are there* — which is also what makes it the menu the inspection is
 *   chosen from. Its first design moved every part along the ray it genuinely sat on: faithful, and
 *   it read as chaos, because no two parts shared a radius or an angle.
 * - **`real`** sends every part along the ray it genuinely occupies, to a radius that clears the
 *   membrane by its own size. It is less tidy and it needs a wider frame, but it is the only view
 *   that answers *where each part is*, which is the spatial relationship a learner is missing when
 *   the intact cell hides its own contents.
 *
 * Neither is "the" arrangement. `ordered` is the index; `real` is the map.
 *
 * ## Why the exit order is authored
 *
 * The obvious rule for it — "outermost part first" — is **not** derivable, and this model proves it.
 * A record's `position` is its measured **centre**, and a centre says nothing about containment:
 * `nuclear-envelope` sits closer to the cell origin (`|position|` 0.634) than the `nucleus` it wraps
 * (0.708), while the `nucleolus` (0.688) is inside the nucleus and the `centriole` (0.893) merely
 * happens to sit on the same ray, four degrees away. So the sequence is authored, ordered by what a
 * learner needs to see: the peripheral, compact parts leave first, and the nucleus opens as a group
 * in nesting order — envelope, then nucleus, then nucleolus — like lifting the lid off a matryoshka.
 *
 * Pure and three-free: `src/catalog/` must never pull three.js into the shell's entry graph.
 */

/** The two views of the same control. */
export type ScatterLayout = 'ordered' | 'real';

/** Every layout, in the order the control offers them. */
export const SCATTER_LAYOUTS: readonly ScatterLayout[] = ['ordered', 'real'];

/**
 * The clear space every slot keeps outside the membrane, in scene units.
 *
 * The one free number in **both** layouts, and the reason a slot's radius is
 * `membrane.extent + SLOT_CLEARANCE + the part's own extent`: the subtraction that matters is
 * `radius − extent`, so the part clears the membrane by exactly this much in either view.
 */
export const SLOT_CLEARANCE = 0.5;

/**
 * The exit sequence, outer → inner. Every separable record appears exactly once, and it is also the
 * order the slots are handed out around the `ordered` ring.
 *
 * Membership is not a second source of truth: a record is separable exactly when it declares
 * `separates` (`isSeparable`). `separation.test.ts` asserts that this sequence and the separable set
 * are the same thing, so a record that joins or leaves the set without the sequence being updated
 * fails the build instead of silently keeping a stale rank.
 */
export const SEPARATION_SEQUENCE: readonly string[] = [
  'centriole',
  'golgi',
  'smooth-endoplasmic-reticulum',
  'small-vacuoles',
  'nuclear-envelope',
  'nucleus',
  'nucleolus',
  'ribosome',
  'endoplasmic-reticulum',
  'mitochondrion',
  'lysosome',
];

/**
 * The share of the global control that one part's own travel occupies.
 *
 * `1` is strictly one part at a time — each part only starts once the previous has finished, which
 * needs a long drag for eleven parts. `0.55` overlaps neighbours enough to read as one continuous
 * motion while staying plainly sequential, and it leaves the last part finishing exactly at 100 %.
 */
export const STAGGER_WINDOW = 0.55;

/** True when a record takes part in the exploded view. */
export function isSeparable(record: OrganelleRecord): boolean {
  return record.separates;
}

/** The cell's own radius, in scene units: the membrane record's measured half-diagonal. */
export function membraneExtentOf(cell: CellId): number {
  const membrane = rosterFor(cell).find((record) => record.id === 'membrane');

  return membrane ? extentFor(membrane) : 0;
}

/** The separable records of one cell, in catalog order. */
export function separableRecords(cell: CellId): readonly OrganelleRecord[] {
  return rosterFor(cell).filter(isSeparable);
}

/**
 * Where one record sits in the exit sequence, or `undefined` when it never separates.
 *
 * A rank is a part's **step index** (0 leaves first). It is not a distance and not a direction.
 */
export function separationRank(record: OrganelleRecord): number | undefined {
  const index = SEPARATION_SEQUENCE.indexOf(record.id);

  return index === -1 ? undefined : index;
}

/**
 * The separable records of one cell, **in exit order**.
 *
 * The rank the stagger consumes is an index into *this* list, not into `SEPARATION_SEQUENCE`. The
 * sequence states the relative order; a cell may separate a subset of it, and a subset must still
 * start at step 0 and finish at the last step it actually has — otherwise the first part would wait
 * for a step that never comes and the last one would never leave.
 */
export function orderedSeparation(cell: CellId): readonly OrganelleRecord[] {
  return [...separableRecords(cell)].sort((a, b) => {
    const rankA = separationRank(a) ?? Number.MAX_SAFE_INTEGER;
    const rankB = separationRank(b) ?? Number.MAX_SAFE_INTEGER;

    return rankA - rankB;
  });
}

/** The ring angle of one slot, in radians: the top of the ring, then clockwise in exit order. */
export function ringAngleFor(rank: number, count: number): number {
  const steps = Math.max(1, count);

  return Math.PI / 2 - (rank / steps) * Math.PI * 2;
}

/**
 * The `ordered` layout: one slot per part, evenly around a ring.
 *
 * The plane is XY, deliberately. The default camera looks down +Z at a slight azimuth and elevation,
 * so a ring here presents as a circle around the cell; a ring in the ground plane collapses into a
 * flattened line and piles its parts on top of one another.
 */
export function orderedSlotFor(
  record: OrganelleRecord,
  rank: number,
  count: number,
  membraneExtent: number,
): [number, number, number] {
  const angle = ringAngleFor(rank, count);
  const radius = membraneExtent + SLOT_CLEARANCE + extentFor(record);

  return [Math.cos(angle) * radius, Math.sin(angle) * radius, 0];
}

/**
 * The `real` layout: the part's own ray, out to a radius that clears the cell.
 *
 * A record at the origin has no ray to travel along — the membrane and the cytoplasm are the two,
 * and both declare `separates: false` — so the fallback only has to be defined, not meaningful.
 */
export function realSlotFor(
  record: OrganelleRecord,
  cell: CellId,
  membraneExtent: number,
): [number, number, number] {
  const [px, py, pz] = positionForRecord(record, cell);
  const radius = membraneExtent + SLOT_CLEARANCE + extentFor(record);
  const length = Math.hypot(px, py, pz);

  if (length <= 1e-9) {
    return [0, radius, 0];
  }

  const scale = radius / length;

  return [px * scale, py * scale, pz * scale];
}

/** The slot one part travels to, in scene units, in whichever layout is running. */
export function scatterSlotFor(
  record: OrganelleRecord,
  cell: CellId,
  layout: ScatterLayout,
  rank: number,
  count: number,
  membraneExtent: number,
): [number, number, number] {
  return layout === 'real'
    ? realSlotFor(record, cell, membraneExtent)
    : orderedSlotFor(record, rank, count, membraneExtent);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

/** Smoothstep: eases a part's own travel so it neither starts nor stops abruptly. */
function easeInOut(value: number): number {
  return value * value * (3 - 2 * value);
}

/**
 * How far one ranked part has travelled, as 0..1, at a given global control value.
 *
 * `percent` is the 0–100 control, `rank` the part's index in `orderedSeparation(cell)` and `count`
 * how many parts separate in that cell. The part's window starts at
 * `window × rank / (count − 1)` and is `1 − window` wide, so:
 *
 * - at 0 % every part is home;
 * - a lower rank is always at least as far along as a higher one, at every value;
 * - at 100 % every part is fully out, including the last one.
 *
 * The degenerate shape — one part, or `window === 1` — is defined rather than guarded away, because
 * a control that silently stops responding is worse than one that snaps.
 */
export function separationProgress(
  percent: number,
  rank: number,
  count: number,
  window: number = STAGGER_WINDOW,
): number {
  const global = clamp01(percent / 100);

  if (count <= 1) {
    return easeInOut(global);
  }

  const span = clamp01(window);
  const start = span * (rank / (count - 1));

  if (start >= 1) {
    return global >= 1 ? 1 : 0;
  }

  const remaining = 1 - span;

  if (remaining <= 0) {
    // Fully sequential: a part is either still home or already all the way out.
    return global > start ? 1 : 0;
  }

  return easeInOut(clamp01((global - start) / remaining));
}
