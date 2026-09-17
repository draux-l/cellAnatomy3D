import { useAppStore } from '../app/store';
import { useT } from './i18n';
import { VIEW_OPTIONS, isLandingState } from './navModel';

/**
 * The view navigation (task 4.5).
 *
 * Two controls, and the distinction between them is the spec's:
 *
 * - **Which cell you are looking at** — the discrete `activeView` value. The comparison entry is
 *   declared unavailable (`navModel.VIEW_OPTIONS`) because its stage lands in M6.
 * - **Back to selection** — the spec's `Back to selection returns to the landing state`. It calls
 *   the store's existing `resetToSelection()`, which clears the isolate, reassembles the cell and
 *   stops any process. No new state and no new action: the button is a second, visible affordance
 *   for the state change the Escape key already performs.
 *
 * The nav publishes its state as `data-nav-view` / `data-landing` so the end-to-end suite can ask
 * "what does the navigation think?" through the same discrete store the render reads, rather than
 * through CSS.
 *
 * It subscribes to four discrete keys and to nothing else. A locale change re-renders the copy and
 * leaves every one of those values untouched, which is what makes the language switch
 * non-destructive from the navigation's side (spec: Language Switch Is Non-Destructive).
 */
export function Nav() {
  const activeView = useAppStore((state) => state.activeView);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const selectedId = useAppStore((state) => state.selectedId);
  const disassemblyTarget = useAppStore((state) => state.disassemblyTarget);
  const processId = useAppStore((state) => state.processId);
  const resetToSelection = useAppStore((state) => state.resetToSelection);
  const t = useT();
  const landing = isLandingState({ selectedId, disassemblyTarget, processId });

  return (
    <nav className="nav" data-nav-view={activeView} data-landing={landing ? 'true' : 'false'}>
      <div className="nav__group" role="group" aria-label={t('nav.view.title')}>
        {VIEW_OPTIONS.map((option) => (
          <button
            key={option.view}
            type="button"
            className="nav__view"
            data-view={option.view}
            aria-pressed={option.view === activeView}
            disabled={!option.available}
            title={option.available ? undefined : t('nav.view.pending')}
            onClick={() => setActiveView(option.view)}
          >
            {t(option.labelKey)}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="nav__reset"
        data-nav-action="back-to-selection"
        disabled={landing}
        onClick={resetToSelection}
      >
        {t('nav.reset')}
      </button>
    </nav>
  );
}
