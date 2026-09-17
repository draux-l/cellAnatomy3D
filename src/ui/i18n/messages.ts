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
  'app.loading3d': {
    es: 'Cargando el modelo 3D…',
    en: 'Loading the 3D model…',
  },
  'language.es': {
    es: 'Español',
    en: 'Español',
  },
  'language.en': {
    es: 'English',
    en: 'English',
  },
  /*
   * The disassembly control is a **view control**, and its copy says so.
   *
   * The spec is explicit that disassembly is a diagram convention for studying structure, not
   * something a cell does, and that it must never read as a fourth vital process. That is why
   * these keys live under `view.` rather than `process.` and why the wording talks about looking
   * at the cell ("exploded view", "study aid") rather than about the cell doing anything.
   */
  'view.disassembly.title': {
    es: 'Vista despiezada',
    en: 'Exploded view',
  },
  'view.disassembly.hint': {
    es: 'Ayuda de estudio: muestra cómo encajan las partes. No es algo que la célula haga.',
    en: 'Study aid: shows how the parts fit together. This is not something a cell does.',
  },
  'view.disassembly.control': {
    es: 'Separación de los orgánulos',
    en: 'Organelle separation',
  },
  'view.disassembly.state.assembled': {
    es: 'Ensamblada',
    en: 'Assembled',
  },
  'view.disassembly.state.partial': {
    es: 'Parcialmente separada',
    en: 'Partially separated',
  },
  'view.disassembly.state.separated': {
    es: 'Totalmente separada',
    en: 'Fully separated',
  },
  /*
   * The FPS readout's accessible name.
   *
   * The unit itself is rendered as `fps`, a technical identifier that is the same in both
   * languages; the bilingual copy is the label, which is what a screen reader announces.
   */
  'hud.fps.title': {
    es: 'Fotogramas por segundo medidos',
    en: 'Measured frames per second',
  },
} as const satisfies Record<string, Localized>;

/** Every UI key the app can ask for. `t()` refuses anything else at compile time. */
export type UiKey = keyof typeof UI_MESSAGES;

/** The selector's options. `labelKey` resolves to the option's own endonym. */
export const LANGUAGE_OPTIONS: readonly { locale: Locale; labelKey: UiKey }[] = [
  { locale: 'es', labelKey: 'language.es' },
  { locale: 'en', labelKey: 'language.en' },
];
