import { useEffect, useMemo } from 'react';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import type { FixtureConfig } from '../app/fixture';
import type { CellId } from '../catalog/types';
import { CellGroup } from './CellGroup';
import { M0_COLORS, createOrganelleMaterials } from './materials';
import { ENVIRONMENT_RESOLUTION } from './renderSettings';
import { DebugSampler } from './useDebugSampler';
import { NAVIGATION_LIMITS } from './interaction/cameraModel';
import { PickController } from './interaction/Picking';

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
}: {
  cell: CellId;
  fixture: FixtureConfig;
}) {
  const materials = useMemo(() => createOrganelleMaterials(), []);

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

      <ContactShadows
        position={[0, -1.45, 0]}
        opacity={0.45}
        scale={9}
        blur={2.6}
        far={3}
        resolution={512}
        color="#000000"
      />

      <OrbitControls
        target={fixture.camera.target}
        enableDamping={false}
        enablePan={false}
        minDistance={NAVIGATION_LIMITS.minDistance}
        maxDistance={NAVIGATION_LIMITS.maxDistance}
      />

      <PickController />

      <DebugSampler fixture={fixture} />
    </>
  );
}
