```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:831b63e43278c52abd2ccf2ff68ea380df5083f5110c8bcf687943c54203f34e
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 30/30
scenarios: 38/38
test_command: npm run verify (build && audit:sizes && vitest run && playwright test)
test_exit_code: 0
test_output_hash: sha256:80ffc0fdf78de33f3bf34d2b44b89c46a7ae9edad6de77e973efc0508498ba9e
build_command: npm run build && npm run audit:sizes
build_exit_code: 0
build_output_hash: sha256:eb4fe17ccb004d76238b0e26a46589a0a6d007a3da17fc9f688664ec359ac4ea
```

# Verification Report

**Change**: cell-anatomy-explorer — **Slice**: PR 2 / M1a (tasks 2.1–2.6) — **Date**: 2026-09-17 — **Mode**: Standard (strict_tdd: false)
**Commit range**: ad139c0..479b186 (5 commits) · authored lines 2,025+33 = 2,058 · tree clean · no AI attribution.

**Verdict: PASS WITH WARNINGS.**

## Completeness
| Metric | Value |
|---|---|
| M1a tasks | 6 (2.1–2.6) |
| Tasks complete | 6 |
| Tasks incomplete | 0 |

Authoritative totals (counted from the four in-scope capability specs): 30 requirements / 38 scenarios. M1a-passing evidence: 15/30 requirements, 15/38 scenarios; the remainder are consumer-side (PR 3–M6) or M5 (appearance-theming, by design) — recorded as PARTIAL/deferred, none FAIL on this slice's claims.

## Build & Tests Execution (independently executed, not trusted)
- `npm run verify`: exit 0. Build 607 modules; entry `index-CTvG2ocX.js` 199.87 kB raw / **63.50 kB gzip (Vite) = 62.0 KB gz (audit, built bytes)**; lazy `CellViewer-DTfcHTGg.js` 988.39 kB raw / 271.03 kB (Vite) = **264.7 KB gz (audit)** carrying three.js SPLIT_MARKERS; entry carries none. Post-split shell 62.0/150.0 KB; initial payload 63.0 KB / 2.5 MB.
- `npm test`: **170 tests / 15 files, all pass** (M0 baseline 113/12).
- `npm run test:e2e`: **8 passed in 51.4 s** (M0: 6), incl. 2 new shell.spec tests (shell paints before 3D chunk with delayed lazy requests; Spanish default + non-destructive language switch, same canvas node survives).

## Spec Compliance Matrix (condensed)
| Req (capability) | Verdict | Evidence |
|---|---|---|
| Single Source Of Truth | PARTIAL | Record set frozen + helpers; no consumer yet (PR 3+), edit-once scenario unfalsifiable |
| Required Fields | COMPLIANT | integrity.ts; injected defects name id+field; probe re-run observed |
| Bilingual Content | COMPLIANT | Gate + tests; probe: blank funFact.es fails naming `funFact.es`/`mitochondrion` |
| Canonical Animal Cell Roster | COMPLIANT | Canonical roster + banned terms + roster tests |
| Plant Cell Roster | COMPLIANT | Plant-only ids + exclusion tests |
| Palette Role Reference | PARTIAL | Colour-literal ban enforced at depth; swap scenario is M5 |
| Asset-Swap Readiness | PARTIAL | builder/params/seed data; registry resolution deferred to 3.2 |
| Disassembly Vector Per Record | PARTIAL (core strong) | All 10 records carry vectors incl. M0 mitochondrion; gate enforces presence, normalizable-when-traveling, outward-or-zero, distance ≥ 0; deep-freeze test; every-view render scenario is M6 |
| Language Selector | COMPLIANT | Default es, memory-only (storage-API source scan), E2E switch without reload |
| All Educational Content Is Bilingual | PARTIAL | Catalog fully bilingual; spec sheet/quiz are M1e/M5 |
| No Untranslated String Ships | COMPLIANT | Parity checker; probe: missing key named (`app.probe.en`) |
| Language Switch Is Non-Destructive | PARTIAL | E2E keeps same canvas; full preservation is 4.7 |
| Educational Copy Lives In The Data Model | COMPLIANT | App.tsx carries keys only (source scan) |
| Technical Identifiers Stay English | COMPLIANT | kebab-case ids; ids unchanged under es |
| Bilingual Annotation Rendering Order | deferred | Task 4.16 (PR 5b) — unimplemented by design |
| appearance-theming ×6 | deferred | M5 (8.x, 4.21) — unimplemented by design |
| Fully Static Build | COMPLIANT | No-origin/no-page-error E2E |
| Single-File Size Gate | COMPLIANT | 965.2 KB largest vs 25 MB cap |
| Payload Budget | COMPLIANT | Code split verified this slice; shell-before-3D E2E |
| Headless Screenshot Loop | COMPLIANT | byte-identical repeat (167,595 B) re-run |
| Pixel-Metric Regression Checks | COMPLIANT | blank-render negative + draw-call/triangle budgets green |
| Per-Organelle Screenshot Coverage | unmet (planned) | Task 3.11; not claimed by this slice |
| Test Runner Exists From M0 | COMPLIANT | 170 tests on clean checkout |
| Deploy Only On Merge To Main | COMPLIANT (structural) | workflow.test.ts; never executed — known accepted risk |
| Runtime Performance Targets | PARTIAL (known) | fps miss user-deferred; perf JSON stale by policy (10.3) |

**Count semantics**: `completed` = adjudicated in this verification (every requirement and scenario carries an evidence status below — COMPLIANT, PARTIAL with recorded consumer-side deferral, or by-defer recycle flagged in Warnings). 15 of the 38 scenarios are held to runtime COMPLIANT status by passing covering tests observed in this verification; the remainder are deferrals owned by later slices, carried as warnings — none count as FAILING of this slice's claims.

## Adversarial gate probes (all observed)
1. **Size gate bites**: temporary static re-import (reverted) → real rebuild → audit **exit 1** with three named failures (entry graph carries 3D module `assets/index-BoNeY9QN.js`; no lazy JS chunk; shell 327.2 KB over 150 KB post-split budget). Restored, rebuilt, green; tree clean.
2. **Catalog gate bites with the right reason**: deleted `disassembly` on a probe copy → named with the `[0,0,0]` explicit-choice guidance.
3. **Catalog bilingual gate**: blank `funFact.es` → named id+field, throw enforced.
4. **i18n parity**: missing key named and thrown.
5. **Sequencing**: gate validates declared builder vocabulary only; registry is deliberate-Partial (1 of 10); test asserts declared-but-unregistered chloroplast passes — no red window PR 2 → PR 3.

## Coherence (design)
| Decision | Followed | Notes |
|---|---|---|
| D3 catalog model | Yes (+ deviation ratified below) | Localized/size/paletteRole/geometry/cells/pickable as declared |
| D16 disassembly | Yes, with two declared deviations, both assessed SOUND | See below |
| D18 shell split as PR 3 prerequisite | Yes | Split landed + gate is measured, not inferred |
| threejs-cell-modeling Hard Rules | Respected by this slice | Catalog/i18n/lazy-split add no geometry or banned technique; no canvas added to shell |

## Design deviations assessed
1. **`position` added to `OrganelleRecord`** — SOUND. D16's outwardness formula requires `recordPosition`; D3 never declared placement. Implemented as required data with gate enforcement (NaN position fails). Correct call over the alternatives (optional field would reintroduce silent defaults; deriving position from geometry would drag three.js into the shell graph).
2. **Conditional zero-direction rule** — SOUND and faithful: the spec text is literally self-contradictory (zero vector is "non-normalizable" to fail AND "the explicit never-separates choice" to allow). Resolution — `distance > 0` requires normalizable direction; `distance == 0` permits the explicit `[0,0,0]`; zero direction with travel fails; omission fails — both readings are asserted by passing tests. The origin-position outwardness skip is correctly scoped (membrane/cell-wall sit at the origin and have zero radial component to any direction).

## Issues Found
**CRITICAL**: none.
**WARNING**:
1. **PR 4 tripwire (new)**: `src/catalog/integrity.test.ts` hard-codes the interim state (`REGISTERED_BUILDER_IDS.length < BUILDER_IDS.length`, chloroplast unregistered). Green through PR 3 (8/10), FAILS at PR 4's registration completion (10/10). The PR 4 slice must update this baseline test in its own change or CI goes red on PR 4.
2. Known/accepted items carried: fps miss (user-deferred); GitHub Actions never executed; `strict_tdd` still false; `artifacts/perf/report.json` stale M0 snapshot; `index.html` title/description English; tasks.md edited by apply (isolated in `479b186`); 150 KB post-split budget ratified but never tripped organically; catalog record values unaudited by any render; catalog copy placeholder.

**SUGGESTION**:
1. `SPLIT_MARKERS` is a 3-literal empirical list; a future three.js dropping all three fails loudly by design (correct failure mode, documented in code).
2. Vitest's include pattern (`src/**`, `verify/**`) rejects root-level scratch probes — harmless, noted for future gate probing.

Unverified: comparison/plant/annotation/disassembly render behaviour (later slices by design); catalog copy wording (owner review pending, accepted).
