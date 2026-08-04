# Delta for Material Dual-Screen Preview

## MODIFIED Requirements

### Requirement: Physical screen and mode identity

The preview MUST render separate 256×192 physical `top` and `bottom` theme surfaces for Material and Custom projects. Each Material scene MUST declare exactly one stable physical-screen and launcher-mode identity; public terminology MUST use `top`/`bottom`. Dual view MUST show both, focus view MUST enlarge one without changing geometry, and the default simulated gap MUST be 96 CSS pixels. Gap, zoom, grid, focus, and selection MUST be local and MUST NOT affect canonical content, validation, or export.
(Previously: The preview rendered distinct 256×192 Material scenes with mode-scoped token overrides.)

#### Scenario: Preview both physical screens

- GIVEN a valid Material or Custom project
- WHEN the user selects a mode or opens the workspace
- THEN distinct interactive 256×192 top and bottom theme surfaces are shown with the correct shared content

#### Scenario: Isolate a Material scoped override

- GIVEN a token override belongs to one Material top-screen/mode identity
- WHEN the user edits that override
- THEN only that addressed scene changes while other modes and the bottom scene retain canonical values

#### Scenario: Keep focus presentation non-authoritative

- GIVEN the user enters bottom focus and changes gap or zoom
- WHEN validation or export runs
- THEN the same 256×192 source surfaces are used and no viewport setting is persisted as theme content

### Requirement: Honest fidelity labels

The preview MUST visibly label evidence-backed dimensions, bounds, inheritance, wrapping, safe areas, and Material colors as `launcher-vector-backed` only when supported by launcher vectors or fixtures. Other rendering MUST be labeled `Chromium approximation`. Canvas 2D MUST remain a view of the shared render plan, DOM controls MUST provide equivalent access, and preview output MUST NOT determine export compatibility or claim DS pixel, hardware font/palette/blending, timing, or audio fidelity.
(Previously: The preview labeled evidence-backed properties and Chromium approximations but did not define a shared Custom render surface or view-only Canvas boundary.)

#### Scenario: Show source-backed fidelity

- GIVEN a rendered property has an accepted launcher vector and fixture
- WHEN the preview displays it
- THEN the property carries the corresponding evidence-backed label

#### Scenario: Show an approximation honestly

- GIVEN a rendered property lacks DS rasterization or hardware evidence
- WHEN the preview displays it
- THEN it is labeled approximate and is not described as pixel-perfect or DS-parity output

## ADDED Requirements

### Requirement: Launcher presentation remains isolated

The DSi frame and launcher-native Coverflow/Banner overlays MUST be read-only, pointer-inert, and outside hit testing, selection, layer lists, project state, history, validation asset enumeration, and export. Their application-level provenance/notices MUST remain separate from project provenance. The local selector MUST default to Coverflow and reset deterministically when a project session is newly created or reopened.

#### Scenario: Change the preview selector

- GIVEN a project is open and native preview overlays are visible
- WHEN the user switches between Coverflow and Banner list
- THEN only the renderer-local compositor changes and all canonical hashes, history, diagnostics, and export inputs remain unchanged

#### Scenario: Ignore overlay input

- GIVEN a pointer or keyboard event targets launcher-native chrome
- WHEN hit testing and accessibility handling run
- THEN the event cannot select or mutate a user layer and the chrome remains hidden from assistive technology
