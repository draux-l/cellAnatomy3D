import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MAX_FRAME_DELTA_SECONDS, processClock, speedToScale } from '../app/clock';
import { cellDebug, type ProcessMirrorEntry } from '../app/debug';
import { useAppStore } from '../app/store';
import { getRecord } from '../catalog/cells';
import type { CellId } from '../catalog/types';
import { processLight } from '../processes/light';
import { getProcessDefinition } from '../processes/registry';
import type { ProcessFrame, ProcessInstance } from '../processes/types';
import { registeredOrganelleRoot } from './anchors';

/**
 * The process driver (tasks 5.1/5.5).
 *
 * One component, one `useFrame`, and the whole lifecycle of every running process. It exists so
 * that *nothing else* has to know how a process is built, where it attaches, or how it is torn down:
 *
 * - **Enter** — a discrete `processId` change builds one instance per target the cell's roster
 *   supports, parents each instance's `Object3D` to **its organelle's root**, and leaves it there.
 *   Parenting rather than copying a transform is what makes the animation follow disassembly,
 *   isolation and the annotation anchors with no synchronisation at all: they all already follow
 *   that same `Object3D` (design D2/D13).
 * - **Advance** — one frame: the shared clock is ticked (which applies the speed scale and clamps a
 *   backgrounded tab's delta), the light intensity is read once, and every instance is advanced and
 *   mirrored. No React state, no re-render, at any frame rate.
 * - **Exit** — the cleanup detaches every instance and disposes it: timelines killed, geometries and
 *   materials released. The base viewer is untouched, because the process never modified it; the
 *   catalog and the selection were never involved.
 *
 * The **fixture's light** is applied here rather than in the slider, so a `?light=` value is the same
 * thing to the app as a user dragging the control — one code path, one state.
 */

export interface ProcessStageProps {
  cell: CellId;
  /** The fixture's pinned light percent, or null in the real app. */
  fixtureLightPercent: number | null;
}

export function ProcessStage({ cell, fixtureLightPercent }: ProcessStageProps) {
  const processId = useAppStore((state) => state.processId);
  const instances = useRef<ProcessInstance[]>([]);

  useEffect(() => {
    if (fixtureLightPercent !== null) {
      // A fixture names its light in the URL, so the state is pinned rather than inherited from
      // whichever value the page happened to start on — and the write counter starts from zero,
      // which is what makes "respiration never writes the light uniform" a clean measurement.
      processLight.reset();
      processLight.setPercent(fixtureLightPercent);
    }
  }, [fixtureLightPercent]);

  useEffect(() => {
    const definition = getProcessDefinition(processId);
    const built: ProcessInstance[] = [];

    if (definition !== null) {
      for (const target of definition.targets(cell)) {
        const root = registeredOrganelleRoot(target.organelleId);

        if (!root) {
          continue;
        }

        const record = getRecord(target.organelleId);
        const instance = definition.build({
          cell,
          target,
          root,
          seed: `${record?.geometry.seed ?? target.organelleId}/${definition.id}`,
        });

        root.add(instance.object);
        built.push(instance);
      }
    }

    instances.current = built;
    cellDebug.setProcesses([]);

    return () => {
      for (const instance of built) {
        instance.object.removeFromParent();
        instance.dispose();
      }

      instances.current = [];
      cellDebug.setProcesses([]);
    };
  }, [processId, cell]);

  useFrame((_state, delta) => {
    // The shared clock's scale is mirrored from the store here, once per frame, by a *read* rather
    // than a subscription. The speed control is a discrete store value that can change while a
    // process runs, and a per-frame read is both the cheapest way to follow it and the only one that
    // cannot re-render the tree. It is done before the early return so the clock stays in step even
    // with no process running — the next process to start must not inherit a stale scale.
    processClock.setScale(speedToScale(useAppStore.getState().speed));

    const running = instances.current;

    if (running.length === 0) {
      return;
    }

    const scale = processClock.scale;
    // The clock owns the clamp and the scale; the instances get the raw delta so a light-driven
    // process can apply its own rate term without inheriting another process's.
    const elapsed = processClock.tick(delta);
    const frame: ProcessFrame = {
      elapsed,
      scale,
      delta: Number.isFinite(delta) ? Math.min(Math.max(0, delta), MAX_FRAME_DELTA_SECONDS) : 0,
      light: processLight.intensity,
      frozen: processClock.frozen ? processClock.elapsed : null,
    };
    const mirrors: ProcessMirrorEntry[] = [];

    for (const instance of running) {
      instance.update(frame);
      mirrors.push({
        id: instance.id,
        processId: instance.processId,
        cell: instance.cell,
        organelleId: instance.organelleId,
        scripted: instance.scripted,
        lightDriven: instance.lightDriven,
        time: instance.time,
        rate: instance.rate,
        label: instance.label,
        progress: instance.progress,
        lightRequired: instance.lightRequired,
        uniformWrites: instance.uniformWrites,
        emitted: { ...instance.emitted },
      });
    }

    cellDebug.setProcesses(mirrors);
  });

  return null;
}
