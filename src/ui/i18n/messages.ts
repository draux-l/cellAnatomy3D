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
  /*
   * The WebGL-unavailable path (task 4.6, design D9).
   *
   * The copy is written for the person who hit it: a machine in a classroom. It says what the
   * machine cannot do and what it still can, in that order, and it never suggests the app is
   * broken — the static path is a supported path, not an error page.
   */
  'fallback.title': {
    es: 'Modo sin WebGL',
    en: 'WebGL-unavailable mode',
  },
  'fallback.lead': {
    es: 'Este equipo no puede crear un contexto WebGL2, así que el modelo 3D no está disponible. Las imágenes de las células y todas las fichas de los orgánulos sí lo están.',
    en: 'This machine cannot create a WebGL2 context, so the 3D model is not available. The cell images and every organelle sheet are still available.',
  },
  'fallback.image.animal': {
    es: 'Imagen estática de la célula animal',
    en: 'Static image of the animal cell',
  },
  'fallback.image.plant': {
    es: 'Imagen estática de la célula vegetal',
    en: 'Static image of the plant cell',
  },
  'fallback.unavailable.title': {
    es: 'No disponible sin WebGL',
    en: 'Unavailable without WebGL',
  },
  /*
   * The three model-inspection aids (task 4.22). They are the surfaces the adopted UI reference
   * makes central — bilingual annotations on the parts, the exploded view, and isolate — and every
   * one of them is a consequence of having a renderer. Saying so is what keeps the fallback honest:
   * the static images still carry their labels, but nothing on the page pretends to be interactive.
   */
  'fallback.unavailable.annotations': {
    es: 'Las anotaciones sobre el modelo en 3D (las imágenes estáticas ya llevan sus etiquetas).',
    en: 'The annotations over the 3D model (the static images already carry their labels).',
  },
  /*
   * Keyed `explodedView`, not `disassembly`, and the difference is deliberate. The app's own word
   * for this control in user copy is "exploded view" (`view.disassembly.title`), and
   * `disassemblyCopy.test.ts` requires every UI key containing `disassembly` to live under `view.`
   * so that a process selector listing `process.*` can never list the control by accident. Renaming
   * this declaration to the surface's user-facing name keeps that guard strict instead of loosening
   * it for a fallback string.
   */
  'fallback.unavailable.explodedView': {
    es: 'La vista despiezada: separar los orgánulos para ver cómo encajan.',
    en: 'The exploded view: separating the organelles to see how they fit together.',
  },
  'fallback.unavailable.isolate': {
    es: 'Aislar un orgánulo en el modelo para verlo por separado.',
    en: 'Isolating an organelle in the model to see it on its own.',
  },
  'fallback.unavailable.processes': {
    es: 'Los procesos: nutrición, movimiento y reproducción.',
    en: 'The processes: nutrition, movement and reproduction.',
  },
  'fallback.unavailable.quiz': {
    es: 'El cuestionario, porque hay que señalar orgánulos en el modelo.',
    en: 'The quiz, because it needs organelle pointing on the model.',
  },
  'fallback.sheets.title': {
    es: 'Fichas de los orgánulos',
    en: 'Organelle sheets',
  },
  /*
   * The nutrition process (M2).
   *
   * Everything under `process.` is one of the three vital processes the spec's vocabulary has.
   * Movement and reproduction are *declared and disabled* — the same honesty pattern as comparison
   * mode above — so a user sees the product's real scope rather than only the part that is built.
   *
   * The stage copy is deliberately a restatement of the spec's own biological sentences and nothing
   * more: respiration releases energy from glucose in the mitochondrion, and the cristae are where
   * the reactions producing most of the ATP happen; photosynthesis uses light on the grana. The app
   * does not have a source for the steps between those clauses, so it does not draw any.
   */
  'process.title': {
    es: 'Procesos',
    en: 'Processes',
  },
  'process.exit': {
    es: 'Salir del proceso',
    en: 'Exit the process',
  },
  'process.pending': {
    es: 'Se añade en una etapa posterior',
    en: 'Added in a later stage',
  },
  'process.nutrition.name': {
    es: 'Nutrición',
    en: 'Nutrition',
  },
  'process.movement.name': {
    es: 'Movimiento',
    en: 'Movement',
  },
  'process.reproduction.name': {
    es: 'Reproducción',
    en: 'Reproduction',
  },
  'process.nutrition.respiration.title': {
    es: 'Respiración',
    en: 'Respiration',
  },
  'process.nutrition.photosynthesis.title': {
    es: 'Fotosíntesis',
    en: 'Photosynthesis',
  },
  'process.nutrition.respiration.stage.reactions': {
    es: 'Reacciones en las crestas',
    en: 'Reactions in the cristae',
  },
  'process.nutrition.respiration.stage.atp': {
    es: 'Se libera ATP',
    en: 'ATP is released',
  },
  'process.nutrition.photosynthesis.stage': {
    es: 'Flujo en los grana: se produce glucosa y oxígeno',
    en: 'Flow at the grana: glucose and oxygen are produced',
  },
  /*
   * The speed control's three ratified settings.
   *
   * `realtime` is the spec's "real time", not "fast": the control scales the process's clock, and
   * calling 1× "fast" would imply a base rate the app does not claim.
   */
  'process.speed.title': {
    es: 'Velocidad',
    en: 'Speed',
  },
  'process.speed.pause': {
    es: 'Pausa',
    en: 'Pause',
  },
  'process.speed.slow': {
    es: 'Lento',
    en: 'Slow',
  },
  'process.speed.realtime': {
    es: 'Tiempo real',
    en: 'Real time',
  },
  'process.light.title': {
    es: 'Intensidad de luz',
    en: 'Light intensity',
  },
  /*
   * The zero-light statement (spec: `Zero light is honest`).
   *
   * It has to say *why* the animation stopped, not merely that it did: a viewer who sees the flow
   * halt with no explanation learns the wrong thing about what photosynthesis needs.
   */
  'process.light.required': {
    es: 'Sin luz no hay fotosíntesis: la luz es necesaria.',
    en: 'Without light there is no photosynthesis: light is required.',
  },
} as const satisfies Record<string, Localized>;

/** Every UI key the app can ask for. `t()` refuses anything else at compile time. */
export type UiKey = keyof typeof UI_MESSAGES;

/** The selector's options. `labelKey` resolves to the option's own endonym. */
export const LANGUAGE_OPTIONS: readonly { locale: Locale; labelKey: UiKey }[] = [
  { locale: 'es', labelKey: 'language.es' },
  { locale: 'en', labelKey: 'language.en' },
];
