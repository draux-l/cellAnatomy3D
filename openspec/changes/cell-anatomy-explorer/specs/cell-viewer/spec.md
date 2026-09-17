# Delta for cell-viewer

Capability `cell-viewer` · **M1** · New capability (greenfield).
`[BC]` = biological correctness · `[VX]` = visual/UX.

> **Spec update — 2026-09-17**: extended from the user's adopted UI reference mockup.
> **ADDED** 5 requirements: continuous disassembly with a live percentage; disassembly-is-a-view-control
> (accuracy guard); persistent bilingual annotations with leader lines and anchors; annotation layout
> invariants (no crossings, no overlap, occlusion stated); on-screen FPS readout.
> **MODIFIED** 1 requirement: `Hover Highlight And Label` — hover now emphasizes an existing annotation
> instead of creating a transient label. Its full change record (original text + replacement) is attached
> to the requirement itself. Nothing was removed or renamed. Not adopted from the mockup: camera
> telemetry (azimuth/elevation), breadcrumb navigation, and the left-panel spec-table layout.

## ADDED Requirements

### Requirement: Mouse-Only Navigation And Reset

**[VX]** The viewer SHALL orbit on pointer drag, zoom on wheel scroll, and return to the view-selection state on demand. Touch, multi-pointer, and projector input are out of scope.

#### Scenario: Drag orbits without selecting

- GIVEN the animal cell is shown
- WHEN the user presses and drags the pointer more than the click threshold
- THEN the camera orbits the cell and no organelle is selected on release

#### Scenario: Scroll zoom is clamped

- GIVEN the animal cell is shown
- WHEN the user scrolls past the maximum zoom-in limit
- THEN the camera stops at the clamp and never passes inside the cell

#### Scenario: Back to selection returns to the landing state

- GIVEN an organelle is isolated and the camera is zoomed on it
- WHEN the user activates "back to selection"
- THEN the isolate clears, the view-selection state returns, and framing resets to default

### Requirement: Hover Highlight And Label

**[VX]** Hovering an organelle SHALL highlight it and emphasize its existing persistent annotation in the active language. At most one organelle SHALL be highlighted at a time. Hover SHALL NOT create a transient label, because every roster organelle already carries a persistent annotation.

> **MODIFIED IN PLACE (2026-09-17)** — original text preserved verbatim for audit:
> "*Hovering an organelle SHALL highlight it and show its catalog name in the active language. At most one organelle SHALL be highlighted at a time.*" with the original scenario "*GIVEN no organelle is selected / WHEN the pointer rests over the mitochondrion / THEN the mitochondrion is visually highlighted and its localized name appears / AND moving off the organelle removes both the highlight and the label*".
> **What changed**: hover no longer *creates* the label; it *emphasizes* the annotation that is already on screen. **Reason**: adopted persistent bilingual annotations make a transient hover label redundant and visually conflicting. The requirement heading is deliberately unchanged so the archive merge matches by name.

#### Scenario: Hover emphasizes the existing annotation

- GIVEN the mitochondrion has a persistent annotation
- WHEN the pointer rests over the mitochondrion
- THEN the mitochondrion is highlighted and its existing annotation is emphasized
- AND no additional label node is created

#### Scenario: Emphasis clears on leave

- GIVEN the pointer is emphasizing the mitochondrion's annotation
- WHEN the pointer moves off the mitochondrion
- THEN the highlight and the emphasis clear and the annotation returns to its resting state

#### Scenario: Blind quiz condition still suppresses

- GIVEN a quiz prompt is active
- WHEN the pointer rests over any organelle
- THEN no annotation is shown or emphasized

### Requirement: Click Isolate And Spec Sheet

**[VX]** Clicking an organelle SHALL isolate it and open its bilingual spec sheet with name, function, approximate size, and fun fact. Clicking empty space SHALL clear the selection.

#### Scenario: Click isolates and opens the sheet

- GIVEN the animal cell is shown
- WHEN the user clicks the Golgi apparatus
- THEN the Golgi is isolated, other organelles are de-emphasized, and its spec sheet opens

#### Scenario: Clicking empty space deselects

- GIVEN the chloroplast is isolated
- WHEN the user clicks outside any organelle
- THEN the spec sheet closes and the full cell returns

### Requirement: Deterministic Scene Reconstruction

**[BC]** Each organelle SHALL be built from a named seed so it renders identically in animal view, plant view, comparison mode, and inside any animation.

#### Scenario: Same organelle is identical across views

- GIVEN the mitochondrion renders in the animal view with seed S
- WHEN the same record is rendered in comparison mode
- THEN the generated geometry is identical

### Requirement: Accuracy Over Spectacle (Standing Tie-Break)

**[BC]** When a visual or motion effect would teach something biologically false, accuracy SHALL win and the effect SHALL be cut, with the reason recorded.

#### Scenario: False teaching blocks an effect

- GIVEN a proposed effect shows an organelle performing a function it does not perform
- WHEN it is reviewed
- THEN it is rejected and the catalog function is cited as the reason

### Requirement: WebGL-Unavailable Fallback

**[VX]** When WebGL is unavailable, the app SHALL present a static image with the full bilingual spec sheet instead of a blank canvas.

#### Scenario: No WebGL still teaches

- GIVEN a machine where WebGL context creation fails
- WHEN the user opens the app
- THEN a static cell image and the organelle spec sheets are available with no blank canvas

### Requirement: Runtime Performance Targets

**[VX]** The viewer SHALL sustain ≥60 fps at 1080p with ≤150 draw calls per cell. These are **targets pending M0 measurement**.

#### Scenario: Single cell is measured against the budget

- GIVEN a built app on the reference laptop with one cell loaded
- WHEN frame rate and draw calls are sampled in steady state
- THEN the result is recorded against the targets and any miss is reported, not silently accepted

### Requirement: Continuous Disassembly Control With Live Percentage

**[VX]** The viewer SHALL offer a continuous disassembly control from 0% (fully assembled) to 100% (fully separated) that separates each organelle outward from the cell centre along its catalog disassembly vector. The control SHALL be animated and reversible: every value SHALL be reachable in either direction, and the same value SHALL always produce the same arrangement. A live readout SHALL display the current percentage.

> **Pedagogical rationale (why this exists alongside isolate)**: isolating shows one part alone; disassembling shows **how the parts fit together**. Both lessons are wanted, and this is the control that serves the project's stated success criterion.
> **Decision to ratify**: disassembly and isolation are **mutually exclusive**, each handing off to the other. Rationale: they answer different questions, and combining them shows a detached part floating inside a displaced cell — a spatially misleading image that the accuracy tie-break forbids.

#### Scenario: Disassembly is continuous, not a toggle

- GIVEN the animal cell is fully assembled at 0%
- WHEN the user drags the disassembly control to an intermediate value
- THEN the organelles move outward by an amount proportional to that value
- AND the motion is animated rather than snapping between two states

#### Scenario: Live percentage readout tracks the value

- GIVEN the disassembly control is at 0%
- WHEN it is set to 57%
- THEN the HUD readout shows the localized state word together with `57%`
- AND the readout follows every change of the control

#### Scenario: Reversing returns an identical arrangement

- GIVEN the control was moved to 100% and then returned to 0%
- WHEN the resulting render is compared with the initial 0% render
- THEN the two are identical within the screenshot tolerance

#### Scenario: Back to selection reassembles the cell

- GIVEN the cell is disassembled at any value above 0%
- WHEN the user activates "back to selection"
- THEN the disassembly returns to 0% and the cell is fully assembled

#### Scenario: Disassembly and isolation hand off to each other

- GIVEN the cell is disassembled at 60%
- WHEN the user clicks an organelle to isolate it
- THEN the disassembly returns to 0% and the clicked organelle is isolated with its spec sheet open
- AND raising the disassembly above 0% while an organelle is isolated clears the isolate and closes the sheet

### Requirement: Disassembly Is A View Control, Not A Biological Claim

**[BC]** Disassembly SHALL be presented as a diagram convention for studying structure. The app SHALL NOT present it as something cells do, and SHALL NOT list it among the three vital processes (nutrition, movement, reproduction).

#### Scenario: It is not presented as a fourth process

- GIVEN the process selector lists nutrition, movement, and reproduction
- WHEN the disassembly control is inspected
- THEN it is presented as a view/inspection control for structure, not as a cellular process

#### Scenario: The accuracy tie-break applies to it

- GIVEN a proposed disassembly behaviour would imply organelles separate this way as a living event
- WHEN it is reviewed
- THEN the claim is rejected and the control is labelled as an exploded-view study aid

### Requirement: Persistent Bilingual Annotations With Leader Lines And Anchors

**[VX]** Every organelle in the current roster SHALL carry a persistent annotation that is always visible, connected to its part by a leader line terminating in an anchor on that part. Each annotation SHALL show both languages at once, ordered by the `i18n-content` contract. Annotations SHALL stay attached to their part while the cell orbits and while disassembly changes. This annotation system is the app's only label system, and hover emphasizes an existing annotation rather than creating a new one.

#### Scenario: Every roster organelle is annotated at rest

- GIVEN the animal cell is loaded with no interaction
- WHEN the viewer settles
- THEN every roster organelle has a visible annotation with a leader line and an anchor on the part

#### Scenario: Both languages are shown at once

- GIVEN the active language is Spanish
- WHEN the mitochondrion's annotation is read
- THEN its Spanish name is the primary line and its English name is the secondary line below it

#### Scenario: Annotations stay attached while orbiting

- GIVEN annotations are visible
- WHEN the user drags to orbit the cell
- THEN each anchor stays on its part and each leader line follows it

#### Scenario: Annotations stay attached while disassembling

- GIVEN the cell is at 0% disassembly
- WHEN the control is moved to 100%
- THEN every annotation follows its part and remains attached
- AND no anchor is left pointing at empty space

#### Scenario: Quiz suppression still wins

- GIVEN a quiz prompt is active
- WHEN annotations would otherwise render
- THEN they are suppressed for the duration of the prompt

### Requirement: Annotation Layout Does Not Cross Or Overlap

**[VX]** At every disassembly value and every camera orbit, annotation layout SHALL hold these invariants: leader lines SHALL NOT cross one another; annotation boxes SHALL NOT overlap; every annotation SHALL stay inside the viewport; and each annotation SHALL be assigned to the left or right column by the projected side of its part, with hysteresis so a slow orbit across the centre does not flip it repeatedly. An anchor occluded by the cell SHALL be stated visually rather than hidden.

> **Ratified numbers — no source supplied them; flagged for design ratification**: hysteresis band **±5% of viewport width**; minimum vertical gap between annotation boxes **4 px**; occluded leader-line and anchor opacity **≤50%**.

#### Scenario: No crossings at rest

- GIVEN the viewer is at rest with all annotations visible
- WHEN the rendered leader-line segments are compared pairwise in screen space
- THEN zero pairs intersect

#### Scenario: No crossings while disassembling

- GIVEN the cell is stepped from 0% to 100% in increments
- WHEN each step is measured
- THEN zero leader-line pairs intersect at every step

#### Scenario: No overlap and nothing off screen

- GIVEN annotations are visible at any disassembly value
- WHEN their boxes and the viewport are measured
- THEN no two boxes overlap, each adjacent pair keeps the minimum gap, and every box is inside the viewport

#### Scenario: Column assignment does not thrash

- GIVEN an organelle orbits slowly across the vertical centre
- WHEN it crosses the centre within the hysteresis band
- THEN its column does not flip repeatedly and its leader line never sweeps across the opposite column

#### Scenario: Occlusion is stated, not hidden

- GIVEN a part whose anchor sits behind the cell body
- WHEN its annotation is rendered
- THEN the leader line and anchor are de-emphasized so depth is not misread
- AND the annotation itself remains visible

### Requirement: On-Screen FPS Readout

**[VX]** The viewer HUD SHALL display a live frames-per-second readout sourced from the same rAF frame sampler the verification harness reads, updated at a bounded cadence, and SHALL NOT drive it through React state. The app's debug bridge SHALL expose a scene-tree render count so the no-per-frame-re-render contract is measurable.

> **Honest context — this is why the requirement exists**: the readout makes rendering performance **user-visible**. Measured M0 performance is **below** the stated target (p50 ≈28 fps, p95 ≈9 fps versus ≥60/≥55 fps; fill-rate bound — see `verify-report.md`). The readout exists so that miss is visible and honest. It SHALL NOT be hidden, hidden-when-poor, clamped upward, or replaced by a qualitative indicator; the ≥60 fps target itself is unchanged.
> **Ratified numbers — flagged for design ratification**: rolling window **≥500 ms**; update cadence **≤4 Hz**; displayed value within **±10%** of the harness-sampled value on a frozen fixture.

#### Scenario: The readout is always on screen

- GIVEN any view (animal, plant, or comparison) and any active process
- WHEN the viewer HUD is inspected
- THEN a numeric fps readout is present

#### Scenario: The displayed value is the measurement

- GIVEN a frozen fixture whose sampler value is known
- WHEN the readout is read
- THEN it agrees with the sampled value within tolerance

#### Scenario: A below-target value is displayed

- GIVEN the measured frame rate is below the 60 fps target
- WHEN the readout updates
- THEN it shows the below-target number
- AND the app does not hide, clamp, or substitute the readout

#### Scenario: The readout does not re-render the scene

- GIVEN the scene is idle for 10 s with the readout visible
- WHEN the scene-tree render count is compared with the same window with the readout disabled
- THEN the counts are equal and the readout updated at most at the bounded cadence
