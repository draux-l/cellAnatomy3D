/**
 * The reproduction process's colours (tasks 6.1–6.5).
 *
 * Same seam as `nutrition/colors.ts` and `ui/annotations/ink.ts`: the values are data and one module
 * owns them, so M5's palette work (task 8.1) can restyle these surfaces without touching a line of
 * animation code. Nothing below is a literal inside a component.
 *
 * The colours are chosen for **legibility against the cells they appear in**, not for realism: the
 * animal cell's boundary is a blue membrane over a blue-grey cytosol and the plant cell's is a tan
 * wall, so the teaching objects (the chromatids, the ring, the plate) are the most saturated things
 * on screen. A mechanism a viewer cannot pick out is a mechanism that has not been taught.
 */

export const REPRODUCTION_COLORS = {
  /**
   * The chromatids.
   *
   * Magenta, deliberately outside the palette's organelle roles: chromosomes are the subject of
   * every phase of this sequence and they travel through the nucleus (purple), the cytosol (blue)
   * and the plant cell (tan), so they have to stay separable from all three.
   */
  chromatid: '#f06aa8',
  /**
   * The contractile ring.
   *
   * Warm and bright: it is the one structure that only exists in the animal mechanism, and it has to
   * read as an active band squeezing the boundary — the exact opposite of the plant's slow plate.
   */
  ring: '#ffb454',
  /**
   * The cell plate.
   *
   * Opaque, and in the tan-green family of the plant wall, because the plate *becomes* the new cell
   * wall. It is the only opaque surface either mechanism adds, which is what lets the central
   * partition be measured from a screenshot at all.
   */
  plate: '#bcd39a',
  /** The two daughter nuclei that form at telophase: the nuclear envelope's own purple. */
  daughterEnvelope: '#9b7fc4',
} as const;
