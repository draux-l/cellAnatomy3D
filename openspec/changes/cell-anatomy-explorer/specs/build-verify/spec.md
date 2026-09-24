# Delta for build-verify

Capability `build-verify` · Milestone **M0, extended by every later milestone** · New capability (greenfield — no baseline spec).
Requirement class legend: **[BC]** biological correctness · **[VX]** visual/UX.

> **Spec update — 2026-09-24 (mesh-geometry path)**: **MODIFIED IN PLACE** 2 requirements —
> `Payload Budget` and `Runtime Performance Targets` — re-ratified from the measured mesh models
> (initial payload ≤6 MB, total static assets ≤6.5 MB; fps floor **≥17 fps p50**). Each carries its
> own change record quoting the original text verbatim plus the reason. Nothing added, removed, or
> renamed.

## ADDED Requirements

### Requirement: Fully Static Build With Zero Runtime Services

**[VX]** The build SHALL produce a static bundle deployable to Cloudflare Pages free tier, with no backend, no server function, and no runtime API key.

#### Scenario: No runtime service is contacted

- GIVEN the built app is served as static files
- WHEN all functionality is exercised
- THEN no application backend request is made and every dependency is a static file

### Requirement: Single-File Size Gate

**[VX]** Every built file SHALL be ≤25 MB, and the build SHALL fail when a file exceeds it.

#### Scenario: Oversized file fails the build

- GIVEN a build output file larger than 25 MB
- WHEN the size gate runs
- THEN the build fails and names the offending file

### Requirement: Payload Budget

**[VX]** The app shell JS SHALL be ≤350 KB gzip with the 3D module lazy-loaded, and the initial payload before the first 3D render SHALL be ≤6 MB, with total static assets ≤6.5 MB. Only the selected cell's model SHALL load before the first 3D render; the other cell's model SHALL stream on demand. **This budget ends the app's zero-download character**: a first-time visitor downloads the selected cell's model, and the app SHALL state that plainly rather than present itself as zero-download.

> **MODIFIED IN PLACE (2026-09-24)** — original text preserved verbatim for audit:
> "**[VX]** The app shell JS SHALL be ≤350 KB gzip with the 3D module lazy-loaded, and the initial payload before the first 3D render SHALL be ≤2.5 MB. **Targets pending M0 measurement.**" with the original scenario "*GIVEN a cold load on a throttled connection / WHEN the shell becomes visible / THEN the 3D module has not blocked the first paint / AND measured sizes are recorded against the budget*".
> **What changed**: the initial-payload ceiling moved from ≤2.5 MB to ≤6 MB; a ≤6.5 MB total-static-asset ceiling was added; selected-cell-only loading was made explicit; the zero-download loss is now stated in the requirement rather than left implicit; the stale "targets pending M0 measurement" marker was retired (this budget is re-ratified from measurement, not pending it). The shell ≤350 KB gzip cap is unchanged.
> **Reason**: the approved mesh-geometry path ships two GLB models totalling 7.25 MB against the old 2.5 MB budget — ≈3× over (design D25). The maintainer ratified "selected cell only" loading and the new ceilings knowing the zero-download character ends. Heading deliberately unchanged so the archive merge matches by name.

#### Scenario: Shell paints before the 3D module loads

- GIVEN a cold load on a throttled connection
- WHEN the shell becomes visible
- THEN the 3D module has not blocked the first paint
- AND measured sizes are recorded against the budget

#### Scenario: Only the selected cell's model loads first

- GIVEN a cold load that opens the animal view
- WHEN the first 3D render completes
- THEN the animal model was fetched and the plant model was not
- AND the plant model is fetched only when the user opens or compares the plant cell

#### Scenario: The budget is measured and reported

- GIVEN the built app
- WHEN the size audit runs
- THEN the shell, the 3D chunk, and each cell model are reported as separate rows
- AND the initial payload is compared against ≤6 MB and total static assets against ≤6.5 MB

### Requirement: Headless Screenshot Verification Loop

**[VX]** Every visual change SHALL be verified by rendering the app headlessly at a known camera pose and seed, capturing a PNG, and inspecting it. A change not visually inspected SHALL be reported as unverified.

#### Scenario: Deterministic screenshot

- GIVEN a fixed camera pose, viewport, pixel ratio, and seed
- WHEN the loop runs
- THEN it produces a repeatable PNG that is inspected before the change is called verified

### Requirement: Pixel-Metric Regression Checks

**[VX]** CI SHALL assert at least non-blank canvas coverage, the isolated organelle's occupied pixel area, and a region color matching its palette swatch. Checks SHALL use tolerance, a pinned browser build, and a frozen animation clock.

#### Scenario: Blank render fails CI

- GIVEN a regression that renders nothing
- WHEN the pixel-metric check runs
- THEN CI fails because the non-blank coverage assertion is violated

### Requirement: Per-Organelle Screenshot Coverage

**[VX]** Every organelle in both cells SHALL have a committed, inspected screenshot, and CI SHALL fail when a catalog organelle has none.

#### Scenario: New organelle requires a screenshot

- GIVEN a new organelle added to the catalog
- WHEN CI runs without its screenshot
- THEN CI fails naming the missing organelle

### Requirement: Test Runner Exists From M0

**[VX]** M0 SHALL land a runnable test command so later verification has machine-checked evidence rather than assertion.

#### Scenario: Verify has evidence

- GIVEN M0 is complete
- WHEN the configured test command runs on a clean checkout
- THEN it executes and reports results without manual setup

### Requirement: Deploy Only On Merge To Main

**[VX]** The host deploy SHALL run only on merge to the main branch, to stay inside the free build quota.

#### Scenario: Pull requests do not consume host builds

- GIVEN a pull request with several pushes
- WHEN CI runs
- THEN verification runs in CI and no host deploy is created

### Requirement: Runtime Performance Targets

**[VX]** Steady state SHALL sustain **≥17 fps p50** at 1280×800 / deviceScaleFactor 2 / DPR cap 1.5 on the reference integrated GPU, with ≤150 draw calls per cell, ≤300 in comparison, and first meaningful 3D paint ≤3 s. The fps figure is a **floor**, re-ratified from the measured mesh models (measured ≈17.3–23.9 fps p50), and replaces the previous ≥60 fps / ≥55 fps p95 target. p95 SHALL be recorded alongside p50 and carries no pass/fail threshold. The draw-call, comparison, and first-3D-paint clauses SHALL be met or explicitly re-ratified.

> **MODIFIED IN PLACE (2026-09-24)** — original text preserved verbatim for audit:
> "**[VX]** Steady state SHALL be ≥60 fps at 1080p on the reference laptop, with ≤150 draw calls per cell, ≤300 in comparison, and first meaningful 3D paint ≤3 s. **These are targets pending M0 measurement** and SHALL be met or explicitly re-ratified." with the original scenario "*GIVEN M0 instrumentation is in place / WHEN the performance measurements run / THEN each dimension is reported against its target, and any miss is re-ratified rather than ignored*".
> **What changed**: the fps target moved from ≥60 fps at 1080p to a **floor of ≥17 fps p50** at the reference measurement configuration; the ≥55 fps p95 companion target is dropped (p95 is recorded, not gated). Draw-call, comparison, and first-paint clauses are unchanged.
> **Why a floor, not a range or hardware tiering**: a range is not a pass/fail gate; hardware tiering has no detection contract in this app. A floor at 17 fps sits at the measured floor of the reference hardware (17.3–23.9 fps p50) with no invented headroom, so the target is verifiable and honest rather than aspirational.
> **Reason**: the approved mesh models measure ≈17.3–23.9 fps p50 on the reference integrated GPU (design OQ-2 / D25 / D28); the previous ≥60 fps target is unreachable by them, and shipping an unreachable number would make the requirement dishonest. Heading deliberately unchanged so the archive merge matches by name.

#### Scenario: Targets are measured and reported

- GIVEN M0 instrumentation is in place
- WHEN the performance measurements run
- THEN each dimension is reported against its target, and any miss is re-ratified rather than ignored

#### Scenario: The fps floor is met or the miss is recorded

- GIVEN the reference integrated GPU at 1280×800, deviceScaleFactor 2, DPR cap 1.5
- WHEN steady-state frame rate is sampled with a cell loaded
- THEN p50 fps is compared against the ≥17 fps floor and p95 is recorded alongside it
- AND a below-floor result is reported, never hidden or clamped
