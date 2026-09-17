import { useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import type { FixtureConfig } from '../app/fixture';
import { getBuilder } from './builders/registry';
import { M0_COLORS, createOrganelleMaterials } from './materials';
import { DPR_CAP, ENVIRONMENT_RESOLUTION, RENDERER_SETTINGS } from './renderSettings';
import { DebugSampler } from './useDebugSampler';

/**
 * The one `<Canvas>` for the whole app.
 *
 * Tone mapping is set explicitly: React Three Fiber defaults to ACES, which is prohibited here
 * because it shifts hue and breaks palette-swatch fidelity.
 */
export function CellViewer({ fixture }: { fixture: FixtureConfig }) {
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
      <SceneContents fixture={fixture} />
    </Canvas>
  );
}

function SceneContents({ fixture }: { fixture: FixtureConfig }) {
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
          <mesh key={part.name} geometry={part.geometry} material={materials[part.materialKey]} />
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
