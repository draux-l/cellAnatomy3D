import type { UiKey } from '../i18n/messages';

/**
 * The disassembly control's copy, as pure functions.
 *
 * Both the HUD component (which renders the initial text) and the frame loop (which rewrites it
 * with the damped value) need to turn a number into a phrase. Keeping that here means the two
 * cannot disagree about where "partially separated" starts.
 */

/** The localized state word for a disassembly value. */
export function disassemblyStateKey(value: number): UiKey {
  if (value <= 0) {
    return 'view.disassembly.state.assembled';
  }

  if (value >= 100) {
    return 'view.disassembly.state.separated';
  }

  return 'view.disassembly.state.partial';
}

/** The percentage, as the HUD shows it: a whole number and a percent sign. */
export function formatDisassemblyPercent(value: number): string {
  return `${Math.round(value)}%`;
}
