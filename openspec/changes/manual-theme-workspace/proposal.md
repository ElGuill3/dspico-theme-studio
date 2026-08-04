# Proposal: Manual Theme Workspace

## Intent

Enable offline Custom-theme authoring while keeping launcher-native chrome read-only and separate. Users can author and export layered backgrounds without breaking Material projects.

## Scope

### First Useful Release
- Portable `project.json` bundle with SHA-256-addressed assets and provenance/rights metadata.
- Extensible V2 model, explicit theme kind, and deterministic V1 Material migration.
- Exact 256×192 surfaces; dual view with a configurable 96px default non-exported gap and focus views.
- PNG import, layers, selection, translation, axis-aligned resize/crop, z-order, properties, Undo/Redo, deterministic preview, validation, and compatible `topbg`/`bottombg` export.
- User-owned content only, rendered by Canvas 2D with DOM accessibility; preview selection stays renderer-local.

### Non-Goals / Later Extensions
- Grid/banner cells, scrim/palettes, optional icon/preview/audio, and their launcher-specific properties.
- Rotation, affine transforms, filters, broad blend modes, external converters, or SD installation.
- Editing/exporting launcher-native content, DSi frame, or Coverflow/Banner chrome.

## Capability Deltas

### New Capabilities
- `manual-theme-workspace`: Accessible layered composition.
- `portable-theme-project-assets`: Immutable ingestion, recovery, and provenance.

### Modified Capabilities
- `offline-material-authoring`: Add V2 while preserving Material behavior.
- `material-dual-screen-preview`: Share surfaces while isolating launcher chrome.
- `dspico-compatibility-validation`: Validate Custom backgrounds/transitions.
- `deterministic-theme-export`: Compile backgrounds with lineage.

## Approach and Delivery

Canonical layered documents feed a pure render plan; Canvas is neither state nor export source. Main/core owns privileged work and compilation.

Under `auto-chain`, keep each tested autonomous slice below 400 authored changed lines: baseline checkpoint → V2/migration → asset store → PNG IPC → read-only workspace → add/move/Undo → layer controls → resize/crop → shared preview → validation/export. Chain strategy remains unselected and MUST be resolved before apply. The current 1,700+ line uncommitted identity-authoring baseline MUST receive a stable checkpoint first.

## Constraints and Compatibility

- V1 migrates to Material V2 without overwrite; unknown/newer formats are refused. Custom projects with assets cannot switch kind.
- Stay offline/sandboxed: check magic bytes/limits; use narrow IPC; deny renderer paths, network, shell, and external tools. Commit assets before JSON.
- Pin conversion policies. Export is byte-deterministic and preserves lineage/notices. Preview assets need application provenance before distribution and never enter exports.

## Affected Areas

`packages/theme-core`, `packages/dspico-contract`, `apps/studio/src`, `packages/test-fixtures`, and `e2e`.

## Risks and Open Technical Details

Spec/design MUST settle resampling, alpha/channel rounding, quantization/dithering, palette allocation, and the nested-transition discrepancy. Risks include migration corruption, history-unsafe asset GC, host variance, incompatible DS output, and preview-asset rights.

## Rollback Plan

Disable V2 creation/Custom export, reverse slices, retain V1 read/export, and never rewrite source bundles.

## Success Criteria

- [ ] Migrated Material remains equivalent; unsupported inputs remain untouched.
- [ ] Custom bundles survive save/reopen and Undo/Redo.
- [ ] The complete top/bottom workflow produces identical validated exports offline.
- [ ] Preview chrome cannot dirty, select, persist, validate, or export.
