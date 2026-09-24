import { create } from 'zustand';

/**
 * The one Zustand store. It holds **discrete** UI state only.
 *
 * Per the project's hard rule, no per-frame value ever lives here: the frame-rate
 * trap is 30-60 React re-renders per second across the whole tree, and it only
 * becomes visible once comparison mode makes the tree largest. Continuous values
 * belong to transient modules (or refs), read inside `useFrame`.
 *
 * `store.test.ts` enforces that boundary.
 */

export type ActiveView = 'animal' | 'plant' | 'comparison';
export type Locale = 'es' | 'en';

/**
 * The disassembly range, in whole percents.
 *
 * It lives beside the store rather than in `src/scene/` because the store must not import from the
 * 3D chunk: `src/scene/` pulls three.js, and the shell's post-split budget is the reason the two
 * are separated at all. `scene/disassembly.ts` imports these from here, not the other way round.
 */
export const DISASSEMBLY_MIN = 0;
export const DISASSEMBLY_MAX = 100;

/**
 * Rounds a control value to a whole percent inside the range.
 *
 * The control writes on `input` change, and only whole steps exist: the arrangement is then a pure
 * function of the integer value, so 57% renders identically whichever way the user arrived at it.
 */
export function clampDisassembly(value: number): number {
  if (!Number.isFinite(value)) {
    return DISASSEMBLY_MIN;
  }

  return Math.round(Math.min(DISASSEMBLY_MAX, Math.max(DISASSEMBLY_MIN, value)));
}

export interface AppState {
  /** Which cell the viewer shows. `comparison` is on-demand only (M6). */
  activeView: ActiveView;
  /** Isolated organelle, or null. Changes on click, never dynamically. */
  selectedId: string | null;
  /** Highlighted organelle, or null. Changes on pointer enter/leave only. */
  hoveredId: string | null;
  /**
   * Disassembly progress, 0-100 in whole steps. Written only on the control's `input` change —
   * never per frame. The damped value that actually renders is transient (`scene/disassembly.ts`).
   */
  disassemblyTarget: number;
  /** Active palette id (M5). */
  paletteId: string;
  /** UI language. Content is bilingual in the catalog; this selects which side. */
  locale: Locale;
  /** True while a quiz prompt is open, so labels and names are suppressed (M5). */
  quizActive: boolean;

  setActiveView: (view: ActiveView) => void;
  setSelected: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  setDisassembly: (value: number) => void;
  /** Back to the view-selection state: no isolate, no disassembly. */
  resetToSelection: () => void;
  setPalette: (paletteId: string) => void;
  setLocale: (locale: Locale) => void;
  setQuizActive: (quizActive: boolean) => void;
}

/** The complete set of discrete keys. Anything outside this list is a bug. */
export const DISCRETE_STATE_KEYS = [
  'activeView',
  'selectedId',
  'hoveredId',
  'disassemblyTarget',
  'paletteId',
  'locale',
  'quizActive',
] as const satisfies readonly (keyof AppState)[];

/**
 * Every discrete key a language switch must leave untouched (spec: `Language Switch Is
 * Non-Destructive`).
 *
 * The spec lists the visible ones — active view, selected organelle, palette, quiz progress — and
 * this list adds the two observable values it does not name but that a rebuild would also disturb:
 * the hovered organelle and the disassembly value. It is **every discrete key except `locale`**, and
 * `store.test.ts` asserts exactly that, so adding a state key without deciding what a language switch
 * does to it fails the build.
 *
 * `setLocale` writes `{ locale }` and nothing else, which is what makes the switch
 * non-destructive by construction rather than by care: there is no code path in the action that
 * could carry another key. The contract is stated here because a later refactor (say, a locale
 * change that "helpfully" reset the view) would otherwise be invisible.
 */
export const LOCALE_PRESERVED_KEYS = [
  'activeView',
  'selectedId',
  'hoveredId',
  'disassemblyTarget',
  'paletteId',
  'quizActive',
] as const satisfies readonly (keyof AppState)[];

/**
 * Names that would signal a per-frame value smuggled into the reactive slice.
 * `store.test.ts` fails the build if any state key matches.
 */
export const PER_FRAME_KEY_PATTERN = /time|elapsed|frame|delta|progress|clock|fps|rotation|drag/i;

/**
 * Disassembly and isolation are mutually exclusive, and the handoff lives here as a precondition
 * on the two actions that exist — no new state machine (design D13).
 *
 * The reason is the accuracy tie-break: a detached organelle floating inside a displaced cell
 * teaches a false spatial relationship. Whichever control the user reaches for wins, and the other
 * one resets, so the two questions ("what is this part?" and "how do the parts fit together?")
 * never render at once.
 */
export const useAppStore = create<AppState>()((set) => ({
  activeView: 'animal',
  selectedId: null,
  hoveredId: null,
  disassemblyTarget: DISASSEMBLY_MIN,
  paletteId: 'default',
  // The spec's default content language is Spanish.
  locale: 'es',
  quizActive: false,

  setActiveView: (activeView) => set({ activeView }),

  setSelected: (selectedId) =>
    set((state) =>
      // Isolating hands off from disassembly: the cell reassembles before the camera moves.
      selectedId !== null && state.disassemblyTarget > DISASSEMBLY_MIN
        ? { selectedId, disassemblyTarget: DISASSEMBLY_MIN }
        : { selectedId },
    ),

  setHovered: (hoveredId) => set({ hoveredId }),

  setDisassembly: (value) =>
    set((state) => {
      const disassemblyTarget = clampDisassembly(value);

      // Raising disassembly hands off from isolation: the isolate clears and its sheet closes.
      return disassemblyTarget > DISASSEMBLY_MIN && state.selectedId !== null
        ? { disassemblyTarget, selectedId: null }
        : { disassemblyTarget };
    }),

  resetToSelection: () =>
    set({ selectedId: null, disassemblyTarget: DISASSEMBLY_MIN }),

  setPalette: (paletteId) => set({ paletteId }),
  /**
   * The language switch (spec: `Language Switch Is Non-Destructive`).
   *
   * One key, and only that key: the view, the isolate, the disassembly value, the palette and the
   * quiz progress are all preserved because this action cannot reach them (`LOCALE_PRESERVED_KEYS`
   * records the contract and `store.test.ts` enforces it).
   *
   * Nothing else in the app needs to co-operate. Content is bilingual in the catalog, so the swap
   * is a re-render of copy; the 3D scene is not rebuilt, the camera is not moved, and the
   * annotation anchors are read per frame from the organelle's own `matrixWorld`, so they cannot
   * move because a string changed.
   */
  setLocale: (locale) => set({ locale }),
  setQuizActive: (quizActive) => set({ quizActive }),
}));
