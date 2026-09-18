import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cellDebug } from './debug';

/**
 * The process mirror (task 5.5).
 *
 * The mirror is the only reason the nutrition capability's claims are *measurable* rather than
 * visible: a rate, a pause and "respiration wrote the light uniform zero times" are all statements
 * about a window of frames, and none of them can be read off a screenshot. So the bridge has to
 * carry them, and it has to be a copy — an owner that kept a reference to its own object would be
 * updating the harness's evidence from inside the animation it is measuring.
 */

function entry() {
  return {
    id: 'respiration',
    processId: 'nutrition',
    cell: 'animal' as const,
    organelleId: 'mitochondrion',
    scripted: true,
    lightDriven: false,
    time: 1.5,
    rate: 1,
    label: 'atp',
    progress: 0.36,
    lightRequired: false,
    uniformWrites: 0,
    emitted: { atp: 12, oxygen: 0, glucose: 0 },
    extra: {},
  };
}

describe('setProcesses', () => {
  it('starts empty', () => {
    expect(cellDebug.processes).toEqual([]);
  });

  it('mirrors what the driver published', () => {
    cellDebug.setProcesses([entry()]);

    expect(cellDebug.processes).toHaveLength(1);
    expect(cellDebug.processes[0]).toMatchObject({
      id: 'respiration',
      rate: 1,
      label: 'atp',
      uniformWrites: 0,
    });

    cellDebug.setProcesses([]);
    expect(cellDebug.processes).toEqual([]);
  });

  it('copies rather than aliases, so a later mutation cannot rewrite the evidence', () => {
    const source = entry();

    cellDebug.setProcesses([source]);

    source.emitted.atp = 999;
    source.time = 99;
    source.label = 'reactions';

    expect(cellDebug.processes[0]?.emitted.atp).toBe(12);
    expect(cellDebug.processes[0]?.time).toBe(1.5);
    expect(cellDebug.processes[0]?.label).toBe('atp');
  });
});

describe('the debug bridge as source', () => {
  it('has no three.js import, so the entry chunk can carry it', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/debug.ts'), 'utf8');

    expect(source).not.toContain("from 'three'");
  });
});
