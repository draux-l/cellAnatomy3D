import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useAppStore } from '../../app/store';
import { getRecord } from '../../catalog/cells';
import type { CellId } from '../../catalog/types';
import {
  CELL_POSE,
  approachFocus,
  defaultFocus,
  focusForRecord,
  focusSettled,
  type FocusState,
} from './cameraModel';

/**
 * Frames the isolated organelle, and returns the camera to the cell when the isolate clears.
 *
 * Design D7 asks for a damped controls-target tween rather than a jump cut, and the reason is
 * legibility: a hard cut leaves the viewer unsure whether the cell moved or the camera did.
 *
 * The loop stops writing as soon as it arrives. That is not a micro-optimisation — it is what lets
 * the user orbit the isolated organelle afterwards without the tween dragging the view back to
 * where it finished.
 *
 * The orbit **angle** is never touched: only the target and the distance are damped, so the user's
 * chosen viewing direction survives both isolating and returning.
 */

/** Minimal shape of the drei `OrbitControls` handle this hook needs. */
export interface OrbitControlsHandle {
  target: Vector3;
  update: () => void;
}

const SCRATCH_OFFSET = new Vector3();
const FALLBACK_DIRECTION = new Vector3(...CELL_POSE.position).normalize();

export interface IsolateCameraProps {
  controlsRef: RefObject<OrbitControlsHandle | null>;
  cell: CellId;
}

export function IsolateCamera({ controlsRef, cell }: IsolateCameraProps) {
  const camera = useThree((state) => state.camera);
  const selectedId = useAppStore((state) => state.selectedId);
  const desired = useRef<FocusState>(defaultFocus());
  const current = useRef<FocusState>(defaultFocus());
  const animating = useRef(false);

  useEffect(() => {
    const record = selectedId === null ? undefined : getRecord(selectedId);

    desired.current = record ? focusForRecord(record, cell) : defaultFocus();
    animating.current = true;
  }, [selectedId, cell]);

  useFrame((_state, delta) => {
    const controls = controlsRef.current;

    if (!controls || !animating.current) {
      return;
    }

    const target = desired.current;

    if (focusSettled(current.current, target)) {
      // Arrived: stop writing so an orbit after the isolate is not fought by the tween.
      current.current = { target: [...target.target], distance: target.distance };
      controls.target.set(target.target[0], target.target[1], target.target[2]);
      animating.current = false;

      return;
    }

    current.current = approachFocus(current.current, target, delta);

    controls.target.set(
      current.current.target[0],
      current.current.target[1],
      current.current.target[2],
    );

    SCRATCH_OFFSET.copy(camera.position).sub(controls.target);

    if (SCRATCH_OFFSET.lengthSq() < 1e-8) {
      SCRATCH_OFFSET.copy(FALLBACK_DIRECTION);
    }

    SCRATCH_OFFSET.setLength(current.current.distance);
    camera.position.copy(controls.target).add(SCRATCH_OFFSET);
    controls.update();
  });

  return null;
}
