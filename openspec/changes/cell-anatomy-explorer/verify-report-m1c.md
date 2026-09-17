```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:6a694c5682df4e00c5a7987ddb15a2af5a824acd247211e02c84339ab3e99dfd
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 7/7
scenarios: 9/9
test_command: npm run verify
test_exit_code: 0
test_output_hash: sha256:dd153875fe3cce214b32193cb6d97b16af43fa81197e075599f8e9f9d1deeb64
build_command: npm run build
build_exit_code: 0
build_output_hash: sha256:9808e5f6b4e3f8f80568eca7de0537f1d473d86177ece77bb9e44a72ea6e19a6
```

# Verification Report — `cell-anatomy-explorer` · PR 4 = M1c (tasks 3.9–3.12)

**Phase**: verify · **Slice**: PR 4 of 13, `stacked-to-main` · **Base**: 19e5065 · **Head**: 110ca46
**Verified independently and read-only** · **Date**: 2026-09-17 · **Mode**: hybrid (OpenSpec + Engram)
**Verdict: PASS WITH WARNINGS** (all carried/known items; zero new CRITICAL).

## 1. Git and commit claims — CONFIRMED

- `git log`: exactly **5 conventional commits** on top of 19e5065, head **110ca46** (`9c00522` chloroplast · `b49e49d` vacuole + cell wall + allowlist emptied · `198e6d6` coverage gate · `6b212e4` vectors · `110ca46` ledger). Messages map to the apply table; no AI-attribution patterns in `19e5065..110ca46`.
- Working tree **clean** (verified after each destructive-free probe; every temporary probe file moved out and `git status --porcelain` re-confirmed empty).
- Diff 19e5065..110ca46: 24 files, **2,462 insertions / 74 deletions = 2,536 changed lines** — matches the claim — plus 3 generated PNG goldens (`chloroplast.png` 176,683 B, `vacuole.png` 135,425 B, `cell-wall.png` 133,183 B).
- `tasks.md` 3.9–3.12 ticked in the 110ca46 ledger commit; no other task lines changed.
- Committed-claim defect confirmed as known item: the 9c00522 body says "**chlorine** envelope" (not amended — history rewriting forbidden).

## 2. Executed verification — all green, observed twice

`npm run verify` (build → audit:sizes → vitest → Playwright) ran **twice end-to-end this session**, exit 0 both times:

| Step | Observed (this verify) | Claim | Match |
|---|---|---|---|
| build | 618 modules, 2 chunks; entry **63.50 kB gz**; lazy `CellViewer-*.js` 1,011.06 kB raw / **278.34 kB gz** | 63.50 / 278.34; +1.8 kB over M1b's 276.5 | ✅ |
| audit:sizes | 3D module lazy; post-split shell **62.0 / 150.0 KB**; initial payload 63.1 KB / 2.5 MB; largest file 987.4 KB / 25 MB | same | ✅ |
| vitest | **324 tests / 26 files pass** (M1b: 258/21) | 324 | ✅ |
| Playwright | **17 tests pass in 1.0–1.3 m** (M1b: 14) | 17 | ✅ |
| Byte-identity | mitochondrion two loads byte-identical, **184,615 bytes** | same | ✅ |

## 3. Per-organelle numbers — measured by this verify, not copied

From the actual harness output of this session's two `npm run verify` runs:

| Organelle | Draw calls | Triangles | Coverage | Region |
|---|---|---|---|---|
| chloroplast | **2** | **6,504** | 25.99 % | `#3b5e35` (hue 112.1°) |
| vacuole | **1** | **2,304** | 46.78 % | `#2b413e` |
| cell-wall | **1** | **448** | 56.04 % | `#6b634b` |

All inside the hard gates (≤150 calls per cell, ≤25,000 tris per organelle). Plant cell summed 2+1+1 vs the M1b 22 → **26 draw calls** — arithmetic over the ten records, not a composed render (known item). The ±1 **draw-call jitter** persists (lysosome read 1 here; owned by task 4.13).

## 4. The angular-silhouette claim — verified as real measurement, and probed

- The wall is a rounded **8-gon ring** (straight sides, quadratic-arc corners, inner polygon cut as a `Path` hole, `ExtrudeGeometry` along depth centred at the origin, `DoubleSide`, no `transmission`).
- The claims of "measured" are real assertions with real numbers:
  - `outlineInradius` measures the closest approach of each **segment** of the outline (the flat-sided inradius), not a naive sampled min — `expect(outlineInradius(points)).toBeCloseTo(INNER, 9)`; `outlineCircumradius` strictly greater than the inradius and below the full circumradius.
  - The fewer-sides test: `ratio(4) < ratio(8) < 0.96` with `ratio(4) < 0.85`.
- **Adversarial probe ran live** (throwaway test, deleted after, tree clean): `ratio(8) = 0.9518`, `ratio(4) = 0.7857`, and a near-circle (`sideCount: 360`) gives `ratio = 0.99998` — a sphere/circle regression would fail `expect(ratio(8)).toBeLessThan(1)` and the `< 0.96` band. The gate discriminates.
- Honest scope note (SUGGESTION 2): the angular gate attaches to the exported generators (`roundedPolygonPoints`, `cellWallShape`). A future rewrite that builds a different silhouette *without* changing those exports would not be caught by the generator tests; "thick band" and "outside the membrane" tests do still pin the built geometry.

## 5. The grana-legibility claim — verified; my own visual judgement

Five iterations are corroborated by the code (stack axis remapped via `GRANA_STACK_STAND_UP` to model X; `GRANA_DISC_TUBE_RATIO` 0.85; yaw ±0.45; showcase `size: 1`; solved axial limit + staggered rows replacing a placement that measured ~35 % interpenetration) and by committed tests (upright axes `|axis.x| > 0.8`; every granum corner inside the ellipsoid; pair distance ≥ 0.95 × touching, measured from real instance matrices with per-instance scale).

- Probe (c): the interpenetration assertion is **real and discriminating**. Measured this session at the committed parameters: minimum pair centre-distance = **1.0028** of the worst-case stack diameter (the gate fails below 0.95); a simulated clustered placement scores **0.0000** and would fail on every pair. Note the live margin above the fail line is small (~5 %) — a real but tight packing guarantee (SUGGESTION 1).
- **My visual judgement (chloroplast.png inspected directly)**: the grana read as **stacked discs**, not a spring. The left pile shows 5 clearly countable edge-on plates; the right pile reads the same; the middle pile is tilted and reads as a coarser stack with a faint ring hint from the near-closed tube hole, but the plates dominate — this is a granum, not a coil. Nuance: only **~4 of the 5** stacks are clearly discernible (the fifth surfaces as thin edge slivers behind the middle stack); a viewer counting piles may find 4. Legibility is confirmed against `references/cell-anatomy-visual-analysis` ("discos apilados ~4-6 discos"): the reference asks for stacks of 4–6 discs and countable piles; the render delivers that. The shell reads as an **oval**, not a rod (2.4:1 by measurement).

## 6. Visual judgement — cell wall and vacuole

- **cell-wall.png inspected directly**: the silhouette is **unmistakably angular** — straight sides with visibly rounded corners, eight-fold; the band's **thickness is visible** at the front rim and top edge; the bore (open depth axis) is visible. Not a sphere by any reading. Matches the reference's "silueta ANGULAR … banda gruesa". Caveat: in isolation the ring reads as an angular prism/barrel; "clearly **outside** the membrane" is corroborated **numerically only** — the test measures the real membrane builder's outermost vertex (1.035) against the wall's inner boundary (1.06): separation **0.025 scene units** at flat sides, deliberately recorded as thin (known composition debt for M1d; the reference asks for a wall "clearly separated from the membrane").
- **vacuole.png inspected directly**: a large, smooth, rounded translucent body filling most of the frame — the reference's "large rounded body", deliberately not angular. Matches.

## 7. Coverage gate — proved on a real removed file

- Probe (a), live: moved `artifacts/screens/organelle/chloroplast.png` → `npx vitest run verify/screenshot-coverage.test.ts` → **1 failed**: `passes for every catalog organelle`, with the report naming `organelleId: chloroplast` and `path: artifacts/screens/organelle/chloroplast.png` — the exact `formatMissingScreenshots` line shape `- chloroplast (plant): artifacts/screens/organelle/chloroplast.png is missing` is what `assertScreenshotCoverage` throws. File restored, tree byte-clean.
- The enumeration is catalog-derived (`screenshotRequirements` = records × cells), the committed-checkout test scans the **real filesystem**, and a dedicated guard test asserts the fixture subjects equal the registered builder ids — so a claim about "the tree it scans" cannot pass vacuously.
- Honest boundary: the gate has been exercised in vitest (and now by this probe), but **GitHub Actions has still never executed** (carried known item).

## 8. `vectors.ts` — 1.5× math, override precedence, no literal constant

- Probe (d): `suggestedDistance` = `1.5 × boundingRadius`, where `boundingRadius` = half the box diagonal; a committed test pins it against three's own `Box3.setFromBufferAttribute().getBoundingSphere().radius` to 9 decimals (unit box → √3), including the documented √3 over-radius consequence for spheres. Importing three only by **type** in `src/catalog/` is enforced by a source scan over the real tree.
- Override precedence: `travelDistanceFor(record)` returns `record.disassembly.distance` — the record always renders; `resolveDistance(geoms, explicit)` returns the declared value and refuses negative/NaN; the "override is live, not vacuous" test proves at least some records differ from the suggestion.
- Grep result: **no** literal displacement constant in viewer code (`src/scene/`, `src/app/`). The static scan is **name-targeted** (consts whose names match DISASSEMBLY/TRAVEL/DISPLACEMENT outside `vectors.ts`), applied over the real source tree, and declared non-vacuous by a dedicated test. Honest boundary (SUGGESTION 3): the scan would evade an unnamed expression such as `record.disassembly.distance * 1.5` in a viewer file; and no viewer consumer exists yet — **nothing consumes `travelDistanceFor` today** (M1d owns that; declared).
- `src/catalog/` stayed three-free: `vectors.ts` has no three import at all; the size audit (which hard-fails if three.js lands in the entry) passed, and the entry chunk measured **63.50 kB gz** — identical to PR 3's shell with the audit's 62.0 KB post-split number unchanged. `vectors.ts` cost the shell **0 bytes**. Claim verified.

## 9. `PENDING_BUILDER_IDS` 3 → 2 → 0 — both halves verified

- Git archaeology exactly as claimed: 19e5065 `['cell-wall','chloroplast','vacuole']` → 9c00522 `['cell-wall','vacuole']` (chloroplast registered, wall/vacuole still pending) → b49e49d `[]` (vacuole + wall registered). So the allowlist-equals-gap assertion could hold **at every commit** and no intermediate commit was red.
- **Rewritten, not loosened**: `registry.test.ts`'s diff replaces the M1b expectation list (and removes the "not.contains" placeholders) with the full ten-id **exact** list plus a new `resolves the whole declared vocabulary` equality assertion, and the unknown-id case still exercises the named error (now via `photosystem`). The resolution-failure path stays proved by injected registries in `integrity.test.ts`, including a test dropping a registered builder with no allowance and expecting the named failure (probe (e): a stale allowlist entry would first fail `expect([...PENDING_BUILDER_IDS]).toEqual([])`; note the integrity function alone would honour a stale allowance by design, so the sync is held by that exact-equality test, not by the integrity check).

## 10. Re-recorded baselines — verified from committed state, not re-executed

`UPDATE_BASELINES=1` was **not** re-run (it rewrites committed artifacts; forbidden here). Derived instead from the committed diff:

- All **7 M1b baseline entries** show **only** the `notes` string change (`(M1b)` → `seed-locked, clock-frozen`); coverage/occupiedArea/regionColor values are character-identical.
- No M1b PNG changed in the diff — the diff adds only the 3 new plant PNGs.
- Claim (byte-identical re-recording) **confirmed** against the committed state.

## 11. Compliance matrix

| # | Requirement (spec) | Verdict | Covering evidence |
|---|---|---|---|
| 1 | cell-viewer · *Deterministic Scene Reconstruction* | **PASS** | Seed-locked rebuild-identical tests for all three builders; registry-wide `hashPart` equality; mitochondrion byte-identity at runtime |
| 2 | cell-viewer · *Accuracy Over Spectacle* | **PASS** | Documented cuts with reasons: closed envelope rejected for the legible ring; grana disc exaggeration + bean-vs-oval recorded as honest limitations |
| 3 | cell-viewer · *Runtime Performance Targets* (measured-and-reported scenario) | **PASS** | Draw-call/triangle gates green; misses (fps) still reported, not hidden — fps miss is a carried known item, out of this slice's scope |
| 4 | organelle-catalog · *Asset-Swap Readiness* | **PASS** | Registry resolution over the whole declared vocabulary; record `geometry.params` consumed in a dedicated test |
| 5 | organelle-catalog · *Disassembly Vector Per Record* | **PASS** (slice portion) | `vectors.ts`: 1.5× Box3-matched math; override wins and is live; three-free catalog; no travel constant outside `vectors.ts`. Suggestion not yet transferred to authored records (declared, known item) |
| 6 | build-verify · *Per-Organelle Screenshot Coverage* | **PASS** | Catalog×cells enumeration; live probe on a real removed file failed naming organelle + exact path |
| 7 | organelle-catalog · *Plant Cell Roster* | **PASS** | cell-wall / chloroplast / vacuole present on the plant roster; roster + integrity tests green |

**Scenarios**: 9/9 covered by passing runtime tests (scenario count: Deterministic 1, Accuracy 1, Runtime Perf 1, Asset-Swap 1, Disassembly Vector 3, Coverage 1, Plant Roster 1).

## 12. Issues

### CRITICAL — none

### WARNING — all carried (user-accepted, listed for continuity, not re-litigated)

1. fps target missed (p50 ≈28.5 / p95 ≈8.6) — user-deferred.
2. GitHub Actions has never executed; `strict_tdd` still false; `artifacts/perf/report.json` still the M0 snapshot; `index.html` head still English.
3. ±35 % cristae axial jitter implemented but unmeasured (PR 3 open WARNING).
4. Draw-call ±1 jitter (shadow quad in a 1 Hz sample) — owned by task 4.13.
5. Nothing consumes the builders; the plant-cell summed 26 is arithmetic.
6. Composition debt for M1d: shared `membrane` is a sphere vs the angular wall; record `size` values give only a **0.025-unit** wall/membrane separation at flat sides; the wall ring is open along depth; grana discs exaggerated ~3–4×; chloroplast built along +Y.
7. Task 3.12's catalog distances are still the M1a hand-authored values; `vectors.ts` is an aid not yet applied.
8. `9c00522` body typo "chlorine envelope" for "chloroplast envelope" (not amended).
9. ER tape-loop hooks and nucleolus faceting remain PR 3 SUGGESTIONS.

### SUGGESTION — new observations from this verify

1. **Grana packing margin is live but tight**: min pair margin measured ~1.0028 of worst-case stack diameter against a fail-line of 0.95 — a ~5 % cushion. Deterministic and proven, but a future `GRANA_*` tweak could flip it red; the derivation constants make it a fragile-looking (though honest) guarantee.
2. **The angular gate attaches to the exported generators** (`roundedPolygonPoints` / `cellWallShape`). A future silhouette rewrite in `buildCellWall` that bypasses them would not be caught by the "is angular" tests; consider asserting the ratio on the *built* geometry's outline in a later slice.
3. **The displacement-constant scan is name-targeted**: a literal like `distance * 1.5` with a non-vocabulary name in viewer code would evade it. M1d should pair the scan with the 4.10 assertion "at 100 % each organelle sits along its record vector".
4. **Stack-count legibility nuance**: 4 of 5 grana piles read clearly in the committed hero pose; the fifth is mostly occluded. Acceptable, but M1d's composed plant cell should re-check pile legibility at cell scale.
5. The coverage gate is vitest-enforced and now probe-proven, but has never run in actual GitHub Actions CI (carried structural assertion only).

## 13. Final verdict

**PASS WITH WARNINGS** — every claim in the brief checked independently and confirmed: 2,536 authored changed lines, verify green (324 vitest / 17 Playwright), measured per-organelle numbers exact, the angular measurement and the interpenetration assertion are real discriminating gates, the coverage gate bites on a real removed file, `vectors.ts` implements the 1.5× Box3-matched math with working override precedence and no literal travel constant in viewer code, the allowlist shrank 3 → 2 → 0 across two commits with the registry tests rewritten (not loosened), and the seven M1b baselines were re-recorded with no metric movement. All warnings are carried items, not new defects.
