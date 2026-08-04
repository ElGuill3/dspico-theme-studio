# Delta for DSpico Compatibility Validation

## MODIFIED Requirements

### Requirement: Immutable Material compatibility profile

Validation MUST use the immutable `dspico-launcher-v1` profile and pinned launcher commit `f3ae63279ab72bc6c83124c752ec79f3247db437`. Material validation MUST retain parseable metadata, `type: material`, integer RGB `0..255`, boolean `darkTheme`, and transition ranges `coverStartScalePercent` `1..200` and alpha values `0..31`; omitted defaults remain `100`, `12`, and `14`. Evidence MUST cite `docs/Themes.md`, `ThemeInfoFactory.thumb.cpp`, `LaunchTransitionStyle.h`, `MaterialColorSchemeFactory.cpp`, and `_pico/themes/material/theme.json`. Custom validation MUST require explicit `type: custom`, exact 256×192 top/bottom sources, and only first-release `topbg`/`bottombg`. Grid/banner, scrim/palette, icon/preview, audio, and BGM MUST be explicitly unsupported rather than silently ignored.
(Previously: The profile validated only Material themes and accepted transition fields at the document root.)

#### Scenario: Validate a supported Material project

- GIVEN a canonical Material project targeting `dspico-launcher-v1`
- WHEN validation runs against the pinned profile and fixtures
- THEN valid values pass and every diagnostic includes the profile ID plus a source citation or fixture reference

#### Scenario: Validate a supported Custom background set

- GIVEN a Custom project with exportable top and bottom 256×192 source documents
- WHEN validation runs
- THEN only the supported background artifacts are evaluated and their source hashes and rights are available to export

#### Scenario: Reject unsupported kind or artifact scope

- GIVEN malformed, empty, out-of-range, newer, unavailable, wrong-kind, wrong-dimension, or later-slot input
- WHEN validation runs
- THEN an export-blocking diagnostic identifies it and no permissive Custom fallback is applied

## ADDED Requirements

### Requirement: Nested launch-transition reconciliation

The canonical V2 transition object MUST be `launchTransition`; validation MUST apply profile ranges and defaults to that nested object for both theme kinds. A V1 root-level transition MAY be read only by the explicit migration path. If root and nested values coexist with different normalized values, validation MUST block with a conflict diagnostic; equal values MAY migrate deterministically, but source bytes MUST remain untouched.
(Previously: Validation read `coverStartScalePercent`, `coverFinalAlpha`, and `scrimFinalAlpha` at the root despite nested launcher documentation.)

#### Scenario: Reconcile equal legacy values

- GIVEN a legacy Material input has root transition fields and an equivalent nested object
- WHEN explicit migration runs
- THEN one nested canonical value is produced, a deterministic migration notice is emitted, and the source is not overwritten

#### Scenario: Block a transition discrepancy

- GIVEN root and nested transition fields normalize to different values
- WHEN validation runs
- THEN export is blocked with both locations identified and neither value is silently selected

### Requirement: Deterministic diagnostics and acknowledgments

Validation MUST emit stable, source-backed diagnostics with severity `error`, `warning`, or `suggestion`, deterministic ordering, and fingerprints derived from profile, rule, location, theme kind, and normalized value. Errors and unsupported Custom artifacts MUST block export; warnings block until acknowledged; suggestions remain informational. Acknowledgments MUST persist by fingerprint and any fingerprint change MUST require a new acknowledgment.
(Previously: Diagnostics described Material-only rules and did not include Custom artifact boundaries or theme kind in their observable identity.)

#### Scenario: Acknowledge a warning

- GIVEN validation emits a warning and no errors
- WHEN its fingerprint is acknowledged and validation repeats without change
- THEN the warning remains visible, is marked acknowledged, and no longer blocks export

#### Scenario: Invalidate stale acknowledgment

- GIVEN an acknowledged warning is tied to one normalized value or profile
- WHEN that value, kind, or profile changes
- THEN a new fingerprint is emitted and the prior acknowledgment no longer satisfies it
