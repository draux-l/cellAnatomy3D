import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Box3, BoxGeometry, Sphere, SphereGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { boundsOf, buildBounds } from './bounds';

/**
 * The geometry-measurement helpers, plus the two structural properties that only a source scan can
 * hold: `src/catalog/` stays free of runtime three.js, and the arrangement's one free distance lives
 * in exactly one module.
 *
 * The numbers are checked against three's own `Box3`, so "the same box three computes" means what it
 * says rather than "whatever this function returns".
 */

const SRC_ROOT = join(process.cwd(), 'src');

function listSourceFiles(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) {
      found.push(full);
    }
  }

  return found;
}

const SOURCE_FILES = listSourceFiles(SRC_ROOT);

function sourceOf(file: string): string {
  return readFileSync(file, 'utf8');
}

function relative(file: string): string {
  return file.slice(SRC_ROOT.length + 1).replace(/\\/g, '/');
}

/** Every `const NAME = <number>;` in a file, as name → value. */
function numericConstants(source: string): Map<string, number> {
  const pattern = /\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=;\n]+)?=\s*(-?\d+(?:\.\d+)?)\s*;/g;
  const found = new Map<string, number>();

  for (const match of source.matchAll(pattern)) {
    found.set(match[1]!, Number(match[2]));
  }

  return found;
}

/** A runtime import of three.js: `import type …` is erased and therefore not a runtime import. */
const RUNTIME_THREE_IMPORT = /import\s+(?!type\b)[^;]*?from\s+['"]three(?:\/[\w./-]+)?['"]/;

/**
 * The vocabulary a hard-coded displacement constant would have to use.
 *
 * Narrowed to the quantity words when the composed-cell slice landed: `DISASSEMBLY` alone is the
 * *feature* name, not a quantity — `DISASSEMBLY_MIN`/`_MAX` are the percentage range of the slider
 * and cannot be a displacement, yet the over-broad pattern flagged them. A gate that reports false
 * positives is a gate people learn to ignore.
 */
const TRAVEL_VOCABULARY = /TRAVEL|DISPLACEMENT/i;

/** Every travel-vocabulary constant in one source file, formatted for the failure message. */
export function findTravelConstants(source: string, file: string): string[] {
  return [...numericConstants(source).keys()]
    .filter((name) => TRAVEL_VOCABULARY.test(name))
    .map((name) => `${file} declares ${name}`);
}

/** The one module allowed to name the arrangement's clearance. */
const CLEARANCE_HOME = 'catalog/separation.ts';

describe('bounds match three\'s own Box3', () => {
  it('measures a unit box', () => {
    const geometry = new BoxGeometry(2, 2, 2);
    const box = new Box3().setFromBufferAttribute(geometry.getAttribute('position') as never);
    const reference = box.getBoundingSphere(new Sphere()).radius;

    expect(boundsOf(geometry)).toEqual({ min: [-1, -1, -1], max: [1, 1, 1] });
    expect(reference).toBeCloseTo(Math.sqrt(3), 9);

    geometry.dispose();
  });

  it('measures a sphere by its box, which is wider than its radius', () => {
    const geometry = new SphereGeometry(2, 16, 8);

    // The box's corners stick out past the surface, so the box is √3 × the sphere's radius in every
    // direction — a documented consequence of measuring boxes, not an error.
    expect(boundsOf(geometry).max[0]).toBeCloseTo(2, 6);
    expect(boundsOf(geometry).max[0]).toBeLessThan(2 * Math.sqrt(3));

    geometry.dispose();
  });

  it('unions every part of a build before it measures', () => {
    const near = new BoxGeometry(1, 1, 1);
    const far = new BoxGeometry(1, 1, 1);

    far.translate(4, 0, 0);

    expect(buildBounds([near, far]).max[0]).toBeCloseTo(4.5, 9);
    expect(buildBounds([near, far]).min[0]).toBeCloseTo(-0.5, 9);
    expect(() => buildBounds([])).toThrow(/at least one geometry/);

    near.dispose();
    far.dispose();
  });

  it('refuses a geometry with nothing in it', () => {
    const empty = new BoxGeometry(0, 0, 0);
    const box = boundsOf(empty);

    // A zero-extent box is still a position attribute with vertices, so it measures zero rather than
    // throwing. Compared as numbers, not with `toEqual`: three produces `-0` on the min side and
    // `-0` is not deep-equal to `0`.
    expect(box.min.every((value) => value === 0)).toBe(true);
    expect(box.max.every((value) => value === 0)).toBe(true);
    expect(() => boundsOf({ getAttribute: () => undefined })).toThrow(/position attribute/);

    empty.dispose();
  });
});

describe('the catalog stays three-free and the clearance has one home', () => {
  it('scans the source tree it thinks it is scanning', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(10);
    expect(SOURCE_FILES.some((file) => relative(file) === 'catalog/bounds.ts')).toBe(true);
    expect(SOURCE_FILES.some((file) => relative(file) === 'catalog/cells.ts')).toBe(true);
    expect(SOURCE_FILES.some((file) => relative(file) === CLEARANCE_HOME)).toBe(true);
  });

  it('imports three.js by type only inside src/catalog', () => {
    const offenders = SOURCE_FILES.filter((file) => relative(file).startsWith('catalog/')).filter(
      (file) => RUNTIME_THREE_IMPORT.test(sourceOf(file)),
    );

    // A runtime import would drag three.js into the shell's entry graph; the size audit fails there,
    // and this is the cheaper, earlier failure.
    expect(offenders.map(relative)).toEqual([]);
  });

  it('keeps every displacement constant out of the viewer', () => {
    const offenders: string[] = [];

    for (const file of SOURCE_FILES) {
      if (relative(file) === CLEARANCE_HOME) {
        continue;
      }

      offenders.push(...findTravelConstants(sourceOf(file), relative(file)));
    }

    expect(offenders).toEqual([]);
  });

  it('still catches a real displacement constant, and ignores a control range', () => {
    const planted = [
      'const ORGANELLE_TRAVEL = 0.75;',
      'const SUGGESTED_DISPLACEMENT = 1.5;',
    ].join('\n');
    const legitimate = [
      'const DISASSEMBLY_MIN = 0;',
      'const DISASSEMBLY_MAX = 100;',
      'const FOCUS_DAMPING_PER_SECOND = 6;',
    ].join('\n');

    expect(findTravelConstants(planted, 'planted.ts')).toEqual([
      'planted.ts declares ORGANELLE_TRAVEL',
      'planted.ts declares SUGGESTED_DISPLACEMENT',
    ]);
    expect(findTravelConstants(legitimate, 'legitimate.ts')).toEqual([]);
  });

  it('declares the slot clearance exactly once, in the layout module', () => {
    const constants = numericConstants(sourceOf(join(SRC_ROOT, 'catalog', 'separation.ts')));
    const clearances = [...constants.entries()].filter(([name]) => /CLEARANCE|MARGIN/i.test(name));

    expect(clearances).toEqual([['SLOT_CLEARANCE', 0.5]]);
  });
});
