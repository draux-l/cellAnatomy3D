import { describe, expect, it } from 'vitest';
import { FIXTURE_POSES, parseFixture } from './fixture';
import { CELL_POSE, yawPose } from '../scene/interaction/cameraModel';

describe('parseFixture', () => {
  it('leaves the real app running when no fixture is requested', () => {
    const config = parseFixture('');

    expect(config.name).toBeNull();
    expect(config.cell).toBeNull();
    expect(config.disassemblyValue).toBeNull();
    // The fixture always produces a yaw-adjusted pose, so this is a value comparison. The real app
    // frames the whole cell with the same pose as the `cell` fixture — that is what lets a fixture
    // capture stand in for the real app when the framing is compared against a plain glTF viewer.
    expect(config.camera).toEqual(CELL_POSE);
  });

  it('ignores an unknown fixture instead of half-freezing the app', () => {
    const config = parseFixture('?fixture=nope');

    expect(config.name).toBeNull();
    expect(config.cell).toBeNull();
  });

  it('selects the cell fixture and its cell under either parameter name', () => {
    expect(parseFixture('?fixture=cell').cell).toBe('animal');
    expect(parseFixture('?fixture=cell&view=plant').cell).toBe('plant');
    expect(parseFixture('?fixture=cell&cell=plant').cell).toBe('plant');
    expect(parseFixture('?fixture=cell&view=animal').camera).toEqual(FIXTURE_POSES.cell);
  });

  it('pins the disassembly value for the cell fixture', () => {
    expect(parseFixture('?fixture=cell&value=57').disassemblyValue).toBe(57);
    expect(parseFixture('?fixture=cell&value=250').disassemblyValue).toBe(100);
    expect(parseFixture('?fixture=cell&value=-5').disassemblyValue).toBe(0);
    // An unusable value degrades to zero rather than leaving the control unpinned.
    expect(parseFixture('?fixture=cell&value=abc').disassemblyValue).toBe(0);
    expect(parseFixture('?fixture=cell').disassemblyValue).toBe(0);
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
