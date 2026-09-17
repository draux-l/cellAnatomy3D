# Delta for process-nutrition

Capability `process-nutrition` · Milestone **M2** · New capability (greenfield — no baseline spec).
Requirement class legend: **[BC]** biological correctness · **[VX]** visual/UX.

## ADDED Requirements

### Requirement: Respiration Animates Inside The Mitochondrion

**[BC]** **Biological fact**: cellular respiration releases energy from glucose in the mitochondrion, and the folded inner membrane (cristae) is where the reactions producing most of the cell's ATP occur. It does not use light.

#### Scenario: Respiration is localized and light-independent

- GIVEN the animal cell with the nutrition process open
- WHEN respiration is activated
- THEN the animation occurs inside the mitochondrion on its cristae
- AND it runs without any light source

### Requirement: Photosynthesis Animates Inside The Chloroplast

**[BC]** **Biological fact**: photosynthesis uses light energy to build glucose inside the chloroplast, where thylakoids stacked as grana are the light-capturing structures.

#### Scenario: Photosynthesis is localized to the chloroplast

- GIVEN the plant cell with the nutrition process open
- WHEN photosynthesis is activated
- THEN the animation occurs inside the chloroplast on the grana
- AND the process is visibly absent from the animal cell

### Requirement: Light-Intensity Slider Drives The Process Rate

**[BC]** The light-intensity slider SHALL change the rate of the photosynthetic sequence measurably and SHALL NOT alter the respiration sequence. The control SHALL drive continuous motion through the animation clock, not a re-render per frame.

#### Scenario: Slider changes the rate

- GIVEN photosynthesis is running at minimum light intensity
- WHEN the slider is moved to maximum
- THEN the measured process rate increases relative to the minimum setting
- AND the respiration animation is unchanged

#### Scenario: Zero light is honest

- GIVEN the slider is at zero
- WHEN photosynthesis is observed
- THEN the light-dependent animation stops and the UI states in the active language that light is required
- AND the animation does not continue as if light were present

### Requirement: Speed Control And Clean Exit

**[VX]** Nutrition SHALL start only when the user enters the process, SHALL respond to the shared pause / slow / real-time control, and SHALL leave the base viewer intact when exited.

#### Scenario: Pause freezes the process

- GIVEN respiration is running
- WHEN the user pauses
- THEN the process holds its current state until resumed

#### Scenario: Exit restores the base viewer

- GIVEN the photosynthesis animation is mid-run
- WHEN the user exits the process
- THEN the cell returns to the base viewer with no animation running
- AND the catalog and selection state are unchanged

### Requirement: The Two Processes Are Not Conflated

**[BC]** Respiration and photosynthesis SHALL be presented as distinct processes with distinct inputs and locations, and neither SHALL be shown inside the other's organelle.

#### Scenario: Organelles are not swapped

- GIVEN both processes are available
- WHEN each is displayed
- THEN photosynthesis appears only in the chloroplast of the plant cell and respiration only in the mitochondrion
