import { describe, expect, it } from 'vitest';
import { PROCESS_IDS, isProcessId } from '../../processes/ids';
import { UI_MESSAGES } from '../i18n/messages';
import { disassemblyStateKey, formatDisassemblyPercent } from './disassemblyCopy';

/**
 * The disassembly control's copy (tasks 4.11, spec: `Disassembly Is A View Control, Not A Biological
 * Claim`).
 *
 * The requirement is a negative one — disassembly must not read as a fourth vital process — and a
 * negative is only checkable if the three that exist are declared. That is what `PROCESS_IDS` is
 * for, and it is asserted here rather than at M2 when the selector is built.
 */

describe('disassemblyStateKey', () => {
  it('names the two ends and everything between them', () => {
    expect(disassemblyStateKey(0)).toBe('view.disassembly.state.assembled');
    expect(disassemblyStateKey(1)).toBe('view.disassembly.state.partial');
    expect(disassemblyStateKey(57)).toBe('view.disassembly.state.partial');
    expect(disassemblyStateKey(99)).toBe('view.disassembly.state.partial');
    expect(disassemblyStateKey(100)).toBe('view.disassembly.state.separated');
  });

  it('has a translation for every key it can return', () => {
    for (const value of [-10, 0, 25, 57, 100, 1000]) {
      const key = disassemblyStateKey(value);
      const message = UI_MESSAGES[key];

      expect(message.es.length).toBeGreaterThan(0);
      expect(message.en.length).toBeGreaterThan(0);
    }
  });
});

describe('formatDisassemblyPercent', () => {
  it('shows whole percents', () => {
    expect(formatDisassemblyPercent(0)).toBe('0%');
    expect(formatDisassemblyPercent(57)).toBe('57%');
    expect(formatDisassemblyPercent(56.6)).toBe('57%');
    expect(formatDisassemblyPercent(100)).toBe('100%');
  });
});

describe('the process vocabulary', () => {
  it('declares exactly the three vital processes', () => {
    expect(PROCESS_IDS).toEqual(['nutrition', 'movement', 'reproduction']);
  });

  it('does not include disassembly, and says so loudly', () => {
    expect(PROCESS_IDS as readonly string[]).not.toContain('disassembly');
    expect(isProcessId('disassembly')).toBe(false);
    expect(isProcessId('nutrition')).toBe(true);
  });

  it('keeps the disassembly copy out of the process namespace', () => {
    // The keys are `view.disassembly.*`, not `process.disassembly.*`: a future process selector
    // that lists `process.*` keys cannot accidentally list this control.
    const disassemblyKeys = Object.keys(UI_MESSAGES).filter((key) => key.includes('disassembly'));

    expect(disassemblyKeys.length).toBeGreaterThan(0);

    for (const key of disassemblyKeys) {
      expect(key.startsWith('view.')).toBe(true);
    }
  });

  it('never presents disassembly as something the cell does', () => {
    // The framing copy is the only place the control's meaning is stated in words, so both locales
    // have to disclaim it explicitly and neither may call it a process.
    const hint = UI_MESSAGES['view.disassembly.hint'];
    const title = UI_MESSAGES['view.disassembly.title'];

    expect(hint.en.toLowerCase()).toContain('not something a cell does');
    expect(hint.es.toLowerCase()).toContain('no es algo que la célula haga');
    expect(title.es.toLowerCase()).not.toContain('proceso');
    expect(title.en.toLowerCase()).not.toContain('process');
  });
});
