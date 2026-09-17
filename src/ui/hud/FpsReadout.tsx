import { useEffect, useRef } from 'react';
import { cellDebug } from '../../app/debug';
import { useT } from '../i18n';
import { FPS_READOUT_INTERVAL_MS, FPS_READOUT_MAX_HZ, formatFps } from './fpsCadence';

/**
 * The on-screen frame-rate readout (task 4.18, design D15).
 *
 * It is a **DOM projection of `__cellDebug.frameStats.p50Fps`** — the exact object the verification
 * harness reads — written by one `setInterval` at 2 Hz through `textContent`. There is no second
 * sampler, no React state and no per-frame work, and truthfulness is structural rather than a
 * promise: the number on screen *is* the number the harness measures, over the same 600-frame ring
 * buffer.
 *
 * The requirement exists because M0 measured **below** the ≥60 fps target. Hiding, clamping or
 * substituting the value is forbidden, and by construction there is no code path that could: this
 * component only reads. `fpsSource.test.ts` asserts that `p50Fps` is assigned in exactly one place
 * in `src/`, and that this file contains no threshold, no clamp and no `useState`.
 *
 * The cadence and the display format live in `fpsCadence.ts` so the Playwright assertion can import
 * the same numbers without pulling React into the harness.
 */

export { FPS_READOUT_INTERVAL_MS, FPS_READOUT_MAX_HZ, formatFps };

export function FpsReadout() {
  const t = useT();
  const value = useRef<HTMLSpanElement | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const ticks = useRef(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const fps = cellDebug.frameStats.p50Fps;

      if (value.current) {
        value.current.textContent = formatFps(fps);
      }

      // The tick counter is written to the node itself, not to state: the harness reads
      // `data-ticks` to prove the cadence bound, and React is never involved.
      ticks.current += 1;

      if (root.current) {
        root.current.dataset.ticks = String(ticks.current);
      }
    }, FPS_READOUT_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className="fps-readout"
      data-role="fps"
      data-ticks="0"
      ref={root}
      role="status"
      aria-label={t('hud.fps.title')}
    >
      <span className="fps-readout__value" data-role="fps-value" ref={value}>
        {formatFps(cellDebug.frameStats.p50Fps)}
      </span>
      <span className="fps-readout__unit">fps</span>
    </div>
  );
}
