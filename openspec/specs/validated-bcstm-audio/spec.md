# Validated BCSTM Audio Specification

## Purpose

Define the later, evidence-backed BCSTM capability without weakening the first useful Material release or the dependent Custom visual safety gate.

## Requirements

### Requirement: Visual-parity dependency

BCSTM authoring, import, playback metadata, and export MUST remain unavailable until the immutable v1.3.0 profile is valid, the complete 12-file Custom visual contract is proven, and the visual release has its required cartridge evidence. BCSTM MUST be a later capability, not a prerequisite for Material or visual export.

#### Scenario: Block audio before visual parity

- GIVEN the visual package is incomplete or lacks cartridge evidence
- WHEN the user requests BCSTM handling or export
- THEN the capability MUST remain blocked with a dependency diagnostic

#### Scenario: Enable audio after visual parity

- GIVEN the pinned profile, complete visual package, and required receipts all pass
- WHEN the later audio capability is enabled
- THEN BCSTM actions SHALL become available only after the visual-parity prerequisite is proven, and enabling them SHALL NOT change Material or visual bytes

### Requirement: Evidence-backed BCSTM package handling

The later capability MUST accept only evidence-supported BCSTM DSP-ADPCM files for the v1.3.0 theme BGM location `/_pico/themes/<theme>/bgm/`. It MUST validate container structure and supported metadata against pinned launcher evidence, preserve source bytes, and distinguish accepted pass-through evidence from unsupported conversion or playback claims. WAV UI sounds and other excluded audio features MUST NOT be substituted.

#### Scenario: Accept supported BCSTM input

- GIVEN a structurally valid, evidence-supported BCSTM file in the theme BGM set
- WHEN it is imported and validated
- THEN its source identity and deterministic package path MUST be retained

#### Scenario: Reject unsupported audio

- GIVEN a malformed, unsupported, or non-BCSTM audio file
- WHEN validation runs
- THEN export MUST be blocked with a source-backed diagnostic and no conversion MUST be implied

### Requirement: Deterministic audio evidence

Repeated handling of identical BCSTM source bytes, profile, and capability version MUST produce identical metadata, manifest entries, diagnostics, and output bytes on Linux x64. Reports MUST identify the exact v1.3.0 evidence and MUST NOT claim cartridge playback parity without a corresponding physical receipt; macOS/Windows are outside the current supported-host set until separately evidenced.

#### Scenario: Repeat BCSTM handling

- GIVEN identical BCSTM bytes and immutable profile evidence
- WHEN the later capability processes them twice
- THEN the resulting metadata, hashes, and package entries MUST be byte-identical
