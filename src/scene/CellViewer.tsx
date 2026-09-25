import { useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr } from '@react-three/drei';
import type { FixtureConfig } from '../app/fixture';
import { useAppStore } from '../app/store';
import { STRUCTURE_TOOLS_ENABLED } from '../app/structureTools';
import type { CellId } from '../catalog/types';
import {
  AnnotationOverlay,
  createAnnotationLayerTarget,
  type AnnotationLayerTarget,
} from '../ui/annotations/AnnotationLayer';
import { FpsReadout } from '../ui/hud/FpsReadout';
import { HoverLabel } from '../ui/HoverLabel';
import { DisassemblyHud } from '../ui/hud/DisassemblyHud';
import { CellStage } from './CellStage';
import type { DisassemblyHudTarget } from './disassembly';
import { useQualityTier } from './quality';
import { RENDERER_SETTINGS } from './renderSettings';

/**
 * The one `<Canvas>` for the whole app.
 *
 * Tone mapping is set explicitly: React Three Fiber defaults to ACES, which is prohibited here
 * because it shifts hue and breaks palette-swatch fidelity.
 *
 * The composed stage mounts the cell through the catalog roster. The catalog is empty while the cell
 * models are reset, so the canvas renders the lighting rig and its inspection mechanisms with no
 * cell body — the shell, the HUD and the annotation layer all mount exactly as they will once a
 * model is composed in.
 */

/** The live view the user is on, as the composer's cell id. Comparison mode is M6. */
function cellForFixture(fixture: FixtureConfig, activeView: string): CellId {
  if (fixture.cell !== null) {
    return fixture.cell;
  }

  return activeView === 'plant' ? 'plant' : 'animal';
}

export function CellViewer({ fixture }: { fixture: FixtureConfig }) {
  const activeView = useAppStore((state) => state.activeView);
  const hoveredId = useAppStore((state) => state.hoveredId);
  const selectedId = useAppStore((state) => state.selectedId);
  const disassemblyTarget = useAppStore((state) => state.disassemblyTarget);
  const tier = useQualityTier(fixture.name);
  const cell = cellForFixture(fixture, activeView);
  // React never renders the readout text; the frame loop owns it. React owns the slider position.
  const hudTarget = useRef<DisassemblyHudTarget>({ percent: null, state: null, lastWritten: -1 });
  /**
   * The annotation layer's shared node registry.
   *
   * The DOM half lives outside the canvas and records its nodes here; the frame half lives inside
   * and writes to them. A ref object rather than React state, so per-frame writes never reach
   * React — the same mechanism the disassembly readout uses.
   */
  const annotationTarget: AnnotationLayerTarget = useMemo(createAnnotationLayerTarget, []);
  /**
   * Whether the annotation layer is mounted at all.
   *
   * Two independent gates, because they answer different questions: `STRUCTURE_TOOLS_ENABLED` is
   * the product decision (the part-identification layer is hidden while the part definitions are
   * rebuilt), and `fixture.showAnnotations` is the URL's capture override
   * (`?annotations=off`). The flag is the outer one, so the layer cannot come back through a URL.
   */
  const annotationsMounted = STRUCTURE_TOOLS_ENABLED && fixture.showAnnotations;

  useEffect(() => {
    // A fixture names its disassembly state in the URL. Setting it once, rather than animating into
    // it, is what makes the screenshot a function of the URL.
    //
    // Order matters: the two controls hand off to each other in the store (each clears the other), so
    // a fixture that names both pins the selection — a per-organelle capture is about the part, and
    // an exploded cell would move it out of its own frame.
    useAppStore.getState().setDisassembly(fixture.disassemblyValue ?? 0);

    if (fixture.select !== null) {
      useAppStore.getState().setSelected(fixture.select);
    }

    hudTarget.current.lastWritten = -1;
  }, [fixture]);

  useEffect(() => {
    // "Back to the view-selection state" (spec: `Back to selection returns to the landing state`).
    // The pointer-only path is the empty-space click the pick controller already handles; this adds
    // a second, keyboard-only affordance.
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
        <CellStage
          cell={cell}
          fixture={fixture}
          tier={tier}
          hudTarget={hudTarget}
          structureToolsEnabled={STRUCTURE_TOOLS_ENABLED}
          annotationTarget={annotationsMounted ? annotationTarget : null}
        />
        {/* Drei's adaptive pass only in the real app: it changes resolution in response to load,
            which would make a fixture screenshot depend on the machine. */}
        {fixture.name === null ? <AdaptiveDpr pixelated={false} /> : null}
      </Canvas>

      {/* The overlay itself. Outside the canvas, so it costs zero draw calls and its typography is
          the browser's rather than a texture atlas. */}
      {annotationsMounted ? <AnnotationOverlay cell={cell} target={annotationTarget} /> : null}

      {/*
        The hover name popup. Separate from the annotation layer and gated by its own flag
        (`HOVER_LABEL_ENABLED`), so the leader lines stay hidden while hovering still names a part.
        It follows the pointer with direct DOM writes, so it never re-renders React per frame.
      */}
      <HoverLabel />

      {fixture.showFps ? <FpsReadout /> : null}

      {/*
        The exploded-view control. Hidden with the rest of the structure-study layer (see
        `app/structureTools.ts`): the model is presented as the GLB authors it, so nothing on screen
        offers to take it apart. The component is untouched and comes back with the flag.
      */}
      {STRUCTURE_TOOLS_ENABLED ? (
        <DisassemblyHud
          value={disassemblyTarget}
          target={hudTarget}
          frozen={fixture.disassemblyValue !== null}
        />
      ) : null}
    </div>
  );
}
