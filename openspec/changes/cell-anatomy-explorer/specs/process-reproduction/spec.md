# Delta for process-reproduction

Capability `process-reproduction` · Milestone **M3** · New capability (greenfield — no baseline spec).
Requirement class legend: **[BC]** biological correctness · **[VX]** visual/UX.

## ADDED Requirements

### Requirement: Mitosis Phase Sequence

**[BC]** **Biological fact**: mitosis proceeds through prophase, metaphase, anaphase, and telophase, followed by cytokinesis. The phases are strictly ordered.

#### Scenario: Phases play in order with correct labels

- GIVEN the reproduction process is opened
- WHEN the sequence plays from the start
- THEN the visible phase labels follow prophase → metaphase → anaphase → telophase → cytokinesis
- AND each label is shown in the active language

#### Scenario: Order is not reversible by scrubbing mistakes

- GIVEN the sequence is playing forward
- WHEN it advances
- THEN no phase is displayed out of the order above

### Requirement: Chromosome Behavior Matches Each Phase

**[BC]** **Biological fact**: in metaphase the chromosomes align along the cell's equator; in anaphase the sister chromatids separate and move to opposite poles; in telophase two nuclei form.

#### Scenario: Alignment then separation

- GIVEN the sequence is at metaphase
- WHEN it advances to anaphase
- THEN the chromosomes shown aligned at the equator separate into two groups moving to opposite poles
- AND the render does not show chromatids separating before metaphase

### Requirement: Scrub And Phase Addressability

**[VX]** The sequence SHALL be seekable by phase label and by continuous progress, and scrubbing SHALL be reversible without re-triggering side effects.

#### Scenario: Seek by label

- GIVEN the sequence is paused at prophase
- WHEN the user selects the "anaphase" phase
- THEN the sequence jumps to anaphase and shows its label

#### Scenario: Scrub backwards

- GIVEN the sequence is at telophase
- WHEN the user drags the scrub bar backwards
- THEN the sequence plays backwards through the intermediate phases and stays visually consistent

### Requirement: Speed Control

**[VX]** The sequence SHALL support pause, slow motion, and real time, driven by one shared process clock rather than per-frame UI state.

#### Scenario: Pause freezes the phase

- GIVEN the sequence is playing at real time
- WHEN the user pauses
- THEN the sequence holds its current phase until resumed

### Requirement: Cytokinesis Contrast — Contractile Ring vs. Cell Plate

**[BC]** **Biological fact**: animal cytokinesis pinches the cell inward with a contractile ring forming a cleavage furrow, while plant cytokinesis builds a cell plate outward from the centre, which becomes the new cell wall.

#### Scenario: The contrast is visually unmistakable

- GIVEN the animal cell at cytokinesis
- WHEN the user toggles to the plant cell's cytokinesis
- THEN the animal side clearly shows inward pinching by a ring and the plant side clearly shows a plate forming from the centre outward
- AND the two are not shown as the same motion with a recolored label

### Requirement: Contrast Teaches Before Comparison Mode Exists

**[VX]** The cytokinesis contrast SHALL be deliverable inside the single-cell view through a phase toggle, so M3 does not depend on comparison mode (M6).

#### Scenario: Contrast without split screen

- GIVEN only the single-cell reproduction view exists
- WHEN the user toggles the cytokinesis phase between animal and plant
- THEN both mechanisms can be compared and their difference is stated in the active language
