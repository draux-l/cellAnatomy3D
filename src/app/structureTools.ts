/**
 * The structure-study layer: the exploded-view control and the annotation layer.
 *
 * ## Why it exists
 *
 * Both surfaces answer "which part is this?" and "how do the parts fit together?" — the exploded
 * view separates the model, and the annotation layer names each part with a leader line. The cell
 * is currently being presented **exactly as the GLB authors it**: whole, centred, undisturbed and
 * unnamed. The part definitions are being rebuilt, and until they are supplied the model must not
 * be identified or taken apart.
 *
 * ## Why it is a flag rather than a deletion
 *
 * The maintainer's instruction is to **hide** this layer, not to remove it: the disassembly and the
 * labels will be rebuilt deliberately once the part definitions land. So every mechanism is still
 * here and still wired — the solver, the overlay, the driver, the HUD and all of their tests — and
 * this one value is the whole switch. Flipping it to `true` restores the control, the leader lines
 * and the labels with no other edit.
 *
 * ## What it turns off, exactly
 *
 * - the **exploded-view control** (`ui/hud/DisassemblyHud.tsx`) — its `VISTA DESPIEZADA` panel;
 * - the **annotation layer** — the labels, the leader lines and the anchor markers
 *   (`ui/annotations/AnnotationLayer.tsx`), both its DOM half and its frame half;
 * - the **disassembly driver** (`scene/disassembly.ts`) — so no offset is ever written to an
 *   organelle root. At 0 % the driver is a no-op, but switching it off makes "the model is whole"
 *   structural rather than a consequence of a store default.
 *
 * It deliberately does **not** turn off `scene/models/*`, the anchor registry or the pick volumes:
 * those are how the model is mounted and measured, not a study aid, and the model must keep
 * rendering as authored with them.
 *
 * Typed as `boolean` on purpose, so both branches stay type-checked and reachable for the compiler
 * and the bundler — a literal `false` would let them be folded away, which is the opposite of
 * "keep the code".
 */
export const STRUCTURE_TOOLS_ENABLED: boolean = false;
