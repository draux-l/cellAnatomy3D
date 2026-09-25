import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { useAppStore } from '../../app/store';
import { ORGANELLE_RECORDS } from '../../catalog/cells';
import {
  DEFAULT_LOCALE,
  LOCALES,
  assertBilingualParity,
  findBilingualGaps,
  formatBilingualGaps,
  isLocale,
  t,
} from './index';
import { LANGUAGE_OPTIONS, UI_MESSAGES } from './messages';

/**
 * i18n infrastructure checks (task 2.4).
 *
 * Two kinds of assertion live here: the data (parity, defaults, accessor behaviour) and the
 * *structural* properties that a unit test can still hold — no persistence API in `src/`, and no
 * educational copy hard-coded in a component. A source scan is the only way to assert the
 * absence of something, and absence is exactly what the spec asks for.
 */

function listSourceFiles(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) {
      // Tests are excluded: they are not shipped, and this scan names the very APIs it forbids.
      found.push(full);
    }
  }

  return found;
}

const SRC_ROOT = join(process.cwd(), 'src');
const SOURCE_FILES = listSourceFiles(SRC_ROOT);

function sourceOf(file: string): string {
  return readFileSync(file, 'utf8');
}

function relative(file: string): string {
  return file.slice(SRC_ROOT.length + 1);
}

describe('i18n accessor', () => {
  it('defaults to Spanish and offers exactly two locales', () => {
    expect(DEFAULT_LOCALE).toBe('es');
    expect(LOCALES).toEqual(['es', 'en']);
    // The store's default and the i18n default are the same fact; they must not drift.
    expect(useAppStore.getState().locale).toBe(DEFAULT_LOCALE);
  });

  it('returns different copy per locale', () => {
    expect(t('app.title', 'es')).not.toBe(t('app.title', 'en'));
    expect(t('app.title', 'es')).toContain('anatomía');
    expect(t('app.title', 'en')).toContain('Anatomy');
  });

  it('names the key when it is missing at runtime', () => {
    expect(() => t('app.nope' as never, 'es')).toThrow(/No UI message for "app.nope"/);
  });

  it('narrows locale strings', () => {
    expect(isLocale('es')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });

  it('labels the selector options with their own endonyms', () => {
    expect(LANGUAGE_OPTIONS.map((option) => option.locale)).toEqual(['es', 'en']);
    expect(t('language.es', 'en')).toBe('Español');
    expect(t('language.en', 'es')).toBe('English');
  });
});

describe('bilingual parity', () => {
  it('accepts the UI message table', () => {
    expect(findBilingualGaps(UI_MESSAGES)).toEqual([]);
    expect(() => assertBilingualParity(UI_MESSAGES)).not.toThrow();
  });

  it('fails naming the key with no English value', () => {
    const broken = { ...UI_MESSAGES, 'app.newKey': { es: 'solo español' } };
    const gaps = findBilingualGaps(broken);

    expect(gaps).toEqual([{ key: 'app.newKey', locale: 'en' }]);
    expect(() => assertBilingualParity(broken, 'ui-messages')).toThrow(/app\.newKey\.en/);
    expect(formatBilingualGaps(gaps, 'ui-messages')).toContain('[ui-messages] app.newKey.en: is empty');
  });

  it('fails naming the key with a blank Spanish value', () => {
    const broken = { ...UI_MESSAGES, 'app.newKey': { es: '   ', en: 'ok' } };

    expect(findBilingualGaps(broken)).toEqual([{ key: 'app.newKey', locale: 'es' }]);
  });

  it('accepts the catalog records under the same rule', () => {
    // The catalog has its own gate (`catalog/integrity.ts`) and applies the same definition of
    // "translated", so the two halves of the content model cannot disagree. Optional fields are
    // checked only when present, matching the name-first record set.
    for (const record of ORGANELLE_RECORDS) {
      const fields: Record<string, unknown> = { [`${record.id}.name`]: record.name };

      if (record.func) {
        fields[`${record.id}.func`] = record.func;
      }

      if (record.funFact) {
        fields[`${record.id}.funFact`] = record.funFact;
      }

      expect(findBilingualGaps(fields)).toEqual([]);
    }
  });
});

describe('language persistence and copy ownership', () => {
  it('never touches a persistence API', () => {
    const offenders: string[] = [];

    for (const file of SOURCE_FILES) {
      const source = sourceOf(file);

      for (const api of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie']) {
        if (source.includes(api)) {
          offenders.push(`${relative(file)} uses ${api}`);
        }
      }
    }

    // The spec is explicit: the language selection lives in memory only.
    expect(offenders).toEqual([]);
  });

  it('keeps the app copy in the message table rather than in a component', () => {
    const app = sourceOf(join(SRC_ROOT, 'App.tsx'));

    expect(app).toContain("t('app.title')");
    expect(app).not.toContain('3D Cell Anatomy Explorer');
    expect(app).not.toContain('modelled procedurally');
  });

  it('scans the source tree it thinks it is scanning', () => {
    // Guards the scan itself: a bad path would make the assertions above pass vacuously.
    expect(SOURCE_FILES.length).toBeGreaterThan(10);
    expect(SOURCE_FILES.some((file) => file.endsWith(`App.tsx`))).toBe(true);
    expect(SOURCE_FILES.some((file) => file.includes(`${sep}catalog${sep}cells.ts`))).toBe(true);
  });
});
