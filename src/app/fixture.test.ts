import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ORGANELLE_ID,
  FIXTURE_POSES,
  HERO_POSE,
  parseFixture,
} from './fixture';
import { CELL_POSE, yawPose } from '../scene/interaction/cameraModel';

describe('parseFixture', () => {
  it('leaves the real app running when no fixture is requested', () => {
    const config = parseFixture('');

    expect(config.name).toBeNull();
    expect(config.freezeClock).toBe(false);
    expect(config.showLabels).toBe(true);
    expect(config.organelleId).toBe(DEFAULT_ORGANELLE_ID);
    expect(config.frozenTime).toBe(0);
    // The fixture now always produces a yaw-adjusted pose, so this is a value comparison.
    expect(config.camera).toEqual(HERO_POSE);
  });

  it('freezes the clock and the labels for the organelle fixture', () => {
    const config = parseFixture('?fixture=organelle&id=mitochondrion');

    expect(config.name).toBe('organelle');
    expect(config.freezeClock).toBe(true);
    expect(config.showLabels).toBe(false);
    expect(config.organelleId).toBe('mitochondrion');
    expect(config.camera).toEqual(FIXTURE_POSES.organelle);
  });

  it('accepts both parameter names the artifacts use for the organelle', () => {
    expect(parseFixture('?fixture=organelle&id=nucleus').organelleId).toBe('nucleus');
    expect(parseFixture('?fixture=organelle&organelle=nucleus').organelleId).toBe('nucleus');
  });

  it('ignores an unknown fixture instead of half-freezing the app', () => {
    const config = parseFixture('?fixture=nope&id=mitochondrion');

    expect(config.name).toBeNull();
    expect(config.freezeClock).toBe(false);
    expect(config.showLabels).toBe(true);
  });

  it('reads a frozen time but falls back to zero when it is unusable', () => {
    expect(parseFixture('?fixture=organelle&t=12.5').frozenTime).toBe(12.5);
    expect(parseFixture('?fixture=organelle&t=-3').frozenTime).toBe(0);
    expect(parseFixture('?fixture=organelle&t=abc').frozenTime).toBe(0);
  });

  it('lets the caller supply the fallback organelle id', () => {
    expect(parseFixture('', { defaultOrganelleId: 'nucleus' }).organelleId).toBe('nucleus');
    expect(parseFixture('?fixture=organelle', { defaultOrganelleId: 'nucleus' }).organelleId).toBe(
      'nucleus',
    );
  });

  it('leaves the annotation layer and the readout on unless the URL switches them off', () => {
    expect(parseFixture('').showAnnotations).toBe(true);
    expect(parseFixture('').showFps).toBe(true);
    expect(parseFixture('?fixture=cell&annotations=off').showAnnotations).toBe(false);
    expect(parseFixture('?fixture=cell&fps=off').showFps).toBe(false);
    // Only the exact `off` value disables a surface, so a typo cannot silently remove it.
    expect(parseFixture('?fixture=cell&annotations=0').showAnnotations).toBe(true);
  });

  it('rotates a posed camera by the requested yaw and clamps it to one turn', () => {
    expect(parseFixture('?fixture=cell').yaw).toBe(0);
    expect(parseFixture('?fixture=cell&yaw=90').camera).toEqual(yawPose(CELL_POSE, 90));
    expect(parseFixture('?fixture=cell&yaw=abc').yaw).toBe(0);
    expect(parseFixture('?fixture=cell&yaw=400').yaw).toBe(180);
    expect(parseFixture('?fixture=cell&yaw=-400').yaw).toBe(-180);
  });

  it('keeps the cell centre and the viewing distance when it yaws', () => {
    const pose = yawPose(CELL_POSE, 42);
    const distance = (p: readonly [number, number, number]) => Math.hypot(p[0], p[1], p[2]);

    expect(pose.target).toEqual(CELL_POSE.target);
    expect(distance(pose.position)).toBeCloseTo(distance(CELL_POSE.position), 9);
    expect(pose.position[1]).toBe(CELL_POSE.position[1]);
  });
});

/**
 * The process fixture (tasks 5.3/5.4).
 *
 * It is the first fixture whose clock is **optional**, and that is the point of these cases: a
 * screenshot needs the clock pinned, while the light-rate measurement needs the animation actually
 * running. Getting that wrong would make the spec's rate scenario unmeasurable or make its
 * screenshots non-deterministic, so both directions are asserted.
 */
describe('the process fixture', () => {
  it('runs the named process in the named cell, with no fixture-only code path', () => {
    const config = parseFixture('?fixture=process&id=nutrition&cell=plant');

    expect(config.name).toBe('process');
    expect(config.processId).toBe('nutrition');
    expect(config.cell).toBe('plant');
    // The process is *entered* through the same store value the panel writes.
    expect(config.selectedId).toBeNull();
    expect(config.hoveredId).toBeNull();
  });

  it('defaults to nutrition and reads the cell under either parameter name', () => {
    expect(parseFixture('?fixture=process').processId).toBe('nutrition');
    expect(parseFixture('?fixture=process&cell=plant').cell).toBe('plant');
    expect(parseFixture('?fixture=process&view=plant').cell).toBe('plant');
  });

  it('pins the clock only when the URL names a time, so the rate can be measured without one', () => {
    const frozen = parseFixture('?fixture=process&id=nutrition&t=1.6');
    const running = parseFixture('?fixture=process&id=nutrition');

    expect(frozen.freezeClock).toBe(true);
    expect(frozen.frozenTime).toBe(1.6);
    expect(running.freezeClock).toBe(false);
    // Every other fixture still freezes: this is a deliberate exception for one fixture, not a
    // loosening of the determinism rule.
    expect(parseFixture('?fixture=cell').freezeClock).toBe(true);
  });

  it('pins the light when the URL names one, and distinguishes zero from absent', () => {
    expect(parseFixture('?fixture=process&light=0').lightPercent).toBe(0);
    expect(parseFixture('?fixture=process&light=100').lightPercent).toBe(100);
    expect(parseFixture('?fixture=process&light=250').lightPercent).toBe(100);
    expect(parseFixture('?fixture=process&light=-5').lightPercent).toBe(0);
    expect(parseFixture('?fixture=process&light=abc').lightPercent).toBeNull();
    // Absence is not zero light: an unset light must leave the control where it is.
    expect(parseFixture('?fixture=process').lightPercent).toBeNull();
  });

  it('frames the organelle it is asked to focus, and the whole cell otherwise', () => {
    const focused = parseFixture('?fixture=process&focus=chloroplast&cell=plant');

    expect(focused.focusOrganelleId).toBe('chloroplast');
    expect(focused.organelleId).toBe('chloroplast');
    // The same pose the app's own isolate view produces, so the close-up is not a fixture invention.
    expect(focused.camera).toEqual(
      parseFixture('?fixture=isolate&id=chloroplast&view=plant').camera,
    );

    const whole = parseFixture('?fixture=process&cell=animal');

    expect(whole.focusOrganelleId).toBeNull();
    expect(whole.camera).toEqual(CELL_POSE);
  });

  it('mounts the annotation overlay only when asked, because the subject is the animation', () => {
    // The process fixtures are the one place the overlay is opt-in: it would sit over the very
    // thing being inspected. Every other composed fixture keeps the opt-out default.
    expect(parseFixture('?fixture=process').showAnnotations).toBe(false);
    expect(parseFixture('?fixture=process&annotations=on').showAnnotations).toBe(true);
    expect(parseFixture('?fixture=cell').showAnnotations).toBe(true);
  });

  it('keeps the yaw control working on the focused pose', () => {
    const focused = parseFixture('?fixture=process&focus=mitochondrion&yaw=45');
    const unyawed = parseFixture('?fixture=process&focus=mitochondrion');

    expect(focused.camera).toEqual(yawPose(unyawed.camera, 45));
  });
});
