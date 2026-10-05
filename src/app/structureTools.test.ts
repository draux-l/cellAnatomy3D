import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANNOTATIONS_ENABLED, DISPERSION_ENABLED, HOVER_LABEL_ENABLED } from './structureTools';

/**
 * Structural gates for the structure-study layer switches.
 *
 * The requirement is *"the model can be taken apart, it is not labelled, the hover still names a
 * part, and none of it is deleted"* — four claims a browser test cannot make. A rendered app can
 * only show that the leader lines are absent; it cannot show that the code behind them is still
 * wired, nor which switch decides what. These assertions read the code that would have to exist for
 * the claims to be false.
 *
 * The layer sat behind **one** flag until the dispersion landed, and the split is the point: a
 * single switch could not turn the ordered separation on without turning the leader lines on with
 * it. `structureTools.test.ts` therefore also asserts that the old combined flag is gone, so a
 * future change cannot quietly re-couple the two surfaces.
 */

const ROOT = process.cwd();

/**
 * The file with its comments removed.
 *
 * A doc comment that explains *why* something is absent must not read as the thing being present —
 * `app/structureTools.ts` names `DisassemblyHud`, `AnnotationOverlay` and `DisassemblyDriver`
 * precisely to say what each flag switches.
 */
function code(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('the dispersion switch', () => {
  it('ships on, so the cell can be taken apart in order', () => {
    expect(DISPERSION_ENABLED).toBe(true);
  });

  it('is the gate the control and the driver read', () => {
    const viewer = code('src/scene/CellViewer.tsx');
    const stage = code('src/scene/CellStage.tsx');

    expect(viewer).toContain("from '../app/structureTools'");
    expect(viewer).toContain('DISPERSION_ENABLED ? (');
    expect(stage).toContain('{dispersionEnabled ? (');
  });

  it('keeps the dispersion code, still exported and still wired to its mount points', () => {
    expect(code('src/ui/hud/DisassemblyHud.tsx')).toContain('export function DisassemblyHud');
    expect(code('src/scene/disassembly.ts')).toContain('export function DisassemblyDriver');

    expect(code('src/scene/CellViewer.tsx')).toContain('DisassemblyHud');
    expect(code('src/scene/CellStage.tsx')).toContain('DisassemblyDriver');
  });
});

describe('the annotation switch', () => {
  it('ships off, so no part is named with a leader line', () => {
    expect(ANNOTATIONS_ENABLED).toBe(false);
  });

  it('is the outer gate, so a URL override cannot bring the layer back', () => {
    expect(code('src/scene/CellViewer.tsx')).toContain(
      'ANNOTATIONS_ENABLED && fixture.showAnnotations',
    );
  });

  it('keeps the annotation code, still exported and still wired to its mount points', () => {
    expect(code('src/ui/annotations/AnnotationLayer.tsx')).toContain(
      'export function AnnotationOverlay',
    );
    expect(code('src/scene/CellViewer.tsx')).toContain('AnnotationOverlay');
    expect(code('src/scene/CellStage.tsx')).toContain('AnnotationDriver');
  });
});

describe('the hover switch', () => {
  it('stays on, so hovering still names a part', () => {
    expect(HOVER_LABEL_ENABLED).toBe(true);
  });

  it('is read by the hover popup', () => {
    expect(code('src/ui/HoverLabel.tsx')).toContain('HOVER_LABEL_ENABLED');
  });
});

describe('the two surfaces are no longer coupled', () => {
  it('has no combined structure-tools flag left', () => {
    expect(code('src/app/structureTools.ts')).not.toContain('STRUCTURE_TOOLS_ENABLED');
    expect(code('src/scene/CellViewer.tsx')).not.toContain('STRUCTURE_TOOLS_ENABLED');
    expect(code('src/scene/CellStage.tsx')).not.toContain('STRUCTURE_TOOLS_ENABLED');
  });
});

describe('no flag disables the model mount, which is not a study aid', () => {
  it('keeps the cell group and the pick controller unconditional', () => {
    const stage = code('src/scene/CellStage.tsx');

    expect(stage).toContain('<CellGroup cell={cell} />');
    expect(stage).toContain('<PickController />');
  });
});
