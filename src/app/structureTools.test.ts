import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STRUCTURE_TOOLS_ENABLED } from './structureTools';

/**
 * Structural gates for the structure-study layer switch.
 *
 * The requirement this encodes is *"hide it, do not delete it, and make it come back with one
 * switch"* — three claims a browser test cannot make. A rendered app can only show that the control
 * and the labels are absent; it cannot show that the code behind them is still wired, nor that no
 * second flag has appeared. These assertions read the code that would have to exist for the claims
 * to be false.
 *
 * Text-level checks are blunt, so each one is written against a **fact**: the flag ships off, both
 * hidden surfaces read that one module rather than a literal of their own, and the three modules the
 * layer is made of are still exported and still imported by their mount points.
 */

const ROOT = process.cwd();

/**
 * The file with its comments removed.
 *
 * A doc comment that explains *why* something is absent must not read as the thing being present —
 * `app/structureTools.ts` names `DisassemblyHud`, `AnnotationOverlay` and `DisassemblyDriver`
 * precisely to say what it switches off.
 */
function code(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('the structure-study layer switch', () => {
  it('ships switched off, so no part is taken apart or named', () => {
    expect(STRUCTURE_TOOLS_ENABLED).toBe(false);
  });

  it('is the one gate the two hidden surfaces read', () => {
    const viewer = code('src/scene/CellViewer.tsx');
    const stage = code('src/scene/CellStage.tsx');

    // Both mount points take the decision from the one module...
    expect(viewer).toContain("from '../app/structureTools'");
    expect(viewer).toContain('STRUCTURE_TOOLS_ENABLED ? (');
    expect(stage).toContain('{structureToolsEnabled ? (');
    // ...and the annotation layer's URL override cannot get past it.
    expect(viewer).toContain('STRUCTURE_TOOLS_ENABLED && fixture.showAnnotations');
  });

  it('keeps the hidden code, still exported and still wired to its mount points', () => {
    expect(code('src/ui/hud/DisassemblyHud.tsx')).toContain('export function DisassemblyHud');
    expect(code('src/ui/annotations/AnnotationLayer.tsx')).toContain(
      'export function AnnotationOverlay',
    );
    expect(code('src/scene/disassembly.ts')).toContain('export function DisassemblyDriver');

    // Still imported and still rendered inside the flag's branch, so flipping it is the only edit
    // a re-enable needs.
    expect(code('src/scene/CellViewer.tsx')).toContain('DisassemblyHud');
    expect(code('src/scene/CellViewer.tsx')).toContain('AnnotationOverlay');
    expect(code('src/scene/CellStage.tsx')).toContain('DisassemblyDriver');
  });

  it('never disables the model mount, which is not a study aid', () => {
    const stage = code('src/scene/CellStage.tsx');

    // The cell group and the pick controller render unconditionally: only the two study surfaces
    // are behind the flag.
    expect(stage).toContain('<CellGroup cell={cell} />');
    expect(stage).toContain('<PickController />');
  });
});
