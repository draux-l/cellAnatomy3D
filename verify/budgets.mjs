/**
 * The ratified performance budgets (design D8).
 *
 * One source of truth, because two different things consume them: the Playwright harness
 * hard-fails CI on the deterministic ones, and `perf-report.mjs` records the measured value of
 * every one of them. Changing a number here changes both the gate and the recorded target, which
 * is the point — a budget cannot drift in one place while the evidence claims the other.
 *
 * Deterministic budgets (draw calls, triangles, payload sizes) hard-fail CI. Frame timing does
 * not: shared CI runners jitter, so it is measured locally and recorded as advisory.
 */

export const PERFORMANCE_BUDGETS = {
  /** Draw calls for one cell. Comparison mode doubles this, so the pair stays under 300. */
  drawCallsPerCell: 150,
  /** Draw calls with both cells mounted. */
  drawCallsComparison: 300,
  /** Triangles for a single organelle; organelles render small on screen. */
  trianglesPerOrganelle: 25_000,
  /** Triangles visible in a full cell scene; two cells stay affordable. */
  trianglesPerCell: 150_000,
  /** First meaningful 3D paint, in milliseconds. */
  first3dPaintMs: 3000,
  /** Steady-state frames per second on the reference laptop. */
  steadyStateFps: 60,
  /** 95th-percentile frames per second on the reference laptop. */
  p95Fps: 55,
};
