import { beforeEach, describe, expect, it } from 'vitest';
import { processClock } from './clock';
import {
  DISASSEMBLY_MAX,
  DISASSEMBLY_MIN,
  DISCRETE_STATE_KEYS,
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
