import type { Color, Material } from 'three';

/**
 * Hover highlight and isolate de-emphasis, as material state.
 *
 * The spec has two visual requirements that look like one: hovering an organelle highlights it,
 * and isolating one de-emphasizes the rest. Both are the same operation — pick one emphasis mode
 * per organelle and write it to that organelle's material instances.
 *
 * **Materials are per organelle, and that is the mechanism.** `src/scene/materials.ts` returns a
 * shared template set; a host clones the keys its build actually uses, so "highlight the
 * mitochondrion" cannot light up the Golgi by accident. The clone is also why the emphasis is a
 * discrete write on a store change rather than a per-frame uniform: nothing here runs in a frame
 * loop.
 *
 * This module is deliberately three-light — it takes a `Material` and mutates the two channels
 * emphasis owns. `emphasizeFor` is the pure decision, so the rule is unit-testable without a
 * renderer.
 */

/** The highlight tint. Cool, so it reads as "selected" against the warm organelle palette. */
export const HIGHLIGHT_EMISSIVE = '#9ec6ff';
/** Strong enough to measure as a luminance rise, weak enough not to blow the shape out. */
export const HIGHLIGHT_EMISSIVE_INTENSITY = 0.7;
/** How much opacity a de-emphasized organelle keeps while another one is isolated. */
export const DIMMED_OPACITY_FACTOR = 0.22;
/** Emissive is black at rest: the palette owns the colour, not this module. */
export const RESTING_EMISSIVE = '#000000';
export const RESTING_EMISSIVE_INTENSITY = 1;

const BASE_OPACITY_KEY = 'cellBaseOpacity';
const BASE_TRANSPARENT_KEY = 'cellBaseTransparent';

export type EmphasisMode = 'base' | 'hovered' | 'dimmed';

/**
 * The one rule, kept pure.
 *
 * Hover wins over isolate de-emphasis: while an organelle is isolated, hovering a *different* one
 * still lights it up, because the hover is the user asking "what is this?" and answering with a
 * dimmer version of the same answer is worse than letting them see it.
 */
export function emphasisFor(
  organelleId: string,
  hoveredId: string | null,
  selectedId: string | null,
): EmphasisMode {
  if (organelleId === hoveredId) {
    return 'hovered';
  }

  if (selectedId !== null && organelleId !== selectedId) {
    return 'dimmed';
  }

  return 'base';
}

/**
 * Records a material's resting opacity **and transparency** once, so de-emphasis is always relative
 * to the palette's own value rather than to a previous emphasis mode.
 */
export function prepareEmphasis<T extends Material>(material: T): T {
  if (typeof material.userData[BASE_OPACITY_KEY] !== 'number') {
    material.userData[BASE_OPACITY_KEY] = material.opacity;
  }

  if (typeof material.userData[BASE_TRANSPARENT_KEY] !== 'boolean') {
    material.userData[BASE_TRANSPARENT_KEY] = material.transparent;
  }

  return material;
}

/** Writes one emphasis mode to a material. Idempotent, so it is safe to call every store change. */
export function applyEmphasis<T extends Material>(material: T, mode: EmphasisMode): T {
  const storedOpacity = material.userData[BASE_OPACITY_KEY];
  const baseOpacity = typeof storedOpacity === 'number' ? storedOpacity : material.opacity;
  const storedTransparent = material.userData[BASE_TRANSPARENT_KEY];
  const baseTransparent =
    typeof storedTransparent === 'boolean' ? storedTransparent : material.transparent;
  const emissiveMaterial = material as Material & { emissive?: Color; emissiveIntensity?: number };

  material.opacity = mode === 'dimmed' ? baseOpacity * DIMMED_OPACITY_FACTOR : baseOpacity;
  /*
   * Written in **both** directions, and that is a performance fix, not tidiness.
   *
   * A de-emphasized organelle is written as translucent even if it was opaque, so the "others
   * recede" reading holds for solid bodies and shells alike. It used to be set only on the way in,
   * which left every material it had ever dimmed permanently in the transparent pass — and
   * `transparent` is part of **three's program key**, so the first flip recompiles that material's
   * shader. Restoring the resting value means the variant is one three already has, and the recompile
   * happens once, at pre-warm, instead of on the user's first click (`scene/MeshCellGroup.tsx`).
   */
  material.transparent = mode === 'dimmed' ? true : baseTransparent;

  if (emissiveMaterial.emissive) {
    emissiveMaterial.emissive.set(mode === 'hovered' ? HIGHLIGHT_EMISSIVE : RESTING_EMISSIVE);
  }

  if (typeof emissiveMaterial.emissiveIntensity === 'number') {
    emissiveMaterial.emissiveIntensity =
      mode === 'hovered' ? HIGHLIGHT_EMISSIVE_INTENSITY : RESTING_EMISSIVE_INTENSITY;
  }

  return material;
}
