import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Matrix4, type InstancedMesh, type Material } from 'three';
import type { FixtureConfig } from '../app/fixture';
import { getBuilder } from './builders/registry';
import type { InstancedPart, OrganellePart } from './builders/primitives';
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

/**
 * One build part, drawn the way the builder declared it.
 *
 * A repeated structure arrives as an `InstancedPart` — the skill's `InstancedMesh` gate means
 * ribosomes and nuclear pores are *one* draw call each, not one per granule. The instance
 * matrices were computed once, deterministically, by the builder; the host only uploads them.
 */
function PartMesh({ part, material }: { part: OrganellePart; material: Material }) {
  if (part.kind === 'instanced') {
    return <InstancedPartMesh part={part} material={material} />;
  }

  return <mesh geometry={part.geometry} material={material} />;
}

const INSTANCE_MATRIX = new Matrix4();

function InstancedPartMesh({ part, material }: { part: InstancedPart; material: Material }) {
  const ref = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;

    if (!mesh) {
      return;
    }

    for (let index = 0; index < part.instanceCount; index += 1) {
      INSTANCE_MATRIX.fromArray(part.matrices, index * 16);
      mesh.setMatrixAt(index, INSTANCE_MATRIX);
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [part]);

  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, material, part.instanceCount]}
      castShadow={false}
      receiveShadow={false}
    />
  );
}
