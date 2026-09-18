import type { CellId } from '../../catalog/types';
import type { ProcessContext, ProcessDefinition, ProcessInstance } from '../types';
import { buildPhotosynthesis } from './photosynthesis';
import { buildRespiration } from './respiration';
import { PHOTOSYNTHESIS_TARGET, nutritionTargetsFor } from './targets';

/**
 * The nutrition process (task 5.1).
 *
 * One definition, one per-cell target list, two sub-processes. The split is the spec's, not this
 * module's convenience: *"Respiration and photosynthesis SHALL be presented as distinct processes
 * with distinct inputs and locations, and neither SHALL be shown inside the other's organelle."* A
 * single shared "energy animation" with a recoloured label is exactly the defect that requirement
 * exists to prevent — so the two are separate modules with separate mechanisms (a scripted GSAP
 * timeline on the cristae; a GPU flow on the grana) and separate inputs (none; light).
 *
 * The target table itself lives in `targets.ts` because the app shell reads it too, and the shell
 * must not pull three.js into the entry graph — so this module deliberately does **not** re-export
 * it. Consumers that must stay in the shell import `targets.ts` directly.
 */

/** The animation's deterministic seed. The organelle's own seed is prefixed by the driver. */
export const NUTRITION_SEED = 'nutrition/v1';

export function buildNutrition(context: ProcessContext): ProcessInstance {
  return context.target.id === PHOTOSYNTHESIS_TARGET.id
    ? buildPhotosynthesis(context)
    : buildRespiration(context);
}

export const nutritionProcess: ProcessDefinition = {
  id: 'nutrition',
  targets: (cell: CellId) => nutritionTargetsFor(cell),
  build: buildNutrition,
};
