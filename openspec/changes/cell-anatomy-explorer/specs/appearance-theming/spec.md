# Delta for appearance-theming

Capability `appearance-theming` · Milestone **M5** · New capability (greenfield — no baseline spec).
Requirement class legend: **[BC]** biological correctness · **[VX]** visual/UX.

> **Spec update — 2026-09-17**: **ADDED** 1 requirement — `Annotation Ink Follows The Palette`.
> Rationale: adopted annotations add leader lines and anchors, which are new colored surfaces. Without a
> requirement that their ink is derived from the palette's `label` role, a palette swap or high-contrast
> mode could leave them hard-coded. `High-Contrast Accessibility Mode` covered label *text*; this closes
> leader lines and anchors. Nothing modified, removed, or renamed.

## ADDED Requirements

### Requirement: Per-Layer Palette Selection

**[VX]** The user SHALL be able to select a palette per layer — membrane, cytoplasm, nucleus, organelles — and the selection SHALL apply to both cells and every mode.

#### Scenario: Layer color applies everywhere

- GIVEN the cytoplasm layer color is changed
- WHEN the animal view, the plant view, and comparison mode are inspected
- THEN the cytoplasm uses the selected color in all three, with no catalog edit

### Requirement: Swatch-To-Render Fidelity

**[VX]** A rendered organelle's color SHALL match its UI swatch within the measurement tolerance. `THREE.NeutralToneMapping` is the only permitted tone mapping; ACES is prohibited because it shifts hue and breaks this requirement.

#### Scenario: Swatch and render agree

- GIVEN a palette with a known swatch value
- WHEN the cell is rendered and the organelle's pixel color is sampled
- THEN the sampled color matches the swatch within tolerance
- AND a mismatch is treated as a tone-mapping defect, not a swatch defect

### Requirement: High-Contrast Accessibility Mode

**[VX]** High-contrast mode SHALL provide a palette that is measurably distinguishable: WCAG contrast ratio ≥4.5:1 for label text against the background, and a ≥30% relative-luminance difference between adjacent layer colors. **Thresholds are targets to ratify in design.**

#### Scenario: Contrast check passes

- GIVEN high-contrast mode is enabled
- WHEN the automated contrast check runs over the palette data model
- THEN both thresholds pass
- AND enabling it changes neither catalog content nor geometry

#### Scenario: Contrast survives tone mapping

- GIVEN high-contrast mode is enabled
- WHEN label and layer colors are sampled from a rendered screenshot
- THEN they remain distinguishable within the same tolerance as the swatch check

### Requirement: Palette Is Consistent And Non-Revealing

**[VX]** The active palette SHALL apply to viewer, processes, comparison, and quiz, and SHALL NOT reveal quiz answers.

#### Scenario: Palette does not leak the quiz

- GIVEN a blind-label quiz round is active with a custom palette
- WHEN the palette is changed mid-round
- THEN colors update but no organelle name or identity is revealed

### Requirement: Fidelity Is Verified, Not Assumed

**[VX]** Swatch-render fidelity SHALL be verified by a committed headless pixel-metric check rather than by eye.

#### Scenario: The check runs in CI

- GIVEN the verification pipeline runs on a build
- WHEN the fidelity check executes
- THEN it fails when the sampled color falls outside tolerance

### Requirement: Annotation Ink Follows The Palette

**[VX]** Annotation ink — leader lines, anchors, and both language lines — SHALL derive from the palette's `label` role and never from literal colors, so a palette change or high-contrast mode restyles annotations with no catalog or code edit. The existing contrast threshold SHALL extend to annotation ink against the background.

#### Scenario: Palette swap restyles annotations

- GIVEN annotations are visible with the default palette
- WHEN the palette changes
- THEN leader lines, anchors, and both language lines adopt the new label color with no catalog edit

#### Scenario: High-contrast mode keeps annotation ink legible

- GIVEN high-contrast mode is enabled
- WHEN annotation ink is sampled against the rendered background
- THEN the WCAG ≥4.5:1 threshold holds for leader lines, anchors, and text
