import { describe, expect, it } from 'vitest';
import { MITOSIS_PHASE_ORDER } from '../../processes/reproduction/stages';
import {
  CYTOKINESIS_DIFFERENCE_KEY,
  CYTOKINESIS_MECHANISM_KEYS,
  REPRODUCTION_PHASE_KEYS,
  REPRODUCTION_PHASE_ORDER,
  cytokinesisMechanismKey,
  formatProgress,
  processRowsFor,
  reproductionPhaseKey,
} from './scrubModel';

/**
 * The scrub bar's model (task 6.3).
 *
 * The control's buttons are built from the phase tuple the timeline builds its labels from, so the
 * spec's "no phase is displayed out of order" cannot be broken by the UI: there is no second list to
 * get out of step. These assertions pin that, and pin the copy the buttons show.
 */

describe('the phase buttons', () => {
  it('is exactly the timeline\'s phase list, in the timeline\'s order', () => {
    expect([...REPRODUCTION_PHASE_ORDER]).toEqual([...MITOSIS_PHASE_ORDER]);
    expect([...REPRODUCTION_PHASE_ORDER]).toEqual([
      'prophase',
      'metaphase',
      'anaphase',
      'telophase',
      'cytokinesis',
    ]);
  });

  it('has one localized key for every phase, with no gaps', () => {
    for (const phase of REPRODUCTION_PHASE_ORDER) {
      expect(REPRODUCTION_PHASE_KEYS[phase]).toBe(`process.reproduction.phase.${phase}`);
    }

    expect(Object.keys(REPRODUCTION_PHASE_KEYS).sort()).toEqual(
      [...REPRODUCTION_PHASE_ORDER].sort(),
    );
  });

  it('falls back to the first phase for a label it does not know', () => {
    expect(reproductionPhaseKey('anaphase')).toBe('process.reproduction.phase.anaphase');
    // The first frame after entering has no label yet, and a completed sequence still reports
    // cytokinesis rather than nothing.
    expect(reproductionPhaseKey(null)).toBe('process.reproduction.phase.prophase');
    expect(reproductionPhaseKey('prometaphase')).toBe('process.reproduction.phase.prophase');
  });
});

describe('the cytokinesis toggle\'s copy', () => {
  it('names both mechanisms and states the difference once', () => {
    expect(cytokinesisMechanismKey('animal')).toBe('process.reproduction.cytokinesis.animal');
    expect(cytokinesisMechanismKey('plant')).toBe('process.reproduction.cytokinesis.plant');
    expect(CYTOKINESIS_MECHANISM_KEYS.animal).not.toBe(CYTOKINESIS_MECHANISM_KEYS.plant);
    expect(CYTOKINESIS_DIFFERENCE_KEY).toBe('process.reproduction.cytokinesis.difference');
  });
});

describe('the readout', () => {
  it('formats the playhead as a whole percent', () => {
    expect(formatProgress(0)).toBe('0%');
    expect(formatProgress(0.576)).toBe('58%');
    expect(formatProgress(1)).toBe('100%');
    // Clamped rather than trusted: the value crosses a module boundary.
    expect(formatProgress(3)).toBe('100%');
    expect(formatProgress(-1)).toBe('0%');
    expect(formatProgress(Number.NaN)).toBe('0%');
  });
});

describe('the instance rows', () => {
  it('shows the instances the running process actually has', () => {
    expect(processRowsFor('reproduction')).toEqual(['mitosis']);
    expect(processRowsFor('nutrition')).toEqual(['respiration', 'photosynthesis']);
    expect(processRowsFor(null)).toEqual([]);
  });
});
