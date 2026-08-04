# Manual Theme Workspace Specification

## Purpose

Provide an offline editor for user-owned Custom top/bottom backgrounds.

## Requirements

### Requirement: Fixed dual-surface workspace

Workspace MUST maintain separate `top` and `bottom` documents, each exactly 256×192 pixels. Dual view MUST show both; focus MAY enlarge one without changing geometry. The default simulated gap MUST be 96 CSS pixels and never persisted/exported. Selection, tool, zoom, and grid MUST remain local.

#### Scenario: Switch between dual and focus views

- GIVEN a Custom project with both surfaces
- WHEN the user enters bottom focus and changes zoom/grid
- THEN only the viewport changes; content and bytes are unchanged

#### Scenario: Reopen with local presentation state

- GIVEN a project viewed with custom gap, zoom, grid, and focus
- WHEN it is reopened
- THEN content is identical and deterministic local defaults apply

### Requirement: Accessible canonical layers

Each layer MUST have a stable ID, name, order, visibility, opacity, asset reference, and integer/fixed-point translation. It MUST support axis-aligned resize/crop, selection, reverse-z hit testing, and keyboard equivalents; rotation, affine transforms, filters, and blend modes MUST be rejected.

#### Scenario: Select and move a layer

- GIVEN an exportable image layer on top
- WHEN the user selects and translates it
- THEN its ID, position, and order are preserved in the operation

#### Scenario: Reject an unsupported transform

- GIVEN an edit requests rotation or an out-of-bounds crop
- WHEN the edit is committed
- THEN it is refused with a diagnostic and the prior state remains authoritative

### Requirement: Gesture-safe history

Transient pointer/keyboard updates MUST be coalesced; each completed drag, resize, or crop MUST commit one semantic operation. Replay and Undo/Redo/save/reopen MUST preserve order, properties, transforms, and content.

#### Scenario: Undo a completed drag

- GIVEN a layer is dragged through many positions
- WHEN the pointer is released and Undo is pressed
- THEN one move is removed and Redo restores the final position

#### Scenario: Save and reopen edited layers

- GIVEN add, reorder, visibility, resize, and crop operations are committed
- WHEN the user saves, reopens, undoes, and redoes
- THEN the same layer state and outcomes are recovered

### Requirement: One shared accessible render view

Workspace and device preview MUST consume one pure render plan from canonical plus ephemeral state. Canvas 2D MUST be view-only, never canonical state or export screenshot. DOM controls MUST expose layers, properties, tools, focus, keyboard commands, and screen-reader status independently.

#### Scenario: Match workspace and device surfaces

- GIVEN the same committed top or bottom document
- WHEN workspace and DSi preview render it
- THEN pixels and composition order match before preview chrome

#### Scenario: Operate without canvas hit targets

- GIVEN an assistive-technology user focuses the layer tree
- WHEN visibility, reorder, or translation is invoked
- THEN the operation and announcement update without canvas

### Requirement: Preview chrome is not project content

The DSi frame and launcher-native overlays MUST remain read-only, pointer-inert, `aria-hidden`, and outside hit testing, layers, project state, history, validation, and export. Coverflow/Banner selection MUST be local, default Coverflow, and reset deterministically for new/reopened sessions.

#### Scenario: Interact with launcher chrome

- GIVEN native frame and Coverflow/Banner overlays are visible
- WHEN the user clicks, tabs, or changes the selector
- THEN no layer or project, history, diagnostic, or export state changes

### Requirement: Release evidence covers authority boundaries

Acceptance MUST include unit, property, integration, end-to-end, and packaged-application evidence for schema, replay, IPC/persistence, copy/reopen, preview isolation, and sandbox/CSP. No unsupported tool may be a prerequisite.

#### Scenario: Approve a complete workspace slice

- GIVEN all five evidence levels exercise the same fixtures
- WHEN the top/bottom workflow runs
- THEN every level passes and no partial output is authoritative

#### Scenario: Stop on boundary failure

- GIVEN evidence detects raw paths, preview contamination, nondeterminism, or recovery loss
- WHEN acceptance is evaluated
- THEN the slice is rejected until corrected
