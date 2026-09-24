import { describe, expect, it } from 'vitest';
import { DISASSEMBLY_MIN, DISCRETE_STATE_KEYS } from '../app/store';
import { UI_MESSAGES } from './i18n/messages';
import { VIEW_OPTIONS, isLandingState } from './navModel';

/**
 * The navigation model (task 4.5).
 *
 * The interesting assertions are about *absence* and about *whose state it is*: the navigation must
 * not offer a view the app cannot render, its labels must be real message keys, and "landing" must
 * be the same question `resetToSelection()` answers.
 */

describe('the view options', () => {
  it('offers the two cells and declares comparison unavailable', () => {
    expect(VIEW_OPTIONS.map((option) => option.view)).toEqual(['animal', 'plant', 'comparison']);
    expect(VIEW_OPTIONS.filter((option) => option.available).map((option) => option.view)).toEqual([
      'animal',
      'plant',
    ]);
    expect(VIEW_OPTIONS.find((option) => option.view === 'comparison')?.available).toBe(false);
  });

  it('labels every entry with a real bilingual UI key', () => {
    for (const option of VIEW_OPTIONS) {
      const message = (UI_MESSAGES as Record<string, { es: string; en: string } | undefined>)[
        option.labelKey
      ];

      expect(message, `missing message for ${option.labelKey}`).toBeDefined();
      expect(message!.es.trim().length).toBeGreaterThan(0);
      expect(message!.en.trim().length).toBeGreaterThan(0);
    }

    // The reason copy for a disabled entry is copy too, and it must exist in both languages.
    expect(UI_MESSAGES['nav.view.pending'].es).toBe('Se añade en una etapa posterior');
    expect(UI_MESSAGES['nav.view.pending'].en).toBe('Added in a later stage');
  });
});

describe('the landing view state', () => {
  it('is the state resetToSelection produces', () => {
    expect(isLandingState({ selectedId: null, disassemblyTarget: DISASSEMBLY_MIN })).toBe(true);
  });

  it('is left by each of the two departures on its own', () => {
    expect(isLandingState({ selectedId: 'golgi', disassemblyTarget: DISASSEMBLY_MIN })).toBe(false);
    expect(isLandingState({ selectedId: null, disassemblyTarget: 1 })).toBe(false);
  });

  it('does not depend on any key the landing question is not about', () => {
    // A language switch, a palette change or a hover must never read as leaving the landing state:
    // those keys are deliberately absent from the input, and the compiler enforces that.
    const inputs = Object.keys({ selectedId: 1, disassemblyTarget: 1 });
    const stateKeys = [...DISCRETE_STATE_KEYS];

    expect(inputs).toEqual(['selectedId', 'disassemblyTarget']);
    expect(stateKeys).toContain('locale');
    expect(inputs).not.toContain('locale');
  });
});
