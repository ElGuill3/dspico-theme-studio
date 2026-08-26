# Delta for DSpico Compatibility Validation

## MODIFIED Requirements

### Requirement: Immutable Material compatibility profile

Validation MUST use profile `dspico-launcher-v1` at tag `v1.3.0`, commit `b087565651c83081dd65552863f5efc2f28e489c`, from the clean, read-only authority worktree. The initial supported host is Linux x64; macOS/Windows are outside the supported-host set until separately evidenced. The profile MUST record the tag, commit, every cited source/fixture hash, and the manifest digest. Consuming launcher code and bundled fixtures MUST outrank prose documentation, including filename typos. Wrong HEAD, a dirty or moved authority, changed evidence hash, or missing evidence MUST be a drift error with no fallback to unpublished commits. Material output MUST use only v1.3.0-consumed metadata, `primaryColor`, and `darkTheme`; it MUST NOT require or emit `launchTransition`.
(Previously: The profile used unpublished commit `f3ae63279ab72bc6c83124c752ec79f3247db437` and required transition fields.)

#### Scenario: Validate a supported Material project

- GIVEN a canonical Material project targeting the pinned v1.3.0 profile
- WHEN validation runs against its immutable evidence and fixtures
- THEN valid metadata, `primaryColor`, and `darkTheme` pass and diagnostics cite the profile and evidence

#### Scenario: Reject unsafe or unsupported input

- GIVEN malformed, empty, out-of-range, non-Material, newer, drifted, or transition-bearing input
- WHEN validation runs
- THEN it MUST return an export-blocking diagnostic and MUST NOT imitate a permissive Custom fallback

#### Scenario: Prefer consuming evidence over prose

- GIVEN launcher code or a bundled fixture names a file differently from documentation
- WHEN the v1.3.0 manifest is built
- THEN the code/fixture name and bytes MUST be authoritative and the discrepancy MUST be recorded

### Requirement: Deterministic diagnostics and acknowledgments

Validation MUST emit stable, source-backed diagnostics with severity `error`, `warning`, or `suggestion`, deterministic ordering, and fingerprints derived from the profile identity, rule, location, and normalized value. Profile identity MUST include the immutable version/commit and manifest digest. Errors MUST block export; warnings MUST block until acknowledged; suggestions MUST remain informational. Acknowledgments MUST persist by fingerprint, and any value, evidence, or profile change MUST require a new acknowledgment.
(Previously: Diagnostics were deterministic but did not bind claims to immutable v1.3.0 evidence and manifest identity.)

#### Scenario: Acknowledge a warning

- GIVEN validation emits a warning and no errors
- WHEN the user acknowledges its fingerprint and validates again without changing it
- THEN the warning remains visible, is marked acknowledged, and no longer blocks export

#### Scenario: Invalidate stale acknowledgment

- GIVEN an acknowledgment is tied to one normalized value or profile
- WHEN that value, evidence hash, manifest digest, or profile changes
- THEN a new fingerprint MUST be emitted and the prior acknowledgment MUST NOT satisfy it

## ADDED Requirements

### Requirement: Explicit v1.3.0 feature boundary

The v1.3.0 profile MUST NOT expose, export, or claim support for selector assets, `preview.bin`, theme `icon.bmp`, WAV UI sounds, `launchTransition`, configurable animation/timing controls, custom fonts, global covers as theme-package assets, direct SD installation, launcher mutation, or AI/cloud prerequisites.

#### Scenario: Keep unsupported features out of the profile

- GIVEN a project or export request contains an excluded feature
- WHEN capability validation runs
- THEN it MUST report the feature as unsupported and MUST leave the v1.3.0 package unchanged
