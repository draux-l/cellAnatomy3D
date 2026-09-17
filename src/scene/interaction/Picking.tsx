import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { BoxGeometry, Vector2, type Mesh } from 'three';
import { useAppStore } from '../../app/store';
import type { Bounds3 } from '../../catalog/vectors';
import {
  PICK_LAYER,
  choosePickFromObjects,
  pickProxyTransform,
  pickVolumeObjects,
  registerPickVolume,
  unregisterPickVolume,
} from './pickingModel';
import { isClickFromTrackedDown, recordPointerDown } from './pointer';

export {
  PICK_LAYER,
  PICK_PROXY_INFLATION,
  choosePick,
  isOuterEnvelope,
  pickProxyTransform,
} from './pickingModel';
export type { PickHit, PickProxyTransform } from './pickingModel';

/**
 * The pick layer (design D7).
 *
 * A raycast against the composed cell would test every organelle mesh. This replaces that with
 * **one simplified hit volume per pickable record** — a box around the record's own built bounds —
 * so a pointer costs about ten box tests instead of a scene traversal.
 *
 * Three deliberate properties:
 *
 * 1. **The hit volumes are never rendered.** They live on `PICK_LAYER`, the camera renders layer 0,
 *    and the pick ray is pointed at layer 1 — so the volumes cost **zero draw calls**, and no
 *    organelle mesh can ever be raycast.
 * 2. **The pointer logic is ours, not R3F's.** R3F only raycasts objects that carry handlers, and
 *    its per-object dispatch cannot express "the nearest *inner* organelle wins, the envelope only
 *    when nothing inside was hit". One controller, one rule the browser check actually exercised.
 * 3. **Nothing is per-frame.** Hover is a discrete store value written on pointer movement, and
 *    pointer movement is coalesced to one raycast per animation frame.
 */

export interface PickVolumeProps {
  organelleId: string;
  bounds: Bounds3;
  /** True when this record is the cell's outer boundary. */
  envelope: boolean;
}

/** One invisible hit volume, registered so the controller can ray it. */
export function PickVolume({ organelleId, bounds, envelope }: PickVolumeProps) {
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const transform = useMemo(() => pickProxyTransform(bounds), [bounds]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const assign = (mesh: Mesh | null): void => {
    if (mesh) {
      registerPickVolume({ object: mesh, organelleId, envelope });
    }
  };

  useEffect(() => () => unregisterPickVolume(organelleId), [organelleId]);

  return (
    <mesh
      ref={assign}
      geometry={geometry}
      position={transform.center}
      scale={transform.size}
      layers={PICK_LAYER}
      userData={{ organelleId, pickEnvelope: envelope }}
    />
  );
}

/**
 * The single pointer controller for the composed cell.
 *
 * It owns three gestures: hover (a raycast per animation frame), click-to-isolate (a click is a
 * press and release that travelled less than the slop), and empty-space click (a click whose ray
 * crossed no volume).
 */
export function PickController() {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const raycaster = useThree((state) => state.raycaster);

  useEffect(() => {
    const element = gl.domElement;
    let pointerDown = false;
    let frame = 0;
    let pending: PointerEvent | null = null;

    // One ray per animation frame at most: pointermove fires far more often than the browser
    // paints, and re-picking a cell that has not moved is wasted work.
    const schedulePick = (event: PointerEvent): void => {
      pending = event;

      if (frame !== 0) {
        return;
      }

      frame = requestAnimationFrame(() => {
        frame = 0;

        const latest = pending;

        pending = null;

        if (!latest || pointerDown) {
          return;
        }

        const store = useAppStore.getState();

        store.setHovered(pickAt(latest));
      });
    };

    const pickAt = (event: PointerEvent): string | null => {
      const rect = element.getBoundingClientRect();
      const ndc = new Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );

      raycaster.layers.set(PICK_LAYER);
      raycaster.setFromCamera(ndc, camera);

      return choosePickFromObjects(raycaster.intersectObjects(pickVolumeObjects(), false));
    };

    const onPointerMove = (event: PointerEvent): void => schedulePick(event);

    const onPointerDown = (event: PointerEvent): void => {
      pointerDown = true;
      recordPointerDown(event);
    };

    const onPointerUp = (event: PointerEvent): void => {
      pointerDown = false;

      if (!isClickFromTrackedDown(event)) {
        // The pointer travelled: that was an orbit, and the spec says it selects nothing.
        return;
      }

      const hit = pickAt(event);
      const store = useAppStore.getState();

      if (hit !== null) {
        store.setSelected(hit);
        return;
      }

      // A click on empty space clears the selection (spec scenario).
      if (store.selectedId !== null) {
        store.setSelected(null);
      }
    };

    const onPointerLeave = (): void => {
      pointerDown = false;
      useAppStore.getState().setHovered(null);
    };

    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerdown', onPointerDown, true);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointerleave', onPointerLeave);

    return () => {
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }

      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerdown', onPointerDown, true);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [camera, gl, raycaster]);

  return null;
}
