# Delta for Deterministic Theme Export

## ADDED Requirements

### Requirement: Export gate and reproducible bundle

The exporter MUST fail closed when any included component has an error, unacknowledged warning, incomplete rights/provenance, stale required evidence, or unsupported feature. The Material-first release boundary MUST remain: every Custom entry point MUST return a blocking capability diagnostic and MUST write no ready or partial output until the exact 12-file visual contract and its required receipt pass. Optional prepared WAVs MAY use installed-target capability evidence without a per-project WAV receipt; one BCSTM MAY proceed only after the visual receipt and its separate BCSTM receipt pass. The `NOT READY — CARTRIDGE TEST ONLY` handoff MUST never become a ready ZIP or export approval. Successful folder and ZIP output MUST be equivalent and MUST contain `theme.json`, an ordered report, provenance, diagnostics, acknowledgments, credits, licenses, and file SHA-256 values. Reports MUST preserve source/fixture evidence `kind`; without a physical receipt they MUST state `softwareFixtureOnly: true` and `hardwareParityClaimed: false`.

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

### Requirement: Byte determinism

For identical canonical project bytes, compiler version, capability release, and immutable v1.3.0 profile, the exporter MUST produce identical file bytes, path order, report bytes, SHA-256 values, and ZIP bytes across repeated Linux x64 exports. It MUST normalize JSON ordering, line endings, path separators, ZIP metadata, and timestamps without compilation-time randomness or clocks. Linux x64 is the initial supported host; macOS/Windows are outside the current supported-host set until separately evidenced, not failed requirements.

#### Scenario: Repeat an export

- GIVEN the same committed project, capability, compiler, and immutable profile
- WHEN the folder and ZIP are exported twice on Linux x64
- THEN manifests, reports, checksums, path order, and ZIP bytes MUST be byte-identical

### Requirement: Atomic capability publication

The exporter MUST publish a new destination only after all capability files and diagnostics pass. An interrupted or failed Custom publication MUST leave the prior valid output untouched and MUST NOT present staging as ready.

#### Scenario: Interrupt a Custom publication

- GIVEN a valid prior output and a new Custom package being staged
- WHEN publication is interrupted or a file fails validation
- THEN the prior output MUST remain valid and the new package MUST be reported as incomplete

### Requirement: Safe and interruptible destinations

Export paths MUST remain within the user-selected destination. The exporter MUST reject absolute, parent-traversal, ambiguous-separator, or symlink-escaping generated paths and MUST NOT install directly to an SD card. An interrupted export MUST leave the prior committed output untouched, discard or report incomplete staging, and never present a partial bundle as valid.

#### Scenario: Reject an unsafe path

- GIVEN an export plan contains a path that escapes its selected destination
- WHEN export validation runs
- THEN export MUST fail before writing outside the destination and MUST report the path-safety error

#### Scenario: Recover from interrupted export

- GIVEN folder or ZIP writing is interrupted
- WHEN the user retries or inspects the destination
- THEN the previous valid output MUST remain intact and incomplete staging MUST NOT be treated as a successful export

Desktop packaging, signing, notarization, auto-update, and distribution are outside this MVP specification.
