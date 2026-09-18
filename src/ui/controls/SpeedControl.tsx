import { useAppStore } from '../../app/store';
import { useT } from '../i18n';
import { SPEED_OPTIONS } from './speedModel';

/**
 * The shared speed control (task 5.1, spec: `Speed Control`).
 *
 * Pause / slow / real time, one discrete store write per press. It has no local state and no
 * animation: the *processes* read the setting — the scripted one through `timeline.timeScale()`, the
 * continuous one through the shared clock's scale — so the control's whole job is to change one
 * value and say which value is current.
 *
 * A button group rather than a range input because there are exactly three ratified settings and the
 * spec names them. `aria-pressed` carries the state, and `data-speed` carries it for the harness, so
 * an end-to-end test asserts the same value the processes read.
 */
export function SpeedControl() {
  const t = useT();
  const speed = useAppStore((state) => state.speed);
  const setSpeed = useAppStore((state) => state.setSpeed);

  return (
    <div className="speed" role="group" aria-label={t('process.speed.title')} data-speed-group>
      {SPEED_OPTIONS.map((option) => (
        <button
          key={option.speed}
          type="button"
          className="speed__option"
          data-speed={option.speed}
          aria-pressed={option.speed === speed}
          onClick={() => setSpeed(option.speed)}
        >
          {t(option.labelKey)}
        </button>
      ))}
    </div>
  );
}
