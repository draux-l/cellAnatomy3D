import { describe, expect, it } from 'vitest';
import { ORGANELLE_RECORDS } from '../catalog/cells';
import { SIZE_UNITS } from '../catalog/types';
import { formatOrganelleSize, SIZE_NUMBER_LOCALES } from './specSheetModel';

/**
 * The spec sheet's size line (task 4.5).
 *
 * The unit is a technical symbol and does not translate; the *number* does, and the decimal
 * separator is the one place where a hand-written formatter would silently be wrong. Every
 * catalog size is formatted in both locales and asserted to carry the record's own unit.
 */
describe('formatOrganelleSize', () => {
  it('keeps the unit symbol and localises the number', () => {
    // The catalog authors 0.5 µm for the lysosome and 50 nm for the ribosome.
    expect(formatOrganelleSize({ value: 0.5, unit: 'µm' }, 'es')).toBe('0,5 µm');
    expect(formatOrganelleSize({ value: 0.5, unit: 'µm' }, 'en')).toBe('0.5 µm');
    expect(formatOrganelleSize({ value: 50, unit: 'nm' }, 'es')).toBe('50 nm');
  });

  it('formats every catalog record in both locales with its own unit', () => {
    for (const record of ORGANELLE_RECORDS) {
      for (const locale of ['es', 'en'] as const) {
        const formatted = formatOrganelleSize(record.size, locale);

        expect(formatted, `${record.id}.${locale}`).toContain(record.size.unit);
        expect(formatted.endsWith(` ${record.size.unit}`)).toBe(true);
        // No thousands separator accidentally introduced: every catalog size is below 1000.
        expect(formatted.replace(/[^0-9]/g, '')).toBe(
          String(record.size.value).replace('.', '').replace(',', ''),
        );
      }
    }
  });

  it('declares a number-formatting locale for every content locale', () => {
    expect(Object.keys(SIZE_NUMBER_LOCALES).sort()).toEqual(['en', 'es']);
  });

  it('uses only declared size units', () => {
    for (const record of ORGANELLE_RECORDS) {
      expect(SIZE_UNITS).toContain(record.size.unit);
    }
  });
});
