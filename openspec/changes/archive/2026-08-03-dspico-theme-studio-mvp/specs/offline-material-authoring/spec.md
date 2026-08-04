# Delta for Offline Material Authoring

## ADDED Requirements

### Requirement: Versioned Material project lifecycle

The studio MUST create, open, save, and reopen only canonical Material projects using `formatVersion: 1`, a stable project ID, metadata, global tokens, ordered scene references, an asset manifest, and a pinned target profile. Save MUST commit canonical state atomically. A known older format MAY be migrated deterministically; an unknown, unsupported, or newer format MUST be refused without overwriting its source.

#### Scenario: Create, save, and reopen a project

- GIVEN the user supplies valid Material metadata, tokens, and target profile data
- WHEN the user creates, saves, closes, and reopens the project
- THEN the committed project and displayed canonical state are equivalent

#### Scenario: Refuse an unsupported or newer format

- GIVEN an input project has an unknown migration path or a `formatVersion` newer than supported
- WHEN the user opens it
- THEN the studio MUST report refusal, preserve the original bytes, and make no migration write

### Requirement: Canonical semantic operations

Every completed semantic edit MUST be represented by a versioned, serializable atomic operation. Replaying the committed operation sequence from its initial state MUST produce the same canonical project state and diagnostics; transient UI, DOM, callbacks, clocks, random values, and AI output MUST NOT be persisted.

#### Scenario: Replay committed edits

- GIVEN a project with metadata, token, scene-override, and acknowledgment edits
- WHEN the committed operations are replayed in order
- THEN the resulting canonical bytes, diagnostics, and snapshot identity MUST match the committed head

#### Scenario: Apply a scoped scene edit

- GIVEN a valid physical screen/mode scene identity and a token override in that scope
- WHEN the edit is committed
- THEN only that addressed scene state changes and the operation remains replayable

### Requirement: Branching history and bounded recovery

Undo and redo MUST operate on committed semantic operations. A new edit after undo MUST discard or rebase the abandoned redo branch. Snapshot retention MUST be bounded, and an interrupted save MUST reopen the last valid committed head, preserve the prior valid state, and surface recoverable orphan data without treating partial bytes as committed.

#### Scenario: Branch after undo

- GIVEN operations A, B, and C are committed and the user undoes C
- WHEN the user commits operation D
- THEN redo MUST NOT reapply C and replaying A, B, D MUST reproduce the new head

#### Scenario: Recover after interruption

- GIVEN a save is interrupted after temporary or journal data is created
- WHEN the project is reopened
- THEN the last committed head MUST load, failed staging MUST NOT become project state, and recovery diagnostics MUST be visible

### Requirement: Material-only offline boundary

The MVP MUST remain usable offline and Material-only. It MUST NOT expose Custom authoring, embedded AI, raw markup, image/background conversion, audio or BGM tooling, direct SD installation, launcher-repository mutation, or cloud/agent integrations.

#### Scenario: Keep deferred capabilities out of the workflow

- GIVEN a user completes the MVP authoring journey
- WHEN the available authoring, assistance, and installation actions are inspected
- THEN only offline Material authoring and local project/export actions MUST be available
