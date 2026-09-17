import { describe, expect, it } from 'vitest';
import { DPR_CAP } from './renderSettings';
import {
  HIGH_TIER,
  LOW_CORE_THRESHOLD,
  P95_FRAME_TARGET_MS,
  REDUCED_TIER,
  resolveQualityTier,
} from './quality';

/**
 * The runtime quality tier (task 4.8, design D12).
 *
 * Both rules are pure and both sides are asserted: a slow machine degrades, and an *unknown* machine
 * does not. Treating "no signal" as "slow" is the easy bug here, and it would put every environment
 * that does not report a core count onto the reduced tier for no reason.
 */

describe('resolveQualityTier', () => {
  it('chooses the reduced tier on a low core count', () => {
    expect(resolveQualityTier({ hardwareConcurrency: LOW_CORE_THRESHOLD })).toEqual(REDUCED_TIER);
    expect(resolveQualityTier({ hardwareConcurrency: 2 })).toEqual(REDUCED_TIER);
    expect(resolveQualityTier({ hardwareConcurrency: 8 })).toEqual(HIGH_TIER);
  });

  it('chooses the reduced tier when p95 frame time degrades', () => {
    expect(resolveQualityTier({ hardwareConcurrency: 8, p95Ms: P95_FRAME_TARGET_MS * 1.5 })).toEqual(
      REDUCED_TIER,
    );
    expect(resolveQualityTier({ hardwareConcurrency: 8, p95Ms: P95_FRAME_TARGET_MS * 0.5 })).toEqual(
      HIGH_TIER,
    );
  });

  it('does not treat an absent or nonsensical signal as slow', () => {
    expect(resolveQualityTier()).toEqual(HIGH_TIER);
    expect(resolveQualityTier({ hardwareConcurrency: undefined, p95Ms: undefined })).toEqual(HIGH_TIER);
    expect(resolveQualityTier({ hardwareConcurrency: 0 })).toEqual(HIGH_TIER);
    expect(resolveQualityTier({ hardwareConcurrency: Number.NaN })).toEqual(HIGH_TIER);
    // p95 is 0 until the first frames land, which is not a degradation signal.
    expect(resolveQualityTier({ hardwareConcurrency: 8, p95Ms: 0 })).toEqual(HIGH_TIER);
  });

  it('never raises the device pixel ratio above the ratified cap', () => {
    expect(HIGH_TIER.dpr).toBe(DPR_CAP);
    expect(REDUCED_TIER.dpr).toBeLessThanOrEqual(DPR_CAP);
    expect(REDUCED_TIER.dpr).toBe(1);
  });

  it('drops contact shadows only on the reduced tier, never the other way round', () => {
    expect(HIGH_TIER.contactShadows).toBe(true);
    expect(REDUCED_TIER.contactShadows).toBe(false);
  });
});
