import { beforeEach, describe, expect, it } from 'vitest';
import { processClock } from './clock';
import {
  DISCRETE_STATE_KEYS,
  PER_FRAME_KEY_PATTERN,
  type AppState,
  useAppStore,
} from './store';

const DEFAULTS = {
  activeView: 'animal',
  selectedId: null,
  hoveredId: null,
  processId: null,
  speed: 'realtime',
  paletteId: 'default',
  locale: 'es',
  quizActive: false,
} satisfies Partial<AppState>;

function stateKeys(): string[] {
  return Object.keys(useAppStore.getState()).filter((key) => !key.startsWith('set'));
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

      expect(['string', 'boolean', 'null']).toContain(type);
    }
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
