import { isProcessId, type ProcessId } from './ids';
import { nutritionProcess } from './nutrition';
import type { ProcessDefinition } from './types';

/**
 * The process registry (task 5.1, design D11).
 *
 * `processId → ProcessDefinition` is the extension point the design names: a new process is one
 * entry here plus its own module, and the viewer, the store, the panel and the i18n table are
 * untouched. Nutrition is the only registered process today, and that is stated rather than
 * implied — `PROCESS_IDS` declares all three vital processes, and M3/M4 register the other two.
 *
 * **This module is part of the 3D chunk.** Its definitions import three.js and GSAP, which is why
 * the UI's process list lives in `src/ui/processModel.ts` (a three-free table) and not here: one
 * careless import of this file from a shell component would pull three.js out of the lazy chunk and
 * break the payload gate (`verify/size-audit.mjs`).
 */

export const PROCESS_REGISTRY: Partial<Record<ProcessId, ProcessDefinition>> = {
  nutrition: nutritionProcess,
};

/** The definitions that exist today, in `PROCESS_IDS` order. */
export function registeredProcessIds(): ProcessId[] {
  return Object.keys(PROCESS_REGISTRY) as ProcessId[];
}

/**
 * The definition for a store value, or null.
 *
 * Null rather than a throw: `processId` is a store value that a URL can set, and an unknown id must
 * degrade to "no process" instead of a blank screen. It is still distinguishable from a declared but
 * unbuilt process, which is what the panel's `available` flags describe.
 */
export function getProcessDefinition(id: string | null): ProcessDefinition | null {
  return id !== null && isProcessId(id) ? PROCESS_REGISTRY[id] ?? null : null;
}
