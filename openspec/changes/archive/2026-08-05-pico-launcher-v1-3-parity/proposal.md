# Proposal: Pico Launcher v1.3.0 Parity

## Intent

Immediately block Custom export because incomplete output can be unsafe. Establish truthful offline authoring against Pico Launcher v1.3.0 (`b087565651c83081dd65552863f5efc2f28e489c`), with explicit legacy migration and evidence-bounded claims.

## Scope

### In Scope
- First useful release: immutable v1.3.0 evidence/profile; Material `primaryColor` and `darkTheme`; no transition output; honest preview labels; explicit V1/V2 Material save-as migration; Custom export blocked.
- Dependent release: typed Custom layout/color/assets; deterministic XBGR555, A3I5, and A5I3 codecs; exactly 12 validated visual files; complete atomic export; physical-cartridge evidence requirements.
- Later release: validated BCSTM support only after the visual baseline is proven.
- Preserve legacy `accent`, `background`, `foreground`, and `scenes` as non-exported evidence, or map only with user confirmation. Preserve source bytes during migration.
- Initial supported host is Linux x64 only; repeated Linux x64 exports MUST be byte-identical. macOS/Windows are outside the current supported-host set until separately evidenced, not failed requirements.
- Preserve the exact v1.3.0 cartridge scope: the 12 named visual files and all physical-receipt gates remain unchanged.

### Out of Scope
- Selector assets, `preview.bin`, theme `icon.bmp`, WAV, `launchTransition`, animation/timing controls, fonts, and global covers.
- Partial Custom packages, silent legacy reinterpretation, direct SD installation, launcher mutation, or AI/cloud prerequisites.

## Capabilities

### New Capabilities
- `custom-visual-authoring`: Typed visual fields/assets, codecs, completeness, atomic export, and cartridge evidence.
- `validated-bcstm-audio`: Evidence-backed BCSTM handling after visual parity.

### Modified Capabilities
- `dspico-compatibility-validation`: Replace obsolete authority with immutable v1.3.0 evidence.
- `deterministic-theme-export`: Truthful Material output and complete-or-blocked Custom output.
- `material-dual-screen-preview`: Display only launcher-consumed fields with honest labels.
- `offline-material-authoring`: Add typed fields and explicit, non-destructive save-as migration.

## Approach

Introduce a launcher-parity project generation in the deterministic core. Keep the GUI offline; CLI/MCP remain optional peers. Use `auto-chain`; task planning selects topology.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `packages/dspico-contract/src/` | Modified | Profile, validation, codecs, manifests |
| `packages/theme-core/src/` | Modified | Typed models, migration, preview |
| `packages/test-fixtures/src/` | Modified | Pinned source and cartridge evidence |
| `apps/studio/src/` | Modified | Save-as lifecycle, controls, export gate |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Unsafe or short Custom binaries | High | Block now; later require exact atomic package |
| Ambiguous legacy semantics | High | Preserve evidence; require confirmed mapping |
| Codec claims exceed evidence | Medium | Deterministic fixtures plus cartridge receipts |
| Host coverage is incomplete | Low | Limit current support to repeated Linux x64 output; separately evidence other hosts before adding them |

## Rollback Plan

Revert each release slice independently; retain the Custom export block until the complete visual contract is restored. Never rewrite legacy source files during rollback.

## Dependencies

- Read-only launcher worktree `/home/guill3/Documents/Hobbies/dspico/pico-launcher-worktrees/v1.3.0-audit` at the target commit; physical cartridge for parity receipts.

## Success Criteria

- [ ] No incomplete Custom package can be exported.
- [ ] Material output and preview expose only v1.3.0-consumed fields.
- [ ] Legacy migration is explicit, non-destructive, and never silently reinterprets fields.
- [ ] Custom readiness requires all 12 exact files and hardware-bounded evidence.
- [ ] Repeated Linux x64 export produces identical folder, report, checksum, and ZIP bytes without claiming macOS/Windows support.
