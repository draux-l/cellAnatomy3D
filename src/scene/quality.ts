import { useEffect, useState } from 'react';
import { cellDebug } from '../app/debug';
import { DPR_CAP } from './renderSettings';

/**
 * The runtime quality tier (design D12).
 *
 * Two settings are worth degrading and nothing else: the device pixel ratio, which is the single
 * biggest fill-rate lever at 1080p, and the contact-shadow pass, which is a whole extra render.
 * Everything else the skill forbids anyway — no LOD, no SSAO, no `transmission`.
 *
 * Two rules decide the tier, and the design names both:
 *
 * - **`hardwareConcurrency <= 4`,** evaluated once at startup. A four-core machine that reports a
 *   low frame time under CI conditions will not do so with a browser, a terminal and a screen
 *   recorder on it, so the tier is chosen before the app has to find out the hard way.
 * - **a p95 frame time above a 55 fps budget,** re-checked on a slow interval. This is the
 *   *degradation* path, not the startup path, and it only runs in the real app.
 *
 * **Why fixtures pin the tier.** A screenshot must be a function of the URL. If the tier depended on
 * the host's core count, the same fixture would render contact shadows on one machine and not on
 * another, and the committed baselines would be wrong for half the team. Under `?fixture=` the tier
 * is pinned to `high`; the adaptive path is unit-tested and runs only in the real app.
 */

export type QualityTierName = 'high' | 'reduced';

export interface QualityTier {
  name: QualityTierName;
  /** Device pixel ratio cap handed to the renderer. Never above `DPR_CAP`. */
  dpr: number;
  contactShadows: boolean;
}

export const HIGH_TIER: QualityTier = { name: 'high', dpr: DPR_CAP, contactShadows: true };
export const REDUCED_TIER: QualityTier = { name: 'reduced', dpr: 1, contactShadows: false };

/** At or below this many logical cores, the reduced tier is chosen at startup. */
export const LOW_CORE_THRESHOLD = 4;
/** The p95 budget, in milliseconds: the 55 fps advisory target from the design. */
export const P95_FRAME_TARGET_MS = 1000 / 55;
/** How often the real app re-checks the frame statistics. Slow on purpose: p95 over ~10 s moves slowly. */
export const QUALITY_RECHECK_INTERVAL_MS = 4000;

export interface QualitySignals {
  hardwareConcurrency?: number | null;
  p95Ms?: number | null;
}

/**
 * The tier for a set of signals. Pure, so both rules are unit-testable without a browser.
 *
 * An absent or nonsensical signal is *not* a reason to degrade: `navigator.hardwareConcurrency` is
 * undefined in some environments, and treating "unknown" as "slow" would put every such machine on
 * the reduced tier for no reason.
 */
export function resolveQualityTier(signals: QualitySignals = {}): QualityTier {
  const cores = signals.hardwareConcurrency;
  const lowCoreCount = typeof cores === 'number' && Number.isFinite(cores) && cores > 0 && cores <= LOW_CORE_THRESHOLD;
  const p95 = signals.p95Ms;

  // p95 is 0 until the first frames land, which is not a degradation signal.
  const slowFrames = typeof p95 === 'number' && Number.isFinite(p95) && p95 > P95_FRAME_TARGET_MS;

  return lowCoreCount || slowFrames ? REDUCED_TIER : HIGH_TIER;
}

/** The tier a session starts on. A fixture pins `high` so a screenshot cannot depend on the host. */
export function initialQualityTier(fixtureName: string | null): QualityTier {
  if (fixtureName !== null) {
    return HIGH_TIER;
  }

  return resolveQualityTier({ hardwareConcurrency: navigator.hardwareConcurrency });
}

/**
 * The tier in force, mirrored onto the debug bridge so the perf report records what was applied
 * rather than what the code intended.
 */
export function useQualityTier(fixtureName: string | null): QualityTier {
  const [tier, setTier] = useState<QualityTier>(() => initialQualityTier(fixtureName));

  useEffect(() => {
    cellDebug.qualityTier = tier.name;
  }, [tier]);

  useEffect(() => {
    if (fixtureName !== null) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setTier(
        resolveQualityTier({
          hardwareConcurrency: navigator.hardwareConcurrency,
          p95Ms: cellDebug.frameStats.p95Ms,
        }),
      );
    }, QUALITY_RECHECK_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [fixtureName]);

  return tier;
}
