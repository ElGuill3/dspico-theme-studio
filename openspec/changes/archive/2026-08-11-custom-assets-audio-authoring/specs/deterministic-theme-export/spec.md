# Delta for Deterministic Theme Export

## MODIFIED Requirements

### Requirement: Export gate and reproducible bundle

The exporter MUST fail closed when any included component has an error, unacknowledged warning, incomplete rights/provenance, stale required evidence, or unsupported feature. The Material-first release boundary MUST remain: every Custom entry point MUST return a blocking capability diagnostic and MUST write no ready or partial output until the exact 12-file visual contract and its required receipt pass. Optional prepared WAVs MAY use installed-target capability evidence without a per-project WAV receipt; one BCSTM MAY proceed only after the visual receipt and its separate BCSTM receipt pass. The `NOT READY — CARTRIDGE TEST ONLY` handoff MUST never become a ready ZIP or export approval. Successful folder and ZIP output MUST be equivalent and MUST contain `theme.json`, an ordered report, provenance, diagnostics, acknowledgments, credits, licenses, and file SHA-256 values. Reports MUST preserve source/fixture evidence `kind`; without a physical receipt they MUST state `softwareFixtureOnly: true` and `hardwareParityClaimed: false`.
(Previously: Custom export was blocked until visual readiness, BCSTM was deferred generically, and the export gate did not define component-specific evidence.)

#### Scenario: Publish a valid composite project

- GIVEN a canonical Material project with no errors and all warnings acknowledged
- WHEN the user exports a folder or ZIP against the immutable v1.3.0 profile
- THEN both outputs MUST contain equivalent files, report ordering, and self-consistent checksums

#### Scenario: Block unsafe or premature export

- GIVEN an error, unacknowledged warning, missing rights, stale required receipt, excluded feature, not-ready handoff, or a Custom request before visual readiness
- WHEN the user requests folder or ZIP export
- THEN no ready or partial output MUST be committed and diagnostics MUST identify the blocking component

#### Scenario: Permit a complete composite export

- GIVEN the complete Custom visual contract, exact manifest, evidence, and validation pass, with optional WAVs valid and any included BCSTM having a separate receipt
- WHEN the dependent Custom release exports the project
- THEN it MUST publish only the complete deterministic package; a second or unreceipted BCSTM MUST remain blocked
