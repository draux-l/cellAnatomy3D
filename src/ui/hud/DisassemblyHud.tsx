import type { MutableRefObject } from 'react';
import { useAppStore } from '../../app/store';
import type { DisassemblyHudTarget } from '../../scene/disassembly';
import { useT } from '../i18n';
import { disassemblyStateKey, formatDisassemblyPercent } from './disassemblyCopy';

/**
 * The disassembly control and its live percentage.
 *
 * React renders this **once per control step** — the range input's `onChange` writes the discrete
 * target — and never per frame. The number the user reads is not React's: the scene's frame loop
 * rewrites `textContent` from the *damped* value, so the readout shows the motion the cell is
 * actually performing rather than the control's destination. That is the same mechanism as the
 * transform loop, which is why the two can never drift.
 *
 * It is its own group (`data-view-control="disassembly"`), outside anything that lists processes:
 * the spec requires the control to read as a view/inspection aid for structure, not as a fourth
 * vital process.
 */
export interface DisassemblyHudProps {
  target: MutableRefObject<DisassemblyHudTarget>;
  /** True under a fixture: the value is pinned and the control must not accept input. */
  frozen: boolean;
}

export function DisassemblyHud({ target, frozen }: DisassemblyHudProps) {
  const t = useT();
  /*
   * The slider subscribes to the discrete target **here**, not in `CellViewer`.
   *
   * The control has to re-render per step to stay controlled, but this component is a DOM sibling of
   * the canvas — outside it. Keeping the subscription local means a slider step re-renders a handful
   * of DOM nodes instead of the whole `<Canvas>` subtree, which is the measured interaction cost.
   */
  const value = useAppStore((state) => state.disassemblyTarget);

  return (
    <div className="view-control" data-view-control="disassembly">
      <div className="view-control__head">
        <span className="view-control__title">{t('view.disassembly.title')}</span>
        <span className="view-control__value">
          <span className="view-control__state" data-role="state" ref={(element) => {
            target.current.state = element;
          }}>
            {t(disassemblyStateKey(value))}
          </span>
          <span className="view-control__percent" data-role="percent" ref={(element) => {
            target.current.percent = element;
          }}>
            {formatDisassemblyPercent(value)}
          </span>
        </span>
      </div>

      <input
        className="view-control__slider"
        data-role="control"
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        disabled={frozen}
        aria-label={t('view.disassembly.control')}
        onChange={(event) => {
          // One discrete store write per control step — the store's own action, not a local
          // mirror, so the guards that hand off from isolation apply here too.
          useAppStore.getState().setDisassembly(Number(event.target.value));
        }}
      />

      <p className="view-control__hint">{t('view.disassembly.hint')}</p>
    </div>
  );
}
