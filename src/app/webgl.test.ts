import { afterEach, describe, expect, it } from 'vitest';
import { WEBGL2_CONTEXT_ID, isWebGL2Available } from './webgl';

/**
 * The capability probe (task 4.6).
 *
 * The probe decides which of the app's two paths runs, so its false answers matter as much as its
 * true one: "no document" (the unit-test environment), "the context is null", and "asking threw"
 * must all reach the fallback rather than mounting a canvas that cannot render.
 */

interface FakeCanvas {
  getContext: (type: string) => unknown;
}

interface Probe {
  document: Document;
  asked: string[];
  canvasCount: number;
  loseContextCalls: number;
}

/** A minimal `document` whose canvases answer `getContext` however the test needs. */
function fakeDocument(answer: (type: string) => unknown): Probe {
  const probe: Probe = {
    asked: [],
    canvasCount: 0,
    loseContextCalls: 0,
    document: undefined as unknown as Document,
  };

  probe.document = {
    createElement: (): FakeCanvas => {
      probe.canvasCount += 1;

      return {
        getContext: (type: string): unknown => {
          probe.asked.push(type);

          return answer(type);
        },
      };
    },
  } as unknown as Document;

  return probe;
}

function installDocument(document: Document | undefined): void {
  Object.defineProperty(globalThis, 'document', {
    value: document,
    configurable: true,
    writable: true,
  });
}

const ORIGINAL_DOCUMENT = globalThis.document;

afterEach(() => {
  installDocument(ORIGINAL_DOCUMENT);
});

describe('isWebGL2Available', () => {
  it('answers true when a WebGL2 context is created, and releases it immediately', () => {
    const probe = fakeDocument(() => ({ getExtension: () => ({ loseContext: () => {
      probe.loseContextCalls += 1;
    } }) }));

    installDocument(probe.document);

    expect(isWebGL2Available()).toBe(true);
    expect(probe.asked).toEqual([WEBGL2_CONTEXT_ID]);
    expect(probe.canvasCount).toBe(1);
    // Handing the context back is what keeps a supporting machine from spending a context slot.
    expect(probe.loseContextCalls).toBe(1);
  });

  it('answers false when the context is null, which is the spec GIVEN', () => {
    const probe = fakeDocument(() => null);

    installDocument(probe.document);

    expect(isWebGL2Available()).toBe(false);
    expect(probe.asked).toEqual([WEBGL2_CONTEXT_ID]);
  });

  it('answers false when creating the context throws', () => {
    const probe = fakeDocument(() => {
      throw new Error('the graphics driver is blocklisted');
    });

    installDocument(probe.document);

    expect(isWebGL2Available()).toBe(false);
  });

  it('asks for webgl2 and never for webgl1', () => {
    // three.js r163+ dropped WebGL1, so a WebGL1 answer would mount a renderer that then fails.
    const probe = fakeDocument(() => null);

    installDocument(probe.document);
    isWebGL2Available();

    expect(probe.asked.every((type) => type === 'webgl2')).toBe(true);
  });

  it('answers false with no document at all', () => {
    installDocument(undefined);

    expect(isWebGL2Available()).toBe(false);
  });
});
