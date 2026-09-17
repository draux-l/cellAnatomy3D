import { useLayoutEffect, useRef } from 'react';
import { Matrix4, type InstancedMesh, type Material } from 'three';
import type { InstancedPart, OrganellePart } from './builders/primitives';

/**
 * One build part, drawn the way the builder declared it.
 *
 * A repeated structure arrives as an `InstancedPart` — the skill's `InstancedMesh` gate means
 * ribosomes and nuclear pores are *one* draw call each, not one per granule. The instance
 * matrices were computed once, deterministically, by the builder; the host only uploads them.
 *
 * Extracted from `CellViewer` unchanged when the composed cell arrived, because both the
 * isolated-organelle stage and the cell stage draw parts the same way.
 */
export function PartMesh({ part, material }: { part: OrganellePart; material: Material }) {
  if (part.kind === 'instanced') {
    return <InstancedPartMesh part={part} material={material} />;
  }

  return <mesh geometry={part.geometry} material={material} />;
}

const INSTANCE_MATRIX = new Matrix4();

export function InstancedPartMesh({
  part,
  material,
}: {
  part: InstancedPart;
  material: Material;
}) {
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
