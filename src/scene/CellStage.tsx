import { useRef } from 'react';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import type { FixtureConfig } from '../app/fixture';
import type { CellId } from '../catalog/types';
import { CellGroup } from './CellGroup';
import { M0_COLORS } from './materials';
import { ENVIRONMENT_RESOLUTION } from './renderSettings';
import { DebugSampler } from './useDebugSampler';
import { NAVIGATION_LIMITS } from './interaction/cameraModel';
import { PickController } from './interaction/Picking';
import { IsolateCamera, type OrbitControlsHandle } from './interaction/useIsolateCamera';
import type { QualityTier } from './quality';
import { DisassemblyDriver, type DisassemblyHudTarget } from './disassembly';
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
 * and hit volumes through the pick registry. With the catalog empty there is nothing to act on yet,
 * which is why each one is mounted here and simply has no subjects.
 *
 * The zoom clamp is the spec's "never passes inside the cell": `minDistance` is asserted against the
 * navigation limits by `cameraModel.test.ts`.
 */
export function CellStage({
  cell,
  fixture,
  tier,
  hudTarget,
  annotationTarget,
}: {
  cell: CellId;
  fixture: FixtureConfig;
  tier: QualityTier;
  hudTarget: { current: DisassemblyHudTarget };
  /** The overlay's node registry, or null when the annotation layer is switched off. */
  annotationTarget: AnnotationLayerTarget | null;
}) {
  const controlsRef = useRef<OrbitControlsHandle | null>(null);

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

      <OrbitControls
        // drei types the ref as its own `OrbitControls` class, which is not exported; the tween
        // only needs `target` and `update`, so the handle is narrowed at the boundary.
        ref={(instance) => {
          controlsRef.current = instance as unknown as OrbitControlsHandle | null;
        }}
        target={fixture.camera.target}
        enableDamping={false}
        enablePan={false}
        minDistance={NAVIGATION_LIMITS.minDistance}
        maxDistance={NAVIGATION_LIMITS.maxDistance}
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
        One loop for the whole cell: it damps the progress once, positions every organelle root, and
        writes the readout when the whole percent changes.
      */}
      <DisassemblyDriver cell={cell} frozenValue={fixture.disassemblyValue} hudTarget={hudTarget} />

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
