# Tasks: 3D Cell Anatomy Explorer (Animal vs. Plant)

**Change**: `cell-anatomy-explorer` · **Phase**: tasks · **Date**: 2026-09-17 (update; original 2026-09-16)
**Inputs**: `proposal.md`, 10 delta specs (updated 2026-09-17), `design.md` (D1–D18), `openspec/config.yaml`, `.opencode/skills/threejs-cell-modeling/SKILL.md` + both references, `verify-report.md` (M0, PASS WITH WARNINGS), M0 source (`src/app/{store,debug,fixture}.ts`).

> **This is an update, not a re-plan.** M0 tasks 1.1–1.8 are **implemented and verified** (7 PASS / 2 PARTIAL / 0 FAIL) and are preserved verbatim, now ticked. D13–D18 and the 9 new/changed spec requirements are absorbed as new tasks. Nothing is renumbered.

> **Size-budget note**: the sdd-tasks skill defaults to <530 words. The phase brief requires per-task capability + spec-requirement traceability **and** an explicit verification for every task, across 10 capabilities and 7 milestones. This artifact exceeds 530 words deliberately and is kept padding-free. This is the only skill-rule deviation, stated here per contract.

> **Threat matrix**: design records `N/A` — the product is a static SPA with no routing, shell, subprocess, VCS/PR automation, or executable-file boundary. No RED security-test tasks are generated because none apply.

> **Ordering**: milestones follow the proposal (M0→M6). Every task names its **capability**, the **spec requirements** it satisfies, and its **verification**. Tests travel with the code they cover. Phase 4's numeric order is not its execution order — the **PR boundary labels inside Phase 4 are authoritative** (5a → 5b → 6).

> **Stack note**: no task depends on an unratified stack decision — D1 (R3F + drei + Zustand + GSAP), D2, and the D13–D18 mechanics are ratified.

> **Task count**: the prior artifact held **58** tasks (8+4+11+8+5+7+4+5+5+1), not 56 as the phase brief stated; `verify-report.md` independently recorded `task_progress 0/58`. This update adds **21** and holds it to **79** (per-milestone grading below).

---

## Spec Defect Report — requested investigation

**Claim under review** (reported by the design phase): `specs/organelle-catalog/spec.md` contains a visibly corrupted scenario block — duplicated/mangled lines under the scenario `Inward directions are rejected`.

**Verification result: NOT REPRODUCED.** The block on disk is well-formed and complete. Raw inspection of lines 108–112 (`sed` + `cat -A`, byte-level, not a rendered view):

```
#### Scenario: Inward directions are rejected

- GIVEN a record whose direction points toward the cell centre
- WHEN the catalog integrity check runs
- THEN it fails and names the record
```

- File is 112 lines; the scenario is the last block and terminates the file cleanly.
- Directory-wide scan: `Inward directions` occurs **exactly once** (`grep -rn`, line 108). No duplicate scenario, no mangled continuation, no repeated GIVEN/WHEN/THEN pair.
- The trailing assertion string occurs exactly once (`grep -c` → 1).
- The only structural oddity in `Disassembly Vector Per Record` is cosmetic: the two blockquote notes (integrity-test implication, ratified 1.5× number) sit **between** the requirement paragraph and its scenarios. That is unusual placement, not corruption, and it does not change meaning.

**Action taken: none.** Per the phase contract I do not write or fix spec artifacts, and nothing here needs fixing. **No task below treats any corrupted text as authoritative**; the authority for disassembly is design **D13/D16** and the requirement `Disassembly Vector Per Record`, whose text is coherent as written. If a corrupted revision existed, it was not the revision on disk at this phase — the design report should be treated as referring to a stale/transient state.

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | **≈31,000 authored changed lines (additions + deletions), range 28,000–38,000** — excludes generated PNG goldens and `package-lock.json` |
| 400-line budget risk | **High** |
| Chained PRs recommended | **Yes** |
| Suggested split | **13 PRs**: PR 1 (M0, done) → PR 2–4 (M1a–c) → **PR 5a + PR 5b** (M1d, split) → PR 6 (M1e) → PR 7 (M2) → PR 8 (M3) → PR 9 (M4) → PR 10–11 (M5) → PR 12 (M6) |
| Delivery strategy | ask-on-risk |
| Chain strategy | **stacked-to-main** (locked by the user) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Reasoning for the revision (this is the point of the forecast)

The prior forecast said ≈7,000 lines and ≈8.75× the 800-line configured budget. **M0 falsified it by 4.4×**: PR 1 was estimated at ≈1,000 and delivered **4,399 authored changed lines**. Two corrections follow, and neither is optional:

1. **Apply the measured miss to the remaining slices.** The old M1–M6 projection (≈6,000) was produced by the same estimating process that missed M0 by 4.4×. I use a central **3.4×** multiplier rather than 4.4×: M0 carried one-off weight (three toolchains, CI, scaffold, first baseline) that later slices do not repeat, and test/screenshot authoring scales sublinearly with slice size. M1's builders/annotations slices are the least favourably calibrated and are shown separately. Range 3.0×–4.3×.
2. **Add the D13–D18 scope increment at 2× the design's own estimate.** D18 projected +890 lines across M1. Design line estimates come from the process that produced the ≈1,000/M0 estimate, so +890 is taken as ≈+800 naive and calibrated as part of M1 below rather than trusted at face value. The revised naive M1 is therefore ≈3,800, not 3,000.

**Per-milestone estimate (authored changed lines, same measure as M0's 4,399):**

| Milestone | Naive est. | Calibrated | Basis |
|---|---|---|---|
| M0 (delivered, not estimated) | 1,000 | **4,399 actual** | verified PR-1 changed lines |
| M1 — catalog, i18n, **code-split**, 10 builders, scene, interaction, **disassembly + HUD**, **annotations + solver**, **FPS readout**, UI, fallback | 3,800 | **≈12,900** | 3.4×; 6 PRs ≈2,150 each; largest slice, highest test/screenshot density |
| M2 — nutrition (respiration, photosynthesis, light slider, frame measurement) | 700 | **≈2,400** | 3.4× |
| M3 — reproduction (5-label timeline, keyframes, scrub, two cytokinesis motions, metrics) | 850 | **≈3,000** | 3.5× — structural metrics are iteration-heavy |
| M4 — movement, plant cyclosis only (**animal slice BLOCKED**) | 350 | **≈1,200** | 3.4× |
| M5 — theming + quiz + **annotation-ink extension** | 1,200 | **≈4,100** | 3.4× |
| M6 — comparison (lazy stage, shared parent timeline, teardown) | 700 | **≈2,400** | 3.4× |
| Cross-cutting — baselines, smoke suite, debug surfaces, repo hygiene | 250 | **≈850** | 3.4× |
| **M1–M6 + cross-cutting subtotal** | **7,850** | **≈26,850** | |
| **Total incl. M0** | **8,850** | **≈31,000** | ≈39× the 800-line configured budget |

**Honest statement**: at ≈31,000 lines over 13 PRs the average PR is ≈2,400 lines — **every PR in this plan exceeds the 800-line configured budget**, and no PR is close to it. Even the smallest remaining slice (M4 plant cyclosis) is forecast above 1,000. Chained delivery is the only viable shape; the 13-PR stack is the plan, not a negotiation. The numbers are deliberately uncomfortable because M0's evidence says comfortable numbers were wrong by 4.4×.

**Chain strategy — `stacked-to-main` (locked)**: slices are strictly sequential (harness → catalog → builders → scene/disassembly → annotations → UI → processes → comparison), each must merge before the next can pass `npm run verify`, and the proposal's rollback plan returns the previous `dist/` by reverting one merge. Because this is stacked to `main`, PR 5b's base is PR 5a's merged state; if a child diff shows its parent's changes, the base is wrong and must be retargeted/rebased before review.

### Suggested Work Units

| Unit | Goal | Likely PR / base | Focused test command | Runtime harness | Rollback boundary |
|------|------|------------------|----------------------|-----------------|-------------------|
| 1 | M0 scaffold, runners, CI, first organelle | PR 1 (done) | `npm test && npm run build && node verify/size-audit.mjs` | `vite preview` + `?fixture=organelle&id=mitochondrion` | Revert PR 1 — greenfield |
| 2 | M1a catalog, bilingual rosters, integrity, i18n, **`disassembly` field**, **code-split** | PR 2 / `main` | `npx vitest run src/catalog src/ui/i18n` | `N/A` — pure data + a build/payload assertion; no scene consumer yet | Revert PR 2 — no builder/scene depends on it |
| 3 | M1b shared-organelle builders + `vectors.ts` | PR 3 / PR 2 | `npx playwright test verify/specs/organelle.spec.ts -g "membrane\|nucleus\|mitochondrion\|ribosome\|lysosome"` | `?fixture=organelle&id=<id>` | Revert PR 3 — builders + their screenshots only |
| 4 | M1c plant + network builders | PR 4 / PR 3 | `npx playwright test verify/specs/organelle.spec.ts -g "er\|golgi\|chloroplast\|vacuole\|wall"` | `?fixture=organelle&id=<id>` | Revert PR 4 — independent of PR 3's builders |
| 5 | **M1d-1**: scene assembly, pick proxies, hover/isolate, camera nav, **disassembly + HUD %** | **PR 5a** / PR 4 | `npx playwright test verify/specs/interaction.spec.ts verify/specs/disassembly.spec.ts` | `?fixture=disassembly&value={0,25,57,100}`, `?fixture=isolate&organelle=X` | Revert PR 5a — viewer falls back to PR 3/4 static cell; annotation layer never existed here |
| 6 | **M1d-2**: **annotations + solver + FPS readout + `sceneRenders`/`annotations` debug surfaces + layout/FPS assertions** | **PR 5b** / **PR 5a** | `npx vitest run src/ui/annotations && npx playwright test verify/specs/annotation.spec.ts verify/specs/hud.spec.ts` | orbit-sweep × disassembly-step fixture matrix | Revert PR 5b — removes overlay + readout; disassembly (5a) stays functional |
| 7 | M1e spec sheet, view switching, ES/EN copy, fallback, **annotation i18n swap + ink plumbing** | PR 6 / PR 5b | `npx playwright test verify/specs/ui.spec.ts verify/specs/fallback.spec.ts` | Full app E2E, no fixture | Revert PR 6 — panels + fallback only; scene/annotations unaffected |
| 8 | M2 nutrition — respiration, photosynthesis, light slider | PR 7 / PR 6 | `npx vitest run src/processes && npx playwright test verify/specs/nutrition.spec.ts` | `?fixture=process&id=nutrition&cell=plant&light=100&t=0` | Revert PR 7 — `processes/nutrition/*` + registry line |
| 9 | M3 mitosis timeline, scrub/seek, cytokinesis contrast | PR 8 / PR 7 | `npx playwright test verify/specs/reproduction.spec.ts` | `?fixture=process&id=reproduction&label=cytokinesis` | Revert PR 8 — `processes/reproduction/*` + controls |
| 10 | M4 plant cyclosis + declared-unavailable animal entry | PR 9 / PR 8 | `npx playwright test verify/specs/movement.spec.ts` | `?fixture=process&id=movement&cell=plant&t=<n>` | Revert PR 9 — `processes/movement/cyclosis.ts` + registry entry |
| 11 | M5a palettes, swatch fidelity, high-contrast, **annotation-ink checks** | PR 10 / PR 9 | `npx vitest run src/catalog/palettes && npx playwright test verify/specs/palette.spec.ts` | `?fixture=swatch&palette=high-contrast`, `?fixture=lit` | Revert PR 10 — `catalog/palettes.ts` + palette UI; default survives |
| 12 | M5b quiz engine, blind guard, seeded shuffle | PR 11 / PR 10 | `npx playwright test verify/specs/quiz.spec.ts` | Full app E2E quiz round | Revert PR 11 — `ui/QuizPanel.tsx` + quiz store slice |
| 13 | M6 comparison stage, shared timeline, teardown, **view-independent vector assertion** | PR 12 / PR 11 | `npx playwright test verify/specs/comparison.spec.ts` | `?fixture=comparison&process=reproduction&label=anaphase` | Revert PR 12 — lazy chunk removal restores single-cell app exactly |

**Justification of the 5a/5b boundary**: 5a is *motion* (discrete store value → transient damped current → `Object3D.position` writes + a text-only HUD), entirely testable with frozen pose + frozen disassembly value. 5b is *overlay + measurement* (projected DOM/SVG layout, occlusion, debug surfaces, FPS projection), which needs 5a's displaced world matrices to exist before attachment can be asserted across disassembly steps. Splitting anywhere else would leave either half unverifiable against the other.

**Optional sub-split of PR 1** (historical, not recommended retroactively — PR 1 has merged): 1a scaffold + vitest (≈350), 1b Playwright + size/perf gates + CI (≈650).

---

## Phase 1: M0 — Scaffold + Verification Harness — **DONE, VERIFIED**

*Verified 2026-09-17: 7 PASS / 2 PARTIAL / 0 FAIL. All 8 tasks complete in substance; the two PARTIALs are requirement 3 (payload budget met numerically, but no lazy split existed — now booked as 2.6) and requirement 9 (fps 28.5/8.6 below target — user-deferred, kept visible by the D15 readout). Verification was read-only; no source was modified.*

- [x] **1.1** Scaffold the app: `package.json`, `vite.config.ts`, `tsconfig.json` (strict), `index.html`, `src/main.tsx`, `src/App.tsx`; pin React + TS + Vite + three + `@react-three/fiber` + `@react-three/drei` + `zustand` + `gsap`. — cap `build-verify`; req *Fully Static Build With Zero Runtime Services*; verify: **done** — `npm run build` clean, bundle audited (604 modules, 334.50 kB gz).
- [x] **1.2** Add the vitest runner with one real passing test (seeded-noise determinism helper), plus `npm test`. — cap `build-verify`; req *Test Runner Exists From M0*; verify: **done** — 113 tests / 12 files pass in 2.33 s on a clean checkout.
- [x] **1.3** Implement `src/app/store.ts` (Zustand discrete slice only), `src/app/clock.ts` (`ProcessClock` singleton, transient), `src/app/debug.ts` (`window.__cellDebug`: draw calls sampled 1 Hz, rAF p50/p95 ring buffer, `firstRenderAt`). — cap `build-verify`, `cell-viewer`; req *Runtime Performance Targets*; verify: **done** — `PER_FRAME_KEY_PATTERN` guard live; harness reads drawCalls/triangles/firstRenderAtMs/frameStats.
- [x] **1.4** Build `src/scene/CellViewer.tsx` and the first procedural organelle (mitochondrion) via `builders/registry.ts` + `builders/primitives.ts`. — cap `cell-viewer`; req *Deterministic Scene Reconstruction*; verify: **done** — screenshot inspected; 13 draw calls, 3,984 tris.
- [x] **1.5** Build the Playwright harness: `?fixture=` route, `verify/metrics.ts`, `verify/baselines.json`, `playwright.config.ts`. — cap `build-verify`; req *Headless Screenshot Verification Loop*, *Pixel-Metric Regression Checks*; verify: **done** — byte-exact repeat observed; blank-render negative test committed.
- [x] **1.6** Build `verify/size-audit.mjs` and `verify/perf-report.mjs` → committed `artifacts/perf/report.json`. — cap `build-verify`; req *Single-File Size Gate*, *Payload Budget*; verify: **done** — 26 MB synthetic file independently proven to fail exit 1 naming the file.
- [x] **1.7** Add the GitHub Actions `npm run verify` workflow. — cap `build-verify`; req *Deploy Only On Merge To Main*; verify: **done (file)** — asserted structurally by `verify/workflow.test.ts`; **never executed (no remote)** — carried risk.
- [x] **1.8** Record the M0 baseline and confirm or re-ratify the targets. — cap `build-verify`, `cell-viewer`; req *Runtime Performance Targets*; verify: **done** — report committed; fps miss recorded as `pending-user-decision`, not silently accepted.

## Phase 2: M1a — Catalog, i18n Foundation, Disassembly Data, Code Split (**PR 2**)

*Depends on 1.3 (store shape). **Blocks Phases 3 and 4.***

- [x] **2.1** Define `src/catalog/types.ts` (`OrganelleRecord`, `Localized`, `PaletteRole`, `BuilderId` per D3) and `src/catalog/cells.ts` shared-organelle records — membrane, nucleus, mitochondrion, ER, Golgi, ribosomes, lysosomes — bilingual, each with size+unit, fun fact, `paletteRole`, geometry params, deterministic `seed`, `cells` membership, `pickable`. — cap `organelle-catalog`; req *Single Source Of Truth*, *Required Fields*, *Bilingual Content*, *Canonical Animal Cell Roster*; verify: vitest integrity assertions over the records; every label/sheet/quiz consumer traces to this file only.
- [x] **2.2** Add the plant-only records — cell wall, chloroplast, large central vacuole — and a roster test asserting no cilia, flagellum, or pseudopod record exists. — cap `organelle-catalog`; req *Plant Cell Roster*, *Canonical Animal Cell Roster*; verify: vitest roster test names present organelles and fails on any out-of-scope organelle.
- [x] **2.3** Implement `src/catalog/integrity.ts` + tests: missing field fails naming field + record id; missing ES/EN translation fails naming the empty field; palette-role-only coloring; roster canonicality. Builder-id resolution lands in 3.2 (registry does not exist yet) so this gate has no red-CI window. — cap `organelle-catalog`, `i18n-content`; req *Required Fields*, *Bilingual Content*, *Palette Role Reference*, *No Untranslated String Ships*; verify: vitest fails on each injected defect and names the offender. **Blocks 3.2.**
- [x] **2.4** Build i18n infrastructure in `src/ui/i18n/` — locale store (default **Spanish**), `t()` accessor, language selector, memory-only persistence, UI-key parity check over both locales. — cap `i18n-content`; req *Language Selector*, *No Untranslated String Ships*, *Educational Copy Lives In The Data Model*, *Technical Identifiers Stay English*; verify: parity unit test fails on a missing key; record ids unchanged under `es`.
- [x] **2.5** **[NEW — D16]** Add the required `DisassemblyVector` (`direction`, `distance`) to every `OrganelleRecord` and extend `catalog/integrity.ts`: field present; direction normalizable (‖v‖ > 1e−6); radial component `dot(direction, normalize(recordPosition)) ≥ 0` (outward or zero; inward fails naming the record); `distance ≥ 0`. A zero-length direction with distance 0 is the **explicit** "never separates" choice — omission is a build failure naming id + field. Give the **M0 mitochondrion record its vector in this same PR — no exception, no optional field**. — cap `organelle-catalog`; req *Disassembly Vector Per Record*, *Required Fields*; verify: vitest fails naming id+field for a missing vector, an inward direction, a non-normalizable direction, and a negative distance; the existing M0 record passes. **Blocks 4.9.**
- [x] **2.6** **[NEW — D18, hard prerequisite]** Code-splitting pass: lazy-load the three.js/3D chunk via `React.lazy` + dynamic `import()` so the shell paints before 3D loads, and extend `verify/size-audit.mjs` with the post-split shell assertion (shell ≤150 KB gz with three.js excluded — a new architectural number to re-ratify at split time and record in the PR). — cap `build-verify`; req *Payload Budget*; verify: build emits ≥2 chunks; size-audit reports the shell drop and fails if the 3D chunk is re-inlined; the landing UI paints before the 3D chunk loads in the E2E trace. **Blocks PR 3 — the shell sits at 326.7/350 KB gz with no split; builders have nowhere to go until this lands.**

## Phase 3: M1b + M1c — Organelle Builders (**PR 3, PR 4**)

*Each organelle is one work unit: record-driven builder + determinism test + committed inspected screenshot. Techniques come from the skill's Decision Gates verbatim.*

- [x] **3.1** Implement `src/scene/builders/primitives.ts`: seeded noise, `MeshSurfaceSampler` helper, geometry-merge utils, the `size/detail/count/seed` parameter convention. — cap `cell-viewer`; req *Deterministic Scene Reconstruction*; verify: vitest builds twice from one seed → identical vertex count and position hash.
- [x] **3.2** Implement `src/scene/builders/registry.ts` (`BuilderId` → builder) and wire builder-id resolution into `integrity.ts`. — cap `organelle-catalog`; req *Asset-Swap Readiness*; verify: integrity test fails on a builder id with no registry entry.
- [x] **3.3** Membrane builder: `SphereGeometry`/`LatheGeometry` + seeded normal displacement, `DoubleSide`, `transparent` + `opacity`, no `transmission`. — cap `cell-viewer`; verify: `?fixture=organelle&id=membrane` screenshot inspected; tri budget respected.
- [x] **3.4** Nucleus builder: `LatheGeometry` envelope + noise-displaced `IcosahedronGeometry` nucleolus + `InstancedMesh` `TorusGeometry` pores. — cap `cell-viewer`; verify: screenshot inspected; pores in one draw call.
- [x] **3.5** Mitochondrion builder: `LatheGeometry` capsule + `ExtrudeGeometry` on `extrudePath` cristae; instance/reuse above ~20. — cap `cell-viewer`, `process-nutrition`; verify: screenshot inspected — cristae read as real surfaces; tri/draw-call report committed.
- [x] **3.6** Granule builders: ribosomes (`InstancedMesh` of low-detail `IcosahedronGeometry`, seeded placement) and lysosome (noise-displaced `IcosahedronGeometry`). — cap `cell-viewer`; verify: screenshots inspected; ribosomes report exactly **1** draw call.
- [x] **3.7** ER builder: `TubeGeometry` along `CatmullRomCurve3` branches, merged. — cap `cell-viewer`; verify: screenshot inspected; merged draw-call count reported.
- [x] **3.8** Golgi builder: stacked flattened `ExtrudeGeometry` arcs with cis/trans faces, instanced vesicles. — cap `cell-viewer`; verify: screenshot inspected; stack legible when isolated.
- [x] **3.9** Chloroplast builder: `LatheGeometry` capsule + flattened `TorusGeometry` grana stacks (instanced stack of ~4–8 discs). — cap `cell-viewer`, `process-nutrition`; verify: screenshot inspected; instancing verified in the draw-call report.
- [x] **3.10** Vacuole and cell-wall builders: large translucent `LatheGeometry` (`DoubleSide`, no `transmission`) and an outer wall offset visibly outward from the membrane. — cap `cell-viewer`, `organelle-catalog`; verify: plant screenshot inspected — wall visibly outside the membrane; overdraw checked.
- [x] **3.11** Add the per-organelle screenshot coverage gate: enumerate catalog records × cells, fail CI when `artifacts/screens/{view}/{organelleId}.png` is missing. — cap `build-verify`; req *Per-Organelle Screenshot Coverage*; verify: CI fails naming a record when its screenshot is removed. **Blocks calling any later milestone verified.**
- [x] **3.12** **[NEW — D13]** Implement `src/catalog/vectors.ts`: compute the suggested default `distance` as **1.5×** the record's own built-geometry bounding radius from a `Box3`, exposed as an *authoring aid* the catalog author may override; the record's explicit `distance` is what renders. — cap `organelle-catalog`, `cell-viewer`; req *Disassembly Vector Per Record*; verify: unit test on known geometry returns the 1.5× radius; an explicit override wins over the computed value; **no literal displacement constant remains in viewer code** (grep/static assertion).

## Phase 4: M1d + M1e — Scene, Interaction, Disassembly, Annotations, HUD, UI, Fallback (**PR 5a → 5b → 6**)

*Depends on Phase 2 and Phase 3. **Execution order is 5a → 5b → 6; numeric order is not execution order.***

**PR 5a — M1d-1: scene, interaction, disassembly + HUD %**

- [ ] **4.1** Build `src/scene/CellGroup.tsx` + `src/scene/OrganelleHost.tsx`: roster → host list, builder lookup, `userData.organelleId`, label anchor, `anchorOffset` registered per record for the annotation layer. — cap `cell-viewer`; req *Hover Highlight And Label*, *Single Source Of Truth*, *Persistent Bilingual Annotations…* (anchor source); verify: fixture screenshot; each host exposes its anchor world position to the overlay. *(Label **text rendering** moves to the annotation layer — 4.15/4.16.)*
- [ ] **4.2** Build `src/scene/interaction/Picking.tsx`: invisible simplified hit volume per organelle on a dedicated raycast layer; hover dispatch; `hoveredId` as a discrete store value; max one highlighted. Hover **emphasis** is applied by the annotation layer (4.17). — cap `cell-viewer`; req *Hover Highlight And Label* (**MODIFIED 2026-09-17** — emphasizes an existing annotation, never creates a transient label); verify: `?fixture=hover&organelle=X` shows organelle-region mean luminance ≥10% above baseline; raycasts hit ~10 proxies.
- [ ] **4.3** Implement click-to-isolate + `useIsolateCamera`: pointerdown/up travel <5 px = click, de-emphasize others, camera frames the organelle, empty-space click clears. — cap `cell-viewer`; req *Click Isolate And Spec Sheet*, *Mouse-Only Navigation And Reset*; verify: `?fixture=isolate&organelle=X` screenshot + E2E click/drag discrimination.
- [ ] **4.4** Implement camera navigation: orbit on drag, clamped wheel zoom that never enters the cell, "back to selection" resetting framing and view state. — cap `cell-viewer`; req *Mouse-Only Navigation And Reset*; verify: E2E orbit-without-selection, clamp, back-to-selection; min/max distance unit test.
- [ ] **4.8** Apply DPR cap + quality tier (drei `AdaptiveDpr` ≤2; drop contact shadows and DPR to 1 when `hardwareConcurrency ≤ 4` or p95 degrades); no LOD, no SSAO, no `transmission`. — cap `build-verify`, `cell-viewer`; req *Runtime Performance Targets*; verify: perf report records the applied tier; hero screenshots inside metric bands.
- [ ] **4.9** **[NEW — D13]** Add the **discrete** `disassemblyTarget: number` (0–100, integer steps, written on `input` change only; passes `PER_FRAME_KEY_PATTERN` because it is a control value) and the ratified mutual-exclusion guards as preconditions on existing actions: `setSelected(id)` forces `disassemblyTarget = 0` when > 0; `setDisassembly(v > 0)` forces `setSelected(null)` and closes the sheet; `resetToSelection()` forces `disassemblyTarget = 0`. No new state machine. — cap `cell-viewer`; req *Continuous Disassembly Control With Live Percentage* (handoff), *Click Isolate And Spec Sheet*, *Mouse-Only Navigation And Reset*; verify: `store.test.ts` covers all four guards; E2E from value=60 → isolate reads disassembly 0 with isolate active; symmetric direction (raise above 0 while isolated clears isolate + closes sheet).
- [ ] **4.10** **[NEW — D13]** Implement `src/scene/disassembly.ts`: transient damped current (`current += (target − current)·k·dt`, k≈8/s) in a single `useFrame`, writing `offset = direction · distance · (current/100)` directly to each organelle root `Object3D.position` — zero React re-renders; the arrangement is a pure function of `(progress, record.disassembly)`. — cap `cell-viewer`; req *Continuous Disassembly Control With Live Percentage*, *Deterministic Scene Reconstruction*, *Accuracy Over Spectacle*; verify: at 100% each organelle sits along its **record** vector (asserted against catalog data, never a constant); 100→0 returns the exact 0% pose; `sceneRenders` unchanged by the loop (4.13).
- [ ] **4.11** **[NEW — D13]** Build the disassembly control + HUD % (rounded to whole percents, `textContent` written from the same `useFrame` only when the rounded value changes) and present it as an **exploded-view study aid for structure** — a view control, outside the three-process selector, with localized framing copy. — cap `cell-viewer`; req *Continuous Disassembly Control With Live Percentage*, *Disassembly Is A View Control, Not A Biological Claim*; verify: E2E at 57% shows the localized state word + `57%`; the process selector lists exactly nutrition, movement, reproduction; disassembly renders in a separate view-control group; no "fourth process" copy exists in either locale.
- [ ] **4.12** **[NEW — D17]** Add `?fixture=disassembly&value=N` to `src/app/fixture.ts` (N ∈ {0,25,57,100}): freezes **target and damped current** at N, bypassing damping, with clock and camera frozen. — cap `build-verify`, `cell-viewer`; req *Continuous Disassembly Control With Live Percentage* (reversibility), *Pixel-Metric Regression Checks*; verify: occupied-pixel area grows monotonically with N across the four fixtures; the N=0 render after a 100→0 round-trip is byte-identical to the committed 0% baseline; repeated loads byte-exact.

**PR 5b — M1d-2: annotations, solver, FPS readout, debug surfaces (base: PR 5a)**

- [ ] **4.13** **[NEW — D15/D17]** Extend `src/app/debug.ts`: `sceneRenders: number` incremented **inside the existing `attachRendererSampling` wrapper** and only when `scene === mainScene` (drei's ContactShadows/Environment auxiliary passes render different scenes and must be excluded — the M0 fix), plus `annotations` — the per-frame solver output (boxes, leader `d`, opacity, column) mirrored on write for the harness. — cap `build-verify`; req *On-Screen FPS Readout* (scene-tree render count); verify: unit test proves an auxiliary-scene render does **not** increment `sceneRenders`; the harness reads both surfaces in-browser.
- [ ] **4.14** **[NEW — D14]** Implement `src/ui/annotations/solver.ts` as pure functions: side-sorted columns with ratified **±5% viewport-width** hysteresis (module-level `Map`, transient), top→down stacking with ratified **4 px** minimum gap, proportional compression then column shift, two-segment elbow leaders, viewport clamping. — cap `cell-viewer`; req *Annotation Layout Does Not Cross Or Overlap*; verify: pure-function unit tests over a matrix of synthetic projections assert zero segment-pair intersections, zero box overlaps, min adjacent gap ≥4 px, all boxes in-viewport, ≤1 column flip on a slow centre crossing. **No browser needed.**
- [ ] **4.15** **[NEW — D14]** Build `src/ui/annotations/AnnotationLayer.tsx`: one absolutely-positioned DOM/SVG overlay whose **single `useFrame`** projects each record's `anchorOffset` through the organelle root's **current, displaced** `matrixWorld`, runs occlusion (one proxy raycast, ≤10), calls the solver, and writes only changed `translate3d` / SVG `d` / opacity values. React renders the layer on discrete changes (roster, locale, palette, quiz) only. — cap `cell-viewer`; req *Persistent Bilingual Annotations With Leader Lines And Anchors*, *Runtime Performance Targets*, *Accuracy Over Spectacle*; verify: every roster organelle has an annotation at rest; fixtures show anchor attachment within a small px radius across orbit × disassembly steps; **zero draw calls added** (draw-call gate unchanged); committed screenshots inspected.
- [ ] **4.16** **[NEW — D14]** Render the bilingual block from the record's own `name` values (active locale primary, uppercase via CSS; other locale secondary below at smaller size) and swap which locale is primary **in place** on `locale` change — no recreated annotation, no moved anchor, no separate copy. — cap `i18n-content`, `cell-viewer`; req *Bilingual Annotation Rendering Order*, *Educational Copy Lives In The Data Model*; verify: ES and EN fixture screenshots show correct primary/secondary order; E2E asserts the anchor position is unchanged across the swap.
- [ ] **4.17** **[NEW — D14]** Wire annotation emphasis: `hoveredId` emphasizes the **existing** annotation (ink → palette `label`, weight bump, leader 1.5→2 px, anchor scale ~1.3×) via a class toggle, composed with the organelle highlight; occluded leader+anchor de-emphasize at the ratified **≤50%** opacity with the label at 100%; unmount the whole layer under `quizActive`. — cap `cell-viewer`; req *Hover Highlight And Label* (**MODIFIED**), *Annotation Layout Does Not Cross Or Overlap* (occlusion stated), *Blind quiz condition still suppresses*; verify: E2E hover shows emphasis and **no additional label node**; clears on leave; occluding-pose fixture samples leader alpha in the occluded range vs the 100% baseline; quiz E2E shows no annotation or emphasis.
- [ ] **4.18** **[NEW — D15]** Build `src/ui/hud/FpsReadout.tsx` as a **2 Hz DOM projection of the existing `__cellDebug.frameStats.p50Fps`** via `setInterval` + `textContent` — **no second sampler**, no React state, no hiding/clamping/substitution — present in animal, plant and comparison views. — cap `cell-viewer`, `build-verify`; req *On-Screen FPS Readout*; verify: E2E asserts the readout exists in every view and shows a below-target number unclamped; a static assertion proves `p50Fps` is computed in exactly one place.
- [ ] **4.19** **[NEW — D17]** Add the stepped annotation-layout fixtures + assertion metrics: orbit yaw sweep × disassembly N steps, reading `__cellDebug.annotations` for leader segments and label boxes; assert zero crossings, zero overlaps, ≥4 px gaps, in-viewport boxes, ≤1 column flip, and anchor attachment at every step; commit the fixture matrix in `verify/baselines.json`, including a compact plant-cell variant. — cap `build-verify`, `cell-viewer`; req *Annotation Layout Does Not Cross Or Overlap* (all five scenarios); verify: assertions run in CI and fail on an injected crossing/overlap/off-screen box.
- [ ] **4.20** **[NEW — D15/D17]** Add the FPS-truthfulness and no-re-render assertions: on a frozen fixture compare HUD text with `frameStats` (|Δ| / sampler ≤10%, expected 0% — same source), and compare `sceneRenders` over an idle 10 s window with the readout live vs disabled (must be equal, ticks ≤2 Hz). — cap `build-verify`, `cell-viewer`; req *On-Screen FPS Readout*; verify: both run in CI; a clamped readout fails the agreement check; a per-frame React update fails the `sceneRenders` equality check.

**PR 6 — M1e: spec sheet, view switching, fallback, annotation i18n/ink (base: PR 5b)**

- [ ] **4.5** Build `src/ui/SpecSheet.tsx` (all fields from the record) and `src/ui/Nav.tsx` view switching with the landing view state. — cap `cell-viewer`, `organelle-catalog`; req *Click Isolate And Spec Sheet*, *Single Source Of Truth*; verify: E2E opens the sheet from a click and shows bilingual fields; editing one record changes label, sheet and quiz with no other file change.
- [ ] **4.6** Build `src/ui/FallbackView.tsx` + a WebGL2 context probe before mounting `<Canvas>`: harness-generated static cell PNGs + the full bilingual spec sheet, with processes/isolate/quiz declared unavailable. — cap `cell-viewer`; req *WebGL-Unavailable Fallback*; verify: E2E with WebGL2 unavailable shows images + spec sheets and never a blank canvas.
- [ ] **4.7** Implement non-destructive language switching (preserve view, selection, phase, speed, palette, and the **annotation anchor positions**) at the store level. — cap `i18n-content`, `cell-viewer`; req *Language Switch Is Non-Destructive*, *Bilingual Annotation Rendering Order*; verify: E2E switches language with an organelle isolated and framing + anchors unchanged; the paused-anaphase variant is re-verified in 6.6.
- [ ] **4.21** **[NEW — D14/D18]** Plumb annotation ink from `palette.label` (leader lines, anchors, both language lines) with **no literal colors** at M1, so the M5 palette/high-contrast work restyles annotations with no code change. — cap `appearance-theming`, `cell-viewer`; req *Annotation Ink Follows The Palette*; verify: static/unit check asserts no literal color literal in `src/ui/annotations/*`; swapping the palette prop restyles annotations with no catalog edit.
- [ ] **4.22** **[NEW — D18]** Extend `src/ui/FallbackView.tsx` declarations: annotations, disassembly and isolate are unavailable without WebGL, stated in both locales, while static PNGs and full spec sheets remain. — cap `cell-viewer`; req *WebGL-Unavailable Fallback*, *Disassembly Is A View Control, Not A Biological Claim*; verify: E2E with WebGL2 unavailable shows the unavailability statements and no blank canvas.

## Phase 5: M2 — Nutrition (**PR 7**)

*Depends on 3.5 (mitochondrion), 3.9 (chloroplast), 1.3 (clock), 1.8 (baseline).*

- [ ] **5.1** Implement `src/processes/types.ts`, `src/processes/registry.ts`, the enter/exit lifecycle with `dispose()`, and `src/ui/controls/SpeedControl.tsx` bound to `timeline.timeScale()` / clock scale (pause 0, slow 0.25, real time 1). — cap `process-nutrition`, `process-reproduction`, `process-movement`; req *Speed Control And Clean Exit*, *Speed Control*; verify: unit test of the speed mapping; E2E pause holds state; nothing per-frame touches React state. **Blocks Phases 6–7, 9.**
- [ ] **5.2** Build respiration as a scripted GSAP stage timeline on the cristae (ATP bursts, no light node anywhere), `paused: true` + labels. — cap `process-nutrition`; req *Respiration Animates Inside The Mitochondrion*, *The Two Processes Are Not Conflated*; verify: frozen-stage screenshot inspected; assertion that no light uniform is written.
- [ ] **5.3** Build photosynthesis as continuous thylakoid flow with O₂/glucose emission on the grana, rate driven by `uLightIntensity`. — cap `process-nutrition`; req *Photosynthesis Animates Inside The Chloroplast*; verify: chloroplast-only fixture; animal fixture shows the process visibly absent.
- [ ] **5.4** Add the light-intensity slider wiring `uLightIntensity` + the clock rate term, the zero-light honest state (motion stops, localized "light required" message), and the invariant that respiration is unaffected. — cap `process-nutrition`; req *Light-Intensity Slider Drives The Process Rate*, *Zero light is honest*; verify: harness measures a higher rate at max vs min light; respiration fixture byte-identical at slider 0 and max.
- [ ] **5.5** Wire process exit (base viewer restored, catalog/selection unchanged), confirm no per-frame React re-render, record the first frame-time p95. — cap `process-nutrition`, `build-verify`; req *Speed Control And Clean Exit*, *Runtime Performance Targets*; verify: E2E exit restores state; committed p95 compared against the 1.8 baseline (advisory in CI).

## Phase 6: M3 — Reproduction (**PR 8**)

*Depends on Phase 5 and 1.5.*

- [ ] **6.1** Build `src/processes/reproduction/mitosis.ts` as a labeled, reversible timeline: prophase(0) → metaphase → anaphase → telophase → cytokinesis, labels localized. — cap `process-reproduction`; req *Mitosis Phase Sequence*; verify: frozen screenshot per label inspected; strict order in both languages.
- [ ] **6.2** Author chromosome keyframes enforcing the cited biology: alignment at metaphase, separation to opposite poles only after metaphase, two nuclei at telophase. — cap `process-reproduction`; req *Chromosome Behavior Matches Each Phase*; verify: structural assertion that no separation occurs before metaphase and two condensed groups exist after.
- [ ] **6.3** Build `src/ui/controls/ScrubBar.tsx` bound to `timeline.progress()` (zero React re-render), phase buttons calling `timeline.seek(label)`, backward scrub without re-triggering side effects. — cap `process-reproduction`; req *Scrub And Phase Addressability*; verify: E2E seek-by-label jumps to anaphase with its label.
- [ ] **6.4** Author cytokinesis as two distinct motions in one factory: animal = membrane constriction + contractile-ring shrink; plant = cell plate growing centre-outward. **Do not** present one motion with a recolored label. — cap `process-reproduction`; req *Cytokinesis Contrast — Contractile Ring vs. Cell Plate*; verify: structural metrics on frozen screenshots — animal silhouette ≥15% narrower at the equator; opaque central partition band present in plant and absent in animal. Per D10, if flaky these are demoted to best-effort with inspected screenshots as the gate, recorded honestly.
- [ ] **6.5** Add the single-cell cytokinesis phase toggle (animal ⇄ plant) with the localized difference statement. — cap `process-reproduction`; req *Contrast Teaches Before Comparison Mode Exists*; verify: E2E toggles both mechanisms in one view; difference text in the active language.
- [ ] **6.6** Apply the shared speed control to reproduction and re-verify non-destructive i18n at a paused phase. — cap `process-reproduction`, `i18n-content`; req *Speed Control*, *Language Switch Is Non-Destructive*; verify: E2E pause freezes the phase; switching language while paused at anaphase stays at anaphase.
- [ ] **6.7** Update the M3 gates: draw calls ≤150 hard fail, p95 recorded, reproduction screenshots added to `artifacts/screens/` and `verify/baselines.json` in the same PR. — cap `build-verify`; req *Pixel-Metric Regression Checks*, *Runtime Performance Targets*; verify: `npm run verify` green; baseline diff visible in the PR.

## Phase 7: M4 — Movement (**PR 9**)

*Plant cyclosis is fully specifiable. The animal slice is user-owned and must not be invented.*

- [ ] **7.1** Build `src/processes/movement/cyclosis.ts`: an instanced particle/organelle set advected around the central vacuole on a toroidal flow field, driven by `ProcessClock` (GPU-side, no per-frame mesh deformation). — cap `process-movement`; req *Plant Cyclosis Animation*; verify: two frozen-time fixtures show particles advanced without stopping.
- [ ] **7.2** Wire slow motion to scale the clock only (direction metric unchanged) and stop streaming on exit with the base viewer restored. — cap `process-movement`; req *Speed control slows the streaming*, *Exiting stops the streaming*; verify: E2E slow-motion lowers the rate while the flow-direction metric is unchanged; E2E exit restores prior state.
- [ ] **7.3** Add the declared-unavailable animal entry: `{ id: 'movement-animal', available: false }` in `processes/registry.ts` plus the localized "content not yet available" UI state, with no animation, diagram, organelle list, or placeholder fabricated. — cap `process-movement`; req *Animal Movement Content Is Blocked, Not Invented*; verify: E2E opens animal Movement and shows only the unavailable statement; assertion that no new catalog record or animation file was added.
- [ ] **7.4** **BLOCKED — user-owned input.** Implement the animal Movement process once the user supplies reference images and defines the included organelles and functions: catalog records for any new organelles (2.1/2.3 gates), builders if new geometry is required (3.x), `processes/movement/animal.ts` implementing `ProcessDefinition`, then flip `available: true`. Constraint: no cell translation and no cilia/pseudopod may be introduced to justify motion. — cap `process-movement`; req *Defined content replaces the statement*, *Movement Does Not Imply Cell Motility*; verify: **verification cannot be specified until the input arrives**; on delivery, fixtures must show a stationary cell boundary across the whole timeline plus a screenshot per new organelle. **Do not start 7.4 without the user's definition.** Reverting means flipping `available` back to `false` and deleting the added records/builders.

## Phase 8: M5 — Theming and Quiz (**PR 10, PR 11**)

- [ ] **8.1** Implement `src/catalog/palettes.ts` (default + high-contrast per D4) and the per-layer selector UI, feeding materials via `useMemo` and applying to viewer, processes, comparison, and quiz. — cap `appearance-theming`; req *Per-Layer Palette Selection*, *Palette Is Consistent And Non-Revealing*; verify: unit test asserts no catalog edit is needed; screenshot per palette inspected; no organelle name appears during a palette change mid-quiz.
- [ ] **8.2** Implement swatch fidelity as two pipeline-stage checks: `?fixture=swatch` unlit full-canvas quad through the identical pipeline (±2/255 per channel) and `?fixture=lit` sampled organelle region (Δhue ≤5°, Δluminance ≤20%), thresholds committed in `verify/baselines.json`. — cap `appearance-theming`; req *Swatch-To-Render Fidelity*, *Fidelity Is Verified, Not Assumed*; verify: CI fails when a sampled color leaves tolerance; `NeutralToneMapping` is the only tone mapper (ACES prohibited).
- [ ] **8.3** Implement high-contrast thresholds as a unit test over the palette model (WCAG ≥4.5:1 label vs background; ≥30% relative-luminance difference between adjacent layer colors) plus the lit-scene sampling scenario. — cap `appearance-theming`; req *High-Contrast Accessibility Mode*; verify: test passes both thresholds and fails when a color is nudged below them; enabling it changes neither catalog content nor geometry.
- [ ] **8.4** Build `src/ui/QuizPanel.tsx` and the quiz store slice: localized blind prompts (`clickedId === promptId` acceptance; other organelle = incorrect and named; empty space = no answer, prompt stays active), catalog-sourced feedback, round summary with score and missed organelles, exit restoring the viewer. — cap `quiz-mode`; req *Round Structure And Prompting*, *Identification Acceptance Criterion*, *Feedback On Every Answer*, *Round Summary And Exit*; verify: E2E covers correct, incorrect, empty-space, and summary cases; the prompt never pre-highlights, labels, or isolates the target.
- [ ] **8.5** Add the `quizActive` blind guard (suppress labels, hover names, spec sheets, and the annotation layer) and the seeded round shuffle. — cap `quiz-mode`; req *Blind Condition Is Maintained*, *Positional Memorization Does Not Pass*; verify: unit test asserts two consecutive rounds differ; E2E hover during a prompt shows no name, no identifying highlight, and no annotation; exit restores them.
- [ ] **8.6** **[NEW — D14/D18]** Extend the M5 checks to annotation ink: the WCAG ≥4.5:1 unit check covers leader lines, anchors and both language lines against the rendered background, and the high-contrast lit-scene sampling also samples annotation ink. — cap `appearance-theming`; req *Annotation Ink Follows The Palette*, *High-Contrast Accessibility Mode*; verify: unit test fails when annotation ink is nudged below threshold; high-contrast screenshot sampling stays within the swatch-check tolerance; a palette swap restyles annotations with no catalog or code edit.

## Phase 9: M6 — Comparison (**PR 12**, last)

- [ ] **9.1** Build `<ComparisonStage>` as its own lazy chunk: the **same** `CellGroup` rendered twice with symmetric transforms, one shared camera and `OrbitControls` target at the midpoint, mounted only on user activation. — cap `comparison-view`; req *On-Demand Only, Never Default*, *One Canvas, Two Groups*, *Camera Policy*; verify: fresh-load E2E shows exactly one cell mounted; activating renders both without reload; exactly one WebGL context.
- [ ] **9.2** Implement the shared timeline: one parent `gsap.timeline({paused:true})`, children via `parent.add(child, 0)`; scrub/speed/seek touch only the parent; one `ProcessClock` with a single `useFrame` calling both `update(elapsed, dt)`. — cap `comparison-view`; req *One Shared Timeline*; verify: E2E pause leaves both cells at the same phase and progress; no drift on resume.
- [ ] **9.3** Implement teardown: exiting disposes each `ProcessInstance`, disposes builder-created geometries/materials, unmounts the chunk, restores the pre-comparison single-cell state. — cap `comparison-view`; req *Teardown Without Leakage*, *Independently Deliverable And Revertible*; verify: E2E enter → run → exit returns `renderer.info` counts to baseline; deleting the chunk leaves everything else functional.
- [ ] **9.4** Apply the comparison performance gate: ≤300 total draw calls hard fail, frame p95 recorded. — cap `comparison-view`, `build-verify`; req *Comparison Performance Budget*; verify: report records comparison draw calls and p95; CI fails above 300.
- [ ] **9.5** Add the end-to-end smoke suite: Animal → Plant → Comparison → back; language switch while paused at anaphase; a quiz round completes; exit-comparison restores state. — cap `build-verify`, `i18n-content`, `quiz-mode`, `comparison-view`; req *Language Switch Is Non-Destructive* (CI scope); verify: smoke suite green with no fixtures, run in CI on every PR.
- [ ] **9.6** **[NEW — D16]** Assert the disassembly vector is **view-independent**: a unit test proving no view/layout path can override a record's `direction`/`distance`, plus an E2E check that mounting comparison mode does not mutate catalog vectors. — cap `comparison-view`, `organelle-catalog`; req *Disassembly Vector Per Record* (same record, same vector, every view); verify: the test fails if comparison constructs a layout-specific vector; both rendered cells use the same catalog records.

## Phase 10: Cross-Cutting

- [ ] **10.1** Keep `verify/baselines.json` and `artifacts/screens/` in lockstep with deliberate visual changes: any PR that changes a render updates the baseline in the same PR so the diff is review-visible, and `artifacts/perf/report.json` is recommitted per milestone. — cap `build-verify`; req *Pixel-Metric Regression Checks*, *Per-Organelle Screenshot Coverage*; verify: `npm run verify` green on `main`; every baseline change appears in the PR that caused it.
- [ ] **10.2** **[NEW — verify-report WARNING 1]** Commit the SDD artifacts and the uncommitted `.gitignore` `references/` rule so the proposal/specs/design/tasks are recoverable, and ensure no reference image is staged by that rule. — cap `build-verify`; verify: `git status` clean for `openspec/` and `.gitignore`; `git check-ignore` confirms the reference images are excluded.
- [ ] **10.3** **[NEW — verify-report SUGGESTION 3]** Make the `artifacts/perf/report.json` refresh deliberate: either a committed refresh per milestone (timestamp churn acknowledged and reviewed) or a scratch output path, decided in the PR that first rewrites it. — cap `build-verify`; req *Runtime Performance Targets*; verify: `npm run verify` on an unrelated PR does not dirty the committed report.

---

## New / Changed Requirement Traceability (D13–D18)

| Requirement (spec) | Tasks |
|---|---|
| cell-viewer · *Continuous Disassembly Control With Live Percentage* | 4.9, 4.10, 4.11, 4.12 |
| cell-viewer · *Disassembly Is A View Control, Not A Biological Claim* | 4.11, 4.22 |
| cell-viewer · *Persistent Bilingual Annotations With Leader Lines And Anchors* | 4.1, 4.7, 4.15, 4.16, 4.19 |
| cell-viewer · *Annotation Layout Does Not Cross Or Overlap* | 4.14, 4.15, 4.17, 4.19 |
| cell-viewer · *On-Screen FPS Readout* | 4.13, 4.18, 4.20 |
| cell-viewer · *Hover Highlight And Label* (**MODIFIED**) | 4.2, 4.17, 8.5 (blind guard) |
| organelle-catalog · *Disassembly Vector Per Record* | 2.5, 3.12, 4.9, 4.10, 9.6 |
| i18n-content · *Bilingual Annotation Rendering Order* | 4.16, 4.7 |
| appearance-theming · *Annotation Ink Follows The Palette* | 4.21, 8.6 |
| D18 code-split prerequisite (build-verify *Payload Budget*) | 2.6 |
| Verification enablement (D17) | 4.12, 4.13, 4.19, 4.20 (+ solver unit tests 4.14) |

## Coverage Check

| Capability | Milestone | Tasks |
|---|---|---|
| `cell-viewer` | M1 | 1.4, 3.3–3.10, 4.1–4.4, 4.6, 4.8–4.22 |
| `organelle-catalog` | M1 | 2.1–2.3, 2.5, 3.2, 3.10, 3.12, 4.5, 9.6 |
| `i18n-content` | M1 + all | 2.4, 4.7, 4.16, 6.6 |
| `build-verify` | M0 + all | 1.1–1.8, 2.6, 3.11, 4.12, 4.13, 4.19, 4.20, 5.5, 6.7, 9.4, 9.5, 10.1–10.3 |
| `process-nutrition` | M2 | 5.1–5.5 |
| `process-reproduction` | M3 | 5.1, 6.1–6.7 |
| `process-movement` | M4 | 5.1, 7.1–7.4 (7.4 blocked) |
| `appearance-theming` | M5 | 8.1–8.3, 8.6, 4.21 |
| `quiz-mode` | M5 | 8.4–8.5 |
| `comparison-view` | M6 | 9.1–9.6 |

All 10 capabilities have tasks; no capability is unplanned; no task lacks a capability; every requirement in the 12-requirement `cell-viewer`, 8-requirement `organelle-catalog`, `i18n-content` and `appearance-theming` surfaces has a verifying task.
