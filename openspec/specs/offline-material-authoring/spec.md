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

### Requirement: Portable typed media and replayable asset operations

The studio MUST persist PNG, source/prepared WAV, BCSTM, and receipt assets as typed immutable hash-addressed records with media type, provenance, rights, assignments, recipes, profile identity, and evidence references. Reopening MUST verify hashes, media contracts, and replayable operations before editing or export; filesystem paths MUST NOT establish authority.

#### Scenario: Save and reopen a mixed asset project

- GIVEN a project containing visual sources, prepared sounds, optional BCSTM, and evidence references
- WHEN it is saved, closed, and reopened
- THEN canonical assets, hashes, recipes, provenance, rights, and assignments MUST be equivalent

#### Scenario: Reject a typed-media mismatch

- GIVEN stored bytes do not match their declared type or hash
- WHEN the project is reopened
- THEN the affected asset MUST be quarantined or refused and export MUST remain blocked

### Requirement: Component-scoped evidence staleness

Project operations MUST track visual, WAV, and BCSTM staleness independently. Visual output changes MUST stale visual receipts; BCSTM replacement MUST stale its source receipt; WAV preparation changes MUST update project identity while retaining capability-level evidence and requiring no per-project WAV receipt.

#### Scenario: Change one component

- GIVEN valid evidence exists for visual, WAV capability, and BCSTM components
- WHEN only a visual transform or BCSTM source changes
- THEN only the corresponding component gate MUST become stale

### Requirement: Material-only offline boundary

The first useful release MUST remain offline, with Custom visual authoring and optional UI WAV authoring available only behind their complete typed-media, validation, and evidence gates. BCSTM authoring MUST remain unavailable until the complete visual package and visual receipt pass. Unsupported v1.3.0 features, direct SD installation, launcher mutation, and AI/cloud integrations MUST remain unavailable.

#### Scenario: Keep unsupported capabilities blocked

- GIVEN a user requests an excluded feature, direct installation, or an unproven capability
- WHEN available authoring, assistance, and installation actions are inspected
- THEN the studio MUST keep that action unavailable with a blocking diagnostic

#### Scenario: Enforce component dependencies

- GIVEN visual readiness or its required receipt is incomplete
- WHEN the user requests BCSTM authoring or export
- THEN BCSTM MUST remain blocked while eligible visual and optional WAV workflows retain their own gates
