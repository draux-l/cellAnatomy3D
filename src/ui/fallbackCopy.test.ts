import { describe, expect, it } from 'vitest';
import { useAppStore } from '../app/store';
import { ORGANELLE_RECORDS } from '../catalog/cells';
import { t } from './i18n';
import { UI_MESSAGES } from './i18n/messages';
import type { UiKey } from './i18n/messages';
import { FALLBACK_UNAVAILABLE_SURFACES } from './fallbackCopy';

/**
 * The fallback's declarations (task 4.6, extended by task 4.22).
 *
 * The spec requires the unavailability to be **stated**, and the design's rule is that the
 * statements must exist in both locales. A unit test is where that can be checked without a
 * browser: every declared key resolves in both languages, and each one is genuinely translated
 * rather than English text wearing a Spanish key.
 *
 * The remaining half — that the statements actually render, alongside the images and the sheets —
 * belongs to `verify/specs/fallback.spec.ts`, because it is a fact about a rendered page.
 */

describe('the fallback declarations', () => {
  it('names every 3D-only surface the static path cannot offer', () => {
    // The 3D path's interactive surface. `hover`/`annotations` are visual consequences of the
    // renderer, the three processes and the quiz need it to run, and isolate + disassembly are the
    // two controls the viewer owns.
    expect([...FALLBACK_UNAVAILABLE_SURFACES]).toEqual([
      'fallback.unavailable.processes',
      'fallback.unavailable.isolate',
      'fallback.unavailable.quiz',
    ]);
    expect(new Set(FALLBACK_UNAVAILABLE_SURFACES).size).toBe(FALLBACK_UNAVAILABLE_SURFACES.length);
  });

  it('resolves every declaration in both locales, translated', () => {
    for (const key of FALLBACK_UNAVAILABLE_SURFACES) {
      const message = (UI_MESSAGES as Record<string, { es: string; en: string } | undefined>)[key];

      expect(message, `missing message for ${key}`).toBeDefined();
      expect(message!.es.trim().length).toBeGreaterThan(0);
      expect(message!.en.trim().length).toBeGreaterThan(0);
      // A key whose two values are identical is an untranslated string that passed the parity gate.
      expect(message!.es, `${key} is not translated`).not.toBe(message!.en);
      expect(t(key, 'es')).toBe(message!.es);
      expect(t(key, 'en')).toBe(message!.en);
    }
  });

  it('keeps the fallback copy itself bilingual and present', () => {
    for (const key of [
      'fallback.title',
      'fallback.lead',
      'fallback.image.animal',
      'fallback.image.plant',
      'fallback.unavailable.title',
      'fallback.sheets.title',
    ] satisfies UiKey[]) {
      expect(t(key, 'es').length).toBeGreaterThan(0);
      expect(t(key, 'en').length).toBeGreaterThan(0);
      expect(t(key, 'es')).not.toBe(t(key, 'en'));
    }
  });

  it('names both static cell images, one per cell', () => {
    expect(t('fallback.image.animal', 'es')).toContain('animal');
    expect(t('fallback.image.plant', 'es')).toContain('vegetal');
  });

  it('leaves the spec-sheet content reaching every catalog record', () => {
    // The fallback renders the sheets from the catalog, so "the full bilingual spec sheet" is a
    // statement about records rather than about a hand-written list.
    expect(ORGANELLE_RECORDS.length).toBeGreaterThan(0);

    for (const record of ORGANELLE_RECORDS) {
      expect(record.name.es.length).toBeGreaterThan(0);
      expect(record.name.en.length).toBeGreaterThan(0);
      expect(record.func.es.length).toBeGreaterThan(0);
      expect(record.func.en.length).toBeGreaterThan(0);
      expect(record.funFact.es.length).toBeGreaterThan(0);
      expect(record.funFact.en.length).toBeGreaterThan(0);
    }
  });

  it('is reachable without the store knowing anything about WebGL', () => {
    // The probe's answer is not state: it is a fact read once at mount, so a language switch (or any
    // other discrete change) can never re-decide it.
    expect(Object.keys(useAppStore.getState())).not.toContain('webgl2');
  });
});
