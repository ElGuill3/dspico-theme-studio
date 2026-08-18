# Delta for Validated BCSTM Audio

## MODIFIED Requirements

### Requirement: Visual-parity dependency

BCSTM authoring, import, playback metadata, and export MUST remain unavailable until the immutable composite profile is valid, the complete 12-file Custom visual contract is proven, and the visual release has its required cartridge receipt. BCSTM MUST remain a later capability, never a prerequisite for Material or visual export. After that prerequisite, the first BCSTM capability MUST accept exactly one source and MUST remain independent of Material and visual bytes.
(Previously: The later BCSTM capability was gated by visual parity but did not define the composite profile or single-source boundary.)

#### Scenario: Block audio before visual receipt

- GIVEN the visual package is incomplete or lacks its required cartridge receipt
- WHEN the user requests BCSTM handling or export
- THEN the capability MUST remain blocked with a dependency diagnostic

#### Scenario: Enable one BGM after visual receipt

- GIVEN the composite profile, complete visual package, and visual receipt pass
- WHEN the later audio capability is enabled
- THEN exactly one BCSTM action MAY become available without changing Material or visual bytes

### Requirement: Evidence-backed BCSTM package handling

The later capability MUST accept exactly one evidence-supported BCSTM DSP-ADPCM source for the v1.3.0 theme BGM location `/_pico/themes/<theme>/bgm/`, validate its container and supported metadata against pinned launcher evidence, preserve its bytes and deterministic path, and issue or consume a separate source-hash receipt for its own playback/loop validation. It MUST distinguish pass-through evidence from unsupported conversion, MUST NOT convert or decode for audition, and MUST NOT claim Studio playback parity. WAV UI sounds and every excluded audio feature MUST remain separate.
(Previously: The capability accepted a BCSTM file in a BGM set and required source matching without an explicit separate receipt.)

#### Scenario: Accept one pass-through BGM

- GIVEN visual receipt validation passes and one supported BCSTM has valid structure and metadata
- WHEN it is imported
- THEN its source identity, loop metadata, path, bytes, and separate receipt boundary MUST be retained

#### Scenario: Reject a second or unsupported BGM

- GIVEN no visual receipt, more than one BCSTM, malformed data, or unsupported audio
- WHEN validation runs
- THEN import/export MUST be blocked and no conversion or audition claim MUST be implied
