/**
 * The structure-study layer: the dispersion control and the annotation layer.
 *
 * ## Why it exists
 *
 * Both surfaces answer "which part is this?" and "how do the parts fit together?" — the dispersion
 * control takes the model apart in an authored order, and the annotation layer names each part with
 * a leader line.
 *
 * ## Three flags, because they answer three different questions
 *
 * The layer used to sit behind a single switch, and splitting it was deliberate: the product wants
 * the model **taken apart** without being **labelled**. One flag could not express that, because
 * turning the dispersion on turned the leader lines on with it.
 *
 * - `DISPERSION_ENABLED` — "can the model be taken apart?" It gates the control
 *   (`ui/hud/DisassemblyHud.tsx`) and the driver (`scene/disassembly.ts`). It is **on**.
 * - `ANNOTATIONS_ENABLED` — "does the viewer name every part with a leader line?" It gates
 *   `ui/annotations/AnnotationLayer.tsx`, both its DOM half and its frame half. It stays **off**:
 *   the part definitions are still being rebuilt.
 * - `HOVER_LABEL_ENABLED` — "does hovering a part name it?" That one is **on**, and it is
 *   deliberately not the annotation layer: it draws no leader lines and no columns.
 *
 * ## What `DISPERSION_ENABLED` does not turn off
 *
 * `scene/models/*`, the anchor registry and the pick targets stay mounted unconditionally: those are
 * how the model is mounted and measured, not a study aid. Switching the control on does not change
 * the resting view either — at 0 % the driver writes each part's own base, and the parts that never
 * separate (the membrane, the cytoplasm and the cytoskeleton) are pinned there at every value.
 *
 * Typed as `boolean` on purpose, so both branches stay type-checked and reachable for the compiler
 * and the bundler — a literal `false` would let them be folded away, which is the opposite of
 * "keep the code".
 */
export const DISPERSION_ENABLED: boolean = true;

/**
 * Whether the annotation layer — the leader lines, the columns and the anchor markers — is shown.
 *
 * Off, and hidden rather than deleted: the part definitions are still being rebuilt, and a label
 * that names a part without being able to explain it is worse than no label. The whole layer — its
 * solver, its overlay, its driver and their tests — stays in the tree and comes back by flipping
 * this one value.
 */
export const ANNOTATIONS_ENABLED: boolean = false;

/**
 * The hover name popup: a **separate** flag, on by default.
 *
 * Hovering a part shows a small popup with the part's name in the active locale. This is the one
 * part-identification surface the product wants while the descriptions are being authored, and it is
 * gated here rather than by `ANNOTATIONS_ENABLED`, so the two cannot change together by accident.
 *
 * Typed `boolean` for the same reason as the flags above: both branches stay reachable for the
 * compiler and the bundler.
 */
export const HOVER_LABEL_ENABLED: boolean = true;
