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

**[VX]** Comparison SHALL sustain ≥60 fps at 1080p with ≤300 total draw calls. These are **targets pending measurement**, not measurements.

#### Scenario: Doubled budget is measured

- GIVEN comparison mode is active on the reference laptop
- WHEN frame rate and draw calls are sampled
- THEN the result is recorded against the ≥60 fps and ≤300 draw-call targets and any miss is reported

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
