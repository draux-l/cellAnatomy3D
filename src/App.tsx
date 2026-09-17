import { useMemo } from 'react';
import { parseFixture } from './app/fixture';
import { CellViewer } from './scene/CellViewer';

/**
 * Application shell.
 *
 * Under a `?fixture=` the shell renders nothing but the stage, so a screenshot is exactly the
 * canvas: DOM chrome must never contribute to the non-blank coverage metric. The landing UI and
 * the spec-sheet panels arrive in M1e (tasks 4.5-4.7).
 */
export function App() {
  const fixture = useMemo(() => parseFixture(window.location.search), []);

  if (fixture.name !== null) {
    return (
      <main className="app app--fixture" data-fixture={fixture.name}>
        <div className="app__stage">
          <CellViewer fixture={fixture} />
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">3D Cell Anatomy Explorer</h1>
        <p className="app__subtitle">
          Animal cell vs. plant cell, modelled procedurally in the browser.
        </p>
      </header>
      <div className="app__stage">
        <CellViewer fixture={fixture} />
      </div>
    </main>
  );
}
