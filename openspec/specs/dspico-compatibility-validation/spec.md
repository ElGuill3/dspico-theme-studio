# Delta for DSpico Compatibility Validation

## ADDED Requirements

### Requirement: Immutable Material compatibility profile

Validation MUST use the first profile `dspico-launcher-v1`, backed by the clean sibling launcher repository commit `f3ae63279ab72bc6c83124c752ec79f3247db437` on branch `feat/theme-launch-transition`. The commit hash is immutable source identity; branch movement MUST NOT change validation, and the sibling repository MUST remain read-only. Profile evidence MUST cite the pinned `docs/Themes.md`, `arm9/source/themes/ThemeInfoFactory.thumb.cpp`, `arm9/source/themes/LaunchTransitionStyle.h`, `arm9/source/themes/material/MaterialColorSchemeFactory.cpp`, and `/_pico/themes/material/theme.json`. Material output MUST require parseable metadata, `type: material`, integer RGB components in `0..255`, a boolean `darkTheme`, and launch-transition values of `coverStartScalePercent` in `1..200` and alpha values in `0..31`; omitted fields use defaults `100`, `12`, and `14`.

#### Scenario: Validate a supported Material project

- GIVEN a canonical Material project targeting `dspico-launcher-v1`
- WHEN validation runs against the pinned profile and its fixtures
- THEN valid values pass and every diagnostic includes the profile ID plus a source citation or fixture reference

#### Scenario: Reject unsafe or unsupported input

- GIVEN a malformed, empty, out-of-range, non-Material, newer, or unavailable target value
- WHEN validation runs
- THEN it MUST produce an export-blocking error and MUST NOT imitate the launcher’s permissive Custom fallback

### Requirement: Deterministic diagnostics and acknowledgments

Validation MUST emit stable, source-backed diagnostics with severity `error`, `warning`, or `suggestion`, deterministic ordering, and a fingerprint derived from the profile, rule, location, and normalized value. Errors MUST block export; warnings MUST block until acknowledged; suggestions MUST remain informational. Acknowledgment MUST persist by fingerprint, not by export attempt, and any fingerprint change MUST require a new acknowledgment.

#### Scenario: Acknowledge a warning

- GIVEN validation emits a warning and no errors
- WHEN the user acknowledges its fingerprint and validates again without changing it
- THEN the warning remains visible, is marked acknowledged, and no longer blocks export

#### Scenario: Invalidate stale acknowledgment

- GIVEN an acknowledged warning is tied to one normalized value or profile
- WHEN that value or profile changes
- THEN a new fingerprint MUST be emitted and the prior acknowledgment MUST NOT satisfy it
