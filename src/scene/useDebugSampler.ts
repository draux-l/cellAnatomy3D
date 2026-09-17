import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { attachRendererSampling, cellDebug } from '../app/debug';
import { processClock, speedToScale } from '../app/clock';
import { useAppStore } from '../app/store';
import type { FixtureConfig } from '../app/fixture';

/**
 * Feeds `window.__cellDebug` from inside the render loop, and applies the fixture's clock.
 *
 * It renders nothing. Reading the clock and `renderer.info` here — never through React state —
 * is the whole point of the transient/reactive split.
 */
export function DebugSampler({ fixture }: { fixture: FixtureConfig }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    cellDebug.fixture = fixture.name;

    if (fixture.freezeClock) {
      processClock.freezeAt(fixture.frozenTime);
    } else {
      processClock.resume();
    }

    processClock.setScale(speedToScale(useAppStore.getState().speed));

    return () => {
      processClock.reset();
    };
  }, [fixture]);

  useEffect(
    () => attachRendererSampling(gl, scene, cellDebug, () => performance.now()),
    [gl, scene],
  );

  useFrame((_state, delta) => {
    cellDebug.recordFrame(delta * 1000, performance.now());
  });

  return null;
}
