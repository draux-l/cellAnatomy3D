# Delta for quiz-mode

Capability `quiz-mode` · Milestone **M5** · New capability (greenfield — no baseline spec).
Requirement class legend: **[BC]** biological correctness · **[VX]** visual/UX.

## ADDED Requirements

### Requirement: Round Structure And Prompting

**[VX]** A quiz round SHALL present a sequence of blind prompts asking the learner to locate a named organelle. The prompt SHALL appear in the active language and SHALL name the target without pointing at it.

#### Scenario: Round starts with a blind prompt

- GIVEN the user starts quiz mode on the animal cell
- WHEN the first prompt appears
- THEN it names the target organelle in the active language
- AND the target is not pre-highlighted, labeled, or isolated

### Requirement: Identification Acceptance Criterion

**[VX]** An answer SHALL count as correct only when the user clicks the organelle whose catalog id equals the prompted id. Any other organelle click counts as incorrect; clicking empty space SHALL count as no answer, not as an error.

#### Scenario: Correct identification

- GIVEN the prompt asks for the lysosome
- WHEN the user clicks the lysosome
- THEN the answer is recorded as correct

#### Scenario: Incorrect identification

- GIVEN the prompt asks for the lysosome
- WHEN the user clicks the Golgi apparatus
- THEN the answer is recorded as incorrect and the clicked organelle is identified as the wrong one

#### Scenario: Empty space is not an error

- GIVEN a prompt is active
- WHEN the user clicks outside every organelle
- THEN no answer is recorded and the prompt remains active

### Requirement: Feedback On Every Answer

**[VX]** After each answer the app SHALL state the result, reveal the correct organelle's name and location, then advance. Feedback SHALL read from the catalog record, not from duplicated copy.

#### Scenario: Feedback after a wrong answer

- GIVEN the user answered incorrectly
- WHEN feedback is shown
- THEN the correct organelle is revealed and labeled with its catalog name in the active language
- AND the result is stated in words, not by color alone

### Requirement: Blind Condition Is Maintained

**[VX]** During a prompt, organelle labels, hover names, and spec sheets SHALL be suppressed so the answer cannot be read off the screen.

#### Scenario: Hover does not leak the answer

- GIVEN a prompt is active
- WHEN the pointer hovers any organelle
- THEN no name label appears and the highlight does not identify the target

### Requirement: Positional Memorization Does Not Pass

**[BC]** Target order and decoy positions SHALL be varied per round by seed, so a learner cannot pass by memorizing screen positions instead of structures.

#### Scenario: Two rounds differ

- GIVEN two consecutive rounds on the same cell
- WHEN the prompt sequences are compared
- THEN the target order differs between rounds

### Requirement: Round Summary And Exit

**[VX]** At the end of a round the app SHALL show a score and the list of misidentified organelles with their correct names, and exiting SHALL restore the viewer to its pre-quiz state.

#### Scenario: Summary names the misses

- GIVEN a round with two incorrect answers
- WHEN the round ends
- THEN the score is shown and both missed organelles are listed with their correct localized names

#### Scenario: Exit restores the viewer

- GIVEN quiz mode is active mid-round
- WHEN the user exits
- THEN labels and hover names return and no quiz state remains applied
