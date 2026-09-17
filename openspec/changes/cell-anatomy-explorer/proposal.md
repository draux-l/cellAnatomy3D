# Proposal: 3D Cell Anatomy Explorer (Animal vs. Plant)

**Change**: `cell-anatomy-explorer` · **Phase**: propose · **Date**: 2026-09-16
**Inputs**: `exploration.md` (rev 2), `.opencode/skills/threejs-cell-modeling/SKILL.md` + references, confirmed session preflight.

## Intent

Secondary-school students have no free, genuinely interactive way to see *how* an animal cell differs from a plant cell **as a living system** — existing free tools (Gurdon Cell Explorer, Allen Cell Explorer) show labeled structure but the three vital processes — nutrition, movement, reproduction — are where the real biological contrast lives (respiration vs. photosynthesis; cyclosis vs. — see Open Items — for animal; contractile-ring vs. cell-plate cytokinesis). This project builds a static-deployed, $0-cost, mouse-driven 3D explorer in Spanish and English where those processes **animate**, wrapped in a premium product-showcase aesthetic (dark stage, technical typography, orbitable hero model, spec side panel) — because visual quality is the hook, but **"que enseñe de verdad"** (that it genuinely teaches) is the success criterion.

**Standing tie-break rule**: visual spectacle serves teaching, never the reverse. If an effect would teach something false, accuracy wins and the effect is cut.

## Scope

### In Scope
- Base viewer: orbit (drag), zoom (scroll), hover = highlight + label, click = isolate organelle + spec sheet (name, function, approximate size, fun fact). Mouse-first, laptop/PC.
- Two canonical cells: animal (nucleus, mitochondria, ER, Golgi, ribosomes, lysosomes, membrane) and plant (adds cell wall, chloroplasts, large central vacuole).
- Three animated processes per cell: **Nutrition** (respiration inside mitochondrion / photosynthesis inside chloroplast with light-intensity slider), **Movement** (plant cyclosis; animal TBD — see Open Items), **Reproduction** (mitosis phases with the cytokinesis contrast as the teaching climax).
- Navigation: Célula Animal / Célula Vegetal / Comparación. Comparison is on-demand only, never default.
- Per-layer palette selector (membrane, cytoplasm, nucleus, organelles) + high-contrast accessibility mode.
- Blind-label quiz mode; animation speed control (pause / slow / real time) + scrub; "back to selection" button.
- i18n (ES + EN) covering **all educational content**, with language selector — not just UI chrome.
- Playwright headless screenshot verification loop; fully static build on Cloudflare Pages.

### Out of Scope (Non-Goals)
- **No touch/mobile/projector redesign.** Mouse-first as decided; no responsive split-screen on phones.
- **No specialized cell types**: no pseudopods, cilia, flagella, neurons, muscle cells. Canonical textbook cell only.
- **No photorealism.** Procedural geometry produces legible, teachable shapes; chasing microscope fidelity is explicitly rejected.
- **No `.glb` assets, no Blender, no Blender MCP, no AI text-to-3D** for the main path. Geometry is procedural Three.js code (AI text-to-3D is technically unsuitable: single closed shell, no internal geometry to isolate or animate).
- **No backend, no runtime AI generation, no accounts, no analytics, no persistence.** Fully static; $0 forever; breaks C1/C2 otherwise.
- **No baked animation clips in files** — they cannot respond to the light slider or scrub.
- **No LOD system**, no SSAO, no `transmission` materials unless measured need appears.
- **No commercial features** (ads, paid tiers, LMS integration) — also a license dependency: any CC-BY-NC asset strategy would die if this changed, though the current plan has zero asset-license surface.

## Capabilities

> Greenfield: `openspec/specs/` does not exist; all capabilities below are new.

### New Capabilities
- `cell-viewer`: 3D scene, camera, hover/click/isolate interaction, organelle highlight + labels.
- `organelle-catalog`: single-source-of-truth data model (name, function, size, fun fact, palette role) shared by 3D labels, spec sheet, and quiz — bilingual.
- `process-nutrition`: respiration (mitochondrion) and photosynthesis (chloroplast) animations + light-intensity slider.
- `process-movement`: plant cyclosis flow; animal-cell movement content pending user input.
- `process-reproduction`: mitosis phase sequence with scrub/speed control; cytokinesis contrast.
- `comparison-view`: on-demand split view, one `<Canvas>`, two groups, one shared timeline.
- `appearance-theming`: per-layer palette selector + high-contrast mode with swatch/render fidelity.
- `quiz-mode`: blind-label identification game.
- `i18n-content`: ES/EN delivery of all UI and educational copy.
- `build-verify`: static build pipeline + Playwright screenshot verification.

### Modified Capabilities
- None (greenfield).

## Approach

- **Stack**: React + TypeScript + Vite + React Three Fiber + drei; **Zustand** with a strict reactive/transient split — per-frame values (clock, timeline instances, particle buffers) live in refs, never React state. This is the guard against the comparison-mode frame-rate cliff.
- **Geometry**: procedural in code, parametric (size/detail/count/seed), per the project skill's Decision Gates (`LatheGeometry` shells, `TubeGeometry` networks, `InstancedMesh` above ~20 repeats, seeded noise). Zero asset download; every shape is directly drivable by palette/slider/animation state. Deterministic seeds so a cell looks identical in every view and mode.
- **Animation**: code-authored. GSAP timelines (`paused: true` + labels) for scripted, scrubbable, reversible sequences (mitosis, respiration stages) — gives `.seek()`, `.progress()`, `.timeScale()` for free. `useFrame` + material/shader uniforms reading one normalized clock for continuous motion (cyclosis, molecule flow, light slider). One paradigm per job; no third animation library.
- **Look**: dark stage, one HDRI `<Environment>` (1024), `MeshPhysicalMaterial` clearcoat sheen, `<ContactShadows>`, restrained CSS overlay. **Tone mapping: `THREE.NeutralToneMapping` (Khronos PBR Neutral) — ratified decision.** The exploration listed ACES vs. PBR Neutral as open; the project skill's hard rule closes it: ACES shifts hue, which would make palette swatches lie to the user and break the high-contrast accessibility mode. Swatch colors in the data model are the single source of truth, read identically by materials and UI.
- **Verification**: Playwright headless loop (render at known camera pose + seed → PNG → inspect) from the first organelle onward; pixel-metric assertions (non-blank canvas, organelle pixel area) as CI regression checks. **A change not visually inspected is not verified.**
- **Deployment**: static Vite SPA → Cloudflare Pages (free, unlimited bandwidth, 25 MB/file cap as a free forcing function); R2 only as documented escape hatch. Deploy on merge to `main` only (500 builds/month, 1 concurrent).

### Milestone Sequencing

Sequenced so high-risk items land late and independently; each milestone is independently shippable and revertible:

1. **M0 — Scaffold + verification loop.** Vite/R3F/Zustand app shell, Playwright screenshot harness working, first procedural organelle rendered and screenshot-verified. Also establishes the test runner that `openspec/config.yaml` says does not exist yet.
2. **M1 — Base viewer.** Both cells assembled, hover/click/isolate, spec sheet, navigation shell, i18n infrastructure.
3. **M2 — Nutrition.** Respiration + photosynthesis animations, light slider.
4. **M3 — Reproduction.** Mitosis timeline, scrub bar, speed control, cytokinesis contrast (single-cell phase toggle first — this alone teaches the contrast before comparison exists).
5. **M4 — Movement.** Plant cyclosis; **animal-cell content blocked on user input** (see Open Items).
6. **M5 — Theming + quiz.** Palette selector, high-contrast mode, blind-label quiz.
7. **M6 — Comparison mode (last).** One `<Canvas>`, two groups, one shared GSAP parent timeline, doubled draw-call budget, teardown lifecycle. Highest architectural complexity, least pedagogically urgent — deliberately last.

**Review-workload risk, stated honestly**: full scope will very likely exceed the 800-line budget and certainly exceeds the 400-line advisory threshold. Under the configured `ask-on-risk` strategy, the user will be asked at the tasks phase whether to split into chained PRs. Chained delivery is the expected outcome, not an exception.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/` (new) | New | Entire application — greenfield, no existing code |
| `openspec/` | Modified | Delta specs per capability during sdd-spec |
| `tests/` or Playwright specs (new) | New | Visual verification harness from M0 |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|-----------|
| **Animal Movement content undefined** (canonical cell does not translocate) | Certain today | Open input owned by **the user**, who will supply reference images and define included organelles/functions. Blocks only M4's animal work unit; M0–M3 and plant cyclosis proceed unblocked. |
| Comparison mode complexity blows budget/teardown | Medium | Isolated as final milestone; single-canvas/shared-timeline pattern fixed up front; skippable without breaking the rest. |
| i18n content-doubling cost (all educational copy × 2) | High effort, low risk | Content lives in the organelle catalog data model, not components; authored once per language in one file set. |
| Performance targets unverified (60 fps, ≤150 draw calls, ≤3 s first paint are **targets, not measurements**) | Medium | Budget enforced from M0; Playwright + pixel metrics in CI; DPR cap and quality tier as fallback. |
| No test runner exists → `sdd-verify` has no machine-checked evidence until M0 | Certain today | M0 explicitly scaffolds the test/verification stack; verify phase for M0+ is evidence-based. |
| Per-frame React state reintroduced later | Medium | Zustand transient split is a hard convention documented in the project skill; review checklists enforce it. |
| Procedural geometry underwhelms visually | Medium | Verification loop catches it early; skill's material/lighting rules (HDRI, clearcoat, contact shadows) carry the premium look. |
| WebGL unavailable on target machines | Low | Static fallback (image + full spec sheet) noted as a design-phase requirement for classroom resilience. |

## Rollback Plan

Each milestone is a separate branch/PR slice; revert the merge to roll back that slice without touching others. Shared-animation or view-state architecture changes (the riskiest class) land in M1 with the scene/state contract; any later change to that contract requires its own PR with before/after Playwright screenshots attached, so regressions are visible in review. Comparison mode (M6) mounts behind its own lazy group — reverting it restores the single-cell app exactly. Static hosting means rollback is redeploying the previous `dist/` build.

## Dependencies

- None external at M0 beyond npm ecosystem (React, three, R3F, drei, GSAP — free for this use, Zustand, Playwright).
- **User input**: animal-cell Movement definition (blocks M4 animal slice only).
- Design-phase ratifications: WebGL fallback requirement, exact draw-call budget numbers, palette data model shape.

## Success Criteria

- [ ] Every organelle in both cells is hoverable (highlight + label) and clickable (isolate + bilingual spec sheet with name, function, approximate size, fun fact).
- [ ] All three processes animate in both cells where defined; the photosynthesis light-intensity slider measurably changes process speed; mitosis is scrubbable and pausable with correct phase labels; the cytokinesis contrast (contractile ring vs. cell plate) is visually unmistakable.
- [ ] A secondary-school student can navigate Animal / Plant / Comparison, switch language, and complete a quiz round without instructions — measured informally by handing the app to a non-technical observer ("que enseñe de verdad").
- [ ] Tone-mapped render colors match palette swatches (no ACES-style hue drift) including in high-contrast mode.
- [ ] Every organelle has an inspected, committed Playwright screenshot; CI fails on blank-render regressions.
- [ ] Performance targets met **or honestly re-ratified**: 60 fps steady state on a mid-tier laptop, ≤ ~150 draw calls/cell (≤ ~300 comparison), first meaningful 3D paint ≤ 3 s.
- [ ] Build stays static, every file ≤ 25 MB, deployable to Cloudflare Pages at $0.
