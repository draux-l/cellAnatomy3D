import type { CellId } from '../../catalog/types';
import type { ProcessDefinition, ProcessTarget } from '../types';
import { buildMitosis } from './mitosis';

/**
 * The reproduction process (task 6.1).
 *
 * One definition, one target, one instance. The reason there is no per-cell target list here — the
 * shape nutrition needed — is that mitosis happens in **every** cell and in the same place: it is
 * the division of the cell itself, not an organelle process that a roster could add or remove.
 *
 * **Why the target is the cytoplasm.** The animation is whole-cell: the chromatids travel from the
 * nucleus to opposite poles, the cell plate spans the cell, and the animal furrow deforms the
 * boundary. The process is parented to its target's root, so the target has to be an object that
 * sits at the cell centre and does not travel when the exploded view runs. The cytoplasm record
 * declares exactly that (`position: [0, 0, 0]`, `disassembly: distance 0`), and
 * `reproduction.test.ts` asserts both facts from the catalog, so the assumption fails loudly if a
 * later edit moves it. Parenting to the nucleus instead would have dragged the plate and the ring
 * along with the exploded nucleus.
 */

export const MITOSIS_TARGET: ProcessTarget = {
  id: 'mitosis',
  organelleId: 'cytoplasm',
  lightDriven: false,
};

/** The animation's deterministic seed. The organelle's own seed is prefixed by the driver. */
export const REPRODUCTION_SEED = 'reproduction/v1';

export function reproductionTargets(_cell: CellId): readonly ProcessTarget[] {
  return [MITOSIS_TARGET];
}

export const reproductionProcess: ProcessDefinition = {
  id: 'reproduction',
  targets: reproductionTargets,
  build: buildMitosis,
};
