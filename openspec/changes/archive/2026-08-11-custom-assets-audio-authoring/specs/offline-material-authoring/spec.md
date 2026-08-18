# Delta for Offline Material Authoring

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Material-only offline boundary

The first useful release MUST remain offline, with Custom visual authoring and optional UI WAV authoring available only behind their complete typed-media, validation, and evidence gates. BCSTM authoring MUST remain unavailable until the complete visual package and visual receipt pass. Unsupported v1.3.0 features, direct SD installation, launcher mutation, and AI/cloud integrations MUST remain unavailable.
(Previously: The first useful release was Material-only, with all Custom and audio authoring deferred.)

#### Scenario: Keep unsupported capabilities blocked

- GIVEN a user requests an excluded feature, direct installation, or an unproven capability
- WHEN available authoring and installation actions are inspected
- THEN the studio MUST keep that action unavailable with a blocking diagnostic

#### Scenario: Enforce component dependencies

- GIVEN visual readiness or its required receipt is incomplete
- WHEN the user requests BCSTM authoring or export
- THEN BCSTM MUST remain blocked while eligible visual and optional WAV workflows retain their own gates
