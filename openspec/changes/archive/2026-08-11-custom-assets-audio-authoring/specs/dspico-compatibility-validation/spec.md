# Delta for DSpico Compatibility Validation

## MODIFIED Requirements

### Requirement: Immutable Material compatibility profile

Validation MUST use one composite profile whose visual component remains `dspico-launcher-v1` at tag `v1.3.0`, commit `b087565651c83081dd65552863f5efc2f28e489c`, from the clean, read-only authority worktree, and whose UI-sound component is separately evidenced against installed target SHA-256 `12a357324cab401a8f100d50198b33bfeba93fbaf53261bc7456ebe863d96342`. The initial supported host MUST remain Linux x64; macOS/Windows are outside the supported-host set until separately evidenced. The profile MUST record each component authority, tag/commit, every cited source/fixture hash, manifest digest, and component identity. Consuming launcher code and bundled fixtures MUST outrank prose documentation, including filename typos. Wrong HEAD, a dirty or moved authority, changed evidence hash, or missing evidence MUST be a drift error with no fallback. Material output MUST use only v1.3.0-consumed metadata, `primaryColor`, and `darkTheme`; it MUST NOT require or emit `launchTransition` or inherit unrelated post-v1.3 launcher features.
(Previously: The profile covered only the official v1.3.0 Material authority and explicitly excluded the installed sound extension.)

#### Scenario: Validate the composite profile

- GIVEN a canonical Material or Custom project targeting the pinned visual commit and installed WAV target
- WHEN profile validation runs with complete component evidence
- THEN valid v1.3.0 metadata, `primaryColor`, and `darkTheme` MUST pass and the composite profile MUST report both authorities separately

#### Scenario: Reject profile drift or authority mixing

- GIVEN malformed, empty, out-of-range, non-Material, newer, or unavailable target data, changed visual commit or target hash, missing evidence, dirty authority, or unrelated post-v1.3 feature
- WHEN validation runs
- THEN it MUST return an export-blocking diagnostic, MUST NOT imitate a permissive Custom fallback, and MUST NOT fall back to another profile

### Requirement: Explicit v1.3.0 feature boundary

The v1.3.0 composite profile MUST NOT expose, export, or claim selector assets, `preview.bin`, theme `icon.bmp`, `launchTransition`, configurable animation/timing controls, custom fonts, global covers as theme-package assets, pixel painting, manual palette ordering, multiple BCSTM files, BCSTM conversion, BCSTM audition, direct SD installation, launcher mutation, or AI/cloud prerequisites. Theme UI WAVs and one pass-through BCSTM MAY be exposed only under their separately evidenced component contracts.
(Previously: WAV UI sounds were listed as unsupported because the profile had no composite extension boundary.)

#### Scenario: Keep exact exclusions blocked

- GIVEN a project or export request contains an excluded feature or a second BCSTM
- WHEN capability validation runs
- THEN it MUST report the feature as unsupported and MUST leave the package unchanged

## ADDED Requirements

### Requirement: Component-scoped compatibility diagnostics

Profile, visual, WAV, and BCSTM evidence MUST retain separate identities and staleness states. A change in one component MUST NOT refresh, invalidate, or promote another component's evidence.

#### Scenario: Preserve independent evidence state

- GIVEN visual evidence passes and WAV capability evidence is valid
- WHEN a visual manifest changes
- THEN only visual readiness MUST become stale while WAV capability evidence remains independently identified
