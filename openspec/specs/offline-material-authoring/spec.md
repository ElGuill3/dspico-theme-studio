# Delta for Offline Material Authoring

## ADDED Requirements

### Requirement: Versioned Material project lifecycle

The studio MUST create, open, save, and reopen canonical Material projects using `formatVersion: 1`, a stable project ID, metadata, `primaryColor`, `darkTheme`, and the pinned v1.3.0 profile. V1/V2 legacy projects MUST open without source overwrite and MUST migrate only through an explicit save-as that writes a new canonical artifact. Valid `primaryColor`/`darkTheme` values MAY map directly; `accent` MAY seed a value only after user confirmation; `background`, `foreground`, scenes, and transition values MUST remain migration evidence or be reported as dropped, never silently exported. Save MUST commit canonical state atomically; unknown or newer formats MUST be refused without a migration write.

#### Scenario: Create, save, and reopen a project

- GIVEN valid Material metadata, `primaryColor`, `darkTheme`, and target profile data
- WHEN the user creates, saves, closes, and reopens the project
- THEN the committed project and displayed canonical state MUST be equivalent

#### Scenario: Refuse an unsupported or newer format

- GIVEN an input project has no migration path or a newer `formatVersion`
- WHEN the user opens it
- THEN the studio MUST report refusal, preserve the original bytes, and make no migration write

#### Scenario: Migrate legacy data by save-as

- GIVEN a valid V1/V2 project containing ambiguous tokens or scenes
- WHEN the user confirms save-as migration
- THEN the new project MUST preserve source bytes and migration evidence, require explicit mappings, and exclude unconfirmed legacy values from export

### Requirement: Canonical semantic operations

Every completed semantic edit MUST be represented by a versioned, serializable atomic operation. Replaying the committed operation sequence from its initial state MUST produce the same canonical project state and diagnostics; transient UI, DOM, callbacks, clocks, random values, and AI output MUST NOT be persisted.

#### Scenario: Replay committed edits

- GIVEN a project with metadata, Material-field, migration, and acknowledgment edits
- WHEN the committed operations are replayed in order
- THEN canonical bytes, diagnostics, and snapshot identity MUST match the committed head

#### Scenario: Apply a Material field edit

- GIVEN a valid `primaryColor` or `darkTheme` edit
- WHEN the edit is committed
- THEN only that authoritative field and its replayable operation MUST change

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

The first useful release MUST remain offline and Material-only, with Custom authoring/export blocked. The dependent Custom release MAY expose Custom controls only after the complete visual contract and evidence gate pass. The later BCSTM release MAY expose audio only after visual parity is proven. Unsupported v1.3.0 features, direct SD installation, launcher mutation, and AI/cloud integrations MUST remain unavailable.

#### Scenario: Keep deferred capabilities blocked

- GIVEN a user completes the first useful Material authoring journey
- WHEN available authoring, assistance, and installation actions are inspected
- THEN only offline Material authoring and local project/export actions MUST be available

#### Scenario: Enforce release dependencies

- GIVEN Custom visual readiness or visual parity evidence is incomplete
- WHEN the user requests Custom or BCSTM authoring/export
- THEN the corresponding capability MUST remain blocked with a diagnostic
