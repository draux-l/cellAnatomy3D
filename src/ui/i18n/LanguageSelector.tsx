import { useAppStore } from '../../app/store';
import { t } from './index';
import { LANGUAGE_OPTIONS } from './messages';

/**
 * The Spanish / English selector (spec: Language Selector).
 *
 * It writes the one discrete `locale` value and nothing else, so switching language is
 * non-destructive by construction: the view, the selection, the phase and the speed are separate
 * keys that this component never touches (spec: Language Switch Is Non-Destructive).
 *
 * Options are labelled with their own endonym, so the label does not move when the UI language
 * changes and a reader who cannot read the current language can still find their own.
 */
export function LanguageSelector() {
  const locale = useAppStore((state) => state.locale);
  const setLocale = useAppStore((state) => state.setLocale);

  return (
    <div className="lang" role="group" aria-label={t('app.language', locale)}>
      {LANGUAGE_OPTIONS.map((option) => (
        <button
          key={option.locale}
          type="button"
          className="lang__option"
          data-locale={option.locale}
          aria-pressed={option.locale === locale}
          lang={option.locale}
          onClick={() => setLocale(option.locale)}
        >
          {t(option.labelKey, option.locale)}
        </button>
      ))}
    </div>
  );
}
