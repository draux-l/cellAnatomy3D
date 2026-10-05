import { useRef } from 'react';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import type { FixtureConfig } from '../app/fixture';
import type { CellId } from '../catalog/types';
import { CellGroup } from './CellGroup';
import { M0_COLORS } from './materials';
import { ENVIRONMENT_RESOLUTION } from './renderSettings';
import { DebugSampler } from './useDebugSampler';
import { useAppStore } from '../app/store';
import { NAVIGATION_LIMITS, dispersionFramingDistance, INSPECTION_MAX_DISTANCE, INSPECTION_MIN_DISTANCE } from './interaction/cameraModel';
import { PickController } from './interaction/Picking';
import { IsolateCamera, type OrbitControlsHandle } from './interaction/useIsolateCamera';
import type { QualityTier } from './quality';
import { DisassemblyDriver, SCATTER_LAYOUT, type DisassemblyHudTarget } from './disassembly';
import { AnnotationDriver, type AnnotationLayerTarget } from '../ui/annotations/AnnotationLayer';

/**
 * The composed-cell stage: the cell mounted under its lighting rig, plus every inspection mechanism.
 *
 * The lighting, environment and tone mapping are the product's one look. The camera is the cell's
 * own pose rather than a per-organelle hero pose: the former cell wall reached ~1.27 scene units
 * radially, and the hero pose clipped that.
 *
 * The mechanisms (picking, isolate, disassembly, annotations) are independent of what the cell is
 * made of: they act on whatever the roster publishes — organelle roots through the anchor registry
 * and pick targets through the pick registry. With the catalog empty there is nothing to act on yet,
 * which is why each one is mounted here and simply has no subjects.
 *
 * Two of them — the disassembly loop and the annotation driver — are additionally behind their own
 * flags (`dispersionEnabled` here, and the annotation layer's own gate), so the cell can be
 * presented exactly as the GLB authors it while still being taken apart deliberately. The rest stay
 * mounted unconditionally: mounting a model and measuring it is not a study aid.
 *
 * The zoom clamp is the spec's "never passes inside the cell": `minDistance` is asserted against the
 * navigation limits by `cameraModel.test.ts`.
 */
export function CellStage({
  cell,
  fixture,
  tier,
  hudTarget,
  dispersionEnabled,
  annotationTarget,
}: {
  cell: CellId;
  fixture: FixtureConfig;
  tier: QualityTier;
  hudTarget: { current: DisassemblyHudTarget };
  /**
   * Whether the dispersion (the ordered exploded view) is on.
   *
   * Off means the disassembly loop is not mounted, so no organelle root is ever displaced. That is
   * stronger than pinning the control at 0 %, which only happens to be a no-op — see
   * `app/structureTools.ts`. The separation order and the travel are authored data
   * (`catalog/separation.ts`, `catalog/cells.ts`); this only decides whether they run.
   */
  dispersionEnabled: boolean;
  /** The overlay's node registry, or null when the annotation layer is switched off. */
  annotationTarget: AnnotationLayerTarget | null;
}) {
  const controlsRef = useRef<OrbitControlsHandle | null>(null);
  const selectedId = useAppStore((state) => state.selectedId);

  /*
   * The orbit's clamps, and each mode owns its own.
   *
   * `NAVIGATION_LIMITS` describes the **cell** view: never passes inside the cell (1.8), never drifts
   * past 9. Neither end fits the two study modes, and reusing them is what made a part impossible to
   * approach:
   *
   * - the **dispersion** is a far wider subject (~5.5 scene units against the membrane's 2.0), so the
   *   far clamp has to open or `OrbitControls.update()` drags the camera back and clips the outer
   *   parts;
   * - the **inspection** hides the cell entirely, so "never inside the cell" is meaningless and the
   *   floor has to drop for a small part, while the ceiling has to clear the largest one.
   *
   * The specified clamp itself is untouched: `NAVIGATION_LIMITS` still governs the composed view and
   * `cameraModel.test.ts` still asserts it.
   */
  const inspecting = selectedId !== null;
  const orbitMinDistance = inspecting ? INSPECTION_MIN_DISTANCE : NAVIGATION_LIMITS.minDistance;
  const orbitMaxDistance = inspecting
    ? INSPECTION_MAX_DISTANCE
    : dispersionEnabled
      ? Math.max(NAVIGATION_LIMITS.maxDistance, dispersionFramingDistance(cell, SCATTER_LAYOUT))
      : NAVIGATION_LIMITS.maxDistance;

  return (
    <>
      <color attach="background" args={[M0_COLORS.background]} />

      <Environment resolution={ENVIRONMENT_RESOLUTION}>
        <Lightformer form="rect" intensity={2.6} position={[0, 3.2, 2.4]} scale={[6, 6, 1]} />
        <Lightformer form="circle" intensity={1.1} position={[-4.5, 1, -3]} scale={5} />
        <Lightformer form="rect" intensity={0.7} position={[4.5, -2, -2]} scale={[6, 6, 1]} />
      </Environment>

      <ambientLight intensity={0.18} />
      <directionalLight position={[-3.4, 2.6, -4.2]} intensity={1.7} color={M0_COLORS.rimLight} />

      <CellGroup cell={cell} />

      {/* The reduced tier drops the whole contact-shadow pass (design D12). */}
      {tier.contactShadows ? (
        <ContactShadows
          position={[0, -1.45, 0]}
          opacity={0.45}
          scale={9}
          blur={2.6}
          far={3}
          resolution={512}
          color="#000000"
        />
      ) : null}

      {/*
        `zoomToCursor` makes the wheel zoom **toward the pointer** instead of toward the orbit
        target.

        Without it the zoom is close to useless in both study views. `OrbitControls` dollies along
        the ray to its `target`, and the target is the cell's centre — which in the exploded view is
        nearly **empty**, because only the envelope and the scaffold stay there. Pointing at a part
        and scrolling took the camera closer to nothing. With this the target follows the pointer too,
        so the wheel takes you to whatever you are aiming at.
      */}
      <OrbitControls
        // drei types the ref as its own `OrbitControls` class, which is not exported; the tween
        // only needs `target` and `update`, so the handle is narrowed at the boundary.
        ref={(instance) => {
          controlsRef.current = instance as unknown as OrbitControlsHandle | null;
        }}
        target={fixture.camera.target}
        enableDamping={false}
        enablePan={false}
        zoomToCursor
        minDistance={orbitMinDistance}
        maxDistance={orbitMaxDistance}
      />

      {/*
        The isolate camera runs in the real app and under a `select` fixture, where it snaps rather
        than tweens. A fixture without a selection would only re-assert the composed pose, so it is
        left unmounted — which also keeps the pose a pure function of the URL.
      */}
      {fixture.name === null || fixture.select !== null ? (
        <IsolateCamera controlsRef={controlsRef} cell={cell} snap={fixture.select !== null} />
      ) : null}

      <PickController />

      {/*
        One loop for the whole cell: it damps the progress once, then positions every organelle root
        in exit order, and writes the readout when the whole percent changes. Not mounted while the
        dispersion is off — the cell stays exactly where the file put every mesh.
      */}
      {dispersionEnabled ? (
        <DisassemblyDriver cell={cell} frozenValue={fixture.disassemblyValue} hudTarget={hudTarget} />
      ) : null}

      {/*
        Mounted **after** the driver on purpose: within a frame, `useFrame` subscribers run in
        subscription order, and the annotation anchors must be read after the driver has written the
        organelle positions (design D14's "one `useFrame`, after the scene updates").
      */}
      {annotationTarget === null ? null : (
        <AnnotationDriver cell={cell} target={annotationTarget} />
      )}

      <DebugSampler fixture={fixture} />
    </>
  );
}
