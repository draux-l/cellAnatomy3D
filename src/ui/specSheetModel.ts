import type { Locale } from '../app/store';
import type { SizeWithUnit } from '../catalog/types';

/**
 * The spec sheet's presentation maths (task 4.5).
 *
 * It is separated from the component for one reason: a component cannot be unit-tested in this
 * project (vitest runs in `node`, with no DOM), and the size line is the one sheet field that is
 * *computed* rather than copied from the record. Keeping the computation pure means the
 * localisation of the number is asserted rather than eyeballed.
 *
 * The unit (`µm` / `nm`) is a technical unit symbol and is deliberately identical in both
 * languages (spec: Technical Identifiers Stay English). Only the decimal separator is localised:
 * a Spanish reader expects `0,5 µm`, and `Intl.NumberFormat` is the mechanism rather than a
 * hand-written `replace('.', ',')`.
 */

/** The `Intl` locale tag per content locale. */
export const SIZE_NUMBER_LOCALES: Record<Locale, string> = {
  es: 'es-ES',
  en: 'en-GB',
};

/**
 * Formats a record's approximate size for the active locale.
 *
 * `maximumFractionDigits: 2` matches the catalog's own precision — the values are authored with
 * at most two decimals, and the runtime never rounds them further.
 */
export function formatOrganelleSize(size: SizeWithUnit, locale: Locale): string {
  const value = new Intl.NumberFormat(SIZE_NUMBER_LOCALES[locale], {
    maximumFractionDigits: 2,
  }).format(size.value);

  return `${value} ${size.unit}`;
}
