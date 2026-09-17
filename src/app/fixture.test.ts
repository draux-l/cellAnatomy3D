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
