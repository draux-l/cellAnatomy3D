import { describe, expect, it } from 'vitest';
import { getRecord, rosterFor } from './cells';
import { baseGeometryParamsFor, hasPerCellOverride, paramsForRecord, positionForRecord } from './params';

/**
 * The per-cell resolution rule (composition slice).
 *
 * These tests are the reason the merge lives in one module: the viewer and the disassembly
 * assertions both read a record's data *for a cell*, and they must not be able to disagree.
 */

describe('paramsForRecord', () => {
  it('returns the record parameters unchanged for a cell with no override', () => {
    const membrane = getRecord('membrane')!;

    expect(paramsForRecord(membrane, 'animal')).toEqual(baseGeometryParamsFor(membrane));
  });

  it('merges the plant override over the base parameters without replacing them', () => {
    const membrane = getRecord('membrane')!;
    const plant = paramsForRecord(membrane, 'plant');

    expect(plant.sides).toBe(8);
    expect(plant.cornerRounding).toBe(0.4);
    // Every base key survives the merge: an override is a deviation, not a replacement.
    expect(plant.size).toBe(baseGeometryParamsFor(membrane).size);
    expect(plant.noiseAmplitude).toBe(baseGeometryParamsFor(membrane).noiseAmplitude);
    expect(plant.seed).toBe(baseGeometryParamsFor(membrane).seed);
  });

  it('does not mutate the frozen catalog', () => {
    const membrane = getRecord('membrane')!;
    const merged = paramsForRecord(membrane, 'plant');

    merged.size = 99;
    merged.injected = true;

    expect(paramsForRecord(membrane, 'plant').size).toBe(1);
    expect(Object.keys(paramsForRecord(membrane, 'plant'))).not.toContain('injected');
    expect(Object.isFrozen(membrane)).toBe(true);
  });

  it('keeps the round silhouette as the animal default', () => {
    // The whole point of the parameter: the animal cell must not change.
    expect(paramsForRecord(getRecord('membrane')!, 'animal').sides).toBeUndefined();
  });
});

describe('positionForRecord', () => {
  it('falls back to the record position', () => {
    for (const record of rosterFor('animal')) {
      expect(positionForRecord(record, 'animal')).toEqual([...record.position]);
    }
  });

  it('returns a fresh array a caller cannot use to mutate the catalog', () => {
    const nucleus = getRecord('nucleus')!;
    const position = positionForRecord(nucleus, 'animal');

    position[0] = 123;

    expect(positionForRecord(nucleus, 'animal')).toEqual([...nucleus.position]);
  });

  it('reports which records deviate in a cell', () => {
    const deviating = rosterFor('plant')
      .filter((record) => hasPerCellOverride(record, 'plant'))
      .map((record) => record.id);

    // The membrane's silhouette is the deviation that exists today.
    expect(deviating).toContain('membrane');
    expect(rosterFor('animal').filter((record) => hasPerCellOverride(record, 'animal'))).toEqual([]);
  });
});
