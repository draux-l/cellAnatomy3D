import type { SpeedSetting } from '../../app/store';
import { SPEED_SCALE } from '../../app/clock';
import type { UiKey } from '../i18n/messages';

/**
 * The shared speed control's model (task 5.1, spec: `Speed Control`).
 *
 * The mapping itself is not here — it is `src/app/clock.ts`'s `SPEED_SCALE`, the single place
 * "pause is 0, slow is 0.25, real time is 1" is written, and `clock.test.ts` already pins it. This
 * module is the *control*: which settings exist, in which order, and what each is called.
 *
 * The order is the spec's own: pause, slow, real time. A test asserts this list is exactly the keys
 * of `SPEED_SCALE`, so a fourth speed cannot be added to the clock and forgotten in the UI (or
 * offered by the UI and ignored by the clock).
 */

export interface SpeedOption {
  speed: SpeedSetting;
  labelKey: UiKey;
}

export const SPEED_OPTIONS: readonly SpeedOption[] = [
  { speed: 'pause', labelKey: 'process.speed.pause' },
  { speed: 'slow', labelKey: 'process.speed.slow' },
  { speed: 'realtime', labelKey: 'process.speed.realtime' },
];

/** Every setting the shared clock knows, in the order the control presents them. */
export function speedSettings(): SpeedSetting[] {
  return SPEED_OPTIONS.map((option) => option.speed);
}

/** The clock scale a setting maps to, read through the one table that owns the mapping. */
export function speedScaleFor(speed: SpeedSetting): number {
  return SPEED_SCALE[speed];
}
