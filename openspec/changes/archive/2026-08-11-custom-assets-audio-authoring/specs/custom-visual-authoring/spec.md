# Delta for Custom Visual Authoring

## ADDED Requirements

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
