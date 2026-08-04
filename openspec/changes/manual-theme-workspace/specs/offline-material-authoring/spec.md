# Delta for Offline Material Authoring

## MODIFIED Requirements

### Requirement: Versioned Material project lifecycle

The studio MUST create/open/save/reopen canonical Material V1 and ThemeProjectV2 projects. V2 MUST declare one `themeKind`: `material` or `custom`; Custom V2 MUST remain limited to first-release top/bottom backgrounds. Save MUST be atomic. V1 migration MUST require explicit V2 save confirmation and produce equivalent Material metadata, tokens, scenes, acknowledgments, and Custom composition state without implicit V1 rewriting. Unknown, invalid, or newer formats MUST be refused without overwrite.
(Previously: The lifecycle created and reopened only canonical Material `formatVersion: 1` projects, with only a generic known-older migration allowance.)

#### Scenario: Create, save, and reopen a supported kind

- GIVEN valid Material or Custom V2 data with an explicit theme kind
- WHEN the user creates, saves, closes, and reopens the project
- THEN state and committed bytes are equivalent and the kind is unchanged

#### Scenario: Migrate V1 without implicit overwrite

- GIVEN a V1 Material project
- WHEN user opens it and has not explicitly confirmed a V2 save
- THEN a deterministic Material V2 candidate may be shown, but the original V1 bytes remain unchanged

#### Scenario: Refuse unsupported or newer input

- GIVEN an unknown migration path or a format version newer than supported
- WHEN the user opens it
- THEN the studio reports refusal, preserves original bytes, and performs no migration write

### Requirement: Material-only offline boundary

MVP MUST remain offline, sandboxed, and usable without AI, cloud, agents, network, shell, or external tools. It MAY expose explicit Custom V2 top/bottom authoring, but MUST NOT expose later grid/banner/scrim/palette/icon/audio tooling, SD installation, launcher mutation, or native-content editing.
(Previously: The MVP was strictly Material-only and exposed no Custom authoring or image/background conversion.)

#### Scenario: Keep deferred capabilities out of the workflow

- GIVEN a user completes the supported authoring journey
- WHEN available authoring, assistance, and installation actions are inspected
- THEN only offline Material features and bounded Custom top/bottom project actions are available

#### Scenario: Work without integrations

- GIVEN network, AI, agent, shell, and external-converter services are unavailable
- WHEN the user creates, edits, saves, validates, and exports a project
- THEN the supported workflow remains functional or reports a local blocking diagnostic

## ADDED Requirements

### Requirement: Material and Custom kind safety

The studio MUST treat `material` and `custom` as separate kinds. It MUST NOT silently convert Material tokens into Custom layers or discard Custom assets during a switch. A switch MAY be offered only with confirmation when no Custom assets or documents exist; otherwise it MUST be refused non-destructively.
(Previously: The MVP was Material-only and provided no theme-kind compatibility rule.)

#### Scenario: Preserve Material equivalence

- GIVEN a V1 Material project with metadata, tokens, scenes, and acknowledgments
- WHEN it is explicitly saved as V2 Material
- THEN those values remain equivalent and no Custom asset is invented

#### Scenario: Block a destructive switch

- GIVEN a Custom V2 project with any referenced asset or composition document
- WHEN the user requests a Material kind switch
- THEN the request is refused, Custom kind and assets remain intact, and no destructive operation is recorded

### Requirement: V2 compositional semantic operations

V2 MUST represent layer add/update/remove/reorder, asset registration/removal, slot assignment, and Custom property edits as versioned replayable operations. Asset bytes MUST NOT be embedded. Completed canvas gestures MUST commit one semantic operation while transient movement remains non-authoritative.

#### Scenario: Replay a layer edit

- GIVEN a V2 project with a layer add, move, reorder, and visibility sequence
- WHEN committed operations are replayed from the initial state
- THEN the same canonical layers, references, and diagnostics are produced

#### Scenario: Do not persist transient interaction

- GIVEN a pointer drag is still in progress
- WHEN the project is saved or an authoritative action is requested
- THEN only the last valid committed state is used until the gesture completes or is cancelled
