import { beforeEach, describe, expect, it } from 'vitest';
import {
  attachRendererSampling,
  createCellDebug,
  computePercentile,
  installCellDebug,
  msToFps,
  type AnnotationMirrorEntry,
  type CellDebug,
} from './debug';
import { processClock } from './clock';

describe('computePercentile', () => {
  it('returns zero for an empty sample set', () => {
    expect(computePercentile([], 50)).toBe(0);
    expect(computePercentile([], 95)).toBe(0);
  });

  it('interpolates between neighbours', () => {
    const values = [10, 20, 30, 40];

    expect(computePercentile(values, 50)).toBeCloseTo(25);
    expect(computePercentile(values, 95)).toBeCloseTo(38.5);
    expect(computePercentile(values, 100)).toBe(40);
  });

  it('does not mutate the caller array', () => {
    const values = [3, 1, 2];
    computePercentile(values, 50);

    expect(values).toEqual([3, 1, 2]);
  });
});

describe('msToFps', () => {
  it('converts a frame delta to frames per second', () => {
    expect(msToFps(16.6667)).toBeCloseTo(60, 2);
    expect(msToFps(0)).toBe(0);
  });
});

describe('createCellDebug', () => {
  let debug: CellDebug;

  beforeEach(() => {
    debug = createCellDebug({ fixture: 'organelle', capacity: 4 });
    processClock.reset();
  });

  it('records the fixture name it was created for', () => {
    expect(debug.fixture).toBe('organelle');
    expect(createCellDebug().fixture).toBeNull();
  });

  it('captures the first render time once and never overwrites it', () => {
    debug.recordFrame(16, 820);
    debug.recordFrame(16, 900);

    expect(debug.firstRenderAtMs).toBe(820);
    expect(debug.frames).toBe(2);
  });

  it('keeps a bounded ring buffer of frame deltas', () => {
    for (const delta of [10, 20, 30, 40, 50]) {
      debug.recordFrame(delta, 0);
    }

    expect(debug.frameStats.samples).toBe(4);
    expect(debug.frameStats.lastMs).toBe(50);
    expect(debug.frameStats.p50Ms).toBeCloseTo(35);
  });

  it('derives p50 and p95 frames per second', () => {
    for (let i = 0; i < 100; i += 1) {
      debug.recordFrame(16, 0);
    }
    debug.recordFrame(1000 / 30, 0);

    expect(debug.frameStats.p50Fps).toBeCloseTo(62.5);
    expect(debug.frameStats.p95Fps).toBeLessThan(debug.frameStats.p50Fps);
  });

  it('throttles draw-call sampling to once per second', () => {
    expect(debug.sampleRenderer(48, 6100, 0)).toBe(true);
    expect(debug.sampleRenderer(50, 6100, 400)).toBe(false);
    expect(debug.sampleRenderer(52, 6200, 999)).toBe(false);
    expect(debug.sampleRenderer(53, 6200, 1000)).toBe(true);

    expect(debug.drawCalls).toBe(53);
    expect(debug.triangles).toBe(6200);
    expect(debug.drawCallSampleTimesMs).toEqual([0, 1000]);
  });

  it('mirrors the transient clock without owning it', () => {
    processClock.freezeAt(3.5);
    debug.recordFrame(16, 10);

    expect(debug.frozen).toBe(true);
    expect(debug.clock.elapsed).toBe(3.5);
  });

  it('clears every measurement on reset', () => {
    debug.recordFrame(16, 500);
    debug.sampleRenderer(60, 9000, 0);
    debug.recordSceneRender();
    debug.reset();

    expect(debug.frames).toBe(0);
    expect(debug.sceneRenders).toBe(0);
    expect(debug.firstRenderAtMs).toBeNull();
    expect(debug.drawCalls).toBe(0);
    expect(debug.triangles).toBe(0);
    expect(debug.frameStats).toEqual({
      samples: 0,
      lastMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p50Fps: 0,
      p95Fps: 0,
    });
  });
});

describe('installCellDebug', () => {
  it('exposes the debug object on the given target', () => {
    const debug = createCellDebug();
    const target: { __cellDebug?: CellDebug } = {};

    installCellDebug(debug, target);

    expect(target.__cellDebug).toBe(debug);
  });
});

describe('attachRendererSampling', () => {
  /** Stands in for three's WebGLRenderer: each render resets the counter, then counts. */
  function createFakeRenderer() {
    const info = { render: { calls: 0, triangles: 0 } };
    let target: unknown = null;
    const renderer = {
      info,
      setRenderTarget(next: unknown) {
        target = next;
      },
      getRenderTarget() {
        return target;
      },
      render(scene: string) {
        const isAuxiliary = scene.startsWith('aux');
        info.render.calls = isAuxiliary ? 1 : 11;
        info.render.triangles = isAuxiliary ? 2 : 6123;
      },
    };

    return renderer;
  }

  it('samples the app scene and ignores auxiliary passes', () => {
    const renderer = createFakeRenderer();
    const debug = createCellDebug();
    let now = 0;
    const detach = attachRendererSampling(renderer, 'main', debug, () => now);

    renderer.render('aux-shadow');
    renderer.render('main');
    renderer.render('aux-post');

    expect(debug.drawCalls).toBe(11);
    expect(debug.triangles).toBe(6123);

    now = 1500;
    renderer.render('main');

    expect(debug.drawCallSampleTimesMs).toEqual([0, 1500]);

    detach();
  });

  it('never lets an auxiliary pass overwrite the sample', () => {
    const renderer = createFakeRenderer();
    const debug = createCellDebug();
    const detach = attachRendererSampling(renderer, 'main', debug, () => 0);

    renderer.render('main');
    renderer.render('aux-shadow');

    expect(debug.drawCalls).toBe(11);

    detach();
  });

  /**
   * The task-4.13 fix, asserted directly.
   *
   * drei's `<ContactShadows>` renders the *main* scene into a render target from a `useFrame`
   * subscriber, so it runs before the presenting render with `scene === mainScene`. Counting it
   * sampled the depth pass — the ±1 draw call / ±2 triangle jitter the harness had been tolerating.
   */
  it('does not count a main-scene render that targets a render target', () => {
    const renderer = createFakeRenderer();
    const debug = createCellDebug();
    const detach = attachRendererSampling(renderer, 'main', debug, () => 0);

    renderer.setRenderTarget({ name: 'contact-shadow-depth' });
    renderer.render('main');

    expect(debug.sceneRenders).toBe(0);
    expect(debug.drawCalls).toBe(0);

    renderer.setRenderTarget(null);
    renderer.render('main');

    expect(debug.sceneRenders).toBe(1);
    expect(debug.drawCalls).toBe(11);

    detach();
  });

  it('counts one presented render per frame, after the auxiliary passes', () => {
    const renderer = createFakeRenderer();
    const debug = createCellDebug();
    const detach = attachRendererSampling(renderer, 'main', debug, () => 0);

    for (let frame = 0; frame < 3; frame += 1) {
      // The order every frame actually runs in: shadow depth pass, post pass, presented frame.
      renderer.setRenderTarget({ name: 'contact-shadow-depth' });
      renderer.render('main');
      renderer.setRenderTarget({ name: 'blur' });
      renderer.render('aux-blur');
      renderer.setRenderTarget(null);
      renderer.render('main');
    }

    expect(debug.sceneRenders).toBe(3);
    expect(debug.drawCalls).toBe(11);

    detach();
  });

  it('restores the original render method on detach', () => {
    const renderer = createFakeRenderer();
    const original = renderer.render;
    const detach = attachRendererSampling(renderer, 'main', createCellDebug(), () => 0);

    expect(renderer.render).not.toBe(original);

    detach();

    expect(renderer.render).toBe(original);
  });
});

describe('annotation mirror', () => {
  it('starts empty and copies what the layer wrote, so a reader cannot mutate it', () => {
    const debug = createCellDebug();
    const entry: AnnotationMirrorEntry = {
      id: 'mitochondrion',
      column: 'right',
      box: { x: 10, y: 20, width: 152, height: 34 },
      leader: [
        [400, 300],
        [200, 320],
        [162, 320],
      ],
      anchor: [400, 300],
      opacity: 1,
      occluded: false,
      hovered: true,
    };

    expect(debug.annotations).toEqual([]);

    debug.setAnnotations([entry]);
    entry.box.x = 999;
    entry.leader[0]![0] = 999;

    expect(debug.annotations[0]!.box.x).toBe(10);
    expect(debug.annotations[0]!.leader[0]![0]).toBe(400);
    expect(debug.annotations[0]!.hovered).toBe(true);
  });
});
