import type { ProcessMirrorEntry } from '../app/debug';
import type { CellId } from '../catalog/types';
import type { ProcessId } from '../processes/ids';
import { nutritionHasLightDrivenTarget } from '../processes/nutrition/targets';
import { reproductionPhaseKey } from './controls/scrubModel';
import type { UiKey } from './i18n/messages';

/**
 * The process panel's model (task 5.1).
 *
 * Same shape and same reason as `navModel.ts`: the panel is DOM in the app shell, and the facts it
 * needs are data that a unit test can check without a browser. Three of them live here:
 *
 * 1. **Which processes exist, and which the app can actually run.** All three vital processes are
 *    listed, because the spec's vocabulary has three and a panel that silently omitted two would
 *    hide the product's own scope. `available: false` is the honest state for the ones whose
 *    milestone has not landed — the same pattern `navModel` uses for comparison mode. A unit test
 *    cross-checks these flags against the 3D registry, so the panel cannot claim a process the app
 *    cannot build.
 * 2. **Which cell has a light-driven sub-process.** Derived from the nutrition target table rather
 *    than from the name "plant", so the light slider appears exactly where light can matter.
 * 3. **Which copy a running sub-process shows.** A timeline label or a continuous flow maps to one
 *    localized key, and nothing else in the app needs to know the label vocabulary.
 */

export interface ProcessOption {
  id: ProcessId;
  labelKey: UiKey;
  /** True when the app has a definition that can build it today. */
  available: boolean;
}

/**
 * The three vital processes, in the proposal's order.
 *
 * Nutrition (M2) and reproduction (M3) exist. Movement's plant slice is M4 and its animal slice is
 * user-owned and blocked (design D11), so it stays declared and disabled — the same honesty pattern
 * `navModel` uses for comparison mode. A panel that offered it today would be a false affordance.
 */
export const PROCESS_OPTIONS: readonly ProcessOption[] = [
  { id: 'nutrition', labelKey: 'process.nutrition.name', available: true },
  { id: 'movement', labelKey: 'process.movement.name', available: false },
  { id: 'reproduction', labelKey: 'process.reproduction.name', available: true },
];

export function processOption(id: string): ProcessOption | undefined {
  return PROCESS_OPTIONS.find((option) => option.id === id);
}

/** True when this process, in this cell, has motion the light slider drives. */
export function processHasLightControl(processId: string | null, cell: CellId): boolean {
  return processId === 'nutrition' && nutritionHasLightDrivenTarget(cell);
}

/** The heading for one running instance. */
export function processInstanceTitleKey(instanceId: string): UiKey {
  if (instanceId === 'photosynthesis') {
    return 'process.nutrition.photosynthesis.title';
  }

  if (instanceId === 'mitosis') {
    return 'process.reproduction.title';
  }

  return 'process.nutrition.respiration.title';
}

/**
 * The copy for one running instance's current state.
 *
 * Respiration and mitosis are both scripted, so their key comes from the timeline label; the label
 * vocabularies live in the process modules (`nutrition/stages.ts`, `reproduction/stages.ts`) and this
 * is the only place either becomes words. Photosynthesis is continuous and has a single statement
 * about what it is doing.
 */
export function processInstanceStageKey(instance: Pick<ProcessMirrorEntry, 'id' | 'label'>): UiKey {
  if (instance.id === 'mitosis') {
    return reproductionPhaseKey(instance.label);
  }

  if (instance.id !== 'respiration') {
    return 'process.nutrition.photosynthesis.stage';
  }

  return instance.label === 'atp'
    ? 'process.nutrition.respiration.stage.atp'
    : 'process.nutrition.respiration.stage.reactions';
}

/** The light control's readout: a whole percent, like every other control in the app. */
export function formatLightPercent(percent: number): string {
  return `${Math.round(percent)}%`;
}
