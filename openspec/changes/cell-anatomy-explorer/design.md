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
