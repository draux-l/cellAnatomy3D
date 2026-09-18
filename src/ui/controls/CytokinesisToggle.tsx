import { useAppStore } from '../../app/store';
import type { CellId } from '../../catalog/types';
import { CYTOKINESIS_MECHANISMS, activeMechanism } from '../../processes/reproduction/stages';
import { useT } from '../i18n';
import { CYTOKINESIS_DIFFERENCE_KEY, cytokinesisMechanismKey } from './scrubModel';

/**
 * The single-cell cytokinesis phase toggle (task 6.5).
 *
 * The spec's requirement is that the contrast between the two mechanisms is deliverable **inside one
 * view**, so that M3 does not depend on comparison mode landing in M6 — and that the difference is
 * stated in the active language. Both halves are here:
 *
 * - Two buttons, one per mechanism, that write one discrete store value. The animation reads it once
 *   per frame through the process driver, so flipping it mid-sequence changes what is rendered with no
 *   rebuild and no re-render of the canvas. The pressed state is `activeMechanism(cell, setting)` —
 *   the *rendered* mechanism — so the control can never claim a mechanism the frame is not showing.
 * - The difference statement, always rendered while reproduction runs. It is not a tooltip and not a
 *   hover state: the spec says the difference is stated, so it is on screen and it follows the
 *   language switch like every other piece of live copy.
 */
export function CytokinesisToggle({ cell }: { cell: CellId }) {
  const t = useT();
  const setting = useAppStore((state) => state.cytokinesisMechanism);
  const setCytokinesis = useAppStore((state) => state.setCytokinesis);
  const shown = activeMechanism(cell, setting);

  return (
    <div className="cytokinesis" data-cytokinesis-toggle data-mechanism={shown}>
      <span className="cytokinesis__title">{t('process.reproduction.cytokinesis.title')}</span>

      <div
        className="cytokinesis__options"
        role="group"
        aria-label={t('process.reproduction.cytokinesis.title')}
      >
        {CYTOKINESIS_MECHANISMS.map((mechanism) => (
          <button
            key={mechanism}
            type="button"
            className="cytokinesis__option"
            data-cytokinesis={mechanism}
            aria-pressed={mechanism === shown}
            onClick={() => setCytokinesis(mechanism)}
          >
            {t(cytokinesisMechanismKey(mechanism))}
          </button>
        ))}
      </div>

      <p className="cytokinesis__difference" data-role="cytokinesis-difference">
        {t(CYTOKINESIS_DIFFERENCE_KEY)}
      </p>
    </div>
  );
}
