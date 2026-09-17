```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:e310e04349fa0b3b598ca1eabe217e774bc39a47b91433fa4410fa57a1454191
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 20/20
scenarios: 44/44
test_command: npm run verify
test_exit_code: 0
test_output_hash: sha256:725aa5a90360c2da8196cb254009ab19e08365cd35ba896733a2fb18e61de9d9
build_command: npm run build
build_exit_code: 0
build_output_hash: sha256:f9075ba2a888e42d3e2906ec7312814c4906dd359c9dd465dd75e7907030ed8f
```

# Verification Report — `cell-anatomy-explorer` · PR 3 = M1b (tasks 3.1–3.8)

**Phase**: verify · **Slice**: PR 3 of 13, `stacked-to-main` · **Base**: 479b186 · **Head**: c54a496
**Verified independently and read-only** · **Date**: 2026-09-17 · **Mode**: hybrid (OpenSpec + Engram)
**Verdict: PASS WITH WARNINGS** (see Issue group).

## 1. Git and commit claims — CONFIRMED

- `git log`: exactly **11 conventional commits** on top of 479b186, head **c54a496**, messages and task mapping match the apply report's table. Zero AI-attribution patterns in 479b186..c54a496 (`grep` on full message bodies → 0 hits).
- Clean working tree at HEAD, **one exception**: `openspec/changes/cell-anatomy-explorer/verify-report-m1a.md` exists but is **untracked**. The M1a report was not committed. New finding (SUGGESTION): commit it, or the M1a evidence is unrecoverable from a fresh clone.
- Diff 479b186..c54a496: 34 files, **3,065 insertions / 257 deletions = 3,322 changed lines** — matches the claim exactly.
- `tasks.md` 3.1–3.8 ticked in its own commit (c54a496); 3.9–3.12 correctly left open for PR 4.

## 2. Executed verification — all green, observed twice

`npm run verify` (build → audit:sizes → vitest → Playwright), run twice end-to-end this session, **exit 0 both times**:

| Step | Observed | Claim | Match |
|---|---|---|---|
| build | 615 modules, 2 chunks, CellViewer 1,005.63 kB raw / 276.47 kB gz | 276.5 kB | ✅ |
| audit:sizes | 3D module lazy; **post-split shell 62.0/150.0 KB gz** | 62.0 KB | ✅ |
| vitest | **258 tests / 21 files pass** (M1a: 170/15) | 258 | ✅ |
| Playwright | **14 tests pass in 56.8 s** (M1a: 8) | 14 | ✅ |
| Mitochondrion determinism | two loads byte-identical PNG, **184,615 bytes** | 184,615 | ✅ |

Command evidence: build+audit exit 0; `npm test` exit 0 (test output sha256: `725aa5a90360c2da8196cb254009ab19e08365cd35ba896733a2fb18e61de9d9`); bundle hashes `dist/assets/index-X3Nr-E1W.js` `d8d738fae1629c23e541684de0f222c6f2263500d8ffd2583ee754ff122c3740`, `dist/assets/CellViewer-Dxl3GL9h.js` `f9075ba2a888e42d3e2906ec7312814c4906dd359c9dd465dd75e7907030ed8f`.

## 3. Per-organelle measurements — independently observed from the harness log, CONFIRMED

| Organelle | Draw calls | Triangles | Claim | Match |
|---|---|---|---|---|
| membrane | 1 | 5,040 | 1 / 5,040 | ✅ |
| nucleus | 3 | 8,244 | 3 / 8,244 | ✅ |
| mitochondrion | 13 | 11,424 | 13 / 11,424 | ✅ |
| endoplasmic-reticulum | 1 | 8,064 | 1 / 8,064 | ✅ |
| golgi | 2 | 1,816 | 2 / 1,816 | ✅ |
| ribosome | 1 | 4,400 (220 instances) | 1 / 4,400 | ✅ |
| lysosome | 1 | 320 | 1 / 320 | ✅ |

**Composed animal cell: 22 draw calls / ~39,300 triangles** is **derived arithmetic over the seven measured per-organelle values** (sum = 22 / 39,308), not a direct render measurement — no composed-cell consumer exists yet (per plan). The arithmetic is correct; the label as a measurement would be overstated but the values are sound. All organelles sit far inside 25k tris / 150 calls; the hard budget gate (test 10, budgets.mjs ↔ `__cellDebug` runtime values) passed. Both runs reproduced every number identically.

## 4. Visual inspection — all seven committed PNGs opened and examined

Reference authority: Engram `references/cell-anatomy-visual-analysis` (#214) — wavy/irregular cristae, folded stacked ER sheets, undulating Golgi ribbons.

| Organelle | Visual verdict |
|---|---|
| **Mitochondrion** | **The radiator is gone. Folds read as organic, undulating ribbons in varied orientations with rounded free edges — the reference's "crestas onduladas" is genuinely rendered.** My judgment: this is the highest-value fix in the slice and it is real. Residual (recorded, accepted): folds sit somewhat centrally and read as discrete ribbons rather than continuous inner-membrane invaginations — the documented `ExtrudeGeometry` constant-cross-section limitation. |
| **ER (the compromise)** | Reads as a stack of wavy folded lamellae — honestly between the skill's "tubule network" and the reference's "folded stacked sheets", achieved with the skill-mandated `TubeGeometry` + one squash. Quality observation: the fold reversals show hook-shaped ribbon ends that read slightly as folded tape loops, not fully continuous sheets. Honest and adequate; not a false-teaching risk. |
| **Golgi** | Clear stack of curved crescent cisternae with visible cis/trans face asymmetry and scattered vesicles. Legible. |
| **Nucleus** | Envelope, nucleolus and instanced pores all separated and legible. Quality observation: the nucleolus silhouette still shows mild faceting, though the crack defect is gone. |
| **Membrane** | Clean soft closed noisy sphere. |
| **Ribosome** | Chunky granule cloud; documented legibility over-size, 1 draw call. |
| **Lysosome** | Smooth irregular sphere, **no cracks** — the weld fix is visible. |

## 5. Adversarial gate probes

- **(a) Draw-call/triangle gate.** Real: test 10 reads measured `__cellDebug.drawCalls/triangles` at runtime and compares against `verify/budgets.mjs`, no baseline involvement. Unit side: `registry.test.ts` double-counts triangles independently of `build.triangles`. Bite was already proven negative in M0 at a lowered budget. Honest limitation: the per-organelle numbers (13 calls etc.) are **logged in e2e output but not exact-value-gated** — a regression to more parts would not fail anything unless a budget trips.
- **(b) Cristae properties.** Three of the four are genuinely measured and would fail the M0 radiator: angle spread > 0.6π (radiator → 0, fails), per-fold spaced-point profiles pairwise unique (radiator → identical, fails), and "stops short of the far side" (septum → ~radius, fails). **The fourth (±35% axial jitter) is implemented (`CRISTA_AXIAL_JITTER=0.7`) but not measured by any test** — only "first ≠ last fold" ordering exists for spacing. The apply report's claim of "four measured properties" overstates by one. Also: the header comment cites "0.06–0.50 of the radius" for extent while the constants (and tests) say 0.24–0.46 — stale doc line.
- **(c) `countBoundaryEdges` / closed shell.** Real and measurable: lysosome and nucleolus tests assert `boundary === 0 && nonManifold === 0` on displaced geometry. Removing the UV-drop inside `smoothGeometry` would re-tear the weld (per-face UVs) and those tests immediately fail — the fix is rot-proofed, not merely fixed. No direct negative test of the 183/44 → 162/0 numbers exists (they live in the doc comment only); the claim is credible but that exact triad is **unverified** as a re-introduced mutation.
- **(d) Allowlist rot-protection.** Real, two-sided: `integrity.test.ts` asserts `PENDING_BUILDER_IDS` **equals** the declared-but-unregistered gap, so registering a plant builder without emptying the list fails, and emptying it without registering also fails (test "fails when a pending allowance is withdrawn"); a registered-but-undeclared id also fails. PR 4 cannot merge with a stale allowlist.

## 6. Requirement compliance matrix (in-scope requirements only)

| Requirement | Verdict | Evidence |
|---|---|---|
| organelle-catalog · Single Source Of Truth | **PASS** | Records feed builders' params (`registry.test.ts` "honours the catalog params"); colors stay palette-role-based; `materials.ts` placeholder colors are the known M0 deferral. |
| organelle-catalog · Required Fields | **PASS** | M1a integrity gate unchanged, still green. |
| organelle-catalog · Bilingual Content | **PASS** | M1a gate unchanged, still green. |
| organelle-catalog · Canonical Animal Cell Roster | **PASS** | M1a roster test unchanged. |
| organelle-catalog · Plant Cell Roster | **PASS** (records only) | Records exist (M1a); PR 4 builders pending by design. |
| organelle-catalog · Palette Role Reference | **PASS** | M1a colour-literal gate unchanged. |
| organelle-catalog · Asset-Swap Readiness | **PASS** | Registry resolution in data, injected into the pure integrity check; catalog stays three-free (audit passes); unregistered id fails naming record + field. |
| organelle-catalog · Disassembly Vector Per Record | **PASS** | M1a vectors verified previously, unchanged in this slice; distances remain hand-authored (accepted, task 3.12/PR 4). |
| cell-viewer · Deterministic Scene Reconstruction | **PASS** | Seeded builders; byte-identical PNG (184,615 B); per-builder hash-equality across rebuilds; fixture clock frozen. |
| cell-viewer · Accuracy Over Spectacle | **PASS** | Cristae correction driven by the user's reference facts; ER compromise reasoned and committed with rationale; technical fictions were cut, not hidden. |
| cell-viewer · Runtime Performance Targets | **PARTIAL** (accepted) | Budgets enforced as hard gates and met with margin; the fps miss (p50 ≈28.5 / p95 ≈8.6) is known, user-deferred and honestly recorded. |
| cell-viewer · Mouse-Only / Hover / Click / WebGL fallback / Disassembly / Annotations / Layout / FPS readout | **Out of scope** — tasks 4.x/6.x (PR 4–6). Not graded in this slice. | — |

Tally: **10 PASS · 1 PARTIAL · 0 FAIL** (in-scope graded); 9 requirements deferred to later slices.

## 7. Determinism assessment

Geometry determinism is solid: seeded per-fold/per-layer streams (per-index stream, so adding a fold doesn't re-roll others), byte-identical fixture PNG, EM unit-level hash equality for all seven builders. The ±1-draw-call / ±2-triangle sampling variance traces to the pre-existing 1 Hz `debug.ts` sample catching a shadow-pass quad (task 4.13 owns it). It does **not** undermine Deterministic Scene Reconstruction (geometry identity) or the pixel gates (byte-exact); it makes the *draw-call sampling* claim soft (`±1`), which the apply report states correctly.

## 8. favicon claim — verified

`git show 479b186:index.html` contains no icon link: the defect is pre-existing at the PR base, surfaced by the fixture's no-page-errors/no-failed-requests assertion which now covers it. Fixed in a165fac with a 6-line icon declaration and a rationale in the commit. Not a regression.

## 9. Issues

**CRITICAL**: none.

**WARNING**:
1. `artifacts/perf/report.json` remains the M0 snapshot (M0's numbers, pre-split sizes) — known/accepted, owned by tasks 10.1/10.3; nothing in this slice needed it beyond the audit.
2. Per-organelle exact draw-call/triangle counts are measured and logged but not exact-value regression-gated; a +N-parts drift inside budget would pass silently. Task 4.13's debug tightening is the natural home.
3. The "four measured properties" description of the cristae correction is three measured + one parameter-documented (axial jitter), and one stale doc-comment line (0.06–0.50 vs 0.24–0.46 constants).

**SUGGESTION**:
1. Commit `verify-report-m1a.md` — it is currently untracked and would be lost.
2. ER fold reversals render as tape-loop hooks; a follow-up pass could hide them, cosmetic only.
3. Nucleolus silhouette retains slight faceting; cosmetic.

## 10. Accepted limitations carried (not re-litigated)

Cristae not continuous invaginations (`ExtrudeGeometry` constant cross-section — user-accepted); fps miss deferred; GitHub Actions never executed; `strict_tdd` false; nothing consumes the builders yet; ribosome `|position|+spread = 0.924` fits on documented convention, not a gate; ribosomes deliberately oversized.

**Next milestone input for PR 4**: empty `PENDING_BUILDER_IDS` when the plant three register; extend `ORGANELLES` in `organelle.spec.ts` and re-record with `UPDATE_BASELINES=1`; register through `REGISTERED_BUILDER_IDS` only.
