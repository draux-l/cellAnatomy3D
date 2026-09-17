import { useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr } from '@react-three/drei';
import type { FixtureConfig } from '../app/fixture';
import { useAppStore } from '../app/store';
import type { CellId } from '../catalog/types';
import { DisassemblyHud } from '../ui/hud/DisassemblyHud';
import { CellStage } from './CellStage';
import type { DisassemblyHudTarget } from './disassembly';
import { OrganelleStage } from './OrganelleStage';
import { useQualityTier } from './quality';
import { DPR_CAP, RENDERER_SETTINGS } from './renderSettings';

/**
 * The one `<Canvas>` for the whole app.
 *
 * Tone mapping is set explicitly: React Three Fiber defaults to ACES, which is prohibited here
 * because it shifts hue and breaks palette-swatch fidelity.
 *
 * Two stages share it. The `organelle` fixture keeps the M0 isolated-builder stage
 * byte-identical; every other route — the real app included — composes a whole cell from the
 * catalog roster. That split is what lets this slice add composition without moving a single
 * committed organelle baseline.
 */

/** The live view the user is on, as the composer's cell id. Comparison mode is M6. */
function cellForFixture(fixture: FixtureConfig, activeView: string): CellId {
  if (fixture.cell !== null) {
    return fixture.cell;
  }

  return activeView === 'plant' ? 'plant' : 'animal';
}

export function CellViewer({ fixture }: { fixture: FixtureConfig }) {
  if (fixture.name === 'organelle') {
    return (
      <Canvas
        dpr={[1, DPR_CAP]}
        frameloop="always"
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          ...RENDERER_SETTINGS,
        }}
        camera={{
          position: fixture.camera.position,
          fov: fixture.camera.fov,
          near: 0.1,
          far: 100,
        }}
      >
        <OrganelleStage fixture={fixture} />
      </Canvas>
    );
  }

  return <ComposedCellView fixture={fixture} />;
}

/**
 * The composed cell, plus the DOM the harness and the accessibility tree read.
 *
 * `data-hovered` / `data-selected` / `data-cell` are the app's own state written to attributes —
 * not a debug bridge. They are how an end-to-end test can ask "what does the viewer think is
 * hovered?" through the same discrete store the render uses, which is what makes the hover and
 * isolate scenarios assertable from outside the canvas.
 */
function ComposedCellView({ fixture }: { fixture: FixtureConfig }) {
  const activeView = useAppStore((state) => state.activeView);
  const hoveredId = useAppStore((state) => state.hoveredId);
  const selectedId = useAppStore((state) => state.selectedId);
  const setHovered = useAppStore((state) => state.setHovered);
  const setSelected = useAppStore((state) => state.setSelected);
  const disassemblyTarget = useAppStore((state) => state.disassemblyTarget);
  const tier = useQualityTier(fixture.name);
  const cell = cellForFixture(fixture, activeView);
  // React never renders the readout text; the frame loop owns it. React owns the slider position.
  const hudTarget = useRef<DisassemblyHudTarget>({ percent: null, state: null, lastWritten: -1 });

  useEffect(() => {
    // A fixture names its hover/isolate/disassembly state in the URL. Setting it once, rather than
    // animating into it, is what makes the screenshot a function of the URL.
    setHovered(fixture.hoveredId);
    setSelected(fixture.selectedId);
    useAppStore.getState().setDisassembly(fixture.disassemblyValue ?? 0);
    hudTarget.current.lastWritten = -1;
  }, [fixture, setHovered, setSelected]);

  useEffect(() => {
    // "Back to the view-selection state" (spec: `Back to selection returns to the landing state`).
    // The pointer-only path is the empty-space click the pick controller already handles; this adds
    // a second, keyboard-only affordance until M1e's navigation panel provides a visible button.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }

      useAppStore.getState().resetToSelection();
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      className="cell-view"
      data-cell={cell}
      data-hovered={hoveredId ?? ''}
      data-selected={selectedId ?? ''}
      data-disassembly={disassemblyTarget}
    >
      <Canvas
        dpr={[1, tier.dpr]}
        frameloop="always"
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          ...RENDERER_SETTINGS,
        }}
        camera={{
          position: fixture.camera.position,
          fov: fixture.camera.fov,
          near: 0.1,
          far: 100,
        }}
        // No `onPointerMissed` here: the pick controller owns click classification, because a
        // "miss" in R3F's terms would be every click (the hit volumes carry no R3F handlers) and
        // would clear a selection the controller just made.
      >
        <CellStage cell={cell} fixture={fixture} tier={tier} hudTarget={hudTarget} />
        {/* Drei's adaptive pass only in the real app: it changes resolution in response to load,
            which would make a fixture screenshot depend on the machine. */}
        {fixture.name === null ? <AdaptiveDpr pixelated={false} /> : null}
      </Canvas>

      <DisassemblyHud
        value={disassemblyTarget}
        target={hudTarget}
        frozen={fixture.disassemblyValue !== null}
      />
    </div>
  );
}
