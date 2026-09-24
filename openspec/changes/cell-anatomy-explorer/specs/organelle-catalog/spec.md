# Delta for organelle-catalog

Capability `organelle-catalog` · Milestone **M1** · New capability (greenfield — no baseline spec).
Requirement class legend: **[BC]** biological correctness · **[VX]** visual/UX.

> **Spec update — 2026-09-17**: **ADDED** 1 requirement — `Disassembly Vector Per Record` — so the
> adopted continuous disassembly control reads its direction and travel from the catalog instead of
> hard-coded viewer values. Nothing modified, removed, or renamed.
>
> **Spec update — 2026-09-24 (mesh-geometry path)**: **MODIFIED IN PLACE** 3 requirements —
> `Required Fields`, `Asset-Swap Readiness`, and `Disassembly Vector Per Record` — so a record's
> geometry source may be a discriminated union (`'procedural' | 'mesh'`) and a mesh record may
> reference more than one mesh. Each carries its own change record quoting the original text verbatim
> plus the reason. Nothing added, removed, or renamed.

## ADDED Requirements

### Requirement: Single Source Of Truth

**[VX]** Every organelle SHALL have exactly one catalog record that is the sole source for its 3D label, spec sheet, and quiz answer. No component SHALL hard-code organelle copy or color values.

#### Scenario: One record feeds every consumer

- GIVEN the mitochondrion record is edited
- WHEN the label, the spec sheet, and the quiz are opened
- THEN all three show the edited values without any other file changing

### Requirement: Required Fields

**[BC]** Each record SHALL carry a stable id, name, function, approximate size with unit, fun fact, palette role, and a geometry source. A procedural geometry source SHALL carry its builder parameters and a deterministic seed; a mesh geometry source SHALL carry one or more manifest mesh references, each with its cell, node name, and material key.

> **MODIFIED IN PLACE (2026-09-24)** — original text preserved verbatim for audit:
> "**[BC]** Each record SHALL carry a stable id, name, function, approximate size with unit, fun fact, palette role, geometry parameters, and a deterministic seed."
> **What changed**: "geometry parameters and a deterministic seed" was replaced by "a geometry source", defined as either a procedural source (builder parameters + seed) or a mesh source (one or more manifest mesh references). Every other listed field is unchanged.
> **Reason**: the approved mesh path makes geometry a discriminated union on `geometry.kind` (`'procedural' | 'mesh'`), and a mesh record has no seed (design D19/D29). Heading deliberately unchanged so the archive merge matches by name.

#### Scenario: Incomplete record fails the build

- GIVEN a record missing its approximate size
- WHEN the catalog integrity check runs
- THEN the check fails and names the missing field and the record id

#### Scenario: Mesh record with an unknown node fails the build

- GIVEN a mesh record whose node name is absent from the committed manifest
- WHEN the catalog integrity check runs
- THEN the check fails naming the record id and the offending `geometry.meshes` entry

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

**[VX]** Geometry SHALL be addressed through the record's `geometry` union — `kind: 'procedural'` (builder parameters) or `kind: 'mesh'` (one or more manifest mesh references) — never through scattered hard-coded paths. Every record SHALL declare a procedural fallback builder, so procedural geometry remains the permanent fallback for every organelle.

> **MODIFIED IN PLACE (2026-09-24)** — original text preserved verbatim for audit:
> "**[VX]** Geometry SHALL be addressed through the record's parameters, never through scattered hard-coded paths, and procedural geometry SHALL remain the permanent fallback for every organelle."
> **What changed**: the addressing clause now names the discriminated `geometry` union explicitly, and the fallback clause now requires every record (mesh included) to declare its procedural fallback builder. The permanent-fallback guarantee is unchanged.
> **Reason**: the approved mesh path makes geometry a discriminated union and gives mesh records a per-record runtime procedural fallback (design D19/D27). Heading deliberately unchanged so the archive merge matches by name.

#### Scenario: Swapping one organelle does not touch the app

- GIVEN a future replacement asset for one organelle
- WHEN it is swapped in
- THEN the change is confined to that record and the viewer renders unchanged

#### Scenario: One record may reference more than one mesh

- GIVEN the mitochondrion record whose geometry references two meshes (outer membranes and cristae)
- WHEN the record is rendered
- THEN both meshes render as that one organelle and the catalog still exposes exactly one mitochondrion record

#### Scenario: A failed mesh load falls back to procedural geometry

- GIVEN a mesh record whose model fails to load
- WHEN the viewer renders
- THEN the record's declared procedural fallback builder renders instead and the cell does not blank

### Requirement: Disassembly Vector Per Record

**[VX]** Every record SHALL declare an explicit disassembly vector: an outward direction from the cell origin and a travel distance in scene units. The vector SHALL be data (no literal displacement values in viewer code), SHALL be identical for a record in animal view, plant view, and comparison mode, and SHALL NOT be defaulted — an omitted vector SHALL fail the catalog integrity check. The radial component of the declared direction SHALL be outward or zero, so no organelle is ever driven inward through the cell centre. For a record whose geometry references more than one mesh, the vector SHALL be measured from the union of that record's meshes' bounds, so all its parts separate together as one organelle. This extends, and does not replace, the `Required Fields` list in this capability.

> **MODIFIED IN PLACE (2026-09-24)** — original text preserved verbatim for audit:
> "**[VX]** Every record SHALL declare an explicit disassembly vector: an outward direction from the cell origin and a travel distance in scene units. The vector SHALL be data (no literal displacement values in viewer code), SHALL be identical for a record in animal view, plant view, and comparison mode, and SHALL NOT be defaulted — an omitted vector SHALL fail the catalog integrity check. The radial component of the declared direction SHALL be outward or zero, so no organelle is ever driven inward through the cell centre. This extends, and does not replace, the `Required Fields` list in this capability."
> **What changed**: one sentence was added defining how the vector is measured for a multi-mesh record (the union of that record's meshes' bounds), and the ratified 1.5× default was scoped to that same union. Everything else — data-not-code, cross-view identity, no-defaulting, outward-or-zero — is unchanged.
> **Reason**: the approved mesh path lets one record reference more than one mesh (the mitochondrion is its outer membranes plus its cristae, design D29), and D22 computes the vector once at authoring time from the union of the record's meshes' bounds. Heading deliberately unchanged so the archive merge matches by name.

> **Integrity-test implication**: `catalog/integrity.ts` extends its required-field and geometry-resolution checks to `disassembly` (direction + distance) with the same failure style — name the record id and the offending field. A **zero** vector (a part that never separates, e.g. an outer envelope the author chooses to keep) is an explicit valid choice, not an omission.
> **Ratified number — no source supplies it; flagged for design ratification**: default travel distance for a newly authored record is **1.5× that record's own bounding radius** (for a multi-mesh record, the bounding radius of the union of its parts), scaled by the 0–100% control.

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

#### Scenario: A multi-mesh record separates as one organelle

- GIVEN the mitochondrion record references its outer membranes and its cristae
- WHEN the disassembly control moves above 0%
- THEN both meshes move along the single record vector and stay together
