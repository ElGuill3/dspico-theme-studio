# Custom Visual Authoring Specification

## Purpose

Define the dependent, evidence-bounded v1.3.0 Custom visual capability. The first useful release MUST keep Custom export blocked until this complete contract is available.

## Requirements

### Requirement: Complete v1.3.0 visual package

The Custom release MUST generate exactly these 12 visual files with exact bytes: `topbg.bin` 98,304; `bottombg.bin` 98,304; `gridcell.bin` 4,096; `gridcellSelected.bin` 4,096; `gridcellPltt.bin` 64; `gridcellSelectedPltt.bin` 64; `bannerListCell.bin` 12,544; `bannerListCellSelected.bin` 12,544; `bannerListCellPltt.bin` 64; `bannerListCellSelectedPltt.bin` 64; `scrim.bin` 336; `scrimPltt.bin` 16. The visual manifest MUST total 230,496 bytes; documentation typos MUST NOT rename a consuming-code or fixture file.

#### Scenario: Block an incomplete package

- GIVEN any required file is missing, extra, short, oversized, or misnamed
- WHEN Custom readiness is evaluated
- THEN export MUST be blocked and no ready package MUST be published

#### Scenario: Accept a complete package

- GIVEN all 12 files have exact names, lengths, canonical hashes, and valid source provenance
- WHEN readiness and package validation pass
- THEN the package SHALL be accepted as complete and export-ready for atomic publication, with deterministic diagnostics and manifest evidence

### Requirement: Typed Custom JSON and safe ranges

Custom `theme.json` MUST contain complete metadata, `type: custom`, `primaryColor` with integer RGB components in `0..255`, and boolean `darkTheme`. Supported layout/color objects MUST be typed as: `topIcon` (position, blendColor); `topBannerTextLine0`, `topBannerTextLine1`, `topBannerTextLine2`, and `topFileNameText` (position, width, textColor, blendColor); `topCover` (position); `gridIcon` and `bannerListIcon` (blendColor); and `bannerListTextLine0`, `bannerListTextLine1`, and `bannerListTextLine2` (textColor). Positions MUST stay within the applicable 256×192 screen, widths MUST be positive and stay within the screen, and every color component MUST be `0..255`. A present nested object MUST be complete; partial objects MUST block export rather than rely on launcher zero defaults.

#### Scenario: Validate a real Custom layout

- GIVEN a Custom document using only the listed v1.3.0 fields and safe coordinates, widths, and colors
- WHEN the typed model is validated
- THEN the model MUST be accepted without adding transition, animation, font, or selector fields

#### Scenario: Reject unsafe or partial JSON

- GIVEN an out-of-range component, off-screen layout, partial nested object, or unsupported field
- WHEN validation runs
- THEN it MUST return a blocking diagnostic and MUST NOT serialize the object as ready

### Requirement: Deterministic indexed visual codecs and evidence

The core MUST deterministically encode little-endian XBGR555 direct-color backgrounds, 32-entry XBGR555 palettes, A3I5 textures for the 64×64 grid allocations and 256×49 banner allocations, and A5I3 for the 8×42 scrim. Palette ordering, quantization, alpha mapping, padding, endianness, and tie-breaking MUST be versioned and stable. Repeated output MUST match on the initial Linux x64 host. Software fixtures MAY prove determinism, but XBGR555 bit-15 transparency and A3I5/A5I3 hardware parity MUST NOT be claimed without physical-cartridge receipts.

#### Scenario: Repeat codec generation

- GIVEN identical canonical pixels, palette policy, codec version, and profile
- WHEN the visual files are encoded twice
- THEN every byte and palette index MUST be identical

#### Scenario: Bound a hardware claim

- GIVEN deterministic codec output with only software/fixture evidence
- WHEN a report is generated without a physical receipt
- THEN it MUST preserve each source/fixture evidence `kind`, state `softwareFixtureOnly: true` and `hardwareParityClaimed: false`, and MUST NOT claim hardware parity

### Requirement: Atomic Custom diagnostics

The package MUST be staged and published only after all binary, JSON, provenance, evidence, and path checks pass. Diagnostics MUST identify the exact file, JSON pointer, expected bytes/range, observed value, and evidence boundary; failed publication MUST leave the prior valid package untouched.

#### Scenario: Diagnose a short binary

- GIVEN a required binary is shorter than its exact length
- WHEN package validation runs
- THEN the diagnostic MUST identify the file and expected/observed lengths and export MUST remain blocked
