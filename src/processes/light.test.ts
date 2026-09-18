import { beforeEach, describe, expect, it } from 'vitest';
import {
  LIGHT_DEFAULT,
  LIGHT_MAX,
  LIGHT_MIN,
  clampLightPercent,
  createLightState,
  percentToIntensity,
  processLight,
} from './light';

/**
 * The transient light state (task 5.4).
 *
 * The write counter is the important part, and it is the reason this module exists as a unit rather
 * than as a number exported from the UI: the spec's requirement that respiration is unaffected by
 * light is asserted as "the app's `uLightIntensity` uniform was written zero times while only
 * respiration ran", and that is only measurable if every write goes through one counter.
 */

describe('light clamping', () => {
  it('rounds to a whole percent inside the range', () => {
    expect(clampLightPercent(-10)).toBe(LIGHT_MIN);
    expect(clampLightPercent(0)).toBe(0);
    expect(clampLightPercent(57.6)).toBe(58);
    expect(clampLightPercent(1000)).toBe(LIGHT_MAX);
  });

  it('treats an unparseable value as the default rather than as darkness', () => {
    // Zero light is a *statement about the world* ("there is no light"), so a broken control value
    // must not silently make it. Absence of a value is not a measurement of darkness.
    expect(clampLightPercent(Number.NaN)).toBe(LIGHT_DEFAULT);
    expect(clampLightPercent(Number.POSITIVE_INFINITY)).toBe(LIGHT_MAX);
  });

  it('converts percent to the shader\'s 0..1 range', () => {
    expect(percentToIntensity(0)).toBe(0);
    expect(percentToIntensity(50)).toBeCloseTo(0.5);
    expect(percentToIntensity(100)).toBe(1);
    expect(percentToIntensity(1000)).toBe(1);
  });
});

describe('the light state', () => {
  it('starts at full light, so photosynthesis is visibly running when entered', () => {
    const light = createLightState();

    expect(light.percent).toBe(LIGHT_DEFAULT);
    expect(light.intensity).toBe(1);
    expect(light.uniformWrites).toBe(0);
  });

  it('counts uniform writes and nothing else', () => {
    const light = createLightState();

    light.setPercent(40);

    expect(light.uniformWrites, 'the control write is not a uniform write').toBe(0);

    expect(light.recordUniformWrite()).toBeCloseTo(0.4);
    expect(light.recordUniformWrite()).toBeCloseTo(0.4);
    expect(light.uniformWrites).toBe(2);
  });

  it('resets the value and the counter together', () => {
    const light = createLightState();

    light.setPercent(0);
    light.recordUniformWrite();
    light.reset();

    expect(light.percent).toBe(LIGHT_DEFAULT);
    expect(light.uniformWrites).toBe(0);
  });

  it('reports zero intensity at zero percent, which is what stops the flow', () => {
    const light = createLightState();

    light.setPercent(0);

    expect(light.intensity).toBe(0);
  });
});

describe('the shared instance', () => {
  beforeEach(() => {
    processLight.reset();
  });

  it('is a single value the slider, the fixture and the shader all read', () => {
    processLight.setPercent(0);

    expect(processLight.intensity).toBe(0);

    processLight.setPercent(LIGHT_MAX);

    expect(processLight.intensity).toBe(1);
  });
});
