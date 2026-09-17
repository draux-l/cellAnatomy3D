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
  setDisassembly: (value: number) => void;
  /** Back to the view-selection state: no isolate, no disassembly, camera back to default. */
  resetToSelection: () => void;
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
  'disassemblyTarget',
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
  processId: null,
  speed: 'realtime',
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
    set({ selectedId: null, disassemblyTarget: DISASSEMBLY_MIN, processId: null }),

  setProcess: (processId) => set({ processId }),
  setSpeed: (speed) => set({ speed }),
  setPalette: (paletteId) => set({ paletteId }),
  setLocale: (locale) => set({ locale }),
  setQuizActive: (quizActive) => set({ quizActive }),
}));
