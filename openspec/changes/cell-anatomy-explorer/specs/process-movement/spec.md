# Delta for process-movement

Capability `process-movement` · Milestone **M4** · New capability (greenfield — no baseline spec).
Requirement class legend: **[BC]** biological correctness · **[VX]** visual/UX.

> **OPEN INPUT — do not resolve in this spec.** The animal-cell Movement content is **undefined**. Owner: **the user**, who will supply reference images and define which organelles are included and what functions they perform. This spec MUST NOT invent that content. Plant cyclosis is specifiable now, and only the M4 animal work unit is blocked.

## ADDED Requirements

### Requirement: Plant Cyclosis Animation

**[BC]** **Biological fact**: cyclosis is the streaming of the cytoplasm that moves organelles and substances around the large central vacuole of a plant cell. It is continuous motion, not a one-shot sequence.

#### Scenario: Streaming is continuous

- GIVEN the plant cell with the movement process open
- WHEN cyclosis is activated
- THEN particles and organelles visibly circulate around the central vacuole without stopping until the user stops them

#### Scenario: Speed control slows the streaming

- GIVEN cyclosis is running
- WHEN the user sets the speed control to slow motion
- THEN the streaming rate decreases and the direction of flow is unchanged

#### Scenario: Exiting stops the streaming

- GIVEN cyclosis is running
- WHEN the user exits the movement process
- THEN the streaming stops and the base viewer state is restored

### Requirement: Animal Movement Content Is Blocked, Not Invented

**[BC]** The animal-cell Movement slice SHALL NOT display invented content. Until the user supplies the definition, the app SHALL state that the content is not yet available instead of presenting a placeholder animation.

#### Scenario: Undefined content is declared

- GIVEN the animal cell with the Movement process selected before the content definition exists
- WHEN the process is opened
- THEN the app states that this content is not yet available
- AND no animation, diagram, or organelle list is fabricated

#### Scenario: Defined content replaces the statement

- GIVEN the user has supplied the animal Movement definition
- WHEN the process is opened
- THEN the defined organelles and animation are shown and the unavailable statement is removed

### Requirement: Movement Does Not Imply Cell Motility

**[BC]** The animal process SHALL NOT depict the canonical cell relocating, because the canonical animal cell does not translocate and has no cilia or pseudopods.

> **Dependency**: everything except this prohibition depends on the open Movement input named above.

#### Scenario: No false motility

- GIVEN the animal Movement process is displayed with supplied content
- WHEN the animation plays
- THEN the cell boundary does not travel across the scene as if the cell were swimming
- AND no cilia or pseudopod is introduced to justify motion
