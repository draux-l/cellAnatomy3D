import { describe, expect, it } from 'vitest';
import { PROCESS_IDS } from './ids';
import { NUTRITION_SEED, nutritionProcess } from './nutrition';
import { nutritionTargetsFor } from './nutrition/targets';
import { getProcessDefinition, registeredProcessIds } from './registry';
import { MITOSIS_TARGET, reproductionProcess } from './reproduction';
import { buildMitosis, PLATE_PART } from './reproduction/mitosis';
import { getRecord } from '../catalog/cells';

/**
 * The process registry and the definitions' per-cell targets (tasks 5.1, 6.1).
 *
 * Three claims are asserted here rather than in a browser:
 *
 * 1. **The registry resolves by id, and degrades safely.** `processId` is a store value a URL can
 *    set, so an unknown or unbuilt id must produce *no process*, not a crash and not a half-built
 *    scene.
 * 2. **Which sub-processes run in a cell is derived from the catalog roster**, not from the cell's
 *    name. That is what makes "photosynthesis is visibly absent from the animal cell" a consequence
 *    of the data instead of a branch that could go stale.
 * 3. **Reproduction's target really is the cell centre.** Mitosis is a whole-cell animation that is
 *    parented to its target's root, so the target must be an object the catalog places at the origin
 *    and never disassembles. Both facts are read from the catalog rather than trusted, so a later
 *    edit that moved the cytoplasm fails here instead of dragging the cell plate along with it.
 */

describe('the process registry', () => {
  it('registers the two processes M2 and M3 deliver', () => {
    expect(registeredProcessIds()).toEqual(['nutrition', 'reproduction']);
    // The declared vocabulary is still all three: M4 fills in the rest.
    expect(PROCESS_IDS).toEqual(['nutrition', 'movement', 'reproduction']);
  });

  it('resolves a registered process', () => {
    expect(getProcessDefinition('nutrition')).toBe(nutritionProcess);
    expect(nutritionProcess.id).toBe('nutrition');
    expect(getProcessDefinition('reproduction')).toBe(reproductionProcess);
    expect(reproductionProcess.id).toBe('reproduction');
  });

  it('returns null for a declared but unbuilt process, and for junk', () => {
    // A declared process with no definition is the state M4 changes, not an error.
    expect(getProcessDefinition('movement')).toBeNull();
    // An unknown id and the empty/none state must both be handled without throwing: the store value
    // arrives from a URL.
    expect(getProcessDefinition(null)).toBeNull();
    expect(getProcessDefinition('')).toBeNull();
    expect(getProcessDefinition('disassembly')).toBeNull();
  });
});

describe('reproduction targets', () => {
  it('runs one whole-cell instance in both cells, in the same place', () => {
    expect(reproductionProcess.targets('animal').map((target) => target.id)).toEqual(['mitosis']);
    expect(reproductionProcess.targets('plant').map((target) => target.id)).toEqual(['mitosis']);
    expect(MITOSIS_TARGET.lightDriven).toBe(false);
  });

  it('animates in the cytoplasm, which the catalog places at the cell centre and never separates', () => {
    const record = getRecord(MITOSIS_TARGET.organelleId);

    expect(record).toBeDefined();
    expect(record?.position.every((value) => value === 0)).toBe(true);
    expect(record?.disassembly.distance).toBe(0);
    // Both cells have it: mitosis is not a per-cell roster difference.
    expect(record?.cells).toEqual(['animal', 'plant']);
  });

  it('exposes the whole-cell factory the registry holds', () => {
    expect(reproductionProcess.build).toBe(buildMitosis);
    // The plate is one of the two mechanisms, and it is the opaque one.
    expect(PLATE_PART).toBe('cell-plate');
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
