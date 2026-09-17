/**
 * The palette's **ink roles** (design D4, task 4.21).
 *
 * Colour is data, never a literal in a component: the catalog's records reference a
 * `paletteRole` and the UI reads its colours from here, which is what lets a palette swap — or
 * M5's high-contrast mode — restyle every surface without a catalog or component edit (spec:
 * `Annotation Ink Follows The Palette`).
 *
 * **This is the M1 seam, and it is deliberately the whole of what M1 consumes.** The annotation
 * layer needs exactly two facts about a palette: which palette is active, and what its `label`
 * role is. D4's full model — the four layer colours, the background, the high-contrast set and the
 * selector that switches between palettes — lands with M5 (task 8.1), and adding those fields now
 * would be data with no consumer. What matters at M1 is that the annotations already read
 * `label` from here rather than from a stylesheet constant, so the M5 work is a data change and
 * not a rewrite of the annotation layer.
 *
 * `src/catalog/` stays three-free: this module is data, and the 3D chunk imports it, never the
 * reverse.
 */

/** One palette. Fields arrive as their consumers do; `label` is the annotation ink role. */
export interface Palette {
  /** Stable English identifier. The store's `paletteId` holds this value. */
  id: string;
  /**
   * The ink used for labels, leader lines and anchors.
   *
   * D4's WCAG ≥4.5:1 requirement is stated against the background; the check itself is M5's
   * (task 8.3), because it needs the full palette model to compare against.
   */
  label: string;
}

/** The palette the store starts on, and the fallback for an unknown id. */
export const DEFAULT_PALETTE_ID = 'default';

/**
 * The default palette.
 *
 * `label` is the app's existing dark-theme foreground, so the palette model describes the look the
 * app already ships rather than restyling it by accident.
 */
export const DEFAULT_PALETTE: Palette = {
  id: DEFAULT_PALETTE_ID,
  label: '#e8edf2',
};

/** Every palette the app knows. M5 appends the high-contrast palette here. */
export const PALETTES: readonly Palette[] = [DEFAULT_PALETTE];

/**
 * The palette for a store value.
 *
 * An unknown id resolves to the default rather than throwing: a stale id from a URL or a future
 * removed palette must degrade to the shipped look, not to a blank screen.
 */
export function resolvePalette(paletteId: string): Palette {
  return PALETTES.find((palette) => palette.id === paletteId) ?? DEFAULT_PALETTE;
}

