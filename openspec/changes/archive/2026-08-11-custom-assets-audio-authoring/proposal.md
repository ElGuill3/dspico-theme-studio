# Proposal: Custom Assets and Audio Authoring

## Intent

Create a Custom asset bench without overstating cartridge readiness. Author seven PNG sources and optional UI sounds against one evidence-bounded profile while export remains fail-closed.

## Scope

### In Scope
- First release: seven PNG sources generate the exact 12-file v1.3 manifest via non-destructive transforms/crops, deterministic palette presets, and post-codec preview.
- Deterministically prepare Navigation/Launch PCM WAVs via trim, fade, gain, downmix, resampling, signed-16 LE quantization, mono 22,050 Hz output, and size validation. Label waveform/playback `Desktop audition`; require no per-project WAV hardware receipt.
- Portably save/reopen sources, outputs, recipes, hashes, explicit provenance/rights, profile, and evidence.
- Provide a separate **NOT READY — CARTRIDGE TEST ONLY** handoff and reusable visual receipts bound to exact manifest/profile/codec-policy hashes.
- Later: one BCSTM after visual receipt, strict byte-preserving pass-through with a separate receipt.

### Out of Scope
- Pixel painting, manual palette ordering, multiple BCSTM files, fonts, direct installation, post-profile features, or BCSTM conversion/audition.

## Capabilities

### New Capabilities
- `theme-ui-sound-authoring`: Deterministic WAV preparation, desktop approximation, persistence, and evidence.
- `cartridge-test-handoff`: Non-publishable handoff and exact-manifest receipts.

### Modified Capabilities
- `custom-visual-authoring`: Seven PNG sources, transforms, generated palettes, post-codec preview, provenance, reusable receipts.
- `dspico-compatibility-validation`: Official v1.3 visuals plus installed/hardware-validated WAV target `12a357324cab401a8f100d50198b33bfeba93fbaf53261bc7456ebe863d96342`, excluding unrelated features.
- `offline-material-authoring`: Portable typed assets and replayable operations.
- `deterministic-theme-export`: Ordinary export stays blocked until component gates pass.
- `validated-bcstm-audio`: One dependent pass-through BCSTM with separate receipt.
- `material-dual-screen-preview`: Evidence-labeled Custom preview and WAV desktop audition.

## Approach

Extend the deterministic core with component manifests, typed assets, recipes, and receipts. Keep filesystem/atomic writes in main; expose IPC to a 12-output visual rail and separate UI Sounds/BGM surfaces. Plan auto-chained, stacked-to-main work units under 400 lines.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `packages/dspico-contract/src/` | Modified/New | Profile, codecs, media contracts, manifests |
| `packages/theme-core/src/` | Modified | Asset operations and evidence |
| `apps/studio/src/` | Modified | Store, IPC, UI, readiness gates |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| False authority/preview claims | High | Component evidence and approximation labels |
| Output drift | High | Version policies, recipes, rounding, hashes |
| Readiness leakage | High | Separate handoff; fail-closed export |

## Rollback Plan

Remove slices independently, retain sources, and restore the Custom export block; never reinterpret projects or receipts.

## Dependencies

- Official v1.3 visuals, installed-target WAV evidence, physical visual/BCSTM validation, strict BCSTM parser.

## Success Criteria

- [ ] Identical inputs/recipes reproduce identical outputs after save/reopen.
- [ ] Handoff is never ready/publishable; ordinary export stays blocked until exact gates pass.
- [ ] Receipts follow exact component identities; BCSTM remains dependent and separate.
