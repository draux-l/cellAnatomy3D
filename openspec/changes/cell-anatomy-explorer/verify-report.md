# Verification Report — cell-anatomy-explorer, M0 slice (PR 1 of 12)

**Phase**: verify · **Scope**: Milestone M0 only (tasks 1.1–1.8) · **Mode**: standard (strict_tdd: false, per config)
**Verdict**: **PASS WITH WARNINGS**
**Date**: 2026-09-17 · **Verifier**: independent sdd-verify run (read-only; nothing modified, nothing committed)

> **Validator admission note (recorded honestly)**: `gentle-ai sdd-verify-validate` was attempted with the authoritative counts (build-verify: 9 requirements / 9 scenarios). Admission was DENIED repeatedly — "invalid evidence_revision in verify result envelope" — even after registering and completing a real native runtime attempt whose ledger `evidence_revision` equals the value offered. The native dispatcher still routes to `apply` (verify: blocked, task_progress 0/58) because the tasks.md checkboxes from 1.1–1.8 are unticked, which is also why the orchestrator scoped this verification to the M0 slice. This report is therefore persisted per the orchestrator's explicit instruction but was NOT accepted by the validator. Zero source/test/baseline/artifact changes were made either way.

---

## 1. Repository state (verified, not read)

- `git log`: base `ca96d88` ("Proyecto Creado") + **9** work-unit commits to `2074736`, all conventional type(scope): subject, no Co-Authored-By / no AI attribution. **The orchestrator brief said "8 commits"; the actual count is 9.** The apply phase's own report correctly listed 9 — discrepancy is in the brief, not the repo.
- Commit map matches the apply report exactly: scaffold, vitest runner, store/clock/debug, cell-viewer + mitochondrion, Playwright harness, size gates + perf writer, CI workflow, draw-call/tri budgets, baseline commit.
- **Uncommitted state found**: `.gitignore` modified (adds `references/` ignore rule, not committed) and `openspec/` + `.opencode/` fully untracked. Nothing should be committed by the verifier, but this contradicts the apply claim of a clean tree and means the SDD planning artifacts exist only in this working directory (no remote, no committed copy).

## 2. Command evidence (observed live, not from the apply report)

| Command | Exit | Observed result |
|---|---|---|
| `npm run build` (tsc --noEmit && vite build) | 0 | 604 modules; 1,189.68 kB JS raw / 334.50 kB gz, 10.24 s |
| `npm run audit:sizes` | 0 | shell 326.7 KB / 350 KB, initial 327.4 KB / 2.5 MB, largest 1.13 MB / 25 MB |
| `npm test` | 0 | **113 tests, 12 files, all pass** (2.33 s) |
| `npm run test:e2e` | 0 | **6 Playwright tests pass (26.1 s)**; see §4 |
| `npm audit` | 0 | **0 vulnerabilities** |
| Negative: 26 MB file via `--dist` temp copy | 1 | `dist/assets/bloat.js is 26.00 MB, over the 25.00 MB single-file cap` — **independently re-proven on a temp copy of dist; no source touched** |
| `npm run perf` | **not run** | Skipped deliberately: it overwrites the committed `artifacts/perf/report.json`; read-only verification forbids that. Its deterministic fields (draw calls 13, triangles 3984, payload sizes) were re-observed via the Playwright harness instead. |

`test_output_hash` (npm test, full output): `sha256:2ed41da304648870cc2f6e4b4ec384244c6f2c6be9dded717aa911b099c7c915`
`build_output_hash` (npm run build, full output): `sha256:64eaba08bdcbf1ba03b6c1be945f899bf4062b955a167a05ce2c4578598b7444`

## 3. Completeness table

| Task | Claimed deliverable | Status |
|---|---|---|
| 1.1 scaffold (pinned stack) | package.json/vite/tsconfig(strict)/App/main | done — verified in tree; React ~19.2, three 0.186, R3F/drei/zustand/gsap pinned |
| 1.2 vitest runner + seeded-noise determinism | 1 real passing test | done — 113 tests pass on clean checkout, no setup |
| 1.3 store/clock/debug bridge | discrete slice, ProcessClock singleton, `__cellDebug` | done — fixture asserts frozen clock elapsed 0; harness reads drawCalls/triangles/firstRenderAtMs/frameStats |
| 1.4 CellViewer + mitochondrion builder | Lathe shell + extruded cristae, NeutralToneMapping/SRGB | done — renders; screenshot inspected; 13 draw calls, 3,984 tris (both gates observed) |
| 1.5 Playwright harness | fixture route, metrics.ts, baselines.json, pinned config | done — byte-exact repeats observed; blank-render negative test in the committed suite |
| 1.6 size-audit + perf-report | gates + committed report.json | done — oversize gate independently proven to fail exit 1 naming the file |
| 1.7 CI workflow | verify on PR, deploy only from main | done (file). **Never executed; no remote — known accepted item**; asserted structurally by `verify/workflow.test.ts` |
| 1.8 M0 baseline | report.json committed; misses re-ratified honestly | done — fps miss recorded as `pending-user-decision`, not silently accepted |

All 8 M0 tasks are complete in substance. tasks.md checkboxes remain unticked (known; apply brief forbade touching tasks artifacts — record only). M1–M6 untouched by design.

## 4. build-verify requirements compliance matrix (9 requirements, 9 scenarios)

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | Fully Static Build, zero runtime services | **PASS** | build.spec.ts: all requests local-origin-only, failed out (observed passing); `npm run build` clean, no backend/runtime API key in the bundle |
| 2 | Single-File Size Gate (≤25 MB, build fails) | **PASS** | Gate runs inside `npm run verify` chain; exit 1 + file name proven live via a temp-dist synthetic file |
| 3 | Payload Budget (shell ≤350 KB gz, 3D lazy-loaded, initial ≤2.5 MB) | **PARTIAL** | Numbers pass: shell 326.7 KB gz, initial 327.4 KB gz, first 3D paint 538–821 ms. But there is **no lazy loading**: three.js ships inside the single entry chunk. The scenario "shell paints before the 3D module loads" is therefore not exercised by any test and is false at M0. Budget met numerically via one bundle, not via code split |
| 4 | Headless Screenshot Verification Loop (deterministic PNG, inspected) | **PASS** | Byte-exact repeats observed live: two independent loads → byte-identical PNG (167,595 bytes, hash-confirmed `buffer.equals`); committed screenshot inspected |
| 5 | Pixel-Metric Regression Checks (coverage, area band, region color, frozen clock, pinned browser) | **PASS (M0 scope)** | All three assertions run and pass at 28.34% / 290,242 px / #7c4d33 hue 21.4°, matching the committed baseline exactly; frozen clock asserted (elapsed 0); pinned `channel: chromium` + `deviceScaleFactor 1`; negative test proves the coverage gate throws on blank render. Note: region color compares to the recorded baseline, not a palette swatch — palettes do not exist until task 8.1 (M5); placeholder colors live in `src/scene/materials.ts` by declared design |
| 6 | Per-Organelle Screenshot Coverage | **PASS (M0 scope)** | The only cataloged organelle (mitochondrion) has a committed, inspected, gated screenshot; a missing baseline key throws naming the record. The catalog-enumeration gate is task 3.11 (M1) — correctly deferred |
| 7 | Test Runner Exists From M0 | **PASS** | `npm test` on this machine: 113/113 in 2.33 s, zero manual setup |
| 8 | Deploy Only On Merge To Main | **PASS (structural), runtime UNVERIFIED** | verify.yml: verify job on PR+main, deploy job `if: push && main`, `needs: verify`, deploy consumes the uploaded verified bundle; workflow.test.ts asserts these structurally. GitHub Actions has **never executed** (no remote; pushing not authorized) — known accepted item |
| 9 | Runtime Performance Targets | **PARTIAL** | draw calls 13/150, triangles 3,984/25,000, first 3D paint ≤1 s / 3,000 ms — all pass live. fps p50 28.5 (<60), p95 8.6 (<55) — **MISS, known, user-deferred**; recorded in report.ts as `pending-user-decision` with fill-rate-bound evidence and suspect (large translucent `MeshPhysicalMaterial` shell, clearcoat + DoubleSide). Target not lowered |

Verdict counts: **PASS 7 · PARTIAL 2 · FAIL 0** (over M0 scope).

## 5. Design-coherence vs. implementation

Apply's declared deviations were checked against design.md and are real and reasonable (registry maps BuilderId → pure geometry factories, not components; `ProcessClock.freezeAt()` instead of a `__CELL_FROZEN_TIME__` global; material colors pinned in `materials.ts` as explicitly temporary; added a hard draw-call/tri budget gate beyond what task 1.6 asked). All are coherent, recorded in the apply report, and none breaks a spec scenario. One design item D10's `?fixture=` freeze contract is honored app-side (verified: `debug.frozen === true`, clock elapsed 0).

## 6. Adversarial findings about the verification story itself

1. **Would these tests pass on a broken implementation?** Mostly no: no page errors, no failed requests, external requests, repeated byte-exact rendering, area ±25%, hue ±5°, and the committed draw-call/tri gates block normal broken paths. Residual gaps (not new CRITICALs): (a) since the baseline was recorded from the current output, a *coordinated* defect also changing materials + baseline in the same PR regenerates as a new passing baseline — this is by-design (the design says baseline changes must accompany visual changes in the same PR, reviewed by a human); (b) the blank-canvas negative test hides the DOM canvas, not the WebGL scene — an app-level regression that renders geometry invisibly could theoretically still fail differently. Both are accepted-design, recorded here as SUGGESTIONs.
2. **Baselines provenance**: `verify/baselines.json` and the screenshot were recorded via `UPDATE_BASELINES=1` from this very implementation. At greenfield M0 this is the correct and only possible independent starting point; regression protection begins now. Recorded, not counted against the slice.
3. **Gate-can-never-fail check**: thresholds are real (26 MB file fails; hidden canvas fails; budget gate would fail at 13 → clearly not vacuous). Playwright test asserts `drawCalls ≤ 150` (hard gap: budgets.mjs `steadyStateFps` is intentionally advisory and not CI-gated, per D8 — honest).
4. **Honesty of the reported baseline**: every reported number reproduced exactly from observed output and committed artifacts: draw calls 13, triangles 3,984, coverage 28.34%, occupied 290,242 px, region #7c4d33 hue 21.4°, PNG 167,595 bytes, shell 326.7 KB gz (=334,501 B), initial payload 327.4 KB gz (=335,300 B), largest file 1.13 MB, fps p50 28.5 / p95 8.6 with 61.1% window spread. First-3D-paint: committed report says 821 ms; live runs re-measured 538 ms — both well under the 3,000 ms target; the difference is per-run jitter of an advisory metric and does not undermine the report. Nothing was inflated.

## 7. Findings

### CRITICAL
- None.

### WARNING
1. **(NEW)** Uncommitted work is left in the tree: `.gitignore` modification (references/ rule) and untracked `openspec/` + `.opencode/`. The apply report's "committed locally" claim omits these. If the working directory is lost, the entire SDD change (10 specs, design, tasks) is unrecoverable — and the committed `.gitignore` does not exclude `references/`, risking accidentally committing the reference images on the next `git add .`. Needs an apply follow-up commit (verification must not fix it).
2. **(carried, restated with new data)** Payload-budget lazy loading is unimplemented: the whole app is one entry chunk of 1,189.68 kB raw / 334.50 KB gz. The shell-gzip budget passes only with 23 KB of headroom (326.7/350). M1's catalog/scenes will almost certainly exceed it unless code-splitting lands in the next slice. Task 3 did NOT book this; item 1.1's verification note says "bundle audited in review" — this is that audit: budget holds today, architecture doesn't yet.
3. **(carried forward, known)** fps target miss (28.5 / 8.6 vs ≥60 / ≥55): measurement unstable (7.7–37.9 fps p50 across runs on identical hardware; 61.1% spread among consecutive 2 s windows; same scene at 640×400 = 59.9 fps → fill-rate bound). User explicitly deferred; do not re-raise as blocking. Named suspect: the large translucent `MeshPhysicalMaterial` shell with clearcoat + DoubleSide.
4. **(gap, known)** GitHub Actions has never executed. Workflow contract is asserted structurally only. Known accepted; do not escalate without CI runs.
5. **(quality observation)** PR 1 stands at ≈4,399 authored changed lines (excluding package-lock and the PNG) versus the 800-line review budget and the ≈1,000-line M0 forecast. The tasks forecast for M1–M6 (≈6,000 lines) is likely 3–4× optimistic and should be re-estimated before its apply launches.

### SUGGESTION
1. Region color currently is compared against the recorded baseline, not a palette swatch; the swatch-fidelity fixtures arrive in M5 (task 8.2). Consider asserting the placeholder material hexes (#b4694a / #e9b783) in the unit suite until then to make the color source explicit (materials.ts already pins them; materials.test.ts already asserts this — keep it alive when palettes land).
2. `debug.drawCalls` gates in test 4 use `PERFORMANCE_BUDGETS.trianglesPerOrganelle` as a second cap under the same organelle — fine at M0 (1 organelle), trivially weaker once cells contain multiple organelles; the per-organelle cap check will become not-by-structure. Review in M1.
3. When running `npm run perf` in CI or locally, the committed report.json gets rewritten with a new timestamp — plan the follow-up slice to either commit the refresh or set the report path to scratch.
4. tasks.md 1.1–1.8 checkboxes and `openspec/config.yaml` `strict_tdd` are both still unfilled/false even though the design-precondition (passing vitest + Playwright) is now verifiably met. Flip both in the next apply slice.

## 8. Re-ratification / open items carried forward
- `pending-user-decision` in `artifacts/perf/report.json`. The user has, since the apply run, explicitly decided to **defer** the fps target question. This report records that and keeps the named suspect for future slices.
- Cloudflare deploy path unverified (no credentials; `--project-name=cell-anatomy-3d` is a placeholder). Known, recorded.
- `strict_tdd` and tasks checkboxes: record-only, per instructions.

## Final verdict
**PASS WITH WARNINGS** — the M0 slice fulfils its scope: all 8 tasks complete, every deterministic gate live-proven (including negative paths), the committed baseline is honest and fully reproducible, commit history matches claims. The warnings concern what the slice leaves exposed (lazy loading absent with 23 KB headroom remaining, uncommitted SDD artifacts, unexercised CI) rather than what the slice falsified.

---

## Provenance

- OpenSpec artifact: `openspec/changes/cell-anatomy-explorer/verify-report.md`
- Engram artifact: topic_key `sdd/cell-anatomy-explorer/verify-report` (same content, stored as the report body)
- `gentle-ai sdd-verify-validate`: **admission denied** — `invalid evidence_revision in verify result envelope` for every acceptable value tried, including the ledger-registered evidence revision `sha256:2ed41da304648870cc2f6e4b4ec384244c6f2c6be9dded717aa911b099c7c915` after a real `sdd-attempt acquire` → `finish (passed)` cycle. The validator was attempted per the sdd-verify contract; persistence proceeded only on the orchestrator's explicit both-store instruction. No validator-accepted bytes exist.
- Canonical artifact bytes: **14651 bytes, sha256 `c4091f819060abb39aac85996a5f99ec684b800b67bdac94fd4ec49cccca98f5`** (CRLF-form, as committed on disk).
- Verification was strictly read-only over the repository: no source files, tests, baselines, or artifacts were modified; nothing committed or pushed. A temp-copy of `dist/` in the OS temp directory was used for the negative size-gate proof and deleted afterwards.
