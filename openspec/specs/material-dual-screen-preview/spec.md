# Delta for Material Dual-Screen Preview

## ADDED Requirements

### Requirement: Physical screen and mode identity

The preview MUST render separate 256×192 physical `top` and `bottom` screens. For Material v1.3.0, the authoritative editable and rendered theme values MUST be only `primaryColor` and `darkTheme`; generic tokens, per-mode scenes, `background`, `foreground`, and `accent` MUST NOT be presented as launcher-exportable semantics. Legacy values MAY appear as preserved migration evidence. Custom preview controls MUST remain unavailable until the dependent Custom visual capability is complete.

#### Scenario: Preview launcher-consumed Material fields

- GIVEN a valid Material project with a `primaryColor` and `darkTheme`
- WHEN the user edits either field
- THEN both physical-screen previews MUST update from those fields and no ignored scene token MUST affect export claims

#### Scenario: Preserve legacy meaning without rendering it as authority

- GIVEN a migrated project containing `accent`, `background`, `foreground`, or scene overrides
- WHEN the preview displays migration state
- THEN those values MUST be labeled non-exported evidence and MUST NOT be shown as v1.3.0 Material behavior

### Requirement: Honest fidelity labels

The preview MUST visibly label evidence-backed dimensions, bounds, inheritance, wrapping, safe areas, and Material `primaryColor`/`darkTheme` behavior as `launcher-vector-backed` only when supported by v1.3.0 vectors or fixtures. Other rendering MUST be labeled `Chromium approximation`. Preview output MUST NOT claim DS pixel parity, hardware font/palette/blending/VRAM fidelity, codec fidelity, timing fidelity, or audio fidelity, and MUST NOT determine export compatibility.

#### Scenario: Show source-backed fidelity

- GIVEN a rendered property has an accepted launcher vector and fixture
- WHEN the preview displays it
- THEN the property MUST carry the corresponding evidence-backed fidelity label

#### Scenario: Show an approximation honestly

- GIVEN a rendered property lacks DS rasterization or hardware evidence
- WHEN the preview displays it
- THEN it MUST be labeled approximate and MUST NOT be described as pixel-perfect or DS-parity output
