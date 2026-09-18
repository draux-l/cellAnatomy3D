import { describe, expect, it } from 'vitest';
import { SPEED_SCALE } from '../../app/clock';
import { SPEED_OPTIONS, speedScaleFor, speedSettings } from './speedModel';

/**
 * The shared speed control's model (task 5.1, spec: `Speed Control`).
 *
 * The mapping is `app/clock.ts`'s and is already unit-tested there; what is asserted here is that
 * the *control* offers exactly the settings that mapping knows, in the spec's order. A fourth speed
 * added to the clock and forgotten here (or vice versa) is the shape of bug this catches: a control
 * that cannot select a scale, or a scale no control can reach.
 */

describe('the speed options', () => {
  it('covers exactly the ratified settings, in the spec\'s order', () => {
    expect(speedSettings()).toEqual(['pause', 'slow', 'realtime']);
    expect(speedSettings().sort()).toEqual(Object.keys(SPEED_SCALE).sort());
  });

  it('maps each option through the one mapping table', () => {
    expect(speedScaleFor('pause')).toBe(0);
    expect(speedScaleFor('slow')).toBe(0.25);
    expect(speedScaleFor('realtime')).toBe(1);

    for (const option of SPEED_OPTIONS) {
      expect(speedScaleFor(option.speed)).toBe(SPEED_SCALE[option.speed]);
    }
  });

  it('leaves no option without copy', () => {
    for (const option of SPEED_OPTIONS) {
      expect(option.labelKey.startsWith('process.speed.')).toBe(true);
    }
  });
});
