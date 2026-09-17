import { getRecord } from '../catalog/cells';
import type { OrganelleRecord } from '../catalog/types';
import type { Locale } from '../app/store';
import { useAppStore } from '../app/store';
import { useT } from './i18n';
import { formatOrganelleSize } from './specSheetModel';

/**
 * The spec sheet (task 4.5, spec: `Click Isolate And Spec Sheet`).
 *
 * **Every value on the sheet is a field of the catalog record.** The sheet owns the labels and the
 * layout, never the content: `name`, `func`, `size` and `funFact` are read from the record at
 * render time, so editing one record updates the annotation label, this sheet and (in M5) the quiz
 * with no other file changing (spec: Single Source Of Truth).
 *
 * The record also carries fields that are **not** shown — `id`, `position`, `geometry`,
 * `paletteRole`, `disassembly`, `cells`, `pickable`. They are the model's internals, not the
 * learner's content: a secondary-school reader needs the name, the function, the size and the fun
 * fact, and rendering a disassembly vector would be noise at best. "All fields from the record" is
 * therefore read as *all of the record's educational fields*, and the four are exactly the set the
 * requirement names.
 *
 * `SpecSheetFields` is exported separately because the WebGL-unavailable fallback renders the same
 * four fields for every organelle (task 4.6). One definition of "the sheet" means the degraded path
 * cannot drift from the real one.
 */

export interface SpecSheetFieldsProps {
  record: OrganelleRecord;
  locale: Locale;
}

/**
 * The four educational fields, in the order a reader needs them.
 *
 * The `data-spec-field` attributes are the sheet's own state written to the DOM, so the
 * end-to-end suite can compare what the user reads against the catalog record it came from.
 */
export function SpecSheetFields({ record, locale }: SpecSheetFieldsProps) {
  const t = useT();

  return (
    <dl className="spec-sheet__fields" lang={locale}>
      <div className="spec-sheet__row">
        <dt className="spec-sheet__label">{t('spec.field.name')}</dt>
        <dd className="spec-sheet__value" data-spec-field="name">
          {record.name[locale]}
        </dd>
      </div>
      <div className="spec-sheet__row">
        <dt className="spec-sheet__label">{t('spec.field.function')}</dt>
        <dd className="spec-sheet__value" data-spec-field="func">
          {record.func[locale]}
        </dd>
      </div>
      <div className="spec-sheet__row">
        <dt className="spec-sheet__label">{t('spec.field.size')}</dt>
        <dd className="spec-sheet__value" data-spec-field="size">
          {formatOrganelleSize(record.size, locale)}
        </dd>
      </div>
      <div className="spec-sheet__row">
        <dt className="spec-sheet__label">{t('spec.field.funFact')}</dt>
        <dd className="spec-sheet__value" data-spec-field="funFact">
          {record.funFact[locale]}
        </dd>
      </div>
    </dl>
  );
}

/**
 * The panel, bound to the store.
 *
 * It renders nothing until an organelle is isolated, which is what makes "clicking empty space
 * closes the sheet" a consequence of `selectedId` rather than a separate close path.
 *
 * It subscribes to `selectedId` and `locale`. Neither is a per-frame value, and a language change
 * re-renders this copy while leaving the selection, the framing and the annotation anchors exactly
 * as they were (spec: Language Switch Is Non-Destructive).
 */
export function SpecSheet() {
  const selectedId = useAppStore((state) => state.selectedId);
  const setSelected = useAppStore((state) => state.setSelected);
  const locale = useAppStore((state) => state.locale);
  const t = useT();
  const record = selectedId === null ? undefined : getRecord(selectedId);

  if (!record) {
    return null;
  }

  return (
    <aside
      className="spec-sheet"
      data-spec={record.id}
      lang={locale}
      aria-label={t('spec.title')}
    >
      <header className="spec-sheet__head">
        <h2 className="spec-sheet__title">{t('spec.title')}</h2>
        <button
          type="button"
          className="spec-sheet__close"
          data-spec-action="close"
          aria-label={t('spec.close')}
          onClick={() => setSelected(null)}
        >
          ×
        </button>
      </header>

      <SpecSheetFields record={record} locale={locale} />
    </aside>
  );
}
