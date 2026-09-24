import { Box3, BoxGeometry, Sphere, SphereGeometry } from 'three';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { OrganelleRecord } from './types';
import {
  SUGGESTED_TRAVEL_MULTIPLIER,
  boundingRadius,
  boundsOf,
  buildBounds,
  resolveDistance,
  suggestedDistance,
  travelDistanceFor,
} from './vectors';

/**
 * The disassembly-vector authoring aid (task 3.12).
 *
 * Two kinds of assertion: the numbers, checked against three's own `Box3` so "the record's own
 * bounding radius" means what it says; and the *structural* properties, which are absences and
 * therefore only a source scan can hold them — no runtime three.js in `src/catalog/`, and no
 * travel constant anywhere but this module.
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
 * Narrowed from `DISASSEMBLY|TRAVEL|DISPLACEMENT` when the composed-cell slice landed. `DISASSEMBLY`
 * alone is the *feature* name, not a quantity: `DISASSEMBLY_MIN`/`_MAX` are the percentage range of
 * the slider and cannot be a displacement, yet the over-broad pattern flagged them. A gate that
 * reports false positives is a gate people learn to ignore, so it now targets the quantity words —
 * and `findTravelConstants` is asserted against synthetic sources below so the narrowing is proven
 * not to have made it vacuous.
 */
const TRAVEL_VOCABULARY = /TRAVEL|DISPLACEMENT/i;

/** Every travel-vocabulary constant in one source file, formatted for the failure message. */
export function findTravelConstants(source: string, file: string): string[] {
  return [...numericConstants(source).keys()]
    .filter((name) => TRAVEL_VOCABULARY.test(name))
    .map((name) => `${file} declares ${name}`);
}

describe('bounding radius matches three\'s own Box3', () => {
  it('measures a unit box', () => {
    const geometry = new BoxGeometry(2, 2, 2);
    const box = new Box3().setFromBufferAttribute(geometry.getAttribute('position') as never);
    const reference = box.getBoundingSphere(new Sphere()).radius;

    // `boundingRadius` *is* `Box3.getBoundingSphere().radius`: half the box diagonal.
    expect(boundingRadius([geometry])).toBeCloseTo(reference, 9);
    expect(boundingRadius([geometry])).toBeCloseTo(Math.sqrt(3), 9);
    expect(boundsOf(geometry)).toEqual({ min: [-1, -1, -1], max: [1, 1, 1] });

    geometry.dispose();
  });

  it('measures a sphere by its box, which is wider than its radius', () => {
    const geometry = new SphereGeometry(2, 16, 8);

    // The box's corners stick out past the surface, so the box-derived radius is √3 × the
    // sphere's — a documented consequence of the definition, not an error.
    expect(boundingRadius([geometry])).toBeCloseTo(2 * Math.sqrt(3), 6);

    geometry.dispose();
  });

  it('tracks the geometry size, so a bigger organelle travels further', () => {
    const small = new BoxGeometry(1, 1, 1);
    const large = new BoxGeometry(2, 2, 2);

    expect(suggestedDistance([large])).toBeCloseTo(suggestedDistance([small]) * 2, 9);
    expect(suggestedDistance([small])).toBeCloseTo((SUGGESTED_TRAVEL_MULTIPLIER * Math.sqrt(3)) / 2, 9);

    small.dispose();
    large.dispose();
  });

  it('unions every part of a build before it measures', () => {
    const near = new BoxGeometry(1, 1, 1);
    const far = new BoxGeometry(1, 1, 1);

    far.translate(4, 0, 0);

    const single = suggestedDistance([near]);
    const combined = suggestedDistance([near, far]);

    expect(combined).toBeGreaterThan(single);
    expect(buildBounds([near, far]).max[0]).toBeCloseTo(4.5, 9);
    expect(() => buildBounds([])).toThrow(/at least one geometry/);

    near.dispose();
    far.dispose();
  });

  it('refuses a geometry with nothing in it', () => {
    const empty = new BoxGeometry(0, 0, 0);

    // A zero-extent box is still a position attribute with vertices, so it measures zero rather
    // than throwing; the loud failure is for a geometry with no position attribute at all.
    expect(boundingRadius([empty])).toBe(0);
    expect(() => boundsOf({ getAttribute: () => undefined })).toThrow(/position attribute/);

    empty.dispose();
  });
});

describe('the explicit record distance always wins', () => {
  it('returns the suggestion when nothing is declared', () => {
    const geometry = new BoxGeometry(2, 2, 2);

    expect(resolveDistance([geometry])).toBeCloseTo(suggestedDistance([geometry]), 9);

    geometry.dispose();
  });

  it('returns the declared value even when the suggestion differs', () => {
    const geometry = new BoxGeometry(2, 2, 2);
    const declared = 0.4;

    expect(suggestedDistance([geometry])).not.toBeCloseTo(declared, 3);
    expect(resolveDistance([geometry], declared)).toBe(declared);
    expect(resolveDistance([geometry], 0)).toBe(0);

    geometry.dispose();
  });

  it('refuses a negative or non-finite distance', () => {
    const geometry = new BoxGeometry(1, 1, 1);

    expect(() => resolveDistance([geometry], -1)).toThrow(/positive number/);
    expect(() => resolveDistance([geometry], Number.NaN)).toThrow(/positive number/);

    geometry.dispose();
  });

  it('renders the record and never the suggestion', () => {
    const geometry = new BoxGeometry(2, 2, 2);
    const declared = 0.4;
    const record = {
      disassembly: { direction: [1, 0, 0], distance: declared },
    } as unknown as OrganelleRecord;
    const suggestion = suggestedDistance([geometry]);

    expect(travelDistanceFor(record)).toBe(declared);
    expect(resolveDistance([geometry], record.disassembly.distance)).toBe(declared);
    expect(Number.isFinite(suggestion)).toBe(true);
    expect(suggestion).toBeGreaterThan(0);
    // The override is live, not vacuous: the authored distance is not the computed one.
    expect(suggestion).not.toBeCloseTo(declared, 3);

    geometry.dispose();
  });
});

describe('the catalog stays three-free and the multiplier has one home', () => {
  it('scans the source tree it thinks it is scanning', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(10);
    expect(SOURCE_FILES.some((file) => relative(file) === 'catalog/vectors.ts')).toBe(true);
    expect(SOURCE_FILES.some((file) => relative(file) === 'catalog/cells.ts')).toBe(true);
  });

  it('imports three.js by type only inside src/catalog', () => {
    const offenders = SOURCE_FILES.filter((file) => relative(file).startsWith('catalog/')).filter(
      (file) => RUNTIME_THREE_IMPORT.test(sourceOf(file)),
    );

    // A runtime import would drag three.js into the shell's entry graph; the size audit fails
    // there, and this is the cheaper, earlier failure.
    expect(offenders.map(relative)).toEqual([]);
  });

  it('keeps every travel constant in vectors.ts', () => {
    const offenders: string[] = [];

    for (const file of SOURCE_FILES) {
      if (relative(file) === 'catalog/vectors.ts') {
        continue;
      }

      offenders.push(...findTravelConstants(sourceOf(file), relative(file)));
    }

    expect(offenders).toEqual([]);
  });

  it('still catches a real displacement constant, and ignores a control range', () => {
    // The non-vacuousness check for the narrowed vocabulary: a planted displacement is caught, and
    // the two shapes that must not trip it do not.
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

  it('declares the ratified multiplier exactly once, here', () => {
    const constants = numericConstants(sourceOf(join(SRC_ROOT, 'catalog', 'vectors.ts')));
    const travelConstants = [...constants.entries()].filter(([name]) => TRAVEL_VOCABULARY.test(name));

    expect(travelConstants).toEqual([['SUGGESTED_TRAVEL_MULTIPLIER', SUGGESTED_TRAVEL_MULTIPLIER]]);
    expect(SUGGESTED_TRAVEL_MULTIPLIER).toBe(1.5);
  });
});
