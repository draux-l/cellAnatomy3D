import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CSSProperties } from 'react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PALETTE, DEFAULT_PALETTE_ID, resolvePalette, type Palette } from '../../catalog/palettes';
import { useAppStore } from '../../app/store';
import { ANNOTATION_INK_VARIABLE, annotationInkStyle, annotationInkStyleForId } from './ink';

/**
 * Annotation ink follows the palette (task 4.21, spec: `Annotation Ink Follows The Palette`).
 *
 * The requirement is about an **absence** — no literal colour may ink the annotation layer — so the
 * assertions are of the only kind that can prove one: a scan of the module, a scan of the
 * stylesheet rules the module's class names select, and a unit test that the ink is a pure function
 * of the palette.
 *
 * The stylesheet half matters as much as the module half. The ink *value* is data and the ink
 * *transport* is CSS, so a literal in `src/styles.css` would satisfy the letter of "no literal
 * colours in `src/ui/annotations/*`" while producing exactly the defect the requirement forbids.
 */

const ANNOTATIONS_DIRECTORY = join(process.cwd(), 'src/ui/annotations');
const STYLESHEET = join(process.cwd(), 'src/styles.css');
const LAYER = join(ANNOTATIONS_DIRECTORY, 'AnnotationLayer.tsx');

const COLOUR_LITERALS = [/#[0-9a-f]{3,8}\b/i, /\brgba?\(/i, /\bhsla?\(/i];

/** The shipped modules, comments stripped: a comment explaining what is absent must not read as present. */
function shippedSources(): { file: string; code: string }[] {
  return readdirSync(ANNOTATIONS_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .filter((entry) => !entry.name.includes('.test.'))
    .map((entry) => ({
      file: entry.name,
      code: readFileSync(join(ANNOTATIONS_DIRECTORY, entry.name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^[ \t]*\/\/.*$/gm, ''),
    }));
}

interface CssRule {
  selector: string;
  declarations: { property: string; value: string }[];
}

/** Reads a custom property back out of a style object; `CSSProperties` does not model custom keys. */
function inkOf(style: CSSProperties): string | undefined {
  return (style as Record<string, string | undefined>)[ANNOTATION_INK_VARIABLE];
}

/** The stylesheet's flat rules. This file has no nesting, no `@media` and no keyframes. */
function cssRules(source: string): CssRule[] {
  const rules: CssRule[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    const selector = match[1]!.trim();
    const body = match[2]!;

    if (selector.startsWith('@')) {
      continue;
    }

    rules.push({
      selector,
      declarations: body
        .split(';')
        .map((declaration) => declaration.trim())
        .filter((declaration) => declaration.includes(':'))
        .map((declaration) => {
          const [property, ...rest] = declaration.split(':');

          return { property: property!.trim(), value: rest.join(':').trim() };
        }),
    });
  }

  return rules;
}

describe('no literal colour inks the annotation layer', () => {
  it('finds none in any shipped module of src/ui/annotations', () => {
    const offenders: string[] = [];

    for (const { file, code } of shippedSources()) {
      for (const pattern of COLOUR_LITERALS) {
        if (pattern.test(code)) {
          offenders.push(`${file} matches ${String(pattern)}`);
        }
      }
    }

    expect(shippedSources().length).toBeGreaterThanOrEqual(4);
    expect(offenders).toEqual([]);
  });

  it('finds none in the stylesheet rules the annotation layer selects', () => {
    const annotationRules = cssRules(readFileSync(STYLESHEET, 'utf8')).filter((rule) =>
      rule.selector.includes('annotation'),
    );

    expect(annotationRules.length).toBeGreaterThanOrEqual(8);

    const offenders: string[] = [];

    for (const rule of annotationRules) {
      for (const { property, value } of rule.declarations) {
        for (const pattern of COLOUR_LITERALS) {
          if (pattern.test(value)) {
            offenders.push(`${rule.selector} { ${property}: ${value} }`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('inks every colour surface of the layer from the one palette variable', () => {
    const annotationRules = cssRules(readFileSync(STYLESHEET, 'utf8')).filter((rule) =>
      rule.selector.includes('annotation'),
    );
    const inked = annotationRules.flatMap((rule) =>
      rule.declarations
        .filter(({ property }) => ['color', 'stroke', 'fill'].includes(property))
        .map(({ property, value }) => ({ selector: rule.selector, property, value })),
    );

    // Leader stroke, anchor fill, primary line, secondary line, and `fill: none` on the path.
    expect(inked.length).toBeGreaterThanOrEqual(5);

    const nonPaletteInk = inked.filter(
      ({ value }) => value !== 'none' && !value.includes(`var(${ANNOTATION_INK_VARIABLE}`),
    );

    expect(nonPaletteInk).toEqual([]);
  });
});

describe('the ink is the palette label role', () => {
  it('transports the palette label under the one custom property', () => {
    expect(annotationInkStyle(DEFAULT_PALETTE)).toEqual({
      [ANNOTATION_INK_VARIABLE]: DEFAULT_PALETTE.label,
    });
  });

  it('re-inks when the palette changes, with no catalog edit', () => {
    const highContrast: Palette = { id: 'high-contrast', label: '#ffffff' };

    expect(inkOf(annotationInkStyle(highContrast))).not.toBe(inkOf(annotationInkStyle(DEFAULT_PALETTE)));
    expect(inkOf(annotationInkStyle(highContrast))).toBe('#ffffff');
  });

  it('resolves the store palette id, falling back to the default for an unknown id', () => {
    expect(inkOf(annotationInkStyleForId(DEFAULT_PALETTE_ID))).toBe(DEFAULT_PALETTE.label);
    expect(inkOf(annotationInkStyleForId('does-not-exist'))).toBe(DEFAULT_PALETTE.label);
    expect(resolvePalette('does-not-exist')).toBe(DEFAULT_PALETTE);
  });

  it('is wired to the discrete palette key the store already holds', () => {
    // The plumbing only means something if the store value it reads is real and discrete.
    expect(useAppStore.getState().paletteId).toBe(DEFAULT_PALETTE_ID);
  });
});

describe('the overlay applies the ink', () => {
  it('resolves the style from the store palette and never from a literal', () => {
    const code = readFileSync(LAYER, 'utf8');

    expect(code).toContain('annotationInkStyleForId');
    expect(code).toContain('state.paletteId');
    // The custom property is set on the layer root, where the stylesheet resolves it.
    expect(code.match(/style=\{inkStyle\}/g)?.length).toBeGreaterThanOrEqual(1);
    expect(code).toContain("data-annotation-ink-role=\"label\"");
  });
});
