import { describe, expect, it } from 'vitest';
import type { OrganelleRecord } from './types';
import { baseGeometryParamsFor, hasPerCellOverride, paramsForRecord, positionForRecord } from './params';

/**
 * The per-cell resolution rule (composition slice).
 *
 * These tests are the reason the merge lives in one module: the viewer and the disassembly
 * assertions both read a record's data *for a cell*, and they must not be able to disagree. The
 * committed catalog is empty while the cell models are reset, so the cases run against a synthetic
 * record that carries the same shape: a base parameter set plus a plant deviation.
 */

const MEMBRANE: OrganelleRecord = {
  id: 'membrane',
  name: { es: 'Membrana plasmática', en: 'Cell membrane' },
  func: { es: 'Delimita la célula.', en: 'Bounds the cell.' },
  size: { value: 7, unit: 'nm' },
  funFact: { es: 'Es muy delgada.', en: 'It is very thin.' },
  paletteRole: 'membrane',
  position: [0, 0, 0],
  geometry: {
    kind: 'procedural',
    builder: 'membrane',
    params: { size: 1, detail: 1, count: 0, noiseAmplitude: 0.035, seed: 'membrane/v1' },
    seed: 'membrane/v1',
  },
  // The plant override gives the membrane the wall's silhouette; the animal default stays round.
  perCell: { plant: { geometryParams: { sides: 8, cornerRounding: 0.4 } } },
  separates: false,
  cells: ['animal', 'plant'],
  pickable: true,
};

describe('paramsForRecord', () => {
  it('returns the record parameters unchanged for a cell with no override', () => {
    expect(paramsForRecord(MEMBRANE, 'animal')).toEqual(baseGeometryParamsFor(MEMBRANE));
  });

  it('merges the plant override over the base parameters without replacing them', () => {
    const plant = paramsForRecord(MEMBRANE, 'plant');

    expect(plant.sides).toBe(8);
    expect(plant.cornerRounding).toBe(0.4);
    // Every base key survives the merge: an override is a deviation, not a replacement.
    expect(plant.size).toBe(baseGeometryParamsFor(MEMBRANE).size);
    expect(plant.noiseAmplitude).toBe(baseGeometryParamsFor(MEMBRANE).noiseAmplitude);
    expect(plant.seed).toBe(baseGeometryParamsFor(MEMBRANE).seed);
  });

  it('does not mutate the record', () => {
    const merged = paramsForRecord(MEMBRANE, 'plant');

    merged.size = 99;
    merged.injected = true;

    expect(paramsForRecord(MEMBRANE, 'plant').size).toBe(1);
    expect(Object.keys(paramsForRecord(MEMBRANE, 'plant'))).not.toContain('injected');
  });

  it('keeps the round silhouette as the animal default', () => {
    // The whole point of the parameter: the animal cell must not change.
    expect(paramsForRecord(MEMBRANE, 'animal').sides).toBeUndefined();
  });
});

describe('positionForRecord', () => {
  it('falls back to the record position', () => {
    expect(positionForRecord(MEMBRANE, 'animal')).toEqual([...MEMBRANE.position]);
  });

  it('prefers the per-cell placement when one is declared', () => {
    const placed: OrganelleRecord = {
      ...MEMBRANE,
      position: [0.1, 0.2, 0.3],
      perCell: { plant: { position: [-0.36, 0.52, 0.15] } },
    };

    expect(positionForRecord(placed, 'animal')).toEqual([0.1, 0.2, 0.3]);
    expect(positionForRecord(placed, 'plant')).toEqual([-0.36, 0.52, 0.15]);
  });

  it('returns a fresh array a caller cannot use to mutate the record', () => {
    const position = positionForRecord(MEMBRANE, 'animal');

    position[0] = 123;

    expect(positionForRecord(MEMBRANE, 'animal')).toEqual([...MEMBRANE.position]);
  });

  it('reports which records deviate in a cell', () => {
    expect(hasPerCellOverride(MEMBRANE, 'plant')).toBe(true);
    expect(hasPerCellOverride(MEMBRANE, 'animal')).toBe(false);
  });
});
