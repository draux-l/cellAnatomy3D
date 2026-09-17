import { useMemo } from 'react';
import { parseFixture } from './app/fixture';
import { CellViewer } from './scene/CellViewer';
import { useT } from './ui/i18n';
import { LanguageSelector } from './ui/i18n/LanguageSelector';

/**
 * Application shell.
 *
 * Under a `?fixture=` the shell renders nothing but the stage, so a screenshot is exactly the
 * canvas: DOM chrome must never contribute to the non-blank coverage metric. The spec-sheet
 * panels and the view navigation arrive in M1e (tasks 4.5-4.7).
 *
 * No user-facing sentence is written here — the two strings below are UI keys resolved from the
 * content model, which is what makes the language selector total (spec: Educational Copy Lives
 * In The Data Model).
 */
export function App() {
  const fixture = useMemo(() => parseFixture(window.location.search), []);
  const t = useT();

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
        <div className="app__bar">
          <h1 className="app__title">{t('app.title')}</h1>
          <LanguageSelector />
        </div>
        <p className="app__subtitle">{t('app.subtitle')}</p>
      </header>
      <div className="app__stage">
        <CellViewer fixture={fixture} />
      </div>
    </main>
  );
}
