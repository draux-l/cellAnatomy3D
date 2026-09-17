import { beforeEach, describe, expect, it } from 'vitest';
import { processClock } from './clock';
import {
  DISASSEMBLY_MAX,
  DISASSEMBLY_MIN,
  DISCRETE_STATE_KEYS,
  LOCALE_PRESERVED_KEYS,
  PER_FRAME_KEY_PATTERN,
  clampDisassembly,
  type AppState,
  useAppStore,
} from './store';

const DEFAULTS = {
  activeView: 'animal',
  selectedId: null,
  hoveredId: null,
  disassemblyTarget: 0,
  processId: null,
  speed: 'realtime',
  paletteId: 'default',
  locale: 'es',
  quizActive: false,
} satisfies Partial<AppState>;

function stateKeys(): string[] {
  // Actions are not state. Most are named `set*`, but `resetToSelection` is not, so the filter is
  // "not a function" rather than "does not start with set".
  return Object.entries(useAppStore.getState())
    .filter(([, value]) => typeof value !== 'function')
    .map(([key]) => key);
}

describe('app store shape', () => {
  beforeEach(() => {
    processClock.reset();
    useAppStore.setState(DEFAULTS);
  });

  it('holds exactly the documented discrete keys', () => {
    expect(stateKeys().sort()).toEqual([...DISCRETE_STATE_KEYS].sort());
  });

  it('holds no key that would signal a per-frame value', () => {
    const offenders = stateKeys().filter((key) => PER_FRAME_KEY_PATTERN.test(key));

    expect(offenders).toEqual([]);
  });

  it('holds no object value capable of carrying frame state', () => {
    for (const key of DISCRETE_STATE_KEYS) {
      const value = useAppStore.getState()[key];
      const type = value === null ? 'null' : typeof value;

      // Numbers are allowed because a control *value* is discrete: `disassemblyTarget` changes on
      // a slider step, not per frame. Objects and arrays are what could smuggle frame state in.
      expect(['string', 'boolean', 'null', 'number']).toContain(type);
    }
  });

  it('keeps the disassembly control value a whole percentage inside its range', () => {
    expect(clampDisassembly(-20)).toBe(DISASSEMBLY_MIN);
    expect(clampDisassembly(57.4)).toBe(57);
    expect(clampDisassembly(999)).toBe(DISASSEMBLY_MAX);
    expect(clampDisassembly(Number.NaN)).toBe(DISASSEMBLY_MIN);
  });

  it('never stores the transient clock', () => {
    const values = Object.values(useAppStore.getState());

    expect(values).not.toContain(processClock);
  });

  it('does not re-render subscribers when the clock ticks', () => {
    let notifications = 0;
    const unsubscribe = useAppStore.subscribe(() => {
      notifications += 1;
    });

    const before = useAppStore.getState();

    for (let i = 0; i < 120; i += 1) {
      processClock.tick(1 / 60);
    }

    expect(useAppStore.getState()).toBe(before);
    expect(notifications).toBe(0);

    unsubscribe();
  });

  it('starts on the animal view in Spanish with the processes at real time', () => {
    expect(useAppStore.getState()).toMatchObject(DEFAULTS);
  });

  it('keeps the disassembly control value on whole percent steps', () => {
    useAppStore.getState().setDisassembly(57.6);

    expect(useAppStore.getState().disassemblyTarget).toBe(58);

    useAppStore.getState().setDisassembly(-3);

    expect(useAppStore.getState().disassemblyTarget).toBe(0);
  });

  it('updates only the value an action owns', () => {
    useAppStore.getState().setHovered('mitochondrion');

    expect(useAppStore.getState().hoveredId).toBe('mitochondrion');
    expect(useAppStore.getState().selectedId).toBeNull();

    useAppStore.getState().setSelected('nucleus');

    expect(useAppStore.getState().selectedId).toBe('nucleus');
    expect(useAppStore.getState().hoveredId).toBe('mitochondrion');

    useAppStore.getState().setSelected(null);

    expect(useAppStore.getState().selectedId).toBeNull();
  });
});

/**
 * The disassembly/isolation handoff (design D13, spec: `Disassembly and isolation hand off to each
 * other`). Four guards, all preconditions on actions that already existed — no state machine.
 *
 * The reason is the accuracy tie-break: a detached organelle floating inside a displaced cell
 * teaches a false spatial relationship, so the two controls must never be active at once.
 */
describe('disassembly and isolation are mutually exclusive', () => {
  beforeEach(() => {
    processClock.reset();
    useAppStore.setState(DEFAULTS);
  });

  it('forces the cell back together when an organelle is isolated', () => {
    useAppStore.getState().setDisassembly(60);
    useAppStore.getState().setSelected('golgi');

    expect(useAppStore.getState().selectedId).toBe('golgi');
    expect(useAppStore.getState().disassemblyTarget).toBe(0);
  });

  it('clears the isolate when disassembly is raised', () => {
    useAppStore.getState().setSelected('golgi');
    useAppStore.getState().setDisassembly(60);

    expect(useAppStore.getState().selectedId).toBeNull();
    expect(useAppStore.getState().disassemblyTarget).toBe(60);
  });

  it('leaves the isolate alone when disassembly is raised to zero', () => {
    // Only a value *above* zero hands off: re-asserting 0 is not a disassembly request.
    useAppStore.getState().setDisassembly(60);
    useAppStore.getState().setSelected('nucleus');
    useAppStore.getState().setDisassembly(0);

    expect(useAppStore.getState().selectedId).toBe('nucleus');
    expect(useAppStore.getState().disassemblyTarget).toBe(0);
  });

  it('reassembles and clears the isolate on back to selection', () => {
    useAppStore.getState().setDisassembly(100);
    useAppStore.getState().resetToSelection();

    expect(useAppStore.getState().selectedId).toBeNull();
    expect(useAppStore.getState().disassemblyTarget).toBe(0);

    useAppStore.getState().setSelected('lysosome');
    useAppStore.getState().resetToSelection();

    expect(useAppStore.getState().selectedId).toBeNull();
    expect(useAppStore.getState().disassemblyTarget).toBe(0);
  });

  it('notifies subscribers once per guard, not once per action', () => {
    // A guard that set two keys with two `set` calls would render twice for one user gesture.
    const seen: number[] = [];
    const unsubscribe = useAppStore.subscribe((state) => seen.push(state.disassemblyTarget));

    useAppStore.getState().setDisassembly(60);
    useAppStore.getState().setSelected('golgi');

    expect(seen).toEqual([60, 0]);

    unsubscribe();
  });
});

/**
 * The language switch is non-destructive (design D5, spec: `Language Switch Is Non-Destructive`).
 *
 * The action writes one key, so the contract looks like a tautology. It is not: the spec lists what
 * must survive a switch precisely because the tempting implementations — re-mounting the viewer,
 * resetting the selection "so the labels are consistent", rebuilding the scene — all destroy it,
 * and the store is where that decision is either kept or broken. These tests fail the moment a
 * language switch starts carrying another key, and the last one fails when a **new** state key
 * arrives without a decision about what a switch does to it.
 */
describe('language switching is non-destructive', () => {
  beforeEach(() => {
    processClock.reset();
    useAppStore.setState(DEFAULTS);
  });

  function preservedState(): Record<string, unknown> {
    const state = useAppStore.getState();
    const snapshot: Record<string, unknown> = {};

    for (const key of LOCALE_PRESERVED_KEYS) {
      snapshot[key] = state[key];
    }

    return snapshot;
  }

  /** Puts a non-default value on every preserved key, so a reset would be visible. */
  function loadDistinctiveState(): void {
    const store = useAppStore.getState();

    store.setActiveView('plant');
    store.setHovered('nucleus');
    store.setSelected('golgi');
    store.setProcess('nutrition');
    store.setSpeed('slow');
    store.setPalette('high-contrast');
    store.setQuizActive(true);
  }

  it('changes the locale and nothing else', () => {
    loadDistinctiveState();

    const before = preservedState();

    useAppStore.getState().setLocale('en');

    expect(useAppStore.getState().locale).toBe('en');
    expect(preservedState()).toEqual(before);
    // The isolate really was set, so the equality above is not two objects of defaults.
    expect(useAppStore.getState().selectedId).toBe('golgi');
  });

  it('preserves the disassembly value in the other mutually-exclusive shape', () => {
    loadDistinctiveState();
    // Raising disassembly clears the isolate, so this is the state the pair never shares.
    useAppStore.getState().setDisassembly(60);

    const before = preservedState();

    useAppStore.getState().setLocale('en');

    expect(useAppStore.getState().disassemblyTarget).toBe(60);
    expect(useAppStore.getState().selectedId).toBeNull();
    expect(preservedState()).toEqual(before);
  });

  it('notifies subscribers once per switch, and only the locale was read', () => {
    loadDistinctiveState();

    const seen: string[] = [];
    const unsubscribe = useAppStore.subscribe((state) => seen.push(state.locale));

    useAppStore.getState().setLocale('en');
    useAppStore.getState().setLocale('es');

    expect(seen).toEqual(['en', 'es']);

    unsubscribe();
  });

  it('covers every discrete key except the locale', () => {
    const expected = [...DISCRETE_STATE_KEYS].filter((key) => key !== 'locale').sort();

    expect([...LOCALE_PRESERVED_KEYS].sort()).toEqual(expected);
  });
});
