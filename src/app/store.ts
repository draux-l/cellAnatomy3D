import { create } from 'zustand';

/**
 * The one Zustand store. It holds **discrete** UI state only.
 *
 * Per the project's hard rule, no per-frame value ever lives here: the frame-rate
 * trap is 30-60 React re-renders per second across the whole tree, and it only
 * becomes visible once comparison mode makes the tree largest. Continuous values
 * belong to the transient `ProcessClock` (or refs), read inside `useFrame`.
 *
 * `store.test.ts` enforces that boundary.
 */

export type ActiveView = 'animal' | 'plant' | 'comparison';
export type SpeedSetting = 'pause' | 'slow' | 'realtime';
export type Locale = 'es' | 'en';

export interface AppState {
  /** Which cell the viewer shows. `comparison` is on-demand only (M6). */
  activeView: ActiveView;
  /** Isolated organelle, or null. Changes on click, never dynamically. */
  selectedId: string | null;
  /** Highlighted organelle, or null. Changes on pointer enter/leave only. */
  hoveredId: string | null;
  /** Running process, or null for the base viewer. */
  processId: string | null;
  /** Shared speed setting for every process. */
  speed: SpeedSetting;
  /** Active palette id (M5). */
  paletteId: string;
  /** UI language. Content is bilingual in the catalog; this selects which side. */
  locale: Locale;
  /** True while a quiz prompt is open, so labels and names are suppressed (M5). */
  quizActive: boolean;

  setActiveView: (view: ActiveView) => void;
  setSelected: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  setProcess: (id: string | null) => void;
  setSpeed: (speed: SpeedSetting) => void;
  setPalette: (paletteId: string) => void;
  setLocale: (locale: Locale) => void;
  setQuizActive: (quizActive: boolean) => void;
}

/** The complete set of discrete keys. Anything outside this list is a bug. */
export const DISCRETE_STATE_KEYS = [
  'activeView',
  'selectedId',
  'hoveredId',
  'processId',
  'speed',
  'paletteId',
  'locale',
  'quizActive',
] as const satisfies readonly (keyof AppState)[];

/**
 * Names that would signal a per-frame value smuggled into the reactive slice.
 * `store.test.ts` fails the build if any state key matches.
 */
export const PER_FRAME_KEY_PATTERN = /time|elapsed|frame|delta|progress|clock|fps|rotation|drag/i;

export const useAppStore = create<AppState>()((set) => ({
  activeView: 'animal',
  selectedId: null,
  hoveredId: null,
  processId: null,
  speed: 'realtime',
  paletteId: 'default',
  // The spec's default content language is Spanish.
  locale: 'es',
  quizActive: false,

  setActiveView: (activeView) => set({ activeView }),
  setSelected: (selectedId) => set({ selectedId }),
  setHovered: (hoveredId) => set({ hoveredId }),
  setProcess: (processId) => set({ processId }),
  setSpeed: (speed) => set({ speed }),
  setPalette: (paletteId) => set({ paletteId }),
  setLocale: (locale) => set({ locale }),
  setQuizActive: (quizActive) => set({ quizActive }),
}));
