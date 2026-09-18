import { describe, expect, it } from 'vitest';
import { PROCESS_IDS } from './ids';
import { NUTRITION_SEED, nutritionProcess } from './nutrition';
import { nutritionTargetsFor } from './nutrition/targets';
import { getProcessDefinition, registeredProcessIds } from './registry';

/**
 * The process registry and the nutrition definition's per-cell targets (task 5.1).
 *
 * Two claims are asserted here rather than in a browser:
 *
 * 1. **The registry resolves by id, and degrades safely.** `processId` is a store value a URL can
 *    set, so an unknown or unbuilt id must produce *no process*, not a crash and not a half-built
 *    scene.
 * 2. **Which sub-processes run in a cell is derived from the catalog roster**, not from the cell's
 *    name. That is what makes "photosynthesis is visibly absent from the animal cell" a consequence
 *    of the data instead of a branch that could go stale.
 */

describe('the process registry', () => {
  it('registers nutrition and nothing else yet', () => {
    expect(registeredProcessIds()).toEqual(['nutrition']);
    // The declared vocabulary is still all three: M3 and M4 fill the rest in.
    expect(PROCESS_IDS).toEqual(['nutrition', 'movement', 'reproduction']);
  });

  it('resolves a registered process', () => {
    expect(getProcessDefinition('nutrition')).toBe(nutritionProcess);
    expect(nutritionProcess.id).toBe('nutrition');
  });

  it('returns null for a declared but unbuilt process, and for junk', () => {
    // A declared process with no definition is the state M3/M4 change, not an error.
    expect(getProcessDefinition('movement')).toBeNull();
    expect(getProcessDefinition('reproduction')).toBeNull();
    // An unknown id and the empty/none state must both be handled without throwing: the store value
    // arrives from a URL.
    expect(getProcessDefinition(null)).toBeNull();
    expect(getProcessDefinition('')).toBeNull();
    expect(getProcessDefinition('disassembly')).toBeNull();
  });
});

describe('nutrition targets', () => {
  it('runs respiration in both cells', () => {
    expect(nutritionTargetsFor('animal').map((target) => target.id)).toEqual(['respiration']);
    expect(nutritionTargetsFor('plant').map((target) => target.id)).toEqual([
      'respiration',
      'photosynthesis',
    ]);
  });

  it('runs photosynthesis only where a chloroplast is in the roster', () => {
    const plant = nutritionTargetsFor('plant');
    const animal = nutritionTargetsFor('animal');

    expect(plant.some((target) => target.organelleId === 'chloroplast')).toBe(true);
    expect(animal.some((target) => target.organelleId === 'chloroplast')).toBe(false);
    // Everything it does run is inside an organelle the cell actually has.
    expect(animal.every((target) => target.organelleId === 'mitochondrion')).toBe(true);
  });

  it('marks exactly one sub-process as light-driven, and it is in the plant cell', () => {
    const driven = nutritionTargetsFor('plant').filter((target) => target.lightDriven);

    expect(driven.map((target) => target.id)).toEqual(['photosynthesis']);
    expect(nutritionTargetsFor('animal').filter((target) => target.lightDriven)).toEqual([]);
  });

  it('has a stable seed for the animation', () => {
    expect(NUTRITION_SEED).toBe('nutrition/v1');
  });
});
