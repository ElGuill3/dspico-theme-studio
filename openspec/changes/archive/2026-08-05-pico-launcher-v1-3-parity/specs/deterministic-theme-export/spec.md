# Delta for Deterministic Theme Export

## MODIFIED Requirements

### Requirement: Export gate and reproducible bundle

The exporter MUST refuse a ready bundle when validation has an error or an unacknowledged warning. The first useful release MUST export Material only; every Custom export entry point MUST return a blocking capability diagnostic and MUST write no ready or partial output. Custom export MAY become available only after the complete `custom-visual-authoring` capability and its v1.3.0 evidence gate pass. BCSTM MAY be included only in the later audio release after that visual baseline. A successful export MUST produce equivalent canonical folder and ZIP outputs with `theme.json`, an ordered report, provenance, diagnostics, acknowledgments, credits, licenses, and file SHA-256 values. Reports MUST preserve source/fixture evidence `kind`; without a physical receipt they MUST explicitly state `softwareFixtureOnly: true` and `hardwareParityClaimed: false`.
(Previously: The gate handled generic validation but allowed an incomplete Custom path and did not distinguish release dependencies.)

#### Scenario: Export a valid Material project

- GIVEN a canonical Material project with no errors and all warnings acknowledged
- WHEN the user exports a folder and ZIP against the immutable v1.3.0 profile
- THEN both outputs MUST contain equivalent files, report ordering, and self-consistent checksums

#### Scenario: Block unsafe or premature export

- GIVEN validation contains an error, an unacknowledged warning, or the request targets Custom before visual readiness
- WHEN the user requests folder or ZIP export
- THEN no ready-to-copy output MUST be committed and the blocking diagnostics MUST be returned

#### Scenario: Permit dependent Custom export only when complete

- GIVEN the complete Custom visual contract, exact manifest, evidence, and validation all pass
- WHEN the dependent Custom release exports the project
- THEN it MUST publish only the complete package and its deterministic report

### Requirement: Byte determinism

For identical canonical project bytes, compiler version, capability release, and immutable v1.3.0 profile, the exporter MUST produce identical file bytes, path order, report bytes, SHA-256 values, and ZIP bytes across repeated Linux x64 exports. It MUST normalize JSON ordering, line endings, path separators, ZIP metadata, and timestamps without compilation-time randomness or clocks. Linux x64 is the initial supported host; macOS/Windows are outside the current supported-host set until separately evidenced, not failed requirements.
(Previously: Determinism was scoped only to the generic `dspico-launcher-v1` exporter.)

#### Scenario: Repeat an export

- GIVEN the same committed project, capability, compiler, and immutable profile
- WHEN the folder and ZIP are exported twice on Linux x64
- THEN manifests, reports, checksums, path order, and ZIP bytes MUST be byte-identical

## ADDED Requirements

### Requirement: Atomic capability publication

The exporter MUST publish a new destination only after all capability files and diagnostics pass. An interrupted or failed Custom publication MUST leave the prior valid output untouched and MUST NOT present staging as ready.

#### Scenario: Interrupt a Custom publication

- GIVEN a valid prior output and a new Custom package being staged
- WHEN publication is interrupted or a file fails validation
- THEN the prior output MUST remain valid and the new package MUST be reported as incomplete
