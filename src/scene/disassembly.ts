import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { DISASSEMBLY_MAX, DISASSEMBLY_MIN, clampDisassembly, useAppStore } from '../app/store';
import { rosterFor } from '../catalog/cells';
import { modelFor } from '../catalog/models';
import { positionForRecord } from '../catalog/params';
import {
  isSeparable,
  membraneExtentOf,
  orderedSeparation,
  scatterSlotFor,
  separationProgress,
  type ScatterLayout,
} from '../catalog/separation';
import { isMeshGeometry, type CellId, type OrganelleRecord } from '../catalog/types';
import { t } from '../ui/i18n';
import { disassemblyStateKey, formatDisassemblyPercent } from '../ui/hud/disassemblyCopy';
import { registeredOrganelleRoot } from './anchors';

/**
 * The exploded view: one progress value, one damped transient current, per-frame transform writes.
 *
 * Design D13 chose transform-driven over a GSAP timeline per organelle and over a shader offset, and
 * the reason is that every consumer already follows the organelle's `Object3D`: the pick volumes are
 * its children, the annotation anchors read its `matrixWorld`, and the contact shadows are drawn from
 * where it actually is. Writing `position` therefore keeps all three correct with no synchronisation,
 * and reversibility is structural — the arrangement is a pure function of
 * `(local progress, layout, catalog vector)`, where the layout decides *where* a part goes and the
 * rank only decides *when* it travels.
 *
 * **Nothing here re-renders React.** The discrete target lives in the store and changes on a control
 * step; the current value lives in this module and is written to `Object3D.position` from one
 * `useFrame`.
 */

/** Damping rate, in inverse seconds. Fast enough to read as motion, slow enough to read as motion. */
export const DISASSEMBLY_DAMPING_PER_SECOND = 8;
/**
 * The current snaps to the target inside this many percent.
 *
 * It is the same threshold the rounding uses, so the rendered arrangement is *exactly* the whole
 * percent at every frame — which is what makes 0% after a round trip the same pose as 0% at load.
 */
export const DISASSEMBLY_SNAP_EPSILON = 0.5;

/**
 * The layout the control is currently showing.
 *
 * A module constant for now, and that is the deliberate order of work: the whole engine can be
 * reviewed against **both** layouts, with tests, before any of it is reachable from the UI. The
 * control that switches it is the next change.
 */
export const SCATTER_LAYOUT: ScatterLayout = 'ordered';

/** The transient side of the split. Never in React state, never in the store. */
export interface DisassemblyState {
  current: number;
}

export function createDisassemblyState(): DisassemblyState {
  return { current: DISASSEMBLY_MIN };
}

/** The one transient current value the loop reads and writes. */
export const disassemblyState = createDisassemblyState();

/** A slot every part is already sitting on: used for the records that never separate. */
const HOME_SLOT: readonly [number, number, number] = [0, 0, 0];

/**
 * Where one organelle's root sits, given how far along it is and the slot it is travelling to.
 *
 * One straight line from where the model file puts the part to its slot, which is what makes the
 * arrangement a pure function of the control value: the same percent is the same pose every time,
 * and 0 % is the file unmodified.
 *
 * Two mountings, one rule, and only the base differs:
 *
 * - **A procedural record** starts at its own catalog placement, in scene units.
 * - **A mesh record** starts at its part's centre *inside the model's frame*, which carries a uniform
 *   scale. Its displacement therefore has to be expressed in the same units — the slot is authored in
 *   scene units, so the delta is divided by the frame's scale before being written. Nothing about the
 *   model's own transform changes; only the magnitude is reconciled.
 */
export function scatterPosition(
  record: OrganelleRecord,
  cell: CellId,
  localPercent: number,
  slot: readonly [number, number, number],
): [number, number, number] {
  const t = clampDisassembly(localPercent) / DISASSEMBLY_MAX;
  const [px, py, pz] = positionForRecord(record, cell);
  const dx = (slot[0] - px) * t;
  const dy = (slot[1] - py) * t;
  const dz = (slot[2] - pz) * t;

  if (isMeshGeometry(record.geometry)) {
    /*
     * A mesh host lives **inside** the model's frame group, so its `position` is expressed in the
     * frame's own units — scene units divided by the frame's scale. The host's authored base is
     * published by its mount, so this stays a pure function of the record, the progress and one
     * number the mount already knows.
     */
    const scale = modelFor(cell)?.frame.scale ?? 1;
    const base = registeredOrganelleRoot(record.id)?.userData.basePosition;
    const [bx, by, bz] = Array.isArray(base) ? base : [0, 0, 0];

    return [bx + dx / scale, by + dy / scale, bz + dz / scale];
  }

  return [px + dx, py + dy, pz + dz];
}

/** One step of the damped approach. Frame-rate independent, and it lands on the target exactly. */
export function dampDisassembly(
  current: number,
  target: number,
  dtSeconds: number,
  rate = DISASSEMBLY_DAMPING_PER_SECOND,
): number {
  const dt = Number.isFinite(dtSeconds) ? Math.max(0, Math.min(dtSeconds, 0.1)) : 0;
  const next = current + (target - current) * (1 - Math.exp(-rate * dt));

  return Math.abs(next - target) < DISASSEMBLY_SNAP_EPSILON ? clampDisassembly(target) : next;
}

/** The live text nodes the loop writes. A ref object, because none of this is React state. */
export interface DisassemblyHudTarget {
  percent: HTMLElement | null;
  state: HTMLElement | null;
  /** The whole percent last written, so a DOM write happens only when the number changes. */
  lastWritten: number;
}

export interface DisassemblyDriverProps {
  cell: CellId;
  /** A fixture freezes target *and* current at this value, bypassing the damping. */
  frozenValue: number | null;
  hudTarget: { current: DisassemblyHudTarget };
}

/**
 * The loop. One `useFrame` for the whole cell: the damping is stepped once, then every organelle
 * root is positioned from the catalog and the running layout.
 */
export function DisassemblyDriver({ cell, frozenValue, hudTarget }: DisassemblyDriverProps) {
  const roster = useMemo(() => rosterFor(cell), [cell]);
  const ordered = useMemo(() => orderedSeparation(cell), [cell]);
  const membraneExtent = useMemo(() => membraneExtentOf(cell), [cell]);

  /*
   * Where an inspected part is taken: the cell's own centre, in the frame's local units.
   *
   * The frame group carries `position = −center × scale` and `scale`, so a host at local `center`
   * lands on the world origin — which is where the membrane record already puts the cell's centre.
   * Taking the part there rather than leaving it on its orbit slot is what makes "bring that part to
   * the camera" a fixed, known place: the framing is the same for every part, and the camera never
   * has to know which slot the part happened to occupy.
   */
  const inspectionPoint = useMemo(() => {
    const centre = modelFor(cell)?.frame.center;

    return (centre ? [centre[0], centre[1], centre[2]] : [0, 0, 0]) as [number, number, number];
  }, [cell]);

  useFrame((_state, delta) => {
    const target = frozenValue ?? useAppStore.getState().disassemblyTarget;

    disassemblyState.current =
      frozenValue !== null
        ? clampDisassembly(frozenValue)
        : dampDisassembly(disassemblyState.current, target, delta);

    const progress = clampDisassembly(disassemblyState.current);
    const selectedId = useAppStore.getState().selectedId;

    /*
     * Ordered separation. `ordered` is the cell's separable records in exit order, and each part
     * travels inside **its own window** of the global control — so dragging the slider emits the
     * parts one order at a time instead of all at once, while 100 % still ends with every part fully
     * out. `separationProgress` owns the arithmetic; the driver only supplies the rank.
     *
     * One part may also be **inspected**, and that overrides the arrangement entirely: the chosen
     * part travels to the cell's centre so the camera can hold it still and close, and every other
     * part stops being drawn. Hiding the rest is what makes "look at this organelle alone, and turn
     * it" possible in this canvas — no second scene, no second model, no second WebGL context.
     */
    const count = ordered.length;

    for (let rank = 0; rank < count; rank += 1) {
      const record = ordered[rank]!;
      const object = registeredOrganelleRoot(record.id);

      if (!object) {
        continue;
      }

      const selected = selectedId === record.id;

      if (selected) {
        object.position.set(inspectionPoint[0], inspectionPoint[1], inspectionPoint[2]);
      } else {
        const local = separationProgress(progress, rank, count) * DISASSEMBLY_MAX;
        const slot = scatterSlotFor(record, cell, SCATTER_LAYOUT, rank, count, membraneExtent);
        const [x, y, z] = scatterPosition(record, cell, local, slot);

        object.position.set(x, y, z);
      }

      object.visible = selectedId === null || selected;
    }

    /*
     * The records that never separate — the envelope and the scaffold — are pinned at their own base
     * from the same zero progress the driver has always used: no travel, so `scatterPosition` returns
     * the mount's own position rather than an animation.
     */
    for (const record of roster) {
      if (isSeparable(record)) {
        continue;
      }

      const object = registeredOrganelleRoot(record.id);

      if (!object) {
        continue;
      }

      const [x, y, z] = scatterPosition(record, cell, DISASSEMBLY_MIN, HOME_SLOT);

      object.position.set(x, y, z);
      object.visible = selectedId === null || selectedId === record.id;
    }

    const hud = hudTarget.current;

    if (hud.lastWritten === progress) {
      return;
    }

    hud.lastWritten = progress;

    // Direct `textContent` writes, and only when the whole percent changes: bounded DOM work, and
    // no React render at any frame rate. The locale is read from the store rather than subscribed
    // to, for the same reason — the loop must not re-render the tree.
    const locale = useAppStore.getState().locale;

    if (hud.percent) {
      hud.percent.textContent = formatDisassemblyPercent(progress);
    }

    if (hud.state) {
      hud.state.textContent = t(disassemblyStateKey(progress), locale);
    }
  });

  return null;
}
