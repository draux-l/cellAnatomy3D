import { rosterFor } from '../../catalog/cells';
import type { CellId } from '../../catalog/types';
import type { ProcessTarget } from '../types';

/**
 * Which sub-processes nutrition runs, per cell — as **data**, and deliberately three-free.
 *
 * This is a separate module from `nutrition/index.ts` for one reason: the process panel lives in the
 * app shell, and the shell must not import anything that reaches three.js or GSAP (design D18's
 * payload gate). The definition module needs both (it builds `InstancedMesh`es and a `ShaderMaterial`),
 * so the *target table* lives here where the panel can read it and the definition can import it.
 *
 * The list is **derived from the catalog roster**, not from a cell name. Photosynthesis is not run in
 * the animal cell because the chloroplast is not in that cell's roster — which is what makes the
 * spec's "the process is visibly absent from the animal cell" true by construction rather than by a
 * branch that could go stale.
 */

export const RESPIRATION_TARGET: ProcessTarget = {
  id: 'respiration',
  organelleId: 'mitochondrion',
  lightDriven: false,
};

export const PHOTOSYNTHESIS_TARGET: ProcessTarget = {
  id: 'photosynthesis',
  organelleId: 'chloroplast',
  lightDriven: true,
};

/** Both sub-processes, in build order. The animal cell keeps only the first. */
export const NUTRITION_TARGETS: readonly ProcessTarget[] = [
  RESPIRATION_TARGET,
  PHOTOSYNTHESIS_TARGET,
];

export function nutritionTargetsFor(cell: CellId): readonly ProcessTarget[] {
  const roster = new Set(rosterFor(cell).map((record) => record.id));

  return NUTRITION_TARGETS.filter((target) => roster.has(target.organelleId));
}

/** True when this cell runs a sub-process the light slider drives. */
export function nutritionHasLightDrivenTarget(cell: CellId): boolean {
  return nutritionTargetsFor(cell).some((target) => target.lightDriven);
}
