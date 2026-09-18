import { useEffect, useMemo, useRef } from 'react';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import type { FixtureConfig } from '../app/fixture';
import type { CellId } from '../catalog/types';
import { CellGroup } from './CellGroup';
import { M0_COLORS, createOrganelleMaterials } from './materials';
import { ENVIRONMENT_RESOLUTION } from './renderSettings';
import { DebugSampler } from './useDebugSampler';
import { NAVIGATION_LIMITS } from './interaction/cameraModel';
import { PickController } from './interaction/Picking';
import { IsolateCamera, type OrbitControlsHandle } from './interaction/useIsolateCamera';
import type { QualityTier } from './quality';
import { DisassemblyDriver, type DisassemblyHudTarget } from './disassembly';
import { ProcessStage } from './ProcessStage';
import { AnnotationDriver, type AnnotationLayerTarget } from '../ui/annotations/AnnotationLayer';

/**
 * The composed-cell stage: one catalog roster, assembled and lit.
 *
 * This is where the cell exists as a cell rather than as ten unrelated fixtures. The lighting,
 * environment and tone mapping are the same as the organelle stage on purpose — the product has
 * one look, and a second lighting rig would drift from it.
 *
 * The camera is the cell's own pose rather than the organelle hero pose: the wall reaches ~1.27
 * scene units radially and ~1.12 along the depth axis, and the hero pose clips that.
 *
 * The zoom clamp is the spec's "never passes inside the cell": `minDistance` is asserted against
 * the wall **as built** by `cameraModel.test.ts`, not against a remembered number.
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
  const materials = useMemo(() => createOrganelleMaterials(), []);
  const controlsRef = useRef<OrbitControlsHandle | null>(null);

  useEffect(() => () => materials.dispose(), [materials]);

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

      <CellGroup cell={cell} materials={materials} />

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
        A fixture pins the camera in the URL, so the isolate tween only runs in the real app —
        otherwise a screenshot would depend on how long the page had been open.
      */}
      {fixture.name === null ? <IsolateCamera controlsRef={controlsRef} cell={cell} /> : null}

      <PickController />

      {/*
        One loop for the whole cell: it damps the progress once, positions every organelle root,
        and writes the readout when the whole percent changes.
      */}
      <DisassemblyDriver cell={cell} frozenValue={fixture.disassemblyValue} hudTarget={hudTarget} />

      {/*
        The running process, if any. It parents itself to the organelle root it animates inside,
        which is why its position in this list is *not* load-bearing: the animation rides whatever
        transform the driver above writes. It sits here so the frame's work reads in order — cell,
        then process, then overlay — and so the harness's process mirror is written before anything
        reads it.
      */}
      <ProcessStage cell={cell} fixtureLightPercent={fixture.lightPercent} />

      {/*
        Mounted **after** the driver on purpose: within a frame, `useFrame` subscribers run in
        subscription order, and the annotation anchors must be read after the driver has written
        the organelle positions (design D14's "one `useFrame`, after the scene updates").
      */}
      {annotationTarget === null ? null : (
        <AnnotationDriver cell={cell} target={annotationTarget} />
      )}

      <DebugSampler fixture={fixture} />
    </>
  );
}
