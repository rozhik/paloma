# Spec Delta

## ADDED Requirements

### Requirement: Edit history is stored in the sidecar
A photo entry SHALL store the photo's edit history as `editHistory`, `{"undo": [...], "redo": [...]}`, where `undo` lists earlier chains from oldest to newest and `redo` lists chains that can be redone, the next one first. The key SHALL be absent when both lists are empty, and it SHALL be kept when the edits are removed. It SHALL NOT be one of the library fields, and SHALL NOT come from or be replaced by a Picasa `.ini` import. An `editHistory` of the wrong type SHALL be treated as empty and kept in the file until the photo's edits are next saved.

#### Scenario: History stored with edits
- **WHEN** the user applies sepia to `a.jpg` that had no edits
- **THEN** the entry for `a.jpg` contains `"edits": [{ "filter": "sepia" }]` and `"editHistory": { "undo": [[]], "redo": [] }`

#### Scenario: Revert keeps the history
- **WHEN** the user reverts `a.jpg` with edits `[{ "filter": "sepia" }]` to the original
- **THEN** the entry has no `edits`, and its `editHistory` has `[{ "filter": "sepia" }]` as the last `undo` item

#### Scenario: History of the wrong type
- **WHEN** the entry for `a.jpg` contains `"editHistory": "lost"`
- **THEN** `a.jpg` opens with no undo history, and the file keeps `"editHistory": "lost"` until the user changes the edits of `a.jpg`
