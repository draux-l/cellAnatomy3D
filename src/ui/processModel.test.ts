import { describe, expect, it } from 'vitest';
import { PROCESS_IDS } from '../processes/ids';
import { getProcessDefinition } from '../processes/registry';
import {
  PROCESS_OPTIONS,
  formatLightPercent,
  processHasLightControl,
  processInstanceStageKey,
  processInstanceTitleKey,
  processOption,
} from './processModel';

/**
 * The process panel's model (task 5.1).
 *
 * The panel makes one claim to the user that the app could get wrong silently: **"this process
 * exists"**. `available` is what decides whether a button is pressable, and the registry is what
 * decides whether a process can actually be built — so the two are cross-checked here. A panel that
 * offered a process with no definition would render an enter button that does nothing, which is
 * exactly the false affordance `navModel` was written to avoid for comparison mode.
 */

describe('the process options', () => {
  it('lists the spec\'s three vital processes, in the spec\'s order', () => {
    expect(PROCESS_OPTIONS.map((option) => option.id)).toEqual([...PROCESS_IDS]);
  });

  it('agrees with the registry about every option it offers', () => {
    for (const option of PROCESS_OPTIONS) {
      const definition = getProcessDefinition(option.id);

      if (option.available) {
        expect(definition, `${option.id} is offered but has no definition`).not.toBeNull();
        expect(definition?.id).toBe(option.id);
      } else {
        expect(definition, `${option.id} is declared unavailable but resolves`).toBeNull();
      }
    }
  });

  it('offers nutrition today and declares the other two as pending', () => {
    expect(processOption('nutrition')?.available).toBe(true);
    expect(processOption('movement')?.available).toBe(false);
    expect(processOption('reproduction')?.available).toBe(false);
    expect(processOption('disassembly')).toBeUndefined();
  });
});

describe('the light control\'s visibility', () => {
  it('is shown exactly where a light-driven sub-process runs', () => {
    expect(processHasLightControl('nutrition', 'plant')).toBe(true);
    // The animal cell has no chloroplast, so a light slider there would drive nothing.
    expect(processHasLightControl('nutrition', 'animal')).toBe(false);
    // And with no process running there is nothing to drive at all.
    expect(processHasLightControl(null, 'plant')).toBe(false);
    expect(processHasLightControl('movement', 'plant')).toBe(false);
  });

  it('formats the slider value as a whole percent', () => {
    expect(formatLightPercent(0)).toBe('0%');
    expect(formatLightPercent(57.6)).toBe('58%');
    expect(formatLightPercent(100)).toBe('100%');
  });
});

describe('the running instance copy', () => {
  it('names each sub-process', () => {
    expect(processInstanceTitleKey('respiration')).toBe('process.nutrition.respiration.title');
    expect(processInstanceTitleKey('photosynthesis')).toBe(
      'process.nutrition.photosynthesis.title',
    );
  });

  it('turns a timeline label into the stage it names', () => {
    expect(processInstanceStageKey({ id: 'respiration', label: 'reactions' })).toBe(
      'process.nutrition.respiration.stage.reactions',
    );
    expect(processInstanceStageKey({ id: 'respiration', label: 'atp' })).toBe(
      'process.nutrition.respiration.stage.atp',
    );
    // A label-less frame — the first frame after entering, or after a seek past the end — must still
    // produce a sentence rather than throwing or rendering a blank line.
    expect(processInstanceStageKey({ id: 'respiration', label: null })).toBe(
      'process.nutrition.respiration.stage.reactions',
    );
  });

  it('has one statement for the continuous process', () => {
    expect(processInstanceStageKey({ id: 'photosynthesis', label: null })).toBe(
      'process.nutrition.photosynthesis.stage',
    );
  });
});
