import { useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr } from '@react-three/drei';
import type { FixtureConfig } from '../app/fixture';
import { useAppStore, type AppState } from '../app/store';
import { ANNOTATIONS_ENABLED, DISPERSION_ENABLED } from '../app/structureTools';
import type { CellId } from '../catalog/types';
import {
  AnnotationOverlay,
  createAnnotationLayerTarget,
  type AnnotationLayerTarget,
} from '../ui/annotations/AnnotationLayer';
import { FpsReadout } from '../ui/hud/FpsReadout';
import { HoverLabel } from '../ui/HoverLabel';
import { InspectorNav } from '../ui/InspectorNav';
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
  const tier = useQualityTier(fixture.name);
  const cell = cellForFixture(fixture, activeView);
  const containerRef = useRef<HTMLDivElement | null>(null);
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
   * Two independent gates, because they answer different questions: `ANNOTATIONS_ENABLED` is the
   * product decision (the leader-line layer stays hidden while the part definitions are rebuilt),
   * and `fixture.showAnnotations` is the URL's capture override (`?annotations=off`). The flag is
   * the outer one, so the layer cannot come back through a URL.
   */
  const annotationsMounted = ANNOTATIONS_ENABLED && fixture.showAnnotations;

  /**
   * The `data-*` mirror of the discrete state, written **outside React**.
   *
   * These three attributes are styling hooks and a harness contract, not scene inputs — but they
   * used to be subscribed with `useAppStore(...)`, so every hover transition and every slider step
   * re-rendered this component and, with it, the whole `<Canvas>` subtree. The `<Environment>` and
   * the contact-shadow pass live down there, and re-rendering them on each interaction is the
   * measured ~450 ms stall. Subscribing imperatively keeps the scene completely out of that render:
   * hover and the dispersion slider no longer touch React here at all.
   *
   * The writes are compared first because the store notifies on *any* key (locale, palette), and an
   * unchanged attribute should not dirty the DOM.
   */
  useEffect(() => {
    const node = containerRef.current;

    if (!node) {
      return;
    }

    let hovered = '';
    let selected = '';
    let disassembly = Number.NaN;

    const apply = (state: AppState): void => {
      const nextHovered = state.hoveredId ?? '';
      const nextSelected = state.selectedId ?? '';

      if (nextHovered !== hovered) {
        node.dataset.hovered = nextHovered;
        hovered = nextHovered;
      }

      if (nextSelected !== selected) {
        node.dataset.selected = nextSelected;
        selected = nextSelected;
      }

      if (state.disassemblyTarget !== disassembly) {
        node.dataset.disassembly = String(state.disassemblyTarget);
        disassembly = state.disassemblyTarget;
      }
    };

    apply(useAppStore.getState());

    return useAppStore.subscribe(apply);
  }, []);

  useEffect(() => {
    // A fixture names its disassembly state in the URL. Setting it once, rather than animating into
    // it, is what makes the screenshot a function of the URL.
    //
    // Order matters, though the handoff is now one-directional: raising the disassembly clears the
    // isolate, so a fixture that names both must set the dispersion FIRST and the selection SECOND.
    // The capture then shows the chosen part alone — the driver hides every other part and the camera
    // frames where the part travelled to — which is what a per-organelle capture is about.
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
      ref={containerRef}
      className="cell-view"
      data-cell={cell}
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
        // "miss" in R3F's terms would be every click (the pick targets carry no R3F handlers) and
        // would clear a selection the controller just made.
      >
        <CellStage
          cell={cell}
          fixture={fixture}
          tier={tier}
          hudTarget={hudTarget}
          dispersionEnabled={DISPERSION_ENABLED}
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

      {/*
        The step control of the inspection view. It renders nothing without a selection, and it is
        mounted unconditionally so its hooks keep a stable position in the tree.
      */}
      <InspectorNav cell={cell} />

      {fixture.showFps ? <FpsReadout /> : null}

      {/*
        The dispersion control: the ordered exploded view. Gated by its own flag (see
        `app/structureTools.ts`) and independent of the annotation layer, so the model can be taken
        apart without also being labelled. At 0 % the driver writes every part's own base, so the
        resting view is the model exactly as the GLB authors it.
      */}
      {DISPERSION_ENABLED ? (
        <DisassemblyHud target={hudTarget} frozen={fixture.disassemblyValue !== null} />
      ) : null}
    </div>
  );
}
