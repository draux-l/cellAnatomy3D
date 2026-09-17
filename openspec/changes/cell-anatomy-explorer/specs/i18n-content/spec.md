# Delta for i18n-content

Capability `i18n-content` · Milestone **M1 infrastructure, extended by every later milestone** · New capability (greenfield — no baseline spec).
Requirement class legend: **[BC]** biological correctness · **[VX]** visual/UX.

> **Spec update — 2026-09-17**: **ADDED** 1 requirement — `Bilingual Annotation Rendering Order`.
> Rationale: the adopted persistent annotations are the app's only surface showing **both** languages at
> once, so the ordering rule (active language primary/uppercase, other language secondary below) is a
> real i18n contract and is stated here rather than left to the viewer capability. Nothing modified,
> removed, or renamed.

## ADDED Requirements

### Requirement: Language Selector

**[VX]** The app SHALL offer a Spanish / English selector covering all user-facing copy. It SHALL default to Spanish and SHALL keep the selection in memory only — no local storage, cookie, or backend persistence.

> **Chosen by this spec**: the default language. The proposal requires both languages but did not state a default; Spanish is chosen for the target audience and is flagged for ratification in design.

#### Scenario: Default language is Spanish

- GIVEN a first load in a fresh session
- WHEN the app appears
- THEN all user-facing copy is Spanish

#### Scenario: Switching to English is immediate

- GIVEN the app shows the animal cell in Spanish
- WHEN the user selects English
- THEN every visible string changes to English without a page reload

### Requirement: All Educational Content Is Bilingual

**[BC]** Every educational string SHALL exist in both languages: organelle names, functions, approximate sizes, fun facts, process names, mitosis phase names, cytokinesis descriptions, and quiz prompts and feedback.

#### Scenario: Spec sheet is bilingual

- GIVEN the Golgi spec sheet is open in Spanish
- WHEN the language switches to English
- THEN name, function, size, and fun fact are all shown in English

### Requirement: No Untranslated String Ships

**[VX]** An automated check SHALL assert key parity between languages across UI copy and the catalog, and the build SHALL fail on a missing translation.

#### Scenario: Missing key fails the build

- GIVEN a UI key with no English value
- WHEN the build runs
- THEN it fails naming the key

### Requirement: Language Switch Is Non-Destructive

**[VX]** Switching language SHALL preserve the active view, selected organelle, running process, phase, speed, palette, and quiz progress.

#### Scenario: Switch mid-process

- GIVEN mitosis is paused at anaphase
- WHEN the language switches
- THEN the sequence remains at anaphase and only the copy changes

### Requirement: Educational Copy Lives In The Data Model

**[VX]** No educational string SHALL be hard-coded in a component; catalog and locale data are the only sources.

#### Scenario: Adding a language is additive

- GIVEN the content model
- WHEN a new language is added to the data
- THEN components render it without code changes

### Requirement: Technical Identifiers Stay English

**[VX]** Organelle ids, file names, code identifiers, and code comments SHALL remain English; only user-facing copy is bilingual.

#### Scenario: Ids are language-independent

- GIVEN the language is Spanish
- WHEN the catalog is inspected
- THEN record ids remain unchanged English identifiers

### Requirement: Bilingual Annotation Rendering Order

**[VX]** Because annotations are the one surface that shows both languages simultaneously, the active language SHALL be the primary line (uppercase, larger type) and the other language the secondary line directly below in smaller type. Switching language SHALL swap which locale is primary **in place**, without recreating the annotation, moving its anchor, or changing which organelles are annotated. Both lines SHALL come from the catalog record.

#### Scenario: Primary line follows the active language

- GIVEN the active language is Spanish and the mitochondrion's annotation is visible
- WHEN the annotation is read
- THEN the Spanish name is the primary line and the English name is the secondary line

#### Scenario: Switching swaps in place

- GIVEN the annotation is visible in Spanish
- WHEN the language switches to English
- THEN the English name becomes primary and Spanish becomes secondary
- AND the annotation keeps its anchor position and stays attached to its part

#### Scenario: No duplicated annotation copy

- GIVEN the annotation's two lines
- WHEN they are compared with the catalog record
- THEN both lines are that record's own `name` values, with no separate copy set
