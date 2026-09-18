import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-level gates for the process surfaces (tasks 5.1/5.4/5.5).
 *
 * Two claims cannot be seen in a screenshot and are therefore asserted against the modules that
 * would have to change for them to become false:
 *
 * 1. **Nothing per-frame touches React.** The panel refreshes from `__cellDebug` on an interval and
 *    writes `textContent`; a `useState` anywhere on that path would re-render the tree — including
 *    the canvas — several times a second, which is the classic R3F trap the project's Hard Rule
 *    forbids.
 * 2. **The shell stays three-free.** The panel, its model and the light state are DOM and numbers;
 *    if any of them imported the process definitions (or three.js) the 3D module would be pulled into
 *    the entry graph and the payload gate would fail. `verify/size-audit.mjs` catches it at build
 *    time; this catches it at test time, naming the file.
 */

const PANEL = join(process.cwd(), 'src/ui/ProcessPanel.tsx');
const SHELL_MODULES = [
  'src/ui/ProcessPanel.tsx',
  'src/ui/processModel.ts',
  'src/ui/controls/SpeedControl.tsx',
  'src/ui/controls/speedModel.ts',
  'src/ui/controls/ScrubBar.tsx',
  'src/ui/controls/scrubModel.ts',
  'src/ui/controls/CytokinesisToggle.tsx',
  'src/processes/light.ts',
  'src/processes/transport.ts',
  'src/processes/nutrition/stages.ts',
  'src/processes/nutrition/targets.ts',
  'src/processes/reproduction/stages.ts',
  'src/processes/reproduction/chromosomes.ts',
  'src/processes/ids.ts',
];

function code(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('the process panel', () => {
  it('never puts a frame value into React state', () => {
    const source = code('src/ui/ProcessPanel.tsx');

    expect(source).not.toContain('useState');
    expect(source).not.toContain('useSyncExternalStore');
    // The panel's only subscription is to discrete store keys.
    expect(source).toContain('useAppStore((state) =>');
  });

  it('reads the readout from the debug mirror through textContent and data attributes', () => {
    const source = code('src/ui/ProcessPanel.tsx');

    expect(source).toContain('cellDebug.processes');
    expect(source).toContain('textContent');
    expect(source).toContain('dataset.active');
  });

  it('writes the light through the transient state on input, not through a controlled value', () => {
    const source = code('src/ui/ProcessPanel.tsx');

    expect(source).toContain('processLight.setPercent');
    expect(source).toContain('onInput');
    // `value=` would make React own the slider position and re-render on every pointer move.
    expect(source).not.toMatch(/\bvalue=\{[^}]*light/i);
  });

  it('keeps the light-required statement out of the process list', () => {
    // The statement is part of the light control's group, not a fourth process entry.
    const source = code('src/ui/ProcessPanel.tsx');

    expect(source).toContain('process.light.required');
  });

  it('writes the scrub through the transient transport, never through React state', () => {
    const source = code('src/ui/controls/ScrubBar.tsx');

    expect(source).not.toContain('useState');
    expect(source).toContain('processTransport.scrub');
    expect(source).toContain('processTransport.seek');
    // The slider is uncontrolled on purpose: a `value` prop would make React own the playhead and
    // re-render the tree on every pointer move. `defaultValue` is the uncontrolled form.
    expect(source).toContain('defaultValue=');
    expect(source).not.toMatch(/[^a-zA-Z]value=\{/);
  });

  it('writes the cytokinesis mechanism as one discrete store value', () => {
    const source = code('src/ui/controls/CytokinesisToggle.tsx');

    expect(source).not.toContain('useState');
    expect(source).toContain('setCytokinesis');
    expect(source).toContain('CYTOKINESIS_DIFFERENCE_KEY');
  });
});

describe('the shell modules stay three-free', () => {
  for (const module of SHELL_MODULES) {
    it(`${module} imports no three.js and no gsap`, () => {
      const source = code(module);

      expect(source).not.toMatch(/from 'three'/);
      expect(source).not.toMatch(/from 'gsap'/);
      expect(source).not.toMatch(/from '\.\.?\/.*registry'/);
    });
  }

  it('does import the three-free target table it needs', () => {
    // The positive half of the same fact: the panel decides whether light matters from data, and the
    // data it reads has to be the three-free module rather than the definition.
    expect(code('src/ui/processModel.ts')).toContain("from '../processes/nutrition/targets'");
  });
});

describe('the process driver', () => {
  it('has exactly one frame loop and no React state for frame values', () => {
    const source = code('src/scene/ProcessStage.tsx');

    expect(source.match(/useFrame\(/g)).toHaveLength(1);
    expect(source).not.toContain('useState');
    expect(source).toContain('cellDebug.setProcesses');
  });

  it('detaches and disposes every instance it built', () => {
    const source = code('src/scene/ProcessStage.tsx');

    expect(source).toContain('removeFromParent()');
    expect(source).toContain('instance.dispose()');
    expect(source).toContain('setProcesses([])');
  });

  it('reads the light once per frame rather than subscribing to it', () => {
    const source = code('src/scene/ProcessStage.tsx');

    expect(source).toContain('processLight.intensity');
    expect(source).not.toContain('processLight.percent');
  });

  it('is the only place a process definition is resolved', () => {
    // One seam: the registry is read here, so nothing else in the app has to know how a process is
    // built or torn down.
    const source = readFileSync(PANEL, 'utf8');

    expect(source).not.toContain('getProcessDefinition');
  });

  it('applies a pending scrub to the running timeline, then publishes what it holds', () => {
    const source = code('src/scene/ProcessStage.tsx');

    expect(source).toContain('processTransport.consume()');
    expect(source).toContain('timeline.seek(');
    expect(source).toContain('timeline.progress(');
    // The readout is the timeline's own playhead, not a copy the driver keeps.
    expect(source).toContain('processTransport.publish(');
    // And a request from a previous process is never applied to a new one.
    expect(source).toContain('processTransport.reset()');
  });
});
