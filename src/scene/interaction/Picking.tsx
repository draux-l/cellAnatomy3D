import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector2, type Mesh } from 'three';
import { cellDebug } from '../../app/debug';
import { useAppStore } from '../../app/store';
import {
  PICK_LAYER,
  choosePickFromObjects,
  isPickIndexReady,
  pickTargetObjects,
  registerPickTarget,
  setPickIndexReady,
  unregisterPickTarget,
} from './pickingModel';
import { buildPickIndex } from './pickBvh';
import { isClickFromTrackedDown, recordPointerDown } from './pointer';

export {
  PICK_LAYER,
  choosePick,
  isOuterEnvelope,
  isPickIndexReady,
} from './pickingModel';
export type { PickHit, PickTargetEntry } from './pickingModel';

/**
 * The pick controller (design D7, revised for exact geometry).
 *
 * A raycast against the composed cell would test every organelle mesh. The previous answer was **one
 * simplified hit box per record** — cheap, but wrong on this model: the mitochondrion is one mesh of
 * several scattered ovals whose box spans nearly the whole cell, so its box covered its neighbours and
 * won every overlap (measured: most probes returned "Mitocondrias"). The controller now raycasts the
 * **real triangles**, accelerated by a per-geometry BVH (`pickBvh.ts`) so the cost stays O(log n) at
 * ~808k triangles.
 *
 * Three properties are kept from the box version:
 *
 * 1. **Nothing is per-frame in React.** Hover is a discrete store value written on pointer movement,
 *    and pointer movement is coalesced to one raycast per animation frame.
 * 2. **The pointer logic is ours, not R3F's.** R3F only raycasts objects that carry handlers, and its
 *    per-object dispatch cannot express the priority rule ("the nearest *inner* organelle wins, the
 *    envelope only when nothing inside was hit").
 * 3. **The pick layer is explicit.** The real meshes keep layer 0 (rendered) and enable `PICK_LAYER`,
 *    and the ray is pointed at `PICK_LAYER`, so the ray's subjects are unambiguous.
 */

export interface PickTarget {
  organelleId: string;
  envelope: boolean;
  /** The record's real meshes, as mounted. */
  meshes: readonly Mesh[];
}

/**
 * Registers a record's meshes as pick targets and builds their BVHs once.
 *
 * Registration is immediate (so the annotation layer's occlusion query has its subjects), but the pick
 * index reports ready only after every tree is built. Until then `PickController` does not pick: a
 * partial index would resolve some organelles and silently miss others.
 */
export function PickTargets({ targets }: { targets: readonly PickTarget[] }) {
  useEffect(() => {
    const meshes: Mesh[] = [];
    // Arm the index from scratch: a previous mount's meshes are gone, and stale targets must not
    // answer a ray.
    setPickIndexReady(false);

    for (const target of targets) {
      for (const mesh of target.meshes) {
        mesh.layers.enable(PICK_LAYER);
        registerPickTarget({ object: mesh, organelleId: target.organelleId, envelope: target.envelope });
        meshes.push(mesh);
      }
    }

    const cancel = buildPickIndex(meshes, () => setPickIndexReady(true));

    return () => {
      cancel();
      setPickIndexReady(false);

      for (const mesh of meshes) {
        unregisterPickTarget(mesh);
        mesh.layers.disable(PICK_LAYER);
      }
    };
  }, [targets]);

  return null;
}

/**
 * The single pointer controller for the composed cell.
 *
 * It owns three gestures: hover (a raycast per animation frame), click-to-isolate (a click is a
 * press and release that travelled less than the slop), and empty-space click (a click whose ray
 * crossed no surface).
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
      if (!isPickIndexReady()) {
        return null;
      }

      const rect = element.getBoundingClientRect();
      const ndc = new Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );

      raycaster.layers.set(PICK_LAYER);
      // Each mesh returns only its own nearest surface; the union is then sorted by distance. This is
      // several times faster than collecting every triangle hit in a ~800k-triangle cell.
      raycaster.firstHitOnly = true;
      raycaster.setFromCamera(ndc, camera);

      const started = performance.now();
      const intersections = raycaster.intersectObjects(pickTargetObjects(), false);

      cellDebug.recordPick(performance.now() - started);

      return choosePickFromObjects(intersections);
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
