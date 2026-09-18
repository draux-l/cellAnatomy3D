import { useEffect, useRef } from 'react';
import { useAppStore } from '../../app/store';
import { processTransport } from '../../processes/transport';
import { useT } from '../i18n';
import {
  REPRODUCTION_PHASE_ORDER,
  formatProgress,
  reproductionPhaseKey,
} from './scrubModel';

/**
 * The reproduction scrub bar (task 6.3, spec: `Scrub And Phase Addressability`).
 *
 * Three claims are built into this control, and each is the reason for a decision:
 *
 * 1. **Zero React re-render while scrubbing.** The slider is **uncontrolled**: it writes a request
 *    into the transient transport on `input` and nothing reads it back through React. Dragging is a
 *    pointer gesture at pointer-move rate, so a controlled `value` plus `setState` would re-render
 *    the whole tree — including the canvas — dozens of times per second. This is the classic R3F
 *    trap the project's Hard Rule forbids, and it is the same mechanism the light slider uses.
 * 2. **The readout is a measurement.** The phase name, the percentage and the pressed button are all
 *    projected from what the timeline *actually holds* — the transport's published playhead, written
 *    by the driver each frame — through `textContent` and `data-*` writes on an interval, exactly
 *    like the process panel's stage readout and the FPS readout. No second clock exists, so the
 *    control cannot disagree with the animation.
 * 3. **Backward scrubbing re-triggers nothing, structurally.** Seeking is the only thing this control
 *    does; the animation is a pure function of the playhead, so there is no event to fire twice. The
 *    suite asserts that instead of trusting it: the same progress reached forward and backward must
 *    render the same frame.
 *
 * Phase buttons **seek by label** and pause: the spec's scenario is a sequence paused at a phase that
 * jumps to the named one, and a seek that immediately resumed would show the label for a single
 * frame. Pausing is one discrete store write, so the shared speed control visibly agrees with what
 * happened — the user resumes from the same control they always use.
 */

/**
 * How often the readout is refreshed.
 *
 * 8 Hz, the same cadence as the process panel's readout: fast enough to read as live, slow enough
 * that the DOM writes are bounded — and it is a read, so the cadence cannot change what is read.
 */
export const SCRUB_READOUT_INTERVAL_MS = 125;

export function ScrubBar() {
  const t = useT();
  const setSpeed = useAppStore((state) => state.setSpeed);
  const input = useRef<HTMLInputElement | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const phaseButtons = useRef<Map<string, HTMLButtonElement>>(new Map());
  const percentage = useRef<HTMLElement | null>(null);
  const phaseName = useRef<HTMLElement | null>(null);
  // The last text written per node, so a DOM write happens only when a value actually changed.
  const lastWritten = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const timer = window.setInterval(() => {
      const container = root.current;
      const slider = input.current;
      const written = lastWritten.current;
      const progress = processTransport.progress;
      const label = processTransport.label;
      const phase = label === null ? REPRODUCTION_PHASE_ORDER[0] : label;

      if (container !== null && container.dataset.label !== phase) {
        container.dataset.label = phase;
      }

      // Never fight the user's own drag: while a pointer is down (or a key is held) the slider
      // belongs to the gesture, and the readout resumes ownership the moment it ends.
      if (slider !== null && !processTransport.scrubbing) {
        const next = String(Math.round(progress * 100));

        if (slider.value !== next) {
          slider.value = next;
        }
      }

      for (const [name, button] of phaseButtons.current) {
        const pressed = name === phase ? 'true' : 'false';

        if (button.getAttribute('aria-pressed') !== pressed) {
          button.setAttribute('aria-pressed', pressed);
        }
      }

      const text = t(reproductionPhaseKey(phase));

      if (phaseName.current !== null && written.get('phase') !== text) {
        written.set('phase', text);
        phaseName.current.textContent = text;
      }

      const percent = formatProgress(progress);

      if (percentage.current !== null && written.get('percent') !== percent) {
        written.set('percent', percent);
        percentage.current.textContent = percent;
      }
    }, SCRUB_READOUT_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [t]);

  return (
    <div className="scrub" data-reproduction-scrub data-label={REPRODUCTION_PHASE_ORDER[0]} ref={root}>
      <div className="scrub__head">
        <label className="scrub__label" htmlFor="reproduction-scrub">
          {t('process.reproduction.scrub.title')}
        </label>
        <span className="scrub__value">
          <span data-role="scrub-phase" ref={phaseName}>
            {t(reproductionPhaseKey(REPRODUCTION_PHASE_ORDER[0]))}
          </span>
          {' · '}
          <span data-role="scrub-percent" ref={percentage}>
            {formatProgress(0)}
          </span>
        </span>
      </div>

      <input
        id="reproduction-scrub"
        className="scrub__slider"
        data-role="scrub"
        type="range"
        min={0}
        max={100}
        step={1}
        defaultValue={0}
        aria-label={t('process.reproduction.scrub.title')}
        onPointerDown={() => processTransport.setScrubbing(true)}
        onPointerUp={() => processTransport.setScrubbing(false)}
        onPointerCancel={() => processTransport.setScrubbing(false)}
        onKeyDown={() => processTransport.setScrubbing(true)}
        onKeyUp={() => processTransport.setScrubbing(false)}
        onInput={(event) => {
          // A scrub is a manual placement of the playhead, so the sequence holds where it was put;
          // the speed control is what starts it again.
          setSpeed('pause');
          processTransport.scrub(Number(event.currentTarget.value) / 100);
        }}
      />

      <div className="scrub__phases" role="group" aria-label={t('process.reproduction.scrub.title')}>
        {REPRODUCTION_PHASE_ORDER.map((phase) => (
          <button
            key={phase}
            type="button"
            className="scrub__phase"
            data-phase={phase}
            aria-pressed={false}
            ref={(element) => {
              if (element === null) {
                phaseButtons.current.delete(phase);
                return;
              }

              phaseButtons.current.set(phase, element);
            }}
            onClick={() => {
              setSpeed('pause');
              processTransport.seek(phase);
            }}
          >
            {t(reproductionPhaseKey(phase))}
          </button>
        ))}
      </div>
    </div>
  );
}
