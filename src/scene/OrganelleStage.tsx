import { useEffect, useMemo } from 'react';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import type { FixtureConfig } from '../app/fixture';
import { getBuilder } from './builders/registry';
import { M0_COLORS, createOrganelleMaterials } from './materials';
import { PartMesh } from './PartMesh';
import { ENVIRONMENT_RESOLUTION } from './renderSettings';
import { DebugSampler } from './useDebugSampler';

/**
 * The isolated-organelle stage: one builder's **defaults**, in the hero pose.
 *
 * This is the M0 stage, extracted from `CellViewer` unchanged when the composed cell arrived so
 * that every committed organelle screenshot stays byte-identical. It renders builder defaults
 * rather than catalog parameters on purpose — the fixture's job is to show what a builder
 * produces, and the catalog's `size` is a cell-scale value that would barely fill the frame.
 *
 * The composed cell has its own stage (`CellStage`); the two share materials, part rendering and
 * the debug sampler, but nothing else, because they frame different things.
 */
export function OrganelleStage({ fixture }: { fixture: FixtureConfig }) {
  const materials = useMemo(() => createOrganelleMaterials(), []);

  useEffect(() => () => materials.dispose(), [materials]);

  const build = useMemo(() => getBuilder(fixture.organelleId)({}), [fixture.organelleId]);

  useEffect(() => () => build.dispose(), [build]);

  return (
    <>
      <color attach="background" args={[M0_COLORS.background]} />

      <Environment resolution={ENVIRONMENT_RESOLUTION}>
        <Lightformer form="rect" intensity={2.6} position={[0, 3.2, 2.4]} scale={[6, 6, 1]} />
        <Lightformer form="circle" intensity={1.1} position={[-4.5, 1, -3]} scale={5} />
        <Lightformer form="rect" intensity={0.7} position={[4.5, -2, -2]} scale={[6, 6, 1]} />
      </Environment>

      <ambientLight intensity={0.18} />
      {/* One cool rim light: silhouette separation on a dark background. */}
      <directionalLight position={[-3.4, 2.6, -4.2]} intensity={1.7} color={M0_COLORS.rimLight} />

      <group rotation={[0, -0.32, -Math.PI / 2]}>
        {build.parts.map((part) => (
          <PartMesh key={part.name} part={part} material={materials[part.materialKey]} />
        ))}
      </group>

      <ContactShadows
        position={[0, -1.05, 0]}
        opacity={0.5}
        scale={7}
        blur={2.4}
        far={2.2}
        resolution={512}
        color="#000000"
      />

      <OrbitControls
        target={fixture.camera.target}
        enableDamping={false}
        enablePan={false}
        minDistance={1.6}
        maxDistance={8}
      />

      <DebugSampler fixture={fixture} />
    </>
  );
}
