/**
 * The WebGL2 capability probe (task 4.6, design D9).
 *
 * It answers one question — can this browser create a WebGL2 context? — **before** any `<Canvas>` is
 * considered. Hard-requiring WebGL2 without asking would blank school machines, which is the exact
 * resilience the proposal flags; a canvas that never renders is the one outcome the spec forbids,
 * so the answer decides between the 3D viewer and the static fallback.
 *
 * Why WebGL2 specifically: three.js r163+ removed WebGL1 support, so WebGL1 would mount a renderer
 * that then fails. The probe therefore asks the question the renderer will ask.
 *
 * The module is three-free and lives in the shell on purpose: the WebGL check has to run before the
 * lazy 3D chunk is even fetched, and importing anything from `src/scene/` would pull that chunk
 * into the entry graph.
 */

/** The context id the renderer needs. `as const` so the DOM overload resolves to WebGL2. */
export const WEBGL2_CONTEXT_ID = 'webgl2' as const;

/**
 * True when a WebGL2 context can be created.
 *
 * The probe canvas is deliberately thrown away: on success the context is immediately released via
 * `WEBGL_lose_context`, because browsers cap how many live WebGL contexts a page may hold and a
 * machine that supports WebGL2 must not spend one slot on a canvas nobody draws to.
 *
 * A `getContext` that throws counts as unavailable — that is how some locked-down browsers and
 * driver-blocklisted machines behave, and it is a failure to *create* the context, which is what
 * the spec's GIVEN describes.
 */
export function isWebGL2Available(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext(WEBGL2_CONTEXT_ID);

    if (!context) {
      return false;
    }

    context.getExtension('WEBGL_lose_context')?.loseContext();

    return true;
  } catch {
    return false;
  }
}
