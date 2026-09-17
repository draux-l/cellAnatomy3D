import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-level gates for the annotation layer (tasks 4.15/4.20, design D14).
 *
 * The layer's whole cost argument is "one `useFrame`, zero React frames, zero draw calls". A
 * browser test can measure the draw calls, but not the absence of React work; these assertions
 * read the module that would have to change for the claim to become false.
 */

const LAYER = join(process.cwd(), 'src/ui/annotations/AnnotationLayer.tsx');
const SOLVER = join(process.cwd(), 'src/ui/annotations/solver.ts');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

/**
 * The file with its comments removed: these gates are about what the code does, and a comment
 * explaining *why* something is absent must not read as the thing being present.
 */
function code(path: string): string {
  return source(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ 	]*\/\/.*$/gm, '');
}

describe('the annotation frame loop', () => {
  it('has exactly one useFrame and no React state', () => {
    const text = code(LAYER);

    expect(text.match(/useFrame\(/g)).toHaveLength(1);
    expect(text).not.toContain('useState');
    expect(text).not.toContain('useSyncExternalStore');
  });

  it('keeps layout maths out of the component', () => {
    const text = code(LAYER);

    // The component decides *when* to write; the solver decides *what* to write. Column assignment,
    // stacking and elbow geometry must not reappear here.
    expect(text).not.toMatch(/Math\.hypot|minGapPx|hysteresisFraction/);
    expect(text).toContain('solveAnnotationLayout');
  });

  it('does not portal into the canvas', () => {
    // R3F's reconciler owns the canvas subtree, so DOM JSX there becomes three objects
    // (`R3F: Rect is not part of the THREE namespace`). The layer is react-dom outside the canvas.
    expect(code(LAYER)).not.toContain('createPortal');
    expect(code(LAYER)).not.toContain('createRoot');
  });

  it('clears the debug mirror when the blind guard suppresses it', () => {
    const text = code(LAYER);

    expect(text).toContain('quizActive');
    expect(text.match(/setAnnotations\(\[\]\)/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it('borrows the shared raycaster and gives it back unchanged', () => {
    const text = code(LAYER);

    expect(text).toContain('previousFar');
    expect(text).toContain('previousMask');
    expect(text).toContain('raycaster.far = previousFar');
    expect(text).toContain('raycaster.layers.mask = previousMask');
  });
});

describe('the solver stays pure', () => {
  it('imports nothing from three, React or the scene', () => {
    const imports = code(SOLVER).match(/^import .*$/gm) ?? [];

    expect(imports.filter((line) => !line.includes("'./"))).toEqual([]);
  });
});
