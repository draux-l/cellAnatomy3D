# Design: 3D Cell Anatomy Explorer (Animal vs. Plant)

**Change**: `cell-anatomy-explorer` · **Phase**: design · **Date**: 2026-09-16 · **Updated**: 2026-09-17
**Inputs**: proposal.md, 10 delta specs, exploration.md (rev 2), `.opencode/skills/threejs-cell-modeling/SKILL.md` + both references. All skill Hard Rules are honored; no contradictions found.
**Update 2026-09-17**: folds in the adopted UI-reference requirements (continuous disassembly + live %, persistent bilingual annotations with leader lines, on-screen FPS readout, per-record disassembly vector, annotation ink follows palette, scene-tree render count). Decisions **D13–D18** below extend, and do not rewrite, D1–D12. Declined mockup mechanics (camera telemetry, breadcrumb, left-panel layout) are deliberately absent.

> **Size-budget note**: the sdd-design skill defaults to <800 words. The phase brief requires 10 concrete design decisions with data-model shapes and measurement plans; this document exceeds 800 words deliberately and is kept padding-free. This is the only skill-rule deviation, stated here per contract.

## Technical Approach

Greenfield R3F application (M0–M6 per proposal sequencing). One `<Canvas>`; cells composed procedurally from a **builder registry** driven by a **single organelle catalog** (bilingual content + geometry params + seed). State split: Zustand reactive slice for discrete UI state, transient refs/clock for per-frame values (skill Hard Rule). GSAP timelines for scripted/scrubbable processes, `useFrame` + uniforms for continuous ones. `THREE.NeutralToneMapping` ratified (Engram `decisions/tone-mapping`); ACES rejected. Verification is a Playwright **metric-assertion** harness from M0, not eyeballing and not pixel-diffing.

## Architecture Decisions

### D1 — Stack: React Three Fiber (ratified, per config.yaml design rule)

| Option | Tradeoff | Decision |
|---|---|---|
| Vanilla Three.js | Full control; but this app is a stateful UI (hover/click/sheet/quiz/palette) over one canvas — hand-rolled scene graph + teardown is exactly the boilerplate R3F removes | — |
| **R3F + drei** | +40–60 KB gz and one abstraction; scene is a function of state; drei gives OrbitControls/Html/Environment/ContactShadows | **Chosen** |

Escape hatch preserved: anything hot drops to `useFrame` with direct `Object3D` mutation. Prior art (cclank/cell-architecture-studio, MIT) uses this exact stack. **Given up**: bundle weight, and React reconciliation cost — mitigated by the transient/reactive split (D5) and instancing.

### D2 — Scene architecture: builder registry + organelle host

```
src/
├── main.tsx / App.tsx
├── app/
│   ├── store.ts              # Zustand reactive slice (discrete state ONLY)
│   ├── clock.ts              # ProcessClock singleton (transient, never in React)
│   └── debug.ts              # window.__cellDebug bridge for the harness
├── catalog/
│   ├── types.ts              # OrganelleRecord, Palette, Localized (D3/D4)
│   ├── cells.ts              # animal + plant rosters (ordered inner→outer)
│   ├── palettes.ts           # default + high-contrast palettes
│   └── integrity.ts          # build/test-time validation (fields, bilingual parity, roster)
├── scene/
│   ├── CellViewer.tsx        # <Canvas>, camera, NeutralToneMapping, Environment(1024), ContactShadows
│   ├── CellGroup.tsx         # maps one cell roster → <OrganelleHost> list
│   ├── OrganelleHost.tsx     # one record → builder lookup; registers pickable proxy + anchor
│   ├── builders/
│   │   ├── registry.ts       # BuilderId → React component  ← THE extension point
│   │   ├── primitives.ts     # seeded noise (simplex-noise+alea), MeshSurfaceSampler helpers, merge utils
│   │   └── membrane.ts nucleus.ts mitochondrion.ts chloroplast.ts er.ts golgi.ts ribosome.ts lysosome.ts vacuole.ts wall.ts
│   └── interaction/
│       ├── Picking.tsx       # proxy raycast layer, hover/click dispatch
│       └── useIsolateCamera.ts
├── processes/
│   ├── types.ts              # ProcessDefinition/ProcessInstance contract (D5)
│   ├── registry.ts           # processId → definition  ← movement extension point (D11)
│   ├── nutrition/ movement/ reproduction/
│   └── controls/SpeedControl.tsx ScrubBar.tsx
├── ui/  (SpecSheet, Nav, Labels, PalettePanel, QuizPanel, FallbackView, i18n/)
└── verify/  (playwright specs, metrics.ts, size-audit.mjs, perf-report.mjs)
```

**Scene graph**: `<Canvas>` → `<CellViewer>` → `<CellGroup cell='animal'|'plant'>` → per record `<OrganielleHost record>` → builder component (meshes + invisible **pick proxy** + `Html` label anchor). Each organelle root carries `userData.organelleId`. Techniques per structure come from the skill Decision Gates table verbatim (Lathe/Tube/Extrude/InstancedMesh — no new techniques invented).

**Extension point**: a new organelle = one catalog record + one builder registered in `registry.ts`. `CellGroup`, viewer, palette, quiz, i18n are untouched. Geometry swap (post-MVP GLB, if ever ratified) stays inside the record + builder.

### D3 — Organelle catalog data model (single source of truth)

```ts
type Localized = { es: string; en: string };
type PaletteRole = 'membrane' | 'cytoplasm' | 'nucleus' | 'organelles';
type BuilderId = 'membrane' | 'nucleus' | 'mitochondrion' | /* ... */;

interface OrganelleRecord {
  id: string;                        // stable English id, e.g. 'mitochondrion'
  name: Localized;                   // hover label, spec sheet, quiz
  func: Localized;                   // spec sheet
  size: { value: number; unit: 'µm' | 'nm' };   // approximate size
  funFact: Localized;
  paletteRole: PaletteRole;          // color comes from palette, never the record
  geometry: {
    builder: BuilderId;              // key into builders/registry.ts
    params: Record<string, number | string | boolean>;  // size/detail/count/seed + specific (cristaeCount…)
    seed: string;                    // deterministic identity (spec: Deterministic Scene Reconstruction)
  };
  cells: Array<'animal' | 'plant'>;  // roster membership drives both cells from one record set
  pickable: boolean;                 // quiz/hover participation
}
```

**Why content lives here, not in components**: the record is read by five consumers — hover label (3D), spec sheet (DOM), quiz correct-answer check (`clickedId === promptId`), palette assignment (`paletteRole`), and geometry construction (`geometry`). One edit updates all five; `integrity.ts` (run in CI unit tests) fails the build on missing fields, bilingual gaps, non-canonical roster entries (no cilia/flagella/pseudopods — spec roster requirements), or a builder id with no registry entry. i18n parity check lives in the same gate (spec: No Untranslated String Ships). Technical ids stay English; only `Localized` values are bilingual (spec: Technical Identifiers Stay English).

### D4 — Palette system + swatch-to-render fidelity (spec gap resolved)

```ts
interface LayerColors { membrane: string; cytoplasm: string; nucleus: string; organelles: string; }
interface Palette {
  id: string;
  name: Localized;
  layers: LayerColors;               // swatch = single source; material AND UI read this hex
  background: string; label: string; // label must meet WCAG vs background
  highContrast: LayerColors;         // alternate set, same roles
}
```

**Fidelity — mechanism over magic number.** A single tolerance cannot be honest for a *lit* material: lighting changes lightness by design. So the check is split by pipeline stage:

1. **Pipeline-exact fixture** (`?fixture=swatch`): renders each layer color as a full-canvas unlit quad through the *identical* renderer pipeline (NeutralToneMapping, `SRGBColorSpace`, exposure 1.0). Assertion: sampled pixel equals the swatch within **±2/255 per channel** — effectively exact. This is the real tone-mapping/color-management defect detector.
2. **Lit-scene check** (`?fixture=lit`): sample the organelle region from the standard hero screenshot; assert **hue rotation ≤ 5°** and relative luminance within **±20%** vs the swatch. NeutralToneMapping preserves hue, so lighting tint and AA noise are the only residuals; 5° absorbs them. A hue miss = tone-mapping defect (spec: mismatch is a render defect, not a swatch defect).

Ratified numbers: **±2/255 (unlit fixture), Δhue ≤ 5°, ΔLuminance ≤ 20% (lit)**. These are only defensible *because* NeutralToneMapping is hue-preserving — under ACES no tolerance would pass; that is the recorded justification for the ratified tone mapper, not a new debate.

**High-contrast thresholds — ratified**: WCAG ≥4.5:1 for label text vs background and ≥30% relative-luminance difference between adjacent layer colors. Both are computed **on the palette data model in a unit test** (no render needed → cheap, deterministic), plus the lit-scene screenshot sampling for the "survives tone mapping" scenario. Palette swap is a store action feeding materials via `useMemo`; catalog content and geometry are untouched (spec scenarios hold).

### D5 — Animation architecture: scripted vs continuous, one contract

```ts
interface ProcessDefinition {
  id: 'nutrition' | 'movement' | 'reproduction';
  build(cell: 'animal' | 'plant', ctx: ProcessContext): ProcessInstance;
}
interface ProcessInstance {
  timeline?: gsap.core.Timeline;         // scripted: paused:true, labeled
  update?(elapsed: number, dt: number): void; // continuous: reads ProcessClock, writes uniforms/instances
  phases?: Record<string, number>;       // label → timeline.progress() (reproduction)
  dispose(): void;                       // kills timeline, disposes geometries/materials it created
}
```

- **Scripted (GSAP)**: `gsap.timeline({ paused: true })` with labels. Scrub bar binds `progress()` (input event → `timeline.progress(v)`, zero React re-render); phase buttons call `timeline.seek(label)`; reversible by construction. Speed maps to `timeline.timeScale()`: **pause=0, slow=0.25, realtime=1** (single shared control, store-held).
- **Continuous (`useFrame`)**: one `ProcessClock` singleton (`app/clock.ts`) accumulates `elapsed += dt * speedScale` where `speedScale` mirrors the same pause/slow/realtime value. Photosynthesis light slider writes `uniforms.uLightIntensity` **and** scales the process-rate term on the clock — no React state, no re-render (spec: control drives the clock, not re-renders). Slider at 0 stops light-dependent motion and the UI states "light required" (spec: Zero light is honest).
- **Paradigm discipline** (skill Hard Rule): one mechanism per motion type; no third animation library; no baked clips.

**Sequence — nutrition** (`processes/nutrition/`):
`enterProcess('nutrition') → build instance for cell → respiration: GSAP stage timeline on cristae (ATP particle bursts, no light node anywhere — spec [BC]) | photosynthesis: continuous thylakoid flow + O₂/glucose molecule emission, rate = f(uLightIntensity) → exit → instance.dispose(), base viewer untouched, catalog/selection unchanged.`

**Sequence — reproduction** (`processes/reproduction/mitosis.ts`):
`enterProcess('reproduction') → timeline paused, labels: prophase(0) → metaphase → anaphase → telophase → cytokinesis → play / scrub / seek-by-label / speed → chromosome keyframes enforce [BC] facts (alignment at metaphase, separation only after, two nuclei at telophase) → cytokinesis is authored as TWO DISTINCT motions in one factory: animal = membrane-constriction + ring shrink (contractile furrow), plant = plate mesh growing center-outward (becomes wall) → single-cell phase toggle shows the other cell's mechanism without leaving the view (spec: contrast teaches before comparison).`

**Sequence — movement** (`processes/movement/cyclosis.ts`):
`enterProcess('movement', plant) → continuous: instanced organelle-particle set advected around the vacuole on a toroidal flow field, driven by ProcessClock → slow-motion scales clock only (direction unchanged — spec) → exit → streaming stops, base restored. Animal: registry entry exists with available:false → UI declares "content not yet available" (D11).`

### D6 — Comparison mode: shared camera RATIFIED, shared parent timeline

The spec resolved to one shared camera state; **this design ratifies it**. Rationale: comparison is a *controlled contrast* — two independent orbits let the user lose the alignment that makes the contrast legible. **Given up**: independent zoom on one cell; the answer is "exit comparison" (one click), which the spec's teardown requirement makes cheap.

**Mechanism (no fork of single-cell code)**:

- `activeView === 'comparison'` lazily mounts `<ComparisonStage>` (its own chunk): it renders `<CellGroup cell='animal' layout={left}/>` + `<CellGroup cell='plant' layout={right}/>` — the **same** `CellGroup` used single-cell, offset by symmetric transforms about the origin. One camera; `OrbitControls` target = midpoint; both stay framed under one orbit.
- **Shared timeline**: one parent `gsap.timeline({paused:true})`; each cell's process child timeline is built by the same `ProcessDefinition.build(cell)` factory and added via `parent.add(child, 0)`. Scrub/speed/seek touch **only** the parent. Continuous processes: **one** `ProcessClock`; `ComparisonStage`'s single `useFrame` calls both instances' `update(elapsed, dt)`. Pause/scrub are identical on both sides by construction (spec: no drift).
- **Teardown**: exit unmounts `ComparisonStage`; each `ProcessInstance.dispose()` and `CellGroup` cleanup traverses and disposes geometries/materials builders registered — restores the pre-comparison single-cell state exactly (spec: Teardown Without Leakage). Removal of the comparison chunk leaves the base viewer complete (spec: Independently Deliverable).

**View-switch sequence** (`app/store.ts` drives it):
`selectView(v) → if v==='comparison' React.lazy(() => import('processes/…ComparisonStage')) → mount groups + parent timeline + shared clock → on exit: dispose instances → unmount chunk → restore camera pose, selectedId, process state of the previous single-cell view.`

### D7 — Interaction: proxy raycasting, throttled by design

- **Pick proxies**: each organelle gets an invisible simplified hit volume (bounding ellipsoid/box, ~dozens of tris) on a dedicated raycast layer. Raycasts test ~10 proxies, never the 150k-tri scene. This is the hover-performance mitigation — full-scene raycast against merged organelle meshes is the naive cost, and proxies remove it structurally, not heuristically.
- **Hover**: R3F pointer events already coalesce to one raycast per frame; with proxies the per-frame cost is negligible. `hoveredId` is a **discrete** Zustand value (changes only on enter/leave, never per frame). Highlight = emissive/outline uniform on that organelle's materials; label = drei `Html` at the organelle anchor with catalog `name` in the active locale. Max one highlighted (single `hoveredId`). During a quiz prompt, label rendering and name lookup are suppressed by a `quizActive` guard reading the store (spec: Blind Condition).
- **Click**: pointerdown/up with <5 px travel = click (drag = orbit, no selection — spec). `selectedId` → isolate: dim others (opacity/emissive tween via GSAP — a UI transition, legitimately scripted), camera frames the organelle via `useIsolateCamera` (damped controls-target tween). Spec sheet opens from the catalog record only.
- **Back to selection**: `resetToSelection()` clears `selectedId`, kills running process, tweens camera to the default hero pose, returns to landing nav state. Empty-space click clears isolation (spec).
- **Quiz answer check**: on click during a prompt, `clickedOrganelleId === promptId` — id equality against the catalog; empty space = no answer (spec). Positional memorization defeated by seeded round shuffling (`seededshuffle(promptIds, roundSeed)`), unit-testable (spec: Two rounds differ).

### D8 — Performance budgets → measurement plan (spec numbers made measurable)

Instrumentation from **M0**: `app/debug.ts` exposes `window.__cellDebug = { drawCalls (renderer.info.render.calls, sampled 1 Hz), frameStats (rAF delta ring buffer → p50/p95), firstRenderAt (first `useFrame` timestamp) }`. The harness (`verify/perf-report.mjs`) reads it and emits `artifacts/perf/report.json` committed per milestone.

| Metric | Tool / source | When measured | Gate |
|---|---|---|---|
| Draw calls | `renderer.info` via `__cellDebug` | M0 (static cell), M2/M3 (animation on), M6 (comparison) | **Hard CI fail** if >150/cell, >300 comparison (deterministic, hardware-independent) |
| Frame timing | rAF delta sampler, 10 s with process running | M2 first, M3, M6 | Local reference laptop: **p95 ≥ 55 fps** recorded in report.json; 60 fps re-ratified from M0 baseline. CI runs it **advisory** (shared-runner GPUs jitter — CI cannot honestly gate fps) |
| First 3D paint | `__cellDebug.firstRenderAt` | M0 | ≤ 3 s on CI with 4× CPU throttle (advisory locally verified) |
| Shell payload | `size-audit.mjs` gzips every `dist/` chunk | M0, every build | Shell ≤ 350 KB gz, initial ≤ 2.5 MB — **hard CI fail** |
| Single-file cap | same script | every build | > 25 MB → **hard CI fail** (spec) |
| Tri counts | per-builder report (skill Output Contract) | each organelle | ≤ 25k/organelle, ≤ 150k/cell visible |

**Honesty**: the ≥60 fps target on "the reference laptop" is not CI-verifiable; the design converts it into (a) deterministic CI gates that *can* fail, (b) a committed local measurement per milestone, (c) an M0 baseline from which targets are re-ratified if the mid-tier-laptop assumption was wrong. This fulfills the spec's "met or honestly re-ratified" clause.

### D9 — WebGL capability fallback: graceful degradation (decided)

Hard-require WebGL2 would blank school machines — the exact resilience the proposal flags. **Decision**: detect WebGL2 context creation (`canvas.getContext('webgl2')` probe before mounting `<Canvas>`); on failure render `<FallbackView>`: committed static PNGs of both cells **generated by the verification harness itself** (the deterministic hero screenshots are reused — no double authoring) + the full bilingual spec-sheet browser. Processes, isolate-framing, and quiz are unavailable in fallback (stated limitation; quiz needs spatial clicking). Justified against audience: personal project, secondary school, unknown classroom hardware — teaching survives, spectacle degrades.

### D10 — Verification harness (Playwright + pngjs) — determinism and CI

- **Setup**: Playwright (pinned browser build), viewport **1280×800**, `deviceScaleFactor: 1`, against `vite preview` of a built bundle.
- **Determinism controls** (animated content breaks pixel comparison — addressed head-on):
  1. `?fixture=…` URL params: app freezes the camera at a named pose, freezes the clock (`__CELL_FROZEN_TIME__=0` — `useFrame` receives fixed t; GSAP timelines stay paused at their label), and disables label float animations.
  2. Geometry identity is seed-locked by the catalog (D3) — same record, same render.
  3. **Metric assertions, NOT pixel diffs.** Cross-machine AA/GPU noise makes image equality fragile; instead `verify/metrics.ts` computes per-screenshot: non-blank coverage (≥1% non-background pixels), organelle occupied pixel area within a recorded band (±25% of the committed baseline), swatch-region color (D4 tolerances). Thresholds live in `verify/baselines.json`; a deliberate visual change updates the baseline in the same PR (reviewable diff — this is the regression gate).
- **Coverage gate**: CI enumerates catalog records × cells and fails if any organelle lacks a committed screenshot (`artifacts/screens/{view}/{organelleId}.png`, all committed).
- **Artifacts**: `artifacts/screens/`, `artifacts/perf/report.json`, `verify/baselines.json` — all in-repo, reviewable.
- **CI (GitHub Actions)**: `npm run verify` = build + size audit + unit/integrity tests + Playwright metric suite. Runs on every PR; **host deploy only on merge to main** (spec: deploy quota). `strict_tdd` in config.yaml flips to `true` after M0 lands vitest + Playwright with one passing test each (recommended, not done in this phase).
- **Hover/isolate verification**: `?fixture=hover&organelle=X` sets the hover state directly; assertion = organelle-region mean luminance rises ≥10% vs non-hover baseline AND the label DOM node contains the localized name (makes the spec's "hover highlight" verifiable). Isolate fixture analogously verifies de-emphasis of others + sheet text.
- **Cytokinesis contrast (spec-risk resolution — one explicit override)**: "visually unmistakable" is subjective and not machine-checkable as written. **Override**: the wording is downgraded to *"presented as structurally distinct motions, verified by committed inspected screenshots plus structural metrics"* — animal: membrane-silhouette equatorial constriction ≥15% narrower than the resting width at the cytokinesis label; plant: an opaque central partition band present and absent in the animal frame. Both computed from the frozen-cytokinesis screenshots. If silhouette metrics prove flaky in M3, they are demoted to best-effort and the committed inspected screenshots become the gate — recorded honestly either way.

### D11 — Animal Movement extension point (open user input — nothing speculative designed)

`processes/registry.ts` maps process ids to `ProcessDefinition`s. The animal movement entry **exists today** as `{ id:'movement-animal', available:false }`; the UI renders "content not yet available" (spec: Blocked, Not Invented). When the user supplies reference images + organelles/functions, adding it is: (1) catalog records for any new organelles, (2) builders if new geometry is needed, (3) `processes/movement/animal.ts` implementing `ProcessDefinition`, (4) flip `available:true`. No viewer, store, UI, or i18n-code changes — i18n keys are data. The same registry is how any future process plugs in. M4's animal slice is isolated; everything else proceeds unblocked.

### D12 — WebGL capability/quality tier (runtime)

DPR capped at 2 (drei `AdaptiveDpr`); `<Environment>` at 1024; quality tier drops contact shadows + DPR to 1 if `hardwareConcurrency ≤ 4` or p95 frame time degrades. No LOD, no SSAO, no `transmission` (skill banned list).

---

# Update 2026-09-17 — Disassembly, Annotations, FPS Readout (D13–D18)

M0 landed since the original design: the store/clock/debug split (D5's transient rule) is real code (`src/app/store.ts` guards per-frame keys with `PER_FRAME_KEY_PATTERN`; `src/app/debug.ts` wraps `gl.render` via `attachRendererSampling` because `renderer.info` is reset per top-level render). D13–D18 are designed **against that implementation**, not the paper design.

### D13 — Disassembly: transform-driven, one progress value, mutual exclusion (ratified)

| Option | Tradeoff | Decision |
|---|---|---|
| GSAP timeline per organelle | Scrub "for free" but N timelines + labels for a single scalar; fights the vector data model | — |
| Uniform-driven (shader offset) | GPU-cheap but displaces in view/space hacks; picking proxies, annotations and ContactShadows would desync from CPU-space positions | — |
| **Transform-driven** (`useFrame` writes `group.position` from one progress) | One scalar → per-record offset; annotations, proxies, shadows all follow the *same* Object3D; trivially reversible | **Chosen** |

**Mechanism**: `app/store.ts` gains a **discrete** `disassemblyTarget: number` (0–100, integer steps only — the control writes on `input` change, not per pointermove frame; the key passes the existing `PER_FRAME_KEY_PATTERN` guard because it is a control value, not a frame value). A new `src/scene/disassembly.ts` holds the transient side: a damped current value `current += (target − current) · k·dt` in a single `useFrame` (k ≈ 8/s — fast enough to feel continuous, slow enough to read as motion; pure code constant, not spec-invented). Per organelle host, each frame: `offset = direction · distance · (current/100)` written directly to the organelle root `Object3D.position` — **no React re-render at any frame rate**. Reversibility is structural: the arrangement is a pure function `f(progress, record.vectors)`, so 57% up or down renders identically (spec scenario: same value → same arrangement). **Ratified spec number**: default travel **1.5× the record's own bounding radius** is kept, but demoted from a *viewer constant* to an **authoring aid**: `catalog/vectors.ts` computes it from `Box3` of the built geometry as a suggested value the catalog author may override per record; the record's explicit `distance` (or the computed one at build time) is what renders. The magic number becomes a formula over data the catalog already owns.

**Live % readout**: derived from the *damped current* value in the same `useFrame`, written via direct DOM text mutation (`textContent`) into a HUD node — React state is forbidden by D5/the Hard Rule. Display is rounded to whole percents; text mutation only fires when the rounded value changes (bounded DOM writes).

**Reset / handoff (mutual exclusion — RATIFIED as specced)**: rationale on record — a detached organelle floating inside a displaced cell teaches a false spatial relationship; the accuracy tie-break forbids it. Handoff in `app/store.ts` as two guards, each one line in the existing actions:
- `setSelected(id)` (isolate requested): if `disassemblyTarget > 0`, first set `disassemblyTarget = 0`; the damped value returns to 0 before the isolate camera tween completes.
- `setDisassembly(v)` with `v > 0` while `selectedId !== null`: first `setSelected(null)` (closes sheet, clears isolate).
The `resetToSelection()` action (D7) also forces `disassemblyTarget = 0` (spec: back-to-selection reassembles). No new state machine — mutual exclusion is two preconditions on existing actions, unit-testable in `store.test.ts`.

**Annotation layer during disassembly**: annotations never detach (D14 anchors read the *displaced* world matrix each frame — the anchor rides the moving organelle automatically). At higher disassembly values boxes may crowd; the D14 solver re-runs each frame and simply does what it does — no special disassembly mode. Fixture: `?fixture=disassembly&value=57` freezes the damped current at exactly 57 (fixture sets both target and current, bypassing damping) for deterministic screenshots.

### D14 — Annotation layout: DOM overlay, projected anchors, stable columns

**DOM overlay (not in-canvas)** — the decision that carries the most weight:

| Option | Tradeoff | Decision |
|---|---|---|
| In-canvas (SDF/text geometry) | One render pipeline; but per-glyph texture atlas, blurry text at DPR edges, hand-rolled layout, and leader lines consume draw calls against a ≤150 budget already at 13+ per cell | — |
| **DOM overlay** | Crisp bilingual typography free (CSS), leader lines as SVG in the same overlay, layout via plain array math; cost = one `getBoundingClientRect`-free projection per frame | **Chosen** |

Cost control is the whole design: the annotation layer is **one absolutely-positioned DOM subtree** (`src/ui/annotations/AnnotationLayer.tsx`) whose per-frame updates are **direct style/textContent mutations from a single `useFrame`** — zero React re-renders (Hard Rule), zero draw calls, text quality identical to the spec-sheet typography. React renders the layer **once** per discrete change (organelle set, locale swap, quiz suppression, palette ink), never per frame.

**Per-frame pipeline** (single `useFrame` in `AnnotationLayer`, after the scene updates):
1. **Project**: for each visible organelle, anchor world position (record's declared `anchorOffset` transformed by the organelle root's **current, displaced** `matrixWorld` — attachment during orbit *and* disassembly is automatic) → `Vector3.project(camera)` → CSS pixels.
2. **Occlusion**: one raycast per anchor against the pick-proxy layer (≤10 proxies, D7 cost) — occluded ⇒ leader+anchor ink at **50% opacity** (ratified below), label stays 100% (spec: stated, not hidden).
3. **Solve**: assign columns, stack boxes, compute leader endpoints (below).
4. **Write**: `transform: translate3d` per label, `d` per SVG path, opacity per group — only when a value changed since last frame (no layout thrash; SVG path attr writes are cheap).

**Bilingual block** (i18n-content `Bilingual Annotation Rendering Order`): two `<span>`s from the record's own `name` — primary = `store.locale` name, uppercase via CSS `text-transform`, secondary = the other locale below at smaller size. Locale swap toggles which span is primary **in place** (React re-render on the discrete `locale` change only; anchor position is per-frame and unaffected). No separate copy exists anywhere (spec: both lines are the record's `name` values).

**Column assignment with hysteresis**: organelle's projected x vs viewport centre with a **±5% viewport-width hysteresis band** (ratified: it is ~64 px at 1280 — roughly the label-block half-width, so a label does not thrash while its own box straddles the centre; smaller bands re-flip inside one label's width, larger bands pin labels on the wrong side at rest). Once assigned, a column flips only when the projected x *exits* the band on the other side. Assignment state lives in a module-level `Map<organelleId, 'left'|'right'>` (transient, not React).

**Non-crossing solver** — ordered projection, not per-pair negotiation:
1. Sort each column's annotations by anchor screen-y.
2. Stack boxes top→down with a minimum vertical gap **4 px** (ratified: at 1280×800, ~10 annotations must fit in ~700 px of usable height; 4 px is the smallest gap that never reads as touching at 1× DPR while keeping total stack height under budget — larger gaps would force off-screen pushing sooner).
3. If the stack would exceed the column height, compress gaps proportionally down to 4 px, then shift the whole column; boxes are clamped inside the viewport (spec: nothing off screen).
4. Leader = two-segment elbow: from the anchor, a short radial stub toward its column side, then a horizontal run into the box edge. **Two-segment elbows in side-sorted columns cannot cross** when every anchor in a column projects to the same side (hysteresis guarantees this): horizontal runs are disjoint by the 4 px stacking, stubs fan out from distinct anchors. Cross-column crossing is impossible by column separation. This is the mechanism that makes the spec's zero-crossing invariant *structural* rather than negotiated — and it is assertable: the harness reads the leader paths from the debug bridge and tests segment-pair intersection (below).

**Occlusion**: the ≤50% opacity threshold is **ratified** as a floor (`occludedOpacity = 0.5`): below 50% the de-emphasis stops reading as "same annotation, farther" and starts reading as a different, disabled element; above ~60% an occluded anchor reads as attached to front-surface geometry, mis-teaching depth. 50% is also the conventional ghost/floor value in HUD design, so it needs no tuning.

**Hover emphasis (spec MODIFIED in place)**: `hoveredId` (existing discrete store value, D7) drives emphasis — label text ink → full palette `label` + weight bump, leader line 1.5→2 px, anchor square scales ~1.3× — via a class toggle on the one label node (discrete change → one React render). It **composes with** the organelle highlight (emissive tween, D7): mesh highlight + annotation emphasis are two effects of one `hoveredId`. **No label node is created or removed** on hover (spec scenario). During `quizActive`, the whole layer unmounts (existing guard).

**Interaction with isolate/disassembly**: on isolate, other annotations de-emphasize to the occluded opacity and the isolated organelle's annotation stays full ink (reads as "you are here"); on disassembly everything follows per the D13 rule. Layout invariants hold at every value because the solver runs every frame from projected reality.

**Ink**: all leader lines, anchors and text take `palette.label` (appearance-theming `Annotation Ink Follows The Palette`); the WCAG ≥4.5:1 unit check (D4) extends to the same role — one palette field, one gate.

### D15 — FPS readout: read the sampler, never sample twice

The readout is a **DOM projection of `__cellDebug.frameStats`** — the exact object the harness reads. One `setInterval` at **2 Hz** (ratified ≤4 Hz cadence; 2 Hz reads as live without implying precision that a rolling p50 does not have) copies `frameStats.p50Fps` into the HUD node via `textContent` (zero React). **No second sampler exists** — truthfulness is structural: the displayed number *is* `p50Fps` over the same 600-frame ring buffer the harness reports.

| Threshold | Verdict | Rationale |
|---|---|---|
| Rolling window ≥500 ms | **Changed** → "the existing 600-frame ring buffer (~10 s at 60 fps, less when slow)" | A second window would be a second sampler — the spec forbids divergence. Reuse is the mechanism; the ≥500 ms floor is automatically satisfied by construction |
| Cadence ≤4 Hz | **Ratified** at 2 Hz | p50 over ~10 s changes slowly; faster is noise, slower is dishonest lag |
| ±10% agreement | **Ratified** | With one sampler it is trivially 0% — the tolerance only guards an implementation that accidentally forks the path; the frozen-fixture check (D17) asserts it anyway |

Below-target values display as measured (M0: p50 ≈28 fps) — hiding, clamping or substituting is forbidden by spec and by design there is simply no code path that could.

**Scene-tree render count** (spec demand, does not exist today): `app/debug.ts` gains `sceneRenders: number`, incremented inside the existing `attachRendererSampling` wrapper **only** when `scene === mainScene` — consistent with the M0 fix (auxiliary passes from `<ContactShadows>`/`<Environment>` are excluded because they render different scenes). This measures the no-per-frame-re-render contract: HUD updates, annotation writes and FPS ticks must leave `sceneRenders` unchanged over an idle window (spec scenario), and D14/D15's zero-React-frames claim becomes assertable rather than asserted.

### D16 — Data model: `disassembly` per record (no silent default)

```ts
interface DisassemblyVector {
  direction: [number, number, number]; // unit vector, cell-origin-relative
  distance: number;                    // scene units at 100%
}
interface OrganelleRecord {
  // …existing D3 fields…
  disassembly: DisassemblyVector;      // REQUIRED — no optional, no default
}
```

**Integrity gate** (`catalog/integrity.ts`): for every record — `disassembly` present; `direction` normalizable (‖v‖ > 1e−6); radial component `dot(direction, normalize(recordPosition))` ≥ 0 (outward or zero — inward fails, naming the record); `distance ≥ 0`. A **zero-length direction with distance 0** is the *explicit* "never separates" choice (spec: envelope); omission is a build failure naming id + field. Consequence: **every** existing and planned record — the M0 mitochondrion included — must carry the field before M1a merges; the M0 record gets a one-line addition, not an exception. Comparison view inherits vectors unchanged (same records — spec: same record, same vector, every view).

### D17 — Verification enablement for the new specs

| New spec surface | Fixture / mechanism | Assertion |
|---|---|---|
| Disassembly continuity + reversibility | `?fixture=disassembly&value=N` (N ∈ {0, 25, 57, 100}) — freezes target *and* damped current at N | Occupied-pixel area grows monotonically with N; render at N=0 after a 100→0 round-trip is byte-identical to the committed 0% baseline (existing harness determinism) |
| Live % readout | same fixture; read HUD DOM | textContent === `${value}%` with the localized state word |
| Mutual exclusion | fixture sets value=60, then dispatches isolate | disassembly reads 0 and isolate active; symmetric direction via E2E |
| Annotations attached while orbiting/disassembling | stepped fixtures (orbit yaw sweep × disassembly values) | anchor leader endpoint stays within a small px radius of the projected anchor position at every step |
| No crossings / no overlap / gap ≥4 px / inside viewport | read leader `d` attributes + label boxes from the debug bridge (`__cellDebug.annotations` — per-frame solver output mirrored on write) | segment-pair intersection count === 0; box-overlap count === 0; min pair gap ≥4 px; all boxes within viewport — at every step. **Layout invariants become committed metrics, not eyeballs** |
| Column hysteresis | orbit fixture crossing centre slowly | column flip count ≤1 across the sweep |
| Occlusion ≤50% | occluding pose fixture | sampled leader-line pixel alpha in the occluded range vs the 100% baseline |
| FPS truthfulness | frozen fixture; harness reads `frameStats` and HUD text | |HUD − sampler| / sampler ≤10% (expected 0% — same source); `sceneRenders` unchanged over an idle 10 s window with the readout live |
| Render count contract | idle window, readout on vs off | counts equal (spec scenario, via D15's `sceneRenders`) |

All of this lands in the existing Playwright metric suite — no new runner, no pixel-diffing.

### D18 — Milestone impact (M1 re-slicing + shell budget)

M1 was sliced catalog/builders/scene/UI. The new work re-slices it; nothing moves out of M1:

| Slice | Original | Now also carries | Est. added lines |
|---|---|---|---|
| PR 2 (M1a) | catalog + i18n | `disassembly` field + integrity checks (D16) + **code-splitting pass** (three.js chunk lazy-loaded — verify report: 23 KB headroom left, single chunk today) | +80, split ≈±0 net |
| PR 3/4 (M1b/c) | builders | `vectors.ts` default travel computation from built geometry (D13) | +40 |
| PR 5 (M1d) | scene + interaction | **disassembly transform loop + HUD % (D13), annotation layer + solver (D14), FPS readout (D15), `sceneRenders` + `annotations` debug surfaces (D15/D17)** | +550 |
| PR 6 (M1e) | UI + fallback | annotation i18n in-place swap, ink-from-palette plumbing (M5 palette lands later; the *plumbing* — reading `palette.label` — is M1 so annotations are not hard-coded ink) | +120 |

**Re-slicing verdict**: M1's five-PR shape survives; **PR 5 grows from ≈400 to ≈950 lines** and now exceeds the 800-line review budget *alone*. Recommendation carried to tasks: split PR 5 into 5a (disassembly + HUD) and 5b (annotations + readouts). The M1 line forecast (≈3,000) rises to **≈3,800**.

**Shell budget — honest risk statement**: the shell is at 326.7/350 KB gz with **no code split** (verify report WARNING 2). D14/D15 add ~0 KB to the shell (annotation layer is plain DOM/SVG + math; readout is a `setInterval`). D13 adds the disassembly loop to the 3D chunk, not the shell. The annotation *typography* adds CSS only. The binding risk is unchanged but tighter: **if the M1a code-splitting pass slips, M1b–M1e cannot land** — the catalog + scene code has nowhere to go. The split is therefore promoted from "recommended" to a **hard prerequisite of PR 3**, and `size-audit.mjs` gains a shell-gate assertion *after* the split (shell must drop to ≤150 KB gz with three.js excluded — the number to re-ratify at split time, since it is a new architectural fact, not a spec number).

## Data Flow

```
catalog/cells.ts ──→ CellGroup ──→ OrganelleHost ──→ builders/registry ──→ meshes+proxy+label
      │                                                                    │
      │                    (read-only, per record)                          │ pointer events
      ▼                                                                    ▼
catalog/palettes.ts ──→ materials (useMemo)          Zustand store (discrete: view, selectedId,
      ▲                                              hoveredId, process, speed, palette,
      │                                              locale, quiz) ←→ ui/ panels
 store.palette action ───────────────────────────────┘
                                                      │ transient (refs/singleton, never React)
                              ProcessClock ──→ useFrame ──→ uniforms / GSAP progress
                                   ▲
                  speed control / scrub bar / light slider (write)
```

## File Changes

Greenfield — all Create. Load-bearing set: `src/catalog/types.ts`, `src/catalog/cells.ts`, `src/catalog/palettes.ts`, `src/catalog/integrity.ts`, `src/scene/CellViewer.tsx`, `src/scene/CellGroup.tsx`, `src/scene/OrganelleHost.tsx`, `src/scene/builders/*` (10 + registry + primitives), `src/scene/interaction/Picking.tsx`, `src/processes/types.ts`, `src/processes/registry.ts`, `src/processes/{nutrition,reproduction,movement}/*`, `src/app/{store,clock,debug}.ts`, `src/ui/*`, `verify/*` (playwright specs, `metrics.ts`, `size-audit.mjs`, `baselines.json`), GitHub Actions workflow. Full tree in D2.

**Added by the 2026-09-17 update** (all Create unless noted):

| File | Action | Description |
|------|--------|-------------|
| `src/scene/disassembly.ts` | Create | Damped progress + per-frame offset writes (D13) |
| `src/catalog/vectors.ts` | Create | Travel-distance computation from built geometry (D13) |
| `src/ui/annotations/AnnotationLayer.tsx` | Create | DOM/SVG annotation overlay + per-frame solver (D14) |
| `src/ui/annotations/solver.ts` | Create | Column assignment, stacking, elbow leaders — pure functions, unit-testable (D14) |
| `src/ui/hud/FpsReadout.tsx` | Create | 2 Hz DOM projection of `frameStats` (D15) |
| `src/app/store.ts` | Modify | `disassemblyTarget` + mutual-exclusion guards (D13) |
| `src/app/debug.ts` | Modify | `sceneRenders` counter + `annotations` mirror (D15/D17) |
| `src/app/fixture.ts` | Modify | `disassembly` fixture name + `value` param (D17) |
| `src/catalog/types.ts` | Modify | `DisassemblyVector` on every record (D16) |

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit (vitest, from M0) | catalog integrity (fields, bilingual parity, roster rules, builder-id resolution); palette WCAG ≥4.5:1 + ≥30% layer luminance deltas; quiz seeded shuffle differs per round; geometry determinism (build twice from same seed → identical vertex count + position hash) | pure data/geometry tests, no browser |
| Visual/metric (Playwright + pngjs) | non-blank coverage; per-organelle pixel-area band; swatch fixture ±2/255; lit hue ≤5°; hover luminance +10% + label text; cytokinesis silhouette metrics; per-organelle screenshot coverage | `?fixture=` frozen deterministic routes |
| Performance | draw calls (hard gate), frame p95 (local, committed), first 3D paint, payload sizes | `window.__cellDebug` + `size-audit.mjs` |
| E2E smoke | navigate Animal→Plant→Comparison→back; language switch mid-paused-anaphase stays at anaphase; quiz round completes; exit-comparison restores state | full app, no fixtures |
| Unit (added by update) | disassembly vector integrity (present, normalizable, outward-or-zero, distance ≥0); mutual-exclusion store guards; solver invariants (no crossing, no overlap, gap ≥4 px, in-viewport, column stability) as pure-function tests | `integrity.ts`, `store.test.ts`, `solver.test.ts` |
| Visual/metric (added by update) | disassembly monotonic area + byte-identical return to 0%; leader crossing/overlap/gap metrics at stepped values; occlusion opacity; FPS agreement; `sceneRenders` idle contract | D17 fixtures + `__cellDebug` surfaces |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary in the product. The app is a static SPA with zero runtime command execution; CI scripts are build tooling, not product surface. (Recorded per skill Step 2a; no manufactured tasks.)

## Milestone Mapping

| Decision | Milestone |
|---|---|
| D10 harness, D8 instrumentation, D1 scaffold, D9 detection, test runner | **M0** (landed 2026-09-17) |
| D2 scene architecture, D3 catalog, D7 interaction, i18n infra, D12 DPR cap, **D16 vectors, D13 code-split prerequisite** | **M1a–c** |
| **D13 disassembly + HUD %, D14 annotations, D15 FPS readout + sceneRenders, D17 fixtures** | **M1d–e (re-sliced per D18: PR 5 → 5a/5b)** |
| D5 nutrition (respiration scripted, photosynthesis continuous, light slider), D8 first frame-time measurement | **M2** |
| D5 reproduction timeline, scrub/speed, cytokinesis contrast + its metrics | **M3** |
| D11 movement extension point consumed (plant cyclosis now; animal when user supplies content) | **M4** |
| D4 palettes + fidelity checks + high-contrast, D7 quiz wiring | **M5** |
| D6 comparison (shared camera + parent timeline + teardown) | **M6** |

## Migration / Rollout

No migration (greenfield). Rollback per proposal: each milestone is a separate PR slice; revert reverts. Baseline changes to `verify/baselines.json` must accompany any deliberate visual change in the same PR so regressions are review-visible.

## Open Questions

- [x] ~~M0 must record the first perf baseline~~ — done; **p50 ≈28 / p95 ≈9 fps, below target**; user deferred the target question; the D15 readout keeps the miss user-visible.
- [ ] Cytokinesis silhouette metrics may prove flaky — M3 decides metric-gate vs inspected-screenshot-gate (D10 states the demotion path).
- [ ] Animal Movement content: user-owned input, blocks only M4's animal slice.
- [ ] Post-split shell budget (D18): the ≤150 KB gz post-split shell number is a proposal to re-ratify when the split actually lands in M1a.
- [ ] Solver quality on the plant cell (large vacuole + wall = few, large annotations): expected to fit trivially; verify with the stepped fixtures in M1d.

---

# Update 2026-09-23 — Mesh-Geometry Path (D19–D28)

**Scope change**: the maintainer has decided to replace the procedural cell geometry with imported GLB models. D1–D18 above are **unchanged** and continue to govern everything they govern; the mesh path reuses their mechanisms wherever possible and this section records where and how, not a rewrite. Estimates below inherit D18's calibration discipline (naive × 3.0–4.3×).

> **Skill Hard-Rule departures (stated explicitly, per phase brief)**: `.opencode/skills/threejs-cell-modeling/` says "Geometry is procedural Three.js code. No `.glb` assets, no Blender" and bans "Downloading `.glb` organelle assets" (references/performance-and-rendering.md). The maintainer's mesh decision **overrides both** — the procedural path stays as the codified fallback (D27), which is also how `Asset-Swap Readiness` ("procedural geometry SHALL remain the permanent fallback") stays honored without a spec contradiction. Every other Hard Rule still binds: NeutralToneMapping, no ACES, no baked clips, no second canvas, no per-frame React state, accuracy over spectacle, static hosting.

> **Threat matrix**: still `N/A` (same reason as the original design — no routing/shell/subprocess/VCS boundary). Adding a static-model loader introduces no new boundary: GLBs are data fetched at runtime like any other static file.

### D19 — Catalog model: discriminated geometry union (ratified)

| Option | Tradeoff | Decision |
|---|---|---|
| Optional mesh field beside `builder` | Smallest diff; but every consumer must null-check `mesh`, and a record with both filled (or neither) compiles — the "no silent defaults" gate cannot express that structurally | — |
| Optional new record field (`meshRef?`) | Splits two facts about one thing across the record | — |
| **Discriminated union on `geometry.kind`** | Exhaustive type check forces every consumer to handle both kinds; integrity gate branches on `kind` and includes the *exhaustiveness* itself as a test (an unknown `kind` fails naming the field) | **Chosen** |

```ts
type GeometrySpec =
  | { kind: 'procedural'; builder: BuilderId; params: Record<string, ParamsPrimitive>; seed: string }
  | { kind: 'mesh'; mesh: MeshAssetRef; fallback: BuilderId };  // procedural builder id — the runtime fallback (D27)

interface MeshAssetRef {
  /** Record placement comes from the measured mesh centre; the placement override stays top-level. */
  cell: CellId;                       // which model the mesh lives in
  node: string;                       // GLB node name — stable, human-auditable (D20)
  materialKey: MaterialKeyName;       // catalog vocabulary (moved to types.ts; primitives re-exports)
}
```

- The 11 existing records migrate mechanically: each gains `kind: 'procedural'` (explicit — no defaulting, per D16's precedent). Cost: ~11 one-line edits + the gate branch, roughly **40 authored lines**, zero behavioral change, all existing tests pass untouched.
- **Integrity extensions** (`catalog/integrity.ts`, same failure style — name record + field):
  - `kind` present and one of the two values; every existing check applies only to `procedural`.
  - For `mesh`: `mesh.cell` must be one of `CELL_IDS`; `mesh.node` non-empty; `mesh.node` must exist in the model manifest for that cell (manifest injected as data, same pattern as `registeredBuilderIds`) and map to this record's id; `materialKey` must be in the declared key list; **`materialKey` must not collide across records sharing one cell** except where the design intends shared keys; `perCell.*.geometryParams` is rejected on mesh records (there are no builder params to merge); `perCell.*.position` stays permitted.
  - A missing/unknown mesh reference fails the build naming `geometry.mesh.node` and the record id. No silent default anywhere.
- **Deterministic identity** replaces the seed: `geometry.mesh` carries the model sha256 transitively via the manifest's `modelHash`; a test asserts the served file's hash equals the manifest value, so "same record, same render" holds for meshes exactly as the seed held it, and **re-optimization cannot land silently**.
- **Spec-requirement notes (not amended here)**: `Deterministic Scene Reconstruction`'s "built from a named seed" extends to "or hashed model data" — an sdd-spec amendment for that capability. `Asset-Swap Readiness` holds as written.

### D20 — Loader + addressing: one loader per cell, name-keyed manifest, build-time verifier

- **Runtime**: `GLTFLoader` (three 0.186 already in the tree) + `MeshoptDecoder` (the optimized GLBs are gltfpack/meshopt output — 4.63/2.62 MB from 28/50 MB), `EXT_texture_webp` is supported natively by GLTFLoader. The loader module lives in the lazy 3D chunk; **the shell ≤150 KB gz budget is untouched** (GLTFLoader + Meshopt decoder ≈ +25–45 KB gz into the chunk — estimate, not measured).
- **Files at runtime**: `public/models/animal-cell.glb` / `public/models/plant-cell.glb`, fetched per cell **only when that cell is first rendered** (never in the shell chunk; comparison fetches the second model on demand, D25). **Nothing references or commits the `.glb` files in this phase** — they stay in gitignored `references/models/`; Phase A lands the copy/validation wiring with the files still absent, and the import is unblocked only by the licensing decision (Open Question L1).
- **Addressing**: by node **name** for both models, not by index. Plant names are the organelle vocabulary themselves (`chloroplast.out`, `rough.ER`). Animal names are material-derived (`Nulo__Material.013_0`) — meaningless *semantically*, but still **stable strings** that the audit script records; numeric indices shift whenever an optimizer merges/splits nodes, names survive any tool that preserves names at all. Nodes are referenced by the *record* (`geometry.mesh.node`), not scavenged out of the scene at render time.
- **Stability contract** — honest version: *no scheme fully survives re-optimization*; the design survives it **loudly** instead. `verify/model-audit.mjs` (build step, `@gltf-transform/core` devDependency, Node-only) reads the committed GLB, asserts every manifest node name exists with a unique node id, and emits a mesh inventory diff. A re-optimization changes the sha256 → the test fails naming the model → the maintainer re-runs the identification map and reviews the manifest diff. Silent breakage is structurally impossible.
- **Why a manifest (not per-code lookup)**: mapping animal mesh name → (record id, materialKey, omit flag) is 21 rows of *data* that Phase B authors once; keeping it in one file is the diff surface a re-audit produces.

### D21 — Materials: GLB materials discarded, catalog roles assigned per mesh

**Both models need this and the plant one is a measured blocker**: its single shared material renders at **2.6 fps** (`alphaMode: BLEND` + `doubleSided`) and carries a `TT_checker_512x512_UV_GRID` Substance placeholder — a UV grid, not organelle colour. **The loader discards every GLB material and texture**; materials come from the palette system.

- Reuse the existing vocabulary: the manifest assigns each mesh an existing `OrganelleMaterialKey` (`nuclearEnvelope` for animal mesh [4], `nucleolus` for [2], `membrane` for [11], `granule` for the three ribosome meshes, …). The handful of keys missing mesh owners are added to the factory once, all following the measured recipes already in `materials.ts`: shells = `createShell(color, opacity)` (FrontSide, `depthWrite:false`, no transmission — the +34% plant fix and the animal shell measurements are why this is **mandatory**, not stylistic), bodies = `createBody`.
- Per-mesh material assignment is manifest data (`node → materialKey`), so the animal's 16 material-index materials collapse into ~4 role recipes + per-mesh keys, and the plant's single checker material is replaced by 14 keyed assignments.
- **Palette compatibility comes free**: a record's `paletteRole` already drives the palette system, and material *keys* are hosted from the M0 colors table; when M5's per-layer palettes land (8.1), the mesh materials receive colors exactly the way builder materials do — **zero selector code change**. The mesh-path variant declarations (opacity/flatShading where a mesh needs to differ from its key's recipe) are, if needed, manifest data too — never palette literals in scene code.
- Fidelity note: the swatch-lit fixture (`?fixture=lit`) samples the *palette role* regions; on mesh cells the sampled mesh is whichever mesh carries the role's material key, so the fidelity checks in D4/M5 keep running unchanged.

### D22 — Disassembly vectors for meshes: computed once at authoring time, committed as data

| Option | Tradeoff | Decision |
|---|---|---|
| Runtime-computed from loaded mesh bounds | No authoring step; but a network/level difference silently changes the exploded view; the harness's byte-identical 100→0 round-trip now depends on asset fetch state | — |
| **Audit-script computes → author reviews → catalog commits** | One more authoring artifact; determinism guaranteed by construction — the vector is frozen data like every other record field after it ships | **Chosen** |

`verify/model-audit.mjs` computes each mapped mesh's `boundsOf`-equivalent center (relative to the normalized cell origin) as the suggested direction and `suggestedDistance`'s **1.5× bounding radius** as the suggested travel — reusing `catalog/vectors.ts`'s existing pure functions (they accept any position-asset source; a parsed GLB mesh satisfies it) — then emits a *suggestion file*. The author reviews, satisfies the outward-radial rule, and commits the values into `cells.ts` per record exactly as today's hand-authored vectors ship. Runtime keeps `travelDistanceFor(record)` untouched — the spec's "no literal displacement values in viewer code" and "same record, same vector, every view" both hold because nothing computes at runtime. Task 3.12's aid is not replaced; it gains a second caller.

### D23 — Cell-frame normalization (scale + orientation) per model, not per record

- **One frame per model**, in the manifest: `{ file, sha256, scale, rotation, center }` — the animal's ≈590-unit bbox → scale ≈ 0.5/295 (target: outer envelope radius ≈ 1.0 scene unit); the plant's ≈180 → scale ≈ 0.5/90. Estimated to ~20% accuracy here; the audit script snaps them and the integrity gate asserts each cell's membrane/envelope record's rendered bounds land in a **radius band 0.9–1.1** (a pure post-load check, deterministic).
- Orientation: a single rotation value per model fixes Sketchfab's up-axis as needed and is asserted by the band check above (a wrong axis flares the bbox, tripling the non-longest axis). Verified once by screenshot in Phase D, then frozen.
- **Interaction with `position`/`perCell`**: the model's internal layout becomes the assembled-truth source for mesh cells. The audit script writes the measured mesh centre × scale as each record's `position` (and as a `perCell.{cell}.position` override where the two cells' placements differ, e.g. nucleus: animal near-centre vs plant pressed to the periphery). D16's gate then applies *unchanged* against the actual placements — including its per-cell override branch, which is exactly the code path this uses.

### D24 — Scene assembly: reparenting loader + unchanged host/picking/anchors

- `OrganelleHost` stays the seam; it gains a `mesh` branch (`MeshOrganelleHost` inside the same file or a sibling). A per-cell `useCellModel(cell)` loader (module-level cache keyed by `{cell, sha256}`) loads once and hands each record its node list; the host **reparents** those meshes under the record's root group (`name={record.id}`, `userData.organelleId`), assigns cloned keyed materials (the existing `localMaterials` pattern, so per-organelle hover respect works untouched), and computes the anchor from the record-side **bounding box of its own meshes** (top-centre, same rule as builders) rather than one mesh's granule — which incidentally fixes the known instanced-anchor wart.
- **Picking: keep the proxies.** 14–21 named meshes tempt a direct raycast, but the animal scene is 239,902 tris and the animal's three ribosome meshes overlap in layers — per-tri raycasting is both slow and ambiguous. The configured PickVolume on this record's own mesh bounds costs dozens of tris, keeps the `≤10 proxies` annotation-occlusion cost, and keeps `isOuterEnvelope` semantics (membrane/cytoplasm/cell-wall bounds → envelope). Proxies remain children of the organelle root, so disassembly follows automatically.
- **Budgets after assembly (estimates)**: draw calls/cell ≈ 17–25 (against the ≤150 hard gate, comfortable); triangles per cell 85k–240k (against the ≤150k guideline, **plant ok, animal over — recorded as a re-ratification item, not hidden**); installed materials ≈ 4 palette-role shaders + clones (material *compile* count drops vs today's 18-key table because fewer shader variants are used).
- **Assembly order**: roster order (inner → outer) no longer means anything to a mesh (positions are baked); `CellGroup` keeps iterating the roster to build one host per *pickable record* and mounts the model's root as a sibling managed frame. Debris/omitted meshes (D26) render as part of the model root with no record — present, unpickable, unannotated — or are hidden by manifest flag.

### D25 — Payload budget re-ratification (stated plainly)

**The models total 7.25 MB against a configured initial-payload budget of 2.5 MB (≈3× over). This change ends the app's zero-download character and the maintainer should ratify it knowing that.**

| Strategy | Initial payload | Where the weight goes |
|---|---|---|
| Both models eager | ~7.5–8.5 MB | Every visitor downloads both cells' models immediately |
| **Selected cell only, compare-on-demand** | **≈4.5–5.5 MB** cold start (shell ≈0.15 + chunk ≈1.0–1.3 + one model 2.6–4.6); the second model fetches only when the user switches/compares | Bandwidth cost follows *use*; comparison pays the second download |
| Tighter assets (Draco/meshopt round 2, KTX-Basis) | ≈3.5–4.5 MB | Additional re-optimization risk — the manifest survives it loudly, but every re-opt is an identification-map re-audit; not part of Phase A |

**Recommendation**: "selected cell only" loading, with the initial-payload budget re-ratified in `build-verify/Payload Budget` from ≤2.5 MB to **≤6 MB before first 3D render, ≤6.5 MB total static assets, shell and 25 MB per-file caps unchanged** — sdd-spec authors the amendment (this design does not amend specs). `size-audit.mjs` gains a models row. Honest framing for the user: the landing shell still paints fast, the classroom still works on school Wi-Fi, but the first 3D paint budget ("≤3 s") must also be re-measured against the model fetch, and the honest Miss is likely; Phase D ratifies a measured number with range, not a promise.

### D26 — Ambiguous animal meshes: identified meshes lead, unmapped meshes are hidden by flag

- **Policy (recommended, pending maintainer decision on OQ-3)**: only meshes with a catalog mapping render as annotated/pickable geometry. The 3 debris meshes and the 7 low-confidence small bodies are hidden by manifest `omit: true` / `unmapped: true` flags — present in the file, absent from the rendered cell. No invented labels, no generic "misc organelle" record (an unlabeled floating blob teaches nothing and breaks quiz discipline; the accuracy tie-break forbids it). Nothing here *omits* geometry to deceive: the omitted set is the specks and the pieces no one can identify confidently.
- **The bigger problem the map surfaced**: the high+medium identification set contains **no mitochondrion mesh** — the canonical roster requires `'mitochondrion'`. The mesh-cell animal model, as identified today, would teach a cell without mitochondria. **Resolution path (Phase B decision for the maintainer)**: (a) re-examine mesh [15] (angular magenta, "lysosome? Golgi vesicles?") against a named mitochondrion render, or (b) adopt the **hybrid cell** the union already supports — animal cell uses GLB meshes for identified organelles and keeps the proven procedural mitochondrion record (`kind:'procedural'` in the mesh cell's roster) — or (c) accept the identification honestly as unproven and disassemble only identified structures. (b) requires no new machinery; (a) is one audit re-render.
- Maintainer decisions required before Phase B: deal with each of the 7 low-confidence bodies (omit → default), the 3 debris meshes (omit → recommended), the mitochondrion question (b recommended), and whether the animal's chromatin mesh [0] maps to a new roster entry (**new record + spec roster change**) or is hidden.

### D27 — Procedural path fate: permanent per-record runtime fallback, plus the WebGL fallback unchanged in kind

- **Not deleted, not secondary**: the mesh variants carry `mesh.fallback: BuilderId` and the loaders' failure path (`fetch` error, decode error, missing file) logs loudly and builds every unmapped record procedurally — the app keeps teaching instead of blanking (the same resilience rationale as D9). The `OrganelleBuild` API and the whole builder registry survive untouched; `?fixture=organelle` routes stay byte-identical, so committed per-organelle baselines survive Phase A–C entirely.
- **Fallback path (WebGL unavailable)**: unchanged mechanism — static PNGs from the harness. What changes in Phase D is *which* composed screens they are generated from (the mesh cell instead of the procedural cell), which is a re-capture, not a design change.
- Consequence to state honestly: two geometry presentations of the same anatomy now exist. Palette, labels, disassembly, quiz, and spec sheet must behave identically under both; the harness gains one "which geometry produced this screenshot" recorded per baseline row (`geometrySource: 'mesh' | 'procedural'`) so future regressions can't be misattributed.

### D28 — Four-phase integration plan (with verification)

Each phase is deliverable and revertible on its own; each names its verification. Line estimates are **authored changed lines**, calibrated per the tasks.md 3.0–4.3× discipline.

| Phase | Content | Verified by | Est. lines |
|---|---|---|---|
| **A — Mesh geometry path** | `GeometrySpec` union + `MeshAssetRef` types; manifest vocabulary in `types.ts`; integrity-gate branches (kind, cell, node↔manifest, materialKey, `geometryParams` rejected on mesh records); the 11-procedural-record migration (`kind:'procedural'`); `useCellModel` loader (GLTFLoader + Meshopt, per-cell lazy fetch, `EXT_texture_webp`); per-record procedural fallback on load failure wired through `OrganelleHost`; design/spec delta notes appended (no spec artifacts authored here) | vitest integrity matrix (each injected defect names id+field); typecheck; the organelle fixture suite remains byte-identical; a fixture proves a missing model logs `meshLoadErrors` and renders procedurally | **2,000–5,000** |
| **B — Catalog mapping + per-mesh materials** | `verify/model-audit.mjs` (names/tris/bounds/sha dump + manifest validation); the committed mesh manifest (mapping + `omit` flags + material keys) for 14 plant + identified animal meshes; records updated to `kind:'mesh'` with `mesh.cell/node/materialKey` + `fallback: BuilderId`; mesh material assignments via existing recipes; **maintainer sign-off on D26's open items happens at the start of B** | a build step that fails if the manifest mismatches the GLB (sha + node names + one-mesh-only assignment); model-audit bounds report committed; per-record disassembly *suggestion* sheet (not yet wired); material-key coverage test | **1,500–3,500** |
| **C — Scene assembly** | `MeshOrganelleHost`: reparenting + cloned keyed materials + anchors from mesh bounds; `CellViewer`/`CellStage`/`CellGroup` mesh route; pick proxies on mesh bounds; cell-frame normalization + the radius-band gate; catalog `position`/`perCell` from audit suggestions; disassembly over mesh records (both mesh and hybrid cells) | fixture screenshots of both mesh cells inspected (mandatory — unverified otherwise); pick/hover/isolate E2E against each cell; disassembly fixtures (area monotonicity, byte-identical 100→0) over the mesh cell; anchor attachment assertions | **1,000–2,500** |
| **D — Verification + budget re-ratification** | Composed-screenshot re-captures (mesh cells become the hero); baselines updated in the same PR; `size-audit` model rows + the new payload budget in effect; perf re-ratification report (fps with catalog-material shaders at 1.5 DPR cap, first-3D-paint including model fetch); the fallback PNGs re-captured from mesh cells; estimate swing recorded honestly | `npm run verify` green with the new gates; the perf report committed; budget re-ratification recorded as the carry into the sdd-spec amendment for `Payload Budget` | **600–2,000** |

**Post-phases validation reality check**: the plant at catalog materials should land near its 23.9 fps opaque/FrontSide measurement for 85k tris (the 1.16M-tri measurement suggests headroom); the animal at ~20 fps today must contain roughly "equal or better" with fewer compiled materials, but it is the material count and overdraw that decide, not the triangles. The ≥60 fps target will not be met on the reference laptop by the measured models; Phase D's re-ratification report must say that plainly (D8-style: the miss is recorded, not tortured).

Additionally — Open Questions introduced by this update:

- [ ] **L1 (BLOCKER)**: Licensing/rights of both source GLBs is unresolved — no import, reference, or commit of the models may happen until it resolves. Blocks Phase B's repo placement step; Phases A–C are authored to be usable without it.
- [ ] OQ-1: Payload budget number (D25's ≤6 MB / ≤6.5 MB proposal) — keeper ratifies or amends the range before Phase D.
- [ ] OQ-2: FPS re-ratified target — current measures are 17.3–23.9 fps; the ≥60 target and the honest M2 baseline are re-ratified in D.
- [x] OQ-3 (mitochondrion clause): **RESOLVED 2026-09-24** — the animal model does contain mitochondria as meshes [13]+[14]; see the correction section below. The ambiguity policy half of OQ-3 (meshes [15], [10]) remains open, decided at the top of Phase B.

---

# Correction 2026-09-24 — Mitochondrion Found; Hybrid Recommendation Invalidated (amends D19–D28)

**A reader who saw the previous version must see what changed.** The 2026-09-23 D19–D28 section was built on a false finding: that the animal model had **no mitochondrion**. That finding was wrong. The mitochondrion exists as **two cooperating meshes**, and the earlier identification dismissed part of it as "debris" because it rendered small in a scaled-down contact sheet. Visual inspection of a contact sheet alone produced a false negative; what resolved it:

1. reading every material's `baseColorFactor`, 2. computing spatial distances between mesh bounding-box centres, 3. **rendering mesh combinations** (`?show=13,14`) — the decisive test. Method lesson recorded in Engram (`references/glb-animal-part-map`, rev 2) and below.

| Statement in D19–D28 | Status | Correction |
|---|---|---|
| Hybrid animal cell recommended (D26 option b: GLB meshes + **procedural** mitochondrion) | **INVALIDATED** | Both models are now **pure mesh** — every canonical animal organelle, mitochondrion included, is sourced from the GLB. No procedural geometry is mixed in. Option (a)-style re-render and option (b) hybrid are both moot; the roster is satisfiable from the model |
| "high+medium identification set contains no mitochondrion mesh" (D26) | **FALSE** | Mitochondria = mesh **[14]** (outer membranes) + mesh **[13]** (cristae) |
| Mesh [14] classified as debris to omit (D26 omit list) | **RETRACTED** | [14] is 5–6 purple (`#5328ba`, `Material.008`, bbox 408×299×534) membrane shells scattered across the cell — not debris |
| Mesh [13] listed as unidentified loose object | **RESOLVED** | [13] is the mitochondrial **cristae** (`#c7641f`, `Material.007`, orange ribbled capsule, 79×32×35); renders inside the [14] shells exactly matching the maintainer's reference image |
| OQ-3 "animal mitochondrion question (a/b/c)" | **CLOSED** | An animal record `mitochondrion` of `kind:'mesh'` is now required and possible; the a/b/c fork ceases to exist. The remaining OQ-3 half is the ambiguity policy for meshes [15] and [10] only — a **2-mesh** question, not the 4-plus-3 one D26 described |
| D21/D22/D23 mesh-mapping line counts | **Unchanged in substance** | Two extra manifest rows ([13], [14] mapped instead of omitted); the "handful of keys" note already covers new material keys |
| Phase B estimate (D28) | **No range change** | Catalog mapping is *simpler* — the procedural mitochondrion never has to be authored into a mesh-cell roster, and no hybrid fallback wiring beyond what D27 already mandates. Removed work is small and inside both the A and B ranges; the 2,000–5,000 / 1,500–3,500 line ranges stand |

## Verified full animal part map (supersedes all prior versions)

`[2]` nucleus · `[3]` nucleolus · `[4]` nuclear envelope with pores · `[5][6][7][8]` chromatin/chromosomes inside the nucleus · `[11]` cell membrane · `[12]` Golgi · **`[13]` mitochondrial cristae · `[14]` mitochondrial outer membranes** · `[16]` endoplasmic reticulum · `[17][18][19]` ribosomes · `[20]` cytoplasm (named in the file) · `[0]` cell-spanning branching network (cytoskeleton, medium confidence) · `[15]` (purple tubes/rings, `Material.026` `#8c317e`, 164×82×115) and `[10]` (green blob, `Material.1` `#219600`, 90×63×103) **unresolved — the only remaining identifications** · `[1]`, `[9]` genuine debris.

## Decision D29 — The mitochondrion is one record referencing two meshes

`OrganelleRecord` (D3) assumed one geometry source. Amended:

```ts
type GeometrySpec = /* … */
  | { kind: 'mesh'; meshes: readonly MeshAssetRef[];  // ≥1 — D19's single `mesh` widens, structure is unchanged
      fallback: BuilderId };
```

**Choice**: one catalog record `mitochondrion` whose `geometry.meshes` holds two refs — `[14]` (membrane, its key drives the record's pickable body) and `[13]` (cristae).
**Alternatives rejected**: two separate records (`mitochondrion-membrane`, `mitochondrion-cristae`) — breaks the canonical roster's single `mitochondrion` id, doubles quiz/label/sheet surface for one anatomical structure, and D16's per-record disassembly vector would separate the cristae from its own membranes (biologically false and a false spatial lesson — the accuracy tie-break forbids it); merging the meshes at load time — complicates reparenting (D24) for no benefit and breaks per-mesh material keys.
**Rationale**: anatomy (one organelle, two shell layers), roster integrity (exactly one `mitochondrion` record), and disassembly coherence (cristae travel with their mitochondrion, like D14's anchor). Integrity gate per D19: every entry's `node` exists in the manifest; entry `materialKey`s must not collide across *records* (two keys inside this one record are intended and explicitly allowed); `meshes` non-empty — an empty array fails naming record + field. Disassembly: one vector per record, measured from the **union** of its meshes' bounds (D22's computation runs over `boundingBox.setFromObjects([...])`). Anchor: same union rule as D24's bounds-based anchor.
