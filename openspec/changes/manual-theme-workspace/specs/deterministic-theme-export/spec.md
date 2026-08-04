# Delta for Deterministic Theme Export

## MODIFIED Requirements

### Requirement: Export gate and reproducible bundle

The exporter MUST refuse a ready bundle when validation has an error or unacknowledged warning; suggestions alone MUST NOT block export. Material output MUST retain its established files. A successful Custom export MUST contain `theme.json`, exactly `topbg.bin` and `bottombg.bin`, and an ordered `report.json` in both a ready folder and a ZIP with identical folder-file and ZIP-entry bytes. The report MUST include profile/compiler/policy identity, diagnostics and acknowledgment fingerprints, per-file SHA-256 checksums, source hashes, layer lineage, credits, licenses, and required notices.
(Previously: Successful output was Material-only and did not compile or report Custom background lineage.)

#### Scenario: Export a valid Custom project

- GIVEN a Custom project has valid top/bottom sources, complete provenance, no errors, and acknowledged warnings
- WHEN the user requests folder and ZIP export
- THEN both outputs contain identical logical file bytes, report order, and self-consistent checksums

#### Scenario: Block unsafe export state

- GIVEN validation contains an error, unacknowledged warning, missing asset, unsupported artifact, or missing rights
- WHEN folder or ZIP export is requested
- THEN no ready output is committed and the blocking diagnostics are returned

### Requirement: Byte determinism

For identical canonical project bytes, source hashes, compiler/profile/policy versions, and target profile, folder files, report bytes, path order, checksums, and ZIP bytes MUST be identical across repeated runs and supported hosts. JSON, line endings, separators, ZIP metadata, and timestamps MUST be normalized without clocks or randomness.
(Previously: Determinism covered Material JSON and ZIP output but not decoded PNG policy or Custom binaries.)

#### Scenario: Repeat a Custom export

- GIVEN the same committed Custom project and immutable profile
- WHEN folder and ZIP exports are produced twice
- THEN every byte, report order, checksum, and ZIP byte is identical

#### Scenario: Preserve deterministic policy identity

- GIVEN two source PNGs decode to the same normalized pixels
- WHEN they are compiled under the same policy
- THEN their output bytes match and the report names the normalization and quantization policies used

## ADDED Requirements

### Requirement: Deterministic top/bottom background compiler

The first-release compiler MUST produce exactly 256×192 `topbg.bin` and `bottombg.bin` outputs from the shared render plan using the pinned launcher 15bpp packing. PNGs MUST normalize to top-left straight-alpha RGBA8 with embedded color management ignored; composition MUST use fixed integer source-over rounding; alpha `>=128` MUST encode opaque, alpha `<128` MUST encode transparent with zero RGB; 8-bit channels MUST quantize to 5-bit round-half-up with dithering disabled. Axis-aligned resize MUST use the named nearest-neighbor policy and crop MUST use integer bounds. Grid/banner, scrim/palette, icon/preview, and audio/BGM outputs MUST be rejected as out of scope, not omitted silently. Decoder/encoder mechanism remains a design decision; these policies and bytes are normative.

#### Scenario: Compile exact background files

- GIVEN valid exportable top and bottom render plans
- WHEN compilation runs
- THEN both named binaries have the target profile’s exact pixel count, packing, alpha behavior, and reproducible bytes

#### Scenario: Reject later-slot content

- GIVEN a project assigns a grid, scrim, palette, icon, preview, audio, or BGM artifact
- WHEN Custom export runs
- THEN export is blocked with an explicit unsupported-scope diagnostic and no partial folder or ZIP is authoritative
