import type { Locale } from '../../app/store';
import type { Localized } from '../../catalog/types';

/**
 * UI copy. The interface's own strings live here and nowhere else (spec: Educational Copy Lives
 * In The Data Model) — a component that needs a sentence asks for a key.
 *
 * The catalog is the other half of the content model: organelle names, functions, sizes and fun
 * facts come from the records. UI chrome comes from this table. Together they are every string
 * the user reads.
 *
 * The language **endonyms** (`Español`, `English`) are deliberately identical in both locales:
 * a language's name for itself is not a translation, and a selector that renamed them would be
 * harder to use for exactly the person who needs it.
 */

export const UI_MESSAGES = {
  'app.title': {
    es: 'Explorador de anatomía celular 3D',
    en: '3D Cell Anatomy Explorer',
  },
  'app.subtitle': {
    es: 'Célula animal y célula vegetal, modeladas de forma procedural en el navegador.',
    en: 'Animal cell and plant cell, modelled procedurally in the browser.',
  },
  'app.language': {
    es: 'Idioma',
    en: 'Language',
  },
  'language.es': {
    es: 'Español',
    en: 'Español',
  },
  'language.en': {
    es: 'English',
    en: 'English',
  },
} as const satisfies Record<string, Localized>;

/** Every UI key the app can ask for. `t()` refuses anything else at compile time. */
export type UiKey = keyof typeof UI_MESSAGES;

/** The selector's options. `labelKey` resolves to the option's own endonym. */
export const LANGUAGE_OPTIONS: readonly { locale: Locale; labelKey: UiKey }[] = [
  { locale: 'es', labelKey: 'language.es' },
  { locale: 'en', labelKey: 'language.en' },
];
