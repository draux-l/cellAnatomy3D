import { useEffect, useRef } from 'react';
import { cellDebug } from '../app/debug';
import { useAppStore } from '../app/store';
import type { CellId } from '../catalog/types';
import { processLight, LIGHT_MAX, LIGHT_MIN } from '../processes/light';
import { useT } from './i18n';
import {
  PROCESS_OPTIONS,
  formatLightPercent,
  processHasLightControl,
  processInstanceStageKey,
  processInstanceTitleKey,
} from './processModel';
import { SpeedControl } from './controls/SpeedControl';

/**
 * The process panel: entry, exit, speed and light (tasks 5.1/5.4).
 *
 * Four things live here, and each has one owner:
 *
 * 1. **Which process is running** — the discrete store value, written by a press. Nutrition starts
 *    only when the user enters it (spec: `Speed Control And Clean Exit`); the other two are listed
 *    and disabled, because their milestones have not landed.
 * 2. **Speed** — `SpeedControl`, which writes the same discrete `speed` the processes read.
 * 3. **Light** — an **uncontrolled** range input. Its `input` event calls `processLight.setPercent`,
 *    which is the transient light state, so moving the slider costs no React render at all: the
 *    shader reads the value through the process driver. Its position on mount is read from the light
 *    state, so leaving and re-entering the process does not silently reset it.
 * 4. **What the processes are doing** — a read-only projection of `__cellDebug.processes`, written by
 *    one interval at `PROCESS_READOUT_INTERVAL_MS` through `textContent` and `data-active`. No React
 *    state, no per-frame render: the same mechanism the FPS readout and the disassembly HUD use.
 *
 * **The zero-light statement is part of the requirement, not a nicety.** With the slider at zero the
 * light-dependent animation stops, and this panel says in the active language that light is
 * required — so a viewer never sees a halted process and concludes it is still working slowly.
 */

/**
 * How often the readout is refreshed.
 *
 * 8 Hz: four times the rate at which the scripted timeline changes labels (its shortest beat is
 * ~1.6 s), and slow enough that the DOM writes are bounded. It is a *read*, so the cadence cannot
 * affect what is being read.
 */
export const PROCESS_READOUT_INTERVAL_MS = 125;

/** The sub-processes a row can show. Declared, so the panel's DOM never grows per frame. */
export const PROCESS_ROWS = ['respiration', 'photosynthesis'] as const;

interface RowTargets {
  root: HTMLElement;
  stage: HTMLElement;
}

interface PanelTargets {
  rows: Map<string, RowTargets>;
  lightValue: HTMLElement | null;
  lightRequired: HTMLElement | null;
}

function createTargets(): PanelTargets {
  return { rows: new Map(), lightValue: null, lightRequired: null };
}

function cellForView(activeView: string): CellId {
  return activeView === 'plant' ? 'plant' : 'animal';
}

export function ProcessPanel() {
  const t = useT();
  const activeView = useAppStore((state) => state.activeView);
  const processId = useAppStore((state) => state.processId);
  const setProcess = useAppStore((state) => state.setProcess);
  const cell = cellForView(activeView);
  const lightControl = processHasLightControl(processId, cell);
  const targets = useRef<PanelTargets>(createTargets());
  // The last text written per node, so a DOM write happens only when a value actually changes.
  const lastWritten = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const timer = window.setInterval(() => {
      const node = targets.current;
      const written = lastWritten.current;
      const entries = cellDebug.processes;

      for (const [id, row] of node.rows) {
        const entry = entries.find((candidate) => candidate.id === id);
        const active = entry !== undefined;
        const nextActive = active ? 'true' : 'false';

        if (row.root.dataset.active !== nextActive) {
          row.root.dataset.active = nextActive;
        }

        const text = entry ? t(processInstanceStageKey(entry)) : '';
        const key = `stage:${id}`;

        if (written.get(key) !== text) {
          written.set(key, text);
          row.stage.textContent = text;
        }
      }

      if (node.lightValue) {
        const text = formatLightPercent(processLight.percent);
        const key = 'light:value';

        if (written.get(key) !== text) {
          written.set(key, text);
          node.lightValue.textContent = text;
        }
      }

      if (node.lightRequired) {
        // The honest state is *measured*: some running instance reports that it is stopped for lack
        // of light. A panel that invented the condition from the slider position would be free to
        // disagree with the animation.
        const required = entries.some((entry) => entry.lightRequired);
        const text = t('process.light.required');
        const key = 'light:required';

        if (written.get(key) !== text) {
          written.set(key, text);
          node.lightRequired.textContent = text;
        }

        if (node.lightRequired.hidden === required) {
          node.lightRequired.hidden = !required;
        }
      }
    }, PROCESS_READOUT_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [t]);

  return (
    <section className="process-panel" data-process-panel>
      <div className="process-panel__head">
        <span className="process-panel__title">{t('process.title')}</span>
        {processId === null ? null : (
          <button
            type="button"
            className="process-panel__exit"
            data-process-action="exit"
            onClick={() => setProcess(null)}
          >
            {t('process.exit')}
          </button>
        )}
      </div>

      <div className="process-panel__options" role="group" aria-label={t('process.title')}>
        {PROCESS_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className="process-panel__option"
            data-process-id={option.id}
            aria-pressed={option.id === processId}
            disabled={!option.available}
            title={option.available ? undefined : t('process.pending')}
            // Pressing the running process again exits it: one control, two states, no second way to
            // reach a state the exit button already owns.
            onClick={() => setProcess(option.id === processId ? null : option.id)}
          >
            {t(option.labelKey)}
          </button>
        ))}
      </div>

      {processId === null ? null : (
        <>
          <div className="process-panel__rows">
            {PROCESS_ROWS.map((id) => (
              <div
                key={id}
                className="process-panel__row"
                data-instance={id}
                data-active="false"
                ref={(element) => {
                  if (!element) {
                    targets.current.rows.delete(id);
                    return;
                  }

                  targets.current.rows.set(id, {
                    root: element,
                    stage:
                      element.querySelector<HTMLElement>('[data-role="stage"]') ??
                      element.appendChild(document.createElement('span')),
                  });
                }}
              >
                <span className="process-panel__instance">{t(processInstanceTitleKey(id))}</span>
                <span className="process-panel__stage" data-role="stage" />
              </div>
            ))}
          </div>

          <SpeedControl />

          {lightControl ? (
            <div className="process-panel__light" data-light-control>
              <div className="process-panel__light-head">
                <label className="process-panel__light-label" htmlFor="process-light">
                  {t('process.light.title')}
                </label>
                <span
                  className="process-panel__light-value"
                  data-role="light-value"
                  ref={(element) => {
                    targets.current.lightValue = element;
                  }}
                >
                  {formatLightPercent(processLight.percent)}
                </span>
              </div>
              <input
                id="process-light"
                className="process-panel__slider"
                data-role="light"
                type="range"
                min={LIGHT_MIN}
                max={LIGHT_MAX}
                step={1}
                // Uncontrolled on purpose: the value lives in the transient light state, so moving the
                // slider never re-renders React and never competes with the shader for the value.
                defaultValue={processLight.percent}
                aria-label={t('process.light.title')}
                onInput={(event) => {
                  processLight.setPercent(Number(event.currentTarget.value));
                }}
              />
            </div>
          ) : null}

          <p
            className="process-panel__warning"
            data-role="light-required"
            hidden
            ref={(element) => {
              targets.current.lightRequired = element;
            }}
          />
        </>
      )}
    </section>
  );
}
