import animalCellImage from '../../artifacts/screens/fallback/animal.png';
import plantCellImage from '../../artifacts/screens/fallback/plant.png';
import { useAppStore } from '../app/store';
import { rosterFor } from '../catalog/cells';
import { CELL_IDS, type CellId } from '../catalog/types';
import { FALLBACK_UNAVAILABLE_SURFACES } from './fallbackCopy';
import { useT } from './i18n';
import { LanguageSelector } from './i18n/LanguageSelector';
import type { UiKey } from './i18n/messages';
import { SpecSheetFields } from './SpecSheet';

/**
 * The WebGL-unavailable path (task 4.6, design D9).
 *
 * **A real path, not a stub.** The spec's scenario is a machine where context creation fails, and
 * what it demands is that the app still teaches: a static cell image plus the full bilingual spec
 * sheets, with no blank canvas anywhere on the page.
 *
 * Three decisions carry the weight:
 *
 * 1. **The images are the harness's own screenshots.** They are the deterministic composed-cell
 *    fixtures the Playwright suite renders and reviews, captured with the existing `?fps=off`
 *    control — so the fallback is generated, inspectable evidence rather than a second set of
 *    authored assets that would silently drift from the 3D model. Re-recording them is the same
 *    `UPDATE_BASELINES=1` run that refreshes every other committed render.
 *
 *    **Why a separate capture rather than `artifacts/screens/cell/*.png` directly** (the letter of
 *    design D9): those hero screenshots include the on-screen FPS readout, which is a live
 *    measurement of a renderer this machine does not have. Shipping a picture that says `59.7 FPS`
 *    next to a page that cannot draw a frame would be a false claim about the page it is on, and
 *    the accuracy tie-break applies. Turning the readout off for this one capture removes it; the
 *    render itself is the same fixture with the same seed.
 * 2. **The spec sheets are the same component the 3D path uses.** `SpecSheetFields` is imported,
 *    not reimplemented, so the degraded path cannot disagree with the real one about what a record
 *    says.
 * 3. **What is missing is stated.** Hover, isolate, disassembly and the quiz all
 *    need a renderer; `FALLBACK_UNAVAILABLE_SURFACES` names them and the copy says so. Nothing is
 *    offered that would not work, and nothing is fabricated to fill the space.
 *
 * It renders both cells rather than a single one: without a model there is no camera to switch, and
 * a static page can afford to show the whole lesson at once.
 */

const CELL_IMAGES: Record<CellId, string> = {
  animal: animalCellImage,
  plant: plantCellImage,
};

const CELL_IMAGE_KEYS: Record<CellId, UiKey> = {
  animal: 'fallback.image.animal',
  plant: 'fallback.image.plant',
};

/** The cell name is the navigation's own label, reused rather than duplicated. */
const CELL_HEADING_KEYS: Record<CellId, UiKey> = {
  animal: 'nav.view.animal',
  plant: 'nav.view.plant',
};

export function FallbackView() {
  const locale = useAppStore((state) => state.locale);
  const t = useT();

  return (
    <section
      className="fallback"
      data-fallback="webgl-unavailable"
      lang={locale}
      aria-label={t('fallback.title')}
    >
      <header className="fallback__head">
        {/*
          The language selector lives here as well as in the 3D shell: the spec sheets are bilingual
          content and the degraded path must be able to show both languages. A fallback that trapped
          the user in Spanish would quietly withdraw half the content model.
        */}
        <div className="app__bar">
          <h1 className="app__title">{t('app.title')}</h1>
          <LanguageSelector />
        </div>
        <p className="fallback__lead">{t('fallback.lead')}</p>
      </header>

      <div className="fallback__declarations" data-role="fallback-declarations">
        <h2 className="fallback__heading">{t('fallback.unavailable.title')}</h2>
        <ul className="fallback__list">
          {FALLBACK_UNAVAILABLE_SURFACES.map((key) => (
            <li key={key} className="fallback__item" data-unavailable={key}>
              {t(key)}
            </li>
          ))}
        </ul>
      </div>

      {CELL_IDS.map((cell) => (
        <section key={cell} className="fallback__cell" data-fallback-cell={cell}>
          <h2 className="fallback__heading">{t(CELL_HEADING_KEYS[cell])}</h2>

          <figure className="fallback__figure">
            <img
              className="fallback__image"
              data-fallback-image={cell}
              src={CELL_IMAGES[cell]}
              alt={t(CELL_IMAGE_KEYS[cell])}
            />
            <figcaption className="fallback__caption">{t(CELL_IMAGE_KEYS[cell])}</figcaption>
          </figure>

          <h3 className="fallback__subheading">{t('fallback.sheets.title')}</h3>
          <div className="fallback__sheets">
            {rosterFor(cell).map((record) => (
              <article
                key={record.id}
                className="fallback__sheet"
                data-fallback-spec={record.id}
              >
                <h4 className="fallback__sheet-name">{record.name[locale]}</h4>
                <SpecSheetFields record={record} locale={locale} />
              </article>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
