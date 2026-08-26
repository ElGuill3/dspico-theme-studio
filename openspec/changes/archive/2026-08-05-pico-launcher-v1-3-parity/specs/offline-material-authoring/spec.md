# Delta for Offline Material Authoring

## MODIFIED Requirements

### Requirement: Versioned Material project lifecycle

The studio MUST create, open, save, and reopen canonical Material projects using `formatVersion: 1`, a stable project ID, metadata, `primaryColor`, `darkTheme`, and the pinned v1.3.0 profile. V1/V2 legacy projects MUST open without source overwrite and MUST migrate only through an explicit save-as that writes a new canonical artifact. Valid `primaryColor`/`darkTheme` values MAY map directly; `accent` MAY seed a value only after user confirmation; `background`, `foreground`, scenes, and transition values MUST remain migration evidence or be reported as dropped, never silently exported. Save MUST commit canonical state atomically; unknown or newer formats MUST be refused without a migration write.
(Previously: The lifecycle treated arbitrary tokens, scene references, and deterministic in-place migration as canonical Material behavior.)

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

Every completed semantic edit MUST be represented by a versioned, serializable atomic operation. Replaying committed operations for metadata, `primaryColor`, `darkTheme`, migration decisions, and acknowledgments MUST reproduce canonical bytes and diagnostics; transient UI, clocks, randomness, AI output, and silent legacy reinterpretation MUST NOT be persisted.
(Previously: Replayability included generic token and scoped scene edits as authoritative Material operations.)

#### Scenario: Replay committed edits

- GIVEN a project with metadata, Material-field, migration, and acknowledgment edits
- WHEN the committed operations are replayed in order
- THEN canonical bytes, diagnostics, and snapshot identity MUST match the committed head

#### Scenario: Apply a Material field edit

- GIVEN a valid `primaryColor` or `darkTheme` edit
- WHEN the edit is committed
- THEN only that authoritative field and its replayable operation MUST change

### Requirement: Material-only offline boundary

The first useful release MUST remain offline and Material-only, with Custom authoring/export blocked. The dependent Custom release MAY expose Custom controls only after the complete visual contract and evidence gate pass. The later BCSTM release MAY expose audio only after visual parity is proven. Unsupported v1.3.0 features, direct SD installation, launcher mutation, and AI/cloud integrations MUST remain unavailable.
(Previously: The MVP boundary was permanent and did not express the dependent Custom and later BCSTM releases.)

#### Scenario: Keep deferred capabilities blocked

- GIVEN a user completes the first useful Material authoring journey
- WHEN available authoring, assistance, and installation actions are inspected
- THEN only offline Material authoring and local project/export actions MUST be available

#### Scenario: Enforce release dependencies

- GIVEN Custom visual readiness or visual parity evidence is incomplete
- WHEN the user requests Custom or BCSTM authoring/export
- THEN the corresponding capability MUST remain blocked with a diagnostic
