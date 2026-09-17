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
  /*
   * The view navigation and the landing state.
   *
   * The three views are the proposal's own vocabulary. `comparison` is declared **unavailable**
   * rather than absent: the comparison stage is milestone M6, so a control that switched to it
   * would render the animal cell under a comparison label. Same honesty pattern as the animal
   * movement process (design D11): the entry exists, says what it is, and fabricates nothing.
   */
  'nav.view.title': {
    es: 'Vista',
    en: 'View',
  },
  'nav.view.animal': {
    es: 'Célula animal',
    en: 'Animal cell',
  },
  'nav.view.plant': {
    es: 'Célula vegetal',
    en: 'Plant cell',
  },
  'nav.view.comparison': {
    es: 'Comparación',
    en: 'Comparison',
  },
  'nav.view.pending': {
    es: 'Se añade en una etapa posterior',
    en: 'Added in a later stage',
  },
  'nav.reset': {
    es: 'Volver a la selección',
    en: 'Back to selection',
  },
  /*
   * The spec sheet. The field labels are UI chrome; the field *values* are the record's own
   * `name`, `func`, `size` and `funFact` (spec: Single Source Of Truth).
   */
  'spec.title': {
    es: 'Ficha del orgánulo',
    en: 'Organelle sheet',
  },
  'spec.field.name': {
    es: 'Nombre',
    en: 'Name',
  },
  'spec.field.function': {
    es: 'Función',
    en: 'Function',
  },
  'spec.field.size': {
    es: 'Tamaño aproximado',
    en: 'Approximate size',
  },
  'spec.field.funFact': {
    es: 'Dato curioso',
    en: 'Fun fact',
  },
  'spec.close': {
    es: 'Cerrar la ficha',
    en: 'Close the sheet',
  },
} as const satisfies Record<string, Localized>;

/** Every UI key the app can ask for. `t()` refuses anything else at compile time. */
export type UiKey = keyof typeof UI_MESSAGES;

/** The selector's options. `labelKey` resolves to the option's own endonym. */
export const LANGUAGE_OPTIONS: readonly { locale: Locale; labelKey: UiKey }[] = [
  { locale: 'es', labelKey: 'language.es' },
  { locale: 'en', labelKey: 'language.en' },
];
