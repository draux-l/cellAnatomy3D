import { useCallback } from 'react';
import type { Locale } from '../../app/store';
import { useAppStore } from '../../app/store';
import type { Localized } from '../../catalog/types';
import { UI_MESSAGES, type UiKey } from './messages';

/**
 * The i18n accessor.
 *
 * Design notes worth keeping:
 *
 * - **The locale is not stored twice.** The discrete `locale` value already lives in the one
 *   Zustand store (design D5), so there is no second source to keep in sync and no persistence
 *   layer to add: a reload starts in Spanish again, which is what the spec asks for
 *   (memory only — no browser storage, no cookie, no backend).
 * - **`t()` is a pure function**; only `useT()` touches React, and it subscribes to `locale`
 *   alone, so a language change re-renders the copy and nothing else.
 * - **Parity is checkable.** `findBilingualGaps` is the same rule the catalog integrity gate
 *   applies to records: every user-facing string exists in both languages or the build fails.
 */

/** The supported locales, in selector order. */
export const LOCALES = ['es', 'en'] as const satisfies readonly Locale[];

/** The spec's default content language, and the store's default. */
export const DEFAULT_LOCALE: Locale = 'es';

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Resolves a UI key for a locale.
 *
 * The key type is a union, so a typo fails the build; the runtime guard exists because a throw
 * naming the key is a better failure than `undefined` reaching the DOM.
 */
export function t(key: UiKey, locale: Locale): string {
  const message = (UI_MESSAGES as Record<string, Localized | undefined>)[key];

  if (!message) {
    throw new Error(`No UI message for "${String(key)}"`);
  }

  return message[locale];
}

/** The locale-bound accessor components use. Subscribes to `locale` only. */
export function useT(): (key: UiKey) => string {
  const locale = useAppStore((state) => state.locale);

  return useCallback((key: UiKey) => t(key, locale), [locale]);
}

export interface BilingualGap {
  key: string;
  locale: Locale;
}

/**
 * Finds every missing or blank locale in a table of `Localized` values.
 *
 * Used both for UI copy and (with the same rule) for the catalog records, so the two halves of
 * the content model cannot drift apart in what "translated" means.
 */
export function findBilingualGaps(messages: Record<string, unknown>): BilingualGap[] {
  const gaps: BilingualGap[] = [];

  for (const [key, value] of Object.entries(messages)) {
    if (typeof value !== 'object' || value === null) {
      for (const locale of LOCALES) {
        gaps.push({ key, locale });
      }

      continue;
    }

    for (const locale of LOCALES) {
      const text = (value as Record<string, unknown>)[locale];

      if (typeof text !== 'string' || text.trim().length === 0) {
        gaps.push({ key, locale });
      }
    }
  }

  return gaps;
}

export function formatBilingualGaps(gaps: readonly BilingualGap[], source: string): string {
  return gaps.map((gap) => `- [${source}] ${gap.key}.${gap.locale}: is empty`).join('\n');
}

/** Throws naming every key that has no value in one of the languages (spec: No Untranslated String Ships). */
export function assertBilingualParity(
  messages: Record<string, unknown>,
  source = 'ui-messages',
): void {
  const gaps = findBilingualGaps(messages);

  if (gaps.length > 0) {
    throw new Error(
      `${source} has ${gaps.length} untranslated string(s):\n${formatBilingualGaps(gaps, source)}`,
    );
  }
}

export { UI_MESSAGES };
export type { UiKey };
