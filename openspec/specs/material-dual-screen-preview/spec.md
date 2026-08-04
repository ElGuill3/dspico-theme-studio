# Delta for Material Dual-Screen Preview

## ADDED Requirements

### Requirement: Physical screen and mode identity

The preview MUST render separate 256×192 physical `top` and `bottom` screens. Each generated Material scene MUST declare exactly one stable physical screen identity and one launcher-mode identity; scoped token overrides MUST apply only to that tuple. Public studio terminology MUST use `top` and `bottom`, not launcher engine names such as `Main` or `Sub`.

#### Scenario: Preview both physical screens

- GIVEN a valid Material project with scenes for its supported modes
- WHEN the user selects a mode
- THEN the studio MUST show distinct interactive 256×192 top and bottom previews with representative content

#### Scenario: Isolate a scoped override

- GIVEN a token override belongs to the top-screen identity for one mode
- WHEN the user edits that override
- THEN the corresponding top scene MUST change while other modes and the bottom scene retain their canonical values

### Requirement: Honest fidelity labels

The preview MUST visibly label evidence-backed dimensions, bounds, inheritance, wrapping, safe areas, and Material colors as `launcher-vector-backed` only when supported by launcher vectors or fixtures. Other rendering MUST be labeled `Chromium approximation`. Preview output MUST NOT claim DS pixel parity, hardware font/palette/blending/VRAM fidelity, timing fidelity, or audio fidelity, and MUST NOT determine export compatibility.

#### Scenario: Show source-backed fidelity

- GIVEN a rendered property has an accepted launcher vector and fixture
- WHEN the preview displays it
- THEN the property MUST carry the corresponding evidence-backed fidelity label

#### Scenario: Show an approximation honestly

- GIVEN a rendered property lacks DS rasterization or hardware evidence
- WHEN the preview displays it
- THEN it MUST be labeled approximate and MUST NOT be described as pixel-perfect or DS-parity output
