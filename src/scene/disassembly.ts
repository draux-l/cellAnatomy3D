import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { DISASSEMBLY_MAX, DISASSEMBLY_MIN, clampDisassembly, useAppStore } from '../app/store';
import { rosterFor } from '../catalog/cells';
import { modelFor } from '../catalog/models';
import { positionForRecord } from '../catalog/params';
import { isMeshGeometry, type CellId, type OrganelleRecord } from '../catalog/types';
import { travelDistanceFor } from '../catalog/vectors';
import { t } from '../ui/i18n';
import { disassemblyStateKey, formatDisassemblyPercent } from '../ui/hud/disassemblyCopy';
import { registeredOrganelleRoot } from './anchors';

/**
 * Disassembly: one progress value, a damped transient current, per-frame transform writes.
 *
 * Design D13 chose transform-driven over a GSAP timeline per organelle and over a shader offset,
 * and the reason is that every consumer already follows the organelle's `Object3D`: the pick
 * volumes are its children, the annotation anchors read its `matrixWorld`, and the contact shadows
 * are drawn from where it actually is. Writing `position` therefore keeps all three correct with
 * no synchronisation, and reversibility is structural — the arrangement is a pure function of
 * `(progress, catalog vector)`.
 *
 * **Nothing here re-renders React.** The discrete target lives in the store and changes on a
 * control step; the current value lives in this module and is written to `Object3D.position` from
 * one `useFrame`.
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

/** The transient side of the split. Never in React state, never in the store. */
export interface DisassemblyState {
  current: number;
}

export function createDisassemblyState(): DisassemblyState {
  return { current: DISASSEMBLY_MIN };
}

/** The one transient current value the loop reads and writes. */
export const disassemblyState = createDisassemblyState();

/**
 * How far one organelle has moved at a given progress, in scene units.
 *
 * The distance is the record's own declared travel, resolved through `travelDistanceFor` — the
 * viewer never carries a displacement constant, and the integrity gate has already proved the
 * direction is outward and normalizable.
 */
export function disassemblyOffset(
  record: OrganelleRecord,
  progress: number,
): [number, number, number] {
  const percent = clampDisassembly(progress);
  const travel = (percent / DISASSEMBLY_MAX) * travelDistanceFor(record);
  const [dx, dy, dz] = record.disassembly.direction;

  return [dx * travel, dy * travel, dz * travel];
}

/**
 * Where one organelle's root sits at a given progress.
 *
 * Two mountings, one rule: the offset is always `direction × travel`, and only the base differs.
 *
 * - **A procedural record** starts at its own catalog placement, in scene units.
 * - **A mesh record** starts at its part's centre *inside the model's frame*, which carries a uniform
 *   scale. Its offset therefore has to be expressed in the same units — the disassembly distance is
 *   authored in scene units, so it is divided by the model's scale before being written. Nothing
 *   about the model's own transform changes; only the magnitude of the displacement is reconciled.
 *
 * A record that never separates (a zero vector with zero distance) returns its own base at every
 * value, which is why the membrane and the cytoplasm stay exactly where the file put them.
 */
export function disassembledPosition(
  record: OrganelleRecord,
  cell: CellId,
  progress: number,
): [number, number, number] {
  const [px, py, pz] = positionForRecord(record, cell);
  const [ox, oy, oz] = disassemblyOffset(record, progress);

  if (isMeshGeometry(record.geometry)) {
    const scale = modelFor(cell)?.frame.scale ?? 1;
    const base = registeredOrganelleRoot(record.id)?.userData.basePosition;

    // The host's authored base is published by its mount, so this function stays a pure function of
    // the record and the progress plus one number the mount already knows.
    const [bx, by, bz] = Array.isArray(base) ? base : [0, 0, 0];

    return [bx + ox / scale, by + oy / scale, bz + oz / scale];
  }

  return [px + ox, py + oy, pz + oz];
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
 * root is positioned from the catalog.
 */
export function DisassemblyDriver({ cell, frozenValue, hudTarget }: DisassemblyDriverProps) {
  const roster = useMemo(() => rosterFor(cell), [cell]);

  useFrame((_state, delta) => {
    const target = frozenValue ?? useAppStore.getState().disassemblyTarget;

    disassemblyState.current =
      frozenValue !== null
        ? clampDisassembly(frozenValue)
        : dampDisassembly(disassemblyState.current, target, delta);

    const progress = clampDisassembly(disassemblyState.current);

    for (const record of roster) {
      const object = registeredOrganelleRoot(record.id);

      if (!object) {
        continue;
      }

      const [x, y, z] = disassembledPosition(record, cell, progress);

      object.position.set(x, y, z);
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
