# Delta for Deterministic Theme Export

## ADDED Requirements

### Requirement: Export gate and reproducible bundle

The exporter MUST refuse to produce a ready bundle when validation has an error or an unacknowledged warning; suggestions alone MUST NOT block export. A successful export MUST produce a ready-to-copy folder and a ZIP containing the same canonical logical files, including `theme.json` and an ordered `report.json`. The report MUST include compatibility provenance, diagnostics and acknowledgment fingerprints, per-file SHA-256 checksums, credits, and licenses.

#### Scenario: Export a valid project

- GIVEN a canonical project with no errors and all warnings acknowledged
- WHEN the user exports a folder and ZIP with the same compiler and target profile
- THEN both outputs MUST contain equivalent files, report ordering, and self-consistent checksums

#### Scenario: Block unsafe export state

- GIVEN validation contains an error or an unacknowledged warning
- WHEN the user requests folder or ZIP export
- THEN no ready-to-copy output MUST be committed and the blocking diagnostics MUST be returned

### Requirement: Byte determinism

For identical canonical project bytes, compiler version, and `dspico-launcher-v1` profile, the exporter MUST produce identical file bytes, path order, report bytes, SHA-256 values, and ZIP bytes across repeated runs and supported hosts. It MUST normalize JSON ordering, line endings, path separators, ZIP metadata, and timestamps without using compilation-time randomness or clocks.

#### Scenario: Repeat an export

- GIVEN the same committed project, compiler, and immutable profile
- WHEN the folder and ZIP are exported twice
- THEN their manifests, report order, checksums, and ZIP bytes MUST be byte-identical

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
