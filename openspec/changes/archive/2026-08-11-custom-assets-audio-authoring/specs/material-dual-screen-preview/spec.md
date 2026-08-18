# Delta for Material Dual-Screen Preview

## MODIFIED Requirements

### Requirement: Physical screen and mode identity

The preview MUST render separate 256×192 physical `top` and `bottom` screens. Material v1.3.0 authority remains limited to `primaryColor` and `darkTheme`; generic tokens, per-mode scenes, `background`, `foreground`, and `accent` MUST NOT be presented as launcher-exportable semantics, though legacy values MAY remain migration evidence. After the dependent visual gate is complete, Custom preview MUST expose the seven source roles, selected/unselected states, all 12 compiled output statuses, and decoded post-codec results without presenting them as hardware authority. WAV audition MUST remain a separate audio surface.
(Previously: Custom preview controls were unavailable, and the requirement described only Material fields.)

#### Scenario: Preview launcher-consumed Material fields

- GIVEN a valid Material project with a `primaryColor` and `darkTheme`
- WHEN the user edits either field
- THEN both physical-screen previews MUST update from those fields and no ignored scene token MUST affect export claims

#### Scenario: Preserve legacy meaning without rendering it as authority

- GIVEN a migrated project containing legacy fields or scene overrides
- WHEN the preview displays migration state
- THEN those values MUST be labeled non-exported evidence and MUST NOT be shown as v1.3.0 Material behavior

#### Scenario: Show the complete Custom output rail

- GIVEN the Custom visual gate has passed
- WHEN the user inspects compiled output
- THEN seven source roles, 12 output statuses, selected/unselected comparison, and post-codec decoding MUST be visible with bounded evidence labels

### Requirement: Honest fidelity labels

The preview MUST visibly label evidence-backed dimensions, bounds, inheritance, wrapping, safe areas, and Material `primaryColor`/`darkTheme` behavior as `launcher-vector-backed` only when supported by v1.3.0 vectors or fixtures. Other rendering MUST be labeled `Chromium approximation`. Custom decoded output MUST identify software-only or hardware-unknown properties. WAV waveform and local playback MUST be labeled `Desktop audition`; BCSTM MUST expose metadata only. Preview MUST NOT claim DS pixel, font/palette/blending/VRAM, timing, audio, or cartridge parity and MUST NOT determine export compatibility.
(Previously: The preview prohibited codec and audio fidelity claims but did not define Custom post-codec output or WAV desktop audition.)

#### Scenario: Show source-backed fidelity

- GIVEN a rendered property has an accepted launcher vector or fixture
- WHEN the preview displays it
- THEN the property MUST carry the corresponding evidence-backed fidelity label

#### Scenario: Show an approximation honestly

- GIVEN a rendered property lacks DS rasterization or hardware evidence
- WHEN the preview displays it
- THEN it MUST be labeled approximate and MUST NOT be described as pixel-perfect or DS-parity output

#### Scenario: Bound audio audition

- GIVEN a prepared WAV is available locally
- WHEN the user opens its waveform or plays it
- THEN the UI MUST show `Desktop audition` and MUST NOT imply BCSTM or cartridge playback parity
