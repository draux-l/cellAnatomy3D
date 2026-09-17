# Delta for build-verify

Capability `build-verify` · Milestone **M0, extended by every later milestone** · New capability (greenfield — no baseline spec).
Requirement class legend: **[BC]** biological correctness · **[VX]** visual/UX.

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

**[VX]** The app shell JS SHALL be ≤350 KB gzip with the 3D module lazy-loaded, and the initial payload before the first 3D render SHALL be ≤2.5 MB. **Targets pending M0 measurement.**

#### Scenario: Shell paints before the 3D module loads

- GIVEN a cold load on a throttled connection
- WHEN the shell becomes visible
- THEN the 3D module has not blocked the first paint
- AND measured sizes are recorded against the budget

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

**[VX]** Steady state SHALL be ≥60 fps at 1080p on the reference laptop, with ≤150 draw calls per cell, ≤300 in comparison, and first meaningful 3D paint ≤3 s. **These are targets pending M0 measurement** and SHALL be met or explicitly re-ratified.

#### Scenario: Targets are measured and reported

- GIVEN M0 instrumentation is in place
- WHEN the performance measurements run
- THEN each dimension is reported against its target, and any miss is re-ratified rather than ignored
