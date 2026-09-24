# cellAnatomy3D

Interactive 3D comparison of an **animal cell** and a **plant cell**: orbit the model, hover an
organelle to highlight it and read its name, click it to isolate it and open a spec sheet.

Educational product for secondary-school biology. Static site, no backend, no runtime API key.

> **Status: cell models being rebuilt.** The catalog currently carries no organelle records and no
> geometry ships, so the viewer renders its lighting rig and inspection mechanisms over an empty
> scene. The shell, the annotation layout solver, the disassembly control and HUD, picking/hover/
> isolate, the spec sheet, i18n, the WebGL fallback and the whole verification harness are in place
> and green; plugging in a model is the remaining step.

## Stack

| Piece | Choice |
| --- | --- |
| Renderer | `three` + `@react-three/fiber` + `@react-three/drei` |
| State | `zustand` (discrete UI state only) |
| Animation | `gsap` timelines for scripted phases, `useFrame` + uniforms for continuous motion |
| Build | `vite` + `typescript` (strict) |
| Unit tests | `vitest` |
| Metrics / E2E | `playwright` + `pngjs` |

Geometry is authored as **committed model assets**; the renderer, tone-mapping and material system
are the shell's, and no procedural geometry ships in this base. Tone mapping is
`THREE.NeutralToneMapping`; ACES is prohibited (it shifts hue and breaks palette-swatch fidelity).

## Commands

```bash
npm install
npm run dev         # vite dev server
npm run build       # typecheck + static build into dist/
npm run preview     # serve the built bundle
npm test            # vitest unit suite
npm run test:e2e    # playwright metric-assertion harness
npm run audit:sizes # single-file / payload size gates over dist/
npm run perf        # write artifacts/perf/report.json from window.__cellDebug
npm run verify      # the full CI gate: build + sizes + unit + metric harness
```

## Verification model

Visual regressions are caught by **metric assertions, not pixel diffs** — animated WebGL makes image
equality fragile across machines. The harness drives the built app through `?fixture=` routes that
freeze the camera pose and the animation clock, then asserts on measured numbers:

- non-blank canvas coverage (≥1%),
- occupied pixel area within ±25% of the committed baseline,
- region colour (hue ≤5°, relative luminance ±20% vs. the baseline),

with thresholds committed in `verify/baselines.json` and screenshots in `artifacts/screens/`.
A deliberate visual change updates those baselines **in the same commit** so the regression stays
review-visible. Draw calls, payload sizes, and file sizes hard-fail CI; frame timing is measured
locally and advisory in CI by design (`artifacts/perf/report.json`).

## Scope

Canonical animal cell and canonical plant cell only. Cilia, flagella, pseudopods, and specialised
cell types are out of scope: adding them would teach a false model.
