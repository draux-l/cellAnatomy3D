/**
 * The nutrition process's colours (task 5.2/5.3).
 *
 * Same seam as `src/ui/annotations/ink.ts`: the value is data and one module owns it, so M5's
 * palette (task 8.1) can restyle the processes without touching a single line of animation code.
 * Nothing here is a literal inside a component, and a palette swap is a change to this table.
 */

export const NUTRITION_COLORS = {
  /**
   * ATP: the product respiration is about.
   *
   * Near-white with a warm emissive, deliberately *not* the cristae's own tan: the folds are the
   * teaching object and a molecule the same colour as the sheet it sits on is invisible against it.
   */
  atp: '#fffaf0',
  /** ATP's emissive: what makes the molecule read as released energy rather than as more geometry. */
  atpEmissive: '#ffd27f',
  /** The carrier moving through the thylakoid stack. */
  carrier: '#cfeecb',
  /** Oxygen, released alongside glucose. */
  oxygen: '#9fd8ff',
  /** The sugar the process builds. */
  glucose: '#f0c8ff',
} as const;
