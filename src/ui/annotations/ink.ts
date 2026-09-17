import type { CSSProperties } from 'react';
import { resolvePalette, type Palette } from '../../catalog/palettes';

/**
 * The annotation ink bridge (task 4.21, design D14/D18).
 *
 * The annotation layer's ink — leader lines, anchors and both language lines — comes from the
 * palette's `label` role and from nowhere else. This module is the single place that fact is
 * expressed, and it is deliberately the only file in `src/ui/annotations/` that mentions the
 * palette:
 *
 * - The **value** is data (`catalog/palettes.ts`), so M5's palette swap and high-contrast mode
 *   restyle the annotations with no change here and no catalog edit.
 * - The **transport** is one CSS custom property, because the layer's per-frame writes are
 *   `transform` / `d` / `opacity` and the ink must not join them: restyling is a React-render-time
 *   concern, so it costs nothing per frame.
 * - The **hierarchy** inside the label is size, weight and opacity — not a second colour. Both
 *   language lines take the same ink, which is what the requirement says, and the secondary line
 *   reads as subordinate because it is smaller and quieter, not because it is a different hue.
 *
 * `inkSource.test.ts` asserts the module holds no colour literal and that the stylesheet's
 * annotation rules resolve their ink from this one variable.
 */

/** The CSS custom property every annotation ink surface resolves. */
export const ANNOTATION_INK_VARIABLE = '--cell-ink';

/**
 * The ink declarations for one palette.
 *
 * Returns a React style object rather than a string so the whole ink assignment stays one
 * expression at the JSX boundary. The cast is the usual one: `CSSProperties` models the standard
 * property set, and a custom property is not part of it.
 */
export function annotationInkStyle(palette: Palette): CSSProperties {
  return { [ANNOTATION_INK_VARIABLE]: palette.label } as CSSProperties;
}

/** The ink declarations for a store `paletteId`. Unknown ids resolve to the default palette. */
export function annotationInkStyleForId(paletteId: string): CSSProperties {
  return annotationInkStyle(resolvePalette(paletteId));
}
