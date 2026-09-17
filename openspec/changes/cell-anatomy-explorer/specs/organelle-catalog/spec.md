# Delta for organelle-catalog

Capability `organelle-catalog` · Milestone **M1** · New capability (greenfield — no baseline spec).
Requirement class legend: **[BC]** biological correctness · **[VX]** visual/UX.

> **Spec update — 2026-09-17**: **ADDED** 1 requirement — `Disassembly Vector Per Record` — so the
> adopted continuous disassembly control reads its direction and travel from the catalog instead of
> hard-coded viewer values. Nothing modified, removed, or renamed.

## ADDED Requirements

### Requirement: Single Source Of Truth

**[VX]** Every organelle SHALL have exactly one catalog record that is the sole source for its 3D label, spec sheet, and quiz answer. No component SHALL hard-code organelle copy or color values.

#### Scenario: One record feeds every consumer

- GIVEN the mitochondrion record is edited
- WHEN the label, the spec sheet, and the quiz are opened
- THEN all three show the edited values without any other file changing

### Requirement: Required Fields

**[BC]** Each record SHALL carry a stable id, name, function, approximate size with unit, fun fact, palette role, geometry parameters, and a deterministic seed.

#### Scenario: Incomplete record fails the build

- GIVEN a record missing its approximate size
- WHEN the catalog integrity check runs
- THEN the check fails and names the missing field and the record id

### Requirement: Bilingual Content

**[BC]** Every educational field SHALL exist in both Spanish and English. A missing translation SHALL fail the build rather than fall back silently.

#### Scenario: Both languages are present

- GIVEN the chloroplast record
- WHEN its content is read in Spanish and in English
- THEN name, function, size, and fun fact are present in both

#### Scenario: Missing translation is detected

- GIVEN a record with an English fun fact and no Spanish fun fact
- WHEN the catalog integrity check runs
- THEN the build fails naming the empty Spanish field

### Requirement: Canonical Animal Cell Roster

**[BC]** The animal cell SHALL contain the canonical textbook organelles and SHALL NOT contain cilia, flagella, pseudopods, or specialized cell types.

#### Scenario: Roster is canonical

- GIVEN the animal cell catalog
- WHEN the roster is listed
- THEN nucleus, mitochondria, endoplasmic reticulum, Golgi, ribosomes, lysosomes, and membrane are present
- AND no cilia, flagellum, or pseudopod record exists

### Requirement: Plant Cell Roster

**[BC]** The plant cell SHALL contain the shared organelles plus cell wall, chloroplasts, and a large central vacuole.

#### Scenario: Plant-specific organelles are present

- GIVEN the plant cell catalog
- WHEN the roster is listed
- THEN cell wall, chloroplast, and central vacuole are present alongside the shared organelles

### Requirement: Palette Role Reference

**[VX]** Records SHALL reference palette roles, not literal colors, so the palette selector and high-contrast mode can restyle every organelle without editing catalog content.

#### Scenario: Palette swap needs no catalog edit

- GIVEN the user selects a different palette
- WHEN the cell re-renders
- THEN organelle colors change while catalog content is unchanged

### Requirement: Asset-Swap Readiness

**[VX]** Geometry SHALL be addressed through the record's parameters, never through scattered hard-coded paths, and procedural geometry SHALL remain the permanent fallback for every organelle.

#### Scenario: Swapping one organelle does not touch the app

- GIVEN a future replacement asset for one organelle
- WHEN it is swapped in
- THEN the change is confined to that record and the viewer renders unchanged

### Requirement: Disassembly Vector Per Record

**[VX]** Every record SHALL declare an explicit disassembly vector: an outward direction from the cell origin and a travel distance in scene units. The vector SHALL be data (no literal displacement values in viewer code), SHALL be identical for a record in animal view, plant view, and comparison mode, and SHALL NOT be defaulted — an omitted vector SHALL fail the catalog integrity check. The radial component of the declared direction SHALL be outward or zero, so no organelle is ever driven inward through the cell centre. This extends, and does not replace, the `Required Fields` list in this capability.

> **Integrity-test implication**: `catalog/integrity.ts` extends its required-field and geometry-resolution checks to `disassembly` (direction + distance) with the same failure style — name the record id and the offending field. A **zero** vector (a part that never separates, e.g. an outer envelope the author chooses to keep) is an explicit valid choice, not an omission.
> **Ratified number — no source supplies it; flagged for design ratification**: default travel distance for a newly authored record is **1.5× that record's own bounding radius**, scaled by the 0–100% control.

#### Scenario: Missing vector fails the integrity check

- GIVEN a record with no disassembly vector
- WHEN the catalog integrity check runs
- THEN it fails naming the record id and the missing field

#### Scenario: Same record, same vector, every view

- GIVEN the mitochondrion record renders in the animal view
- WHEN the same record renders in comparison mode
- THEN its disassembly direction and distance are identical

#### Scenario: Inward directions are rejected

- GIVEN a record whose direction points toward the cell centre
- WHEN the catalog integrity check runs
- THEN it fails and names the record
