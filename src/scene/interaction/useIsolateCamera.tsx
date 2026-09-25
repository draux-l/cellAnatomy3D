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
  /**
   * Pin the framing instead of tweening into it.
   *
   * A `?fixture=…&select=` capture must not depend on how many frames the page happened to run, so
   * under a fixture the isolate arrives on the first frame. The placement below is idempotent, which
   * is what lets the snapped and the tweened arrival share one code path.
   */
  snap: boolean;
}

export function IsolateCamera({ controlsRef, cell, snap }: IsolateCameraProps) {
  const camera = useThree((state) => state.camera);
  const selectedId = useAppStore((state) => state.selectedId);
  const desired = useRef<FocusState>(defaultFocus());
  const current = useRef<FocusState>(defaultFocus());
  const animating = useRef(false);

  useEffect(() => {
    const record = selectedId === null ? undefined : getRecord(selectedId);

    desired.current = record ? focusForRecord(record, cell) : defaultFocus();

    if (snap) {
      // Arrive before the first frame, so the first rendered frame is already the final pose.
      current.current = {
        target: [...desired.current.target],
        distance: desired.current.distance,
      };
    }

    animating.current = true;
  }, [selectedId, cell, snap]);

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
      placeCamera(camera, controls, target.distance);
      animating.current = false;

      return;
    }

    current.current = approachFocus(current.current, target, delta);

    controls.target.set(
      current.current.target[0],
      current.current.target[1],
      current.current.target[2],
    );

    placeCamera(camera, controls, current.current.distance);
  });

  return null;
}

/**
 * Puts the camera on its current view ray at `distance` from the controls target.
 *
 * The orbit **angle** is never touched: only the distance is set, so the user's chosen viewing
 * direction survives both isolating and returning. Called on arrival as well as during the tween, so
 * a snapped arrival (which never ran a damped step) is framed exactly like a tweened one; on a
 * tweened arrival the camera is already there and the call is a no-op.
 */
function placeCamera(
  camera: { position: Vector3 },
  controls: OrbitControlsHandle,
  distance: number,
): void {
  SCRATCH_OFFSET.copy(camera.position).sub(controls.target);

  if (SCRATCH_OFFSET.lengthSq() < 1e-8) {
    SCRATCH_OFFSET.copy(FALLBACK_DIRECTION);
  }

  SCRATCH_OFFSET.setLength(distance);
  camera.position.copy(controls.target).add(SCRATCH_OFFSET);
  controls.update();
}
