import { Suspense, lazy, useMemo } from 'react';
import { parseFixture } from './app/fixture';
import { isWebGL2Available } from './app/webgl';
import { FallbackView } from './ui/FallbackView';
import { useT } from './ui/i18n';
import { LanguageSelector } from './ui/i18n/LanguageSelector';
import { Nav } from './ui/Nav';
import { ProcessPanel } from './ui/ProcessPanel';
import { SpecSheet } from './ui/SpecSheet';

/**
 * Application shell.
 *
 * **The 3D module is a lazy chunk, and the shell must not import it.** three.js, R3F and drei
 * are ~290 KB gzipped together; with them in the entry graph the shell sat at 326.7 KB of its
 * 350 KB budget, leaving every later milestone nowhere to go (task 2.6 / design D18). So the
 * only reference to `CellViewer` here is a dynamic `import()`, and the shell — header, language
 * selector, this comment — paints while the 3D chunk is still in flight.
 *
 * `verify/size-audit.mjs` enforces the same fact from the built artifact: the 3D module must be
 * in a lazy chunk, the entry graph must not carry it, and the shell must stay inside its
 * post-split budget. A lazy boundary can be undone by one careless static import, so it is
 * measured rather than trusted.
 *
 * The named export is mapped inline rather than adding a default export, so the module keeps the
 * codebase's one-export-style convention.
 *
 * Under a `?fixture=` the shell renders nothing but the stage, so a screenshot is exactly the
 * canvas: DOM chrome must never contribute to the non-blank coverage metric. So the navigation and
 * the spec sheet render only in the real app — they are the two panels M1e adds (tasks 4.5-4.7),
 * and both are plain DOM in the entry chunk.
 *
 * The WebGL2 probe runs first, and it runs in the **shell** — before this lazy import is even
 * fetched (task 4.6, design D9). A machine that cannot create a WebGL2 context gets the static
 * fallback instead of a canvas that never paints; that is why the check is here and not inside the
 * viewer.
 */
const CellViewer = lazy(async () => {
  const { CellViewer: Viewer } = await import('./scene/CellViewer');

  return { default: Viewer };
});

export function App() {
  const fixture = useMemo(() => parseFixture(window.location.search), []);
  const webgl2 = useMemo(() => isWebGL2Available(), []);
  const t = useT();

  if (!webgl2) {
    return (
      <main className="app app--fallback" data-webgl="unavailable">
        <FallbackView />
      </main>
    );
  }

  if (fixture.name !== null) {
    return (
      <main className="app app--fixture" data-fixture={fixture.name}>
        <div className="app__stage">
          <Suspense fallback={null}>
            <CellViewer fixture={fixture} />
          </Suspense>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="app__header">
        <div className="app__bar">
          <h1 className="app__title">{t('app.title')}</h1>
          <LanguageSelector />
        </div>
        <p className="app__subtitle">{t('app.subtitle')}</p>
      </header>
      <Nav />
      <div className="app__stage">
        <Suspense fallback={<p className="app__note">{t('app.loading3d')}</p>}>
          <CellViewer fixture={fixture} />
        </Suspense>
        <ProcessPanel />
        <SpecSheet />
      </div>
    </main>
  );
}
