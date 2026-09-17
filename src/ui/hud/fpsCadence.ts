/**
 * The FPS readout's cadence and display format, as plain values (task 4.18, design D15).
 *
 * Split out of the component so the Playwright assertion can import the ratified numbers without
 * pulling React into the harness — the code and the bound it is checked against cannot drift.
 */

/** Ratified cadence: 2 Hz. A rolling p50 over ~10 s changes slowly; faster is noise, slower is lag. */
export const FPS_READOUT_INTERVAL_MS = 500;

/** The same cadence as a rate, so an assertion reads as a rate rather than as milliseconds. */
export const FPS_READOUT_MAX_HZ = 1000 / FPS_READOUT_INTERVAL_MS;

/**
 * The readout text for a measured p50.
 *
 * Rounds for display only, and never clips to a range: `formatFps(3.4)` is `3.4`, and a value above
 * the target is displayed as measured too. One decimal rather than none because an integer would
 * turn a genuine 3.4 fps reading into a 15% error against the value it claims to report.
 */
export function formatFps(p50Fps: number): string {
  if (!Number.isFinite(p50Fps) || p50Fps < 0) {
    return '0.0';
  }

  return p50Fps.toFixed(1);
}
