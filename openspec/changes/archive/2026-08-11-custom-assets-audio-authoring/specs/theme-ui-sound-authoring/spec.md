# Theme UI Sound Authoring Specification

## Requirements

### Requirement: Deterministic prepared WAV assets

The system MUST accept uncompressed PCM RIFF/WAVE sources and apply replayable trim, fade, gain, downmix, resampling, clipping, rounding, and signed-16 quantization. Prepared output MUST be PCM mono 22,050 Hz signed 16-bit little-endian, with non-empty even PCM data no larger than 11,024 bytes and a complete file no larger than 16 KiB. Unsupported codecs or parameters MUST fail closed.

#### Scenario: Reproduce a prepared sound

- GIVEN identical WAV bytes, recipe, preparation policy, and capability version
- WHEN Navigation or Launch preparation runs twice
- THEN output bytes, metadata, diagnostics, and hashes MUST be identical

#### Scenario: Reject an unsupported source or size

- GIVEN compressed audio, unsupported PCM, empty/odd data, or output over either limit
- WHEN preparation or validation runs
- THEN the sound MUST remain unavailable and a blocking diagnostic MUST identify the violated rule

### Requirement: Named optional sounds with portable evidence

The system MUST keep Navigation and Launch as separate optional typed assets, preserving source and prepared bytes, hashes, recipe parameters, media type, provenance, rights, and the canonical runtime path. Valid absence of either sound MUST remain supported. Prepared WAV capability evidence MUST identify installed target `12a357324cab401a8f100d50198b33bfeba93fbaf53261bc7456ebe863d96342` without claiming official-v1.3 authority.

#### Scenario: Save and reopen sound authoring

- GIVEN a project containing typed Navigation or Launch source and prepared assets
- WHEN it is saved, closed, and reopened
- THEN hashes, recipe, provenance, rights, assignment, and prepared bytes MUST be equivalent

#### Scenario: Allow an omitted optional sound

- GIVEN only one named sound or neither named sound is assigned
- WHEN component validation runs
- THEN the omitted sound MUST NOT create a missing-asset error

### Requirement: Bounded desktop audition and evidence policy

The system MUST provide waveform inspection and local playback of prepared WAV output labeled `Desktop audition`. This preview MUST NOT claim cartridge playback parity. WAV publication MUST reuse capability-level evidence and MUST NOT require a per-project WAV cartridge receipt; optional listening observations MUST remain non-blocking.

#### Scenario: Audition without hardware authority

- GIVEN a valid prepared WAV
- WHEN the user opens its waveform or plays it locally
- THEN the UI MUST show `Desktop audition` and MUST keep hardware authority separate

#### Scenario: Publish without a project WAV receipt

- GIVEN valid prepared WAVs and the composite profile's installed-target capability evidence
- WHEN a project is checked for publication
- THEN no per-project WAV receipt MUST be required, while invalid media or incomplete rights MUST still block publication
