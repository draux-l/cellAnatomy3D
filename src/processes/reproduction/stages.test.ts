import { describe, expect, it } from 'vitest';
import {
  CYTOKINESIS_MECHANISMS,
  MITOSIS_BANDS,
  MITOSIS_DURATION_SECONDS,
  MITOSIS_PHASE_ORDER,
  MITOSIS_PHASES,
  activeMechanism,
  isMitosisPhase,
  mitosisLabelTime,
  mitosisProgressTime,
  phaseAt,
  phaseProgress,
} from './stages';

/**
 * The mitosis timeline's shape (tasks 6.1/6.5).
 *
 * The spec's first reproduction requirement is an *order*: prophase → metaphase → anaphase →
 * telophase → cytokinesis, with no phase displayed out of it. The assertions below are what make
 * that structural: the bands must tile `[0, 1]` with no gap and no overlap, in that order, and the
 * phase of any progress value must therefore be unambiguous.
 */

describe('the phase sequence', () => {
  it('is the spec\'s five phases in the spec\'s order', () => {
    expect([...MITOSIS_PHASE_ORDER]).toEqual([
      'prophase',
      'metaphase',
      'anaphase',
      'telophase',
      'cytokinesis',
    ]);
  });

  it('tiles the whole sequence with no gap and no overlap', () => {
    expect(MITOSIS_BANDS.prophase.start).toBe(0);
    expect(MITOSIS_BANDS.cytokinesis.end).toBe(1);

    for (const [index, phase] of MITOSIS_PHASE_ORDER.entries()) {
      const next = MITOSIS_PHASE_ORDER[index + 1];

      expect(MITOSIS_BANDS[phase].end, `${phase} ends before it starts`).toBeGreaterThan(
        MITOSIS_BANDS[phase].start,
      );

      if (next !== undefined) {
        expect(MITOSIS_BANDS[phase].end, `${phase} does not meet ${next}`).toBe(
          MITOSIS_BANDS[next].start,
        );
      }
    }
  });

  it('labels each phase where its own band begins, and measures progress inside one band', () => {
    for (const phase of MITOSIS_PHASE_ORDER) {
      expect(MITOSIS_PHASES[phase]).toBe(MITOSIS_BANDS[phase].start);
      expect(mitosisLabelTime(phase)).toBeCloseTo(
        MITOSIS_PHASES[phase] * MITOSIS_DURATION_SECONDS,
        9,
      );
      // Inside its own band the phase's own progress runs 0 → 1; outside it, it is empty.
      expect(phaseProgress(phase, MITOSIS_BANDS[phase].start)).toBe(0);
      expect(phaseProgress(phase, MITOSIS_BANDS[phase].end)).toBe(1);
    }

    expect(phaseProgress('anaphase', 0)).toBe(0);
    expect(phaseProgress('anaphase', 1)).toBe(1);
    expect(mitosisLabelTime('prometaphase')).toBeNull();
    expect(mitosisLabelTime('')).toBeNull();
  });

  it('reports the phase a progress value falls in, and only one', () => {
    expect(phaseAt(0)).toBe('prophase');
    expect(phaseAt(0.1)).toBe('prophase');
    expect(phaseAt(MITOSIS_BANDS.prophase.end)).toBe('metaphase');
    expect(phaseAt(0.3)).toBe('metaphase');
    expect(phaseAt(MITOSIS_BANDS.anaphase.start)).toBe('anaphase');
    expect(phaseAt(0.5)).toBe('anaphase');
    expect(phaseAt(MITOSIS_BANDS.telophase.start)).toBe('telophase');
    expect(phaseAt(0.7)).toBe('telophase');
    expect(phaseAt(MITOSIS_BANDS.cytokinesis.start)).toBe('cytokinesis');
    // The last band is closed, so a finished sequence is still cytokinesis rather than nothing.
    expect(phaseAt(1)).toBe('cytokinesis');
    // And a nonsense value clamps rather than falling outside the sequence.
    expect(phaseAt(-3)).toBe('prophase');
    expect(phaseAt(Number.NaN)).toBe('prophase');
  });

  it('advances the phase monotonically across the whole sequence', () => {
    let previous = -1;

    for (let step = 0; step <= 1000; step += 1) {
      const index = MITOSIS_PHASE_ORDER.indexOf(phaseAt(step / 1000));

      expect(index).toBeGreaterThanOrEqual(previous);
      previous = index;
    }
  });

  it('turns a sequence fraction into the timeline\'s own clock', () => {
    expect(mitosisProgressTime(0)).toBe(0);
    expect(mitosisProgressTime(1)).toBe(MITOSIS_DURATION_SECONDS);
    expect(mitosisProgressTime(0.5)).toBeCloseTo(MITOSIS_DURATION_SECONDS / 2, 9);
    // Out of range clamps; nonsense is "no time at all" rather than a NaN playhead.
    expect(mitosisProgressTime(4)).toBe(MITOSIS_DURATION_SECONDS);
    expect(mitosisProgressTime(Number.NaN)).toBeNull();
  });

  it('recognizes the five phase names and nothing else', () => {
    for (const phase of MITOSIS_PHASE_ORDER) {
      expect(isMitosisPhase(phase)).toBe(true);
    }

    expect(isMitosisPhase('PROPHASE')).toBe(false);
    expect(isMitosisPhase('prometaphase')).toBe(false);
  });
});

describe('the cytokinesis mechanism', () => {
  it('defaults to the cell being viewed', () => {
    expect(activeMechanism('animal', 'auto')).toBe('animal');
    expect(activeMechanism('plant', 'auto')).toBe('plant');
    expect(activeMechanism('comparison', 'auto')).toBe('animal');
  });

  it('honours an explicit override in either cell', () => {
    expect(activeMechanism('animal', 'plant')).toBe('plant');
    expect(activeMechanism('plant', 'animal')).toBe('animal');
    expect(activeMechanism('plant', 'plant')).toBe('plant');
  });

  it('offers exactly the two mechanisms, and auto is not one of them', () => {
    expect([...CYTOKINESIS_MECHANISMS]).toEqual(['animal', 'plant']);
  });
});
