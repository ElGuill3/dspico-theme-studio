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

### Requirement: Seven PNG sources and twelve output lineage

The system MUST author exactly seven non-interlaced RGBA8 PNG source roles: top and bottom backgrounds, unselected and selected grid cells, unselected and selected banner cells, and one scrim. Non-destructive crop/transform recipes MUST generate the exact 12-file v1.3 manifest (`topbg.bin`, `bottombg.bin`, `gridcell.bin`, `gridcellSelected.bin`, `gridcellPltt.bin`, `gridcellSelectedPltt.bin`, `bannerListCell.bin`, `bannerListCellSelected.bin`, `bannerListCellPltt.bin`, `bannerListCellSelectedPltt.bin`, `scrim.bin`, `scrimPltt.bin`) totaling 230,496 bytes. Pixel painting MUST NOT be offered.

#### Scenario: Compile the complete visual rail

- GIVEN all seven source roles are valid and assigned
- WHEN the visual package is compiled
- THEN exactly 12 named outputs with the required total and source lineage MUST be produced

#### Scenario: Preserve source bytes through editing

- GIVEN an imported PNG with a committed crop or transform recipe
- WHEN the user changes the visual composition
- THEN the original hash MUST remain unchanged and the recipe MUST be replayable

### Requirement: Deterministic palette presets and post-codec preview

Generated A3I5/A5I3 palette outputs MUST use versioned, inspectable deterministic presets. Manual palette editing or reordering MUST NOT be available. The preview MUST decode compiled output after its codec step and identify hardware-unknown properties without claiming pixel parity.

#### Scenario: Repeat a palette preset

- GIVEN identical source pixels, preset, codec policy, and profile
- WHEN palette generation and encoding repeat
- THEN palette bytes, indices, diagnostics, and output hashes MUST match

#### Scenario: Inspect compiled bytes honestly

- GIVEN a complete compiled visual package without physical evidence
- WHEN the user opens preview
- THEN decoded post-codec output and software-only limitations MUST be shown without a hardware-parity claim

### Requirement: Explicit visual provenance and reusable evidence

Every imported source MUST require explicit provenance and rights before assignment. Visual receipts MUST bind the complete ordered manifest, composite profile hash, and codec/policy hashes; receipt reuse MUST follow exact identity matching and component-scoped staleness.

#### Scenario: Block incomplete source authority

- GIVEN a source lacks rights, provenance, or a valid media hash
- WHEN visual readiness is evaluated
- THEN assignment and export MUST remain blocked with a source-specific diagnostic

#### Scenario: Stale visual evidence after an edit

- GIVEN a passing visual receipt is bound to a complete manifest
- WHEN any visual source or transform changes its output hash
- THEN that receipt MUST be stale even if WAV capability evidence remains valid
