# Delta for comparison-view

Capability `comparison-view` · Milestone **M6 (last)** · New capability (greenfield — no baseline spec).
Requirement class legend: **[BC]** biological correctness · **[VX]** visual/UX.

## ADDED Requirements

### Requirement: On-Demand Only, Never Default

**[VX]** The app SHALL open in a single-cell view. Comparison SHALL render only after the user activates it, without a page reload.

#### Scenario: Startup is single-cell

- GIVEN a fresh load of the app
- WHEN the first cell appears
- THEN only one cell is mounted and no second cell is rendered off-screen

#### Scenario: Comparison is reached from a cell view

- GIVEN the plant cell is displayed
- WHEN the user activates comparison
- THEN both cells appear without the app returning to the initial loading screen

### Requirement: One Canvas, Two Groups

**[VX]** Comparison SHALL use the existing single `<Canvas>` with two cell groups. A second WebGL context SHALL NOT be created.

#### Scenario: Single context

- GIVEN comparison mode is active
- WHEN the renderer is inspected
- THEN exactly one WebGL context exists and it renders both cells

### Requirement: One Shared Timeline

**[VX]** Both cells SHALL be driven by one process timeline so phase, progress, and speed are identical on both sides.

#### Scenario: Pause affects both

- GIVEN comparison mode with a process running on both cells
- WHEN the user pauses
- THEN both cells hold the same phase and progress
- AND resuming keeps them aligned rather than drifting apart

#### Scenario: Scrub affects both

- GIVEN comparison mode with a process running
- WHEN the user scrubs to a specific phase
- THEN both cells display that same phase

### Requirement: Camera Policy

**[VX]** Both cells SHALL be viewed through one shared camera state so the comparison is a controlled visual contrast rather than two unrelated views.

> **Reported**: `exploration.md` left independent per-cell orbit open. This spec resolves toward a shared camera because the pedagogical purpose is comparison. Design MAY revisit only with a recorded rationale.

#### Scenario: Orbit applies to both

- GIVEN comparison mode is active
- WHEN the user drags to orbit
- THEN both cells move together and remain fully framed

### Requirement: Comparison Performance Budget

**[VX]** Comparison SHALL sustain the same **≥17 fps p50** floor as the single-cell views at 1280×800 / deviceScaleFactor 2 / DPR cap 1.5 on the reference integrated GPU, with ≤300 total draw calls. p95 SHALL be recorded alongside p50 with no pass/fail threshold. The ≤300 draw-call ceiling is unchanged.

> **MODIFIED IN PLACE (2026-09-24)** — original text preserved verbatim for audit:
> "**[VX]** Comparison SHALL sustain ≥60 fps at 1080p with ≤300 total draw calls. These are **targets pending measurement**, not measurements." with the original scenario "*GIVEN comparison mode is active on the reference laptop / WHEN frame rate and draw calls are sampled / THEN the result is recorded against the ≥60 fps and ≤300 draw-call targets and any miss is reported*".
> **What changed**: the fps target moved from ≥60 fps at 1080p to the same **≥17 fps p50 floor** carried by `build-verify` and `cell-viewer`; the ≤300 draw-call ceiling is unchanged.
> **Why this capability was touched although not enumerated in the amendment brief**: leaving a ≥60 fps target here while `build-verify` and `cell-viewer` carry the re-ratified floor would make the spec set self-contradictory. It is the same target class and is re-ratified identically.
> **Flagged for ratification**: no comparison-specific fps measurement exists — the floor is inherited from the single-cell measurement (≈17.3–23.9 fps p50). It SHALL be re-ratified against an actual comparison measurement at M6 rather than assumed.
> **Reason**: the approved mesh models measure ≈17.3–23.9 fps p50 (design OQ-2); comparison renders the same cells and cannot be expected to exceed the single-cell floor. Heading deliberately unchanged so the archive merge matches by name.

#### Scenario: Doubled budget is measured

- GIVEN comparison mode is active on the reference integrated GPU
- WHEN frame rate and draw calls are sampled
- THEN the result is recorded against the ≥17 fps p50 floor and the ≤300 draw-call target and any miss is reported

### Requirement: Teardown Without Leakage

**[VX]** Leaving comparison SHALL unmount the second cell, stop the shared timeline, and release its meshes, labels, and GPU resources, restoring the single-cell view exactly.

#### Scenario: Exit comparison is clean

- GIVEN comparison mode has been active with a process running
- WHEN the user exits to the single-cell view
- THEN the second cell's meshes, labels, and timeline are disposed and the single-cell state matches the pre-comparison state

### Requirement: Independently Deliverable And Revertible

**[VX]** Comparison SHALL be isolated behind its own lazily loaded group, and its absence SHALL leave the base viewer complete.

#### Scenario: Removal does not break the viewer

- GIVEN the comparison module is not loaded
- WHEN the app is used
- THEN animal and plant views, all processes, theming, and quiz all work
