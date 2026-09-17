/**
 * The declared process vocabulary.
 *
 * There are exactly three vital processes in this product, and the spec makes that a *guard* rather
 * than a description: disassembly is a view control for studying structure and must never be
 * presented as a fourth process. Declaring the vocabulary here — before any process is built —
 * makes that assertion checkable today instead of at M2, and gives the process registry (task 5.1)
 * one place to read its ids from.
 *
 * This module is data only: it has no runtime behaviour and no dependency, so it is safe in the
 * shell's entry graph and cheap to assert against in a unit test.
 */

export const PROCESS_IDS = ['nutrition', 'movement', 'reproduction'] as const;

export type ProcessId = (typeof PROCESS_IDS)[number];

export function isProcessId(value: string): value is ProcessId {
  return (PROCESS_IDS as readonly string[]).includes(value);
}
