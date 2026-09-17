import { Canvas } from '@react-three/fiber';
import type { FixtureConfig } from '../app/fixture';
import { useAppStore } from '../app/store';
import type { CellId } from '../catalog/types';
import { CellStage } from './CellStage';
import { OrganelleStage } from './OrganelleStage';
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
  const cell = cellForFixture(fixture, activeView);

  return (
    <div
      className="cell-view"
      data-cell={cell}
      data-hovered={hoveredId ?? ''}
      data-selected={selectedId ?? ''}
    >
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
        <CellStage cell={cell} fixture={fixture} />
      </Canvas>
    </div>
  );
}
