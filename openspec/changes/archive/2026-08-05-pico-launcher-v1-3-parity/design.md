# Design: Pico Launcher v1.3.0 Parity

## Technical Approach

Use one schema-discriminated project beside legacy V1/V2. Bind validation/export to v1.3.0 commit `b087565651c83081dd65552863f5efc2f28e489c`, rejecting `f3ae632`. Sequence Custom blocking with retained open/save, truthful Material, evidence-gated Custom, then pass-through BCSTM. Initial host support is Linux x64 only; repeated exports on that host must match byte-for-byte. macOS/Windows remain outside the supported-host set until separately evidenced.

## Architecture Decisions

| Decision | Alternative / rationale |
|---|---|
| Strict `LauncherParityProjectV1` | Patching ambiguous V1/V2 cannot prove semantics; use schema, format 1, union payloads, versioned operations. |
| Save As migration | Reject in-place source loss; retain exact bytes and explicit decisions. |
| Split export routes | A generic route can reopen unsafe Custom: guard renderer, preload, IPC, and main. |
| Evidence-gated publication | Reject best-effort output/claims; require complete Custom and scoped immutable evidence. |

## Data Flow

```text
V1/V2 bytes -> read-only adapter -> migration review -> Save As parity bundle
UI -> typed operation -> project replay -> profile validation -> compile -> AtomicExportWriter
source PNG -> rights check -> SHA-256 store -> codec -> 12-file gate -> receipt gate
BCSTM bytes -> strict parser -> pass-through manifest -> visual-parity gate
```

## File Changes

| File | Action | Description |
|---|---|---|
| `packages/theme-core/src/parity-model-v1.ts`, `packages/theme-core/src/parity-history-v1.ts`, `packages/theme-core/src/parity-migration-v1.ts` | Create | Model/replay/migration. |
| `packages/theme-core/src/index.ts`, `packages/theme-core/src/preview.ts` | Modify | Dispatch/preview. |
| `packages/dspico-contract/src/profile-v1-3.ts`, `packages/dspico-contract/src/codecs-v1-3.ts`, `packages/dspico-contract/src/custom-v1-3.ts`, `packages/dspico-contract/src/bcstm-v1-3.ts` | Create | Profile/capabilities. |
| `packages/dspico-contract/src/index.ts` | Modify | Diagnostics/export. |
| `packages/test-fixtures/src/capture.ts`, `packages/test-fixtures/src/launcher-v1.ts` | Modify | Capture/evidence. |
| `apps/studio/src/main.ts`, `apps/studio/src/studio-ipc.ts`, `apps/studio/src/preload.ts`, `apps/studio/src/project-file-session.ts`, `apps/studio/src/portable-project-store.ts` | Modify | Guards/Save As/store. |
| `apps/studio/src/renderer/renderer.tsx`, `apps/studio/src/renderer/workspace/read-only-workspace.tsx`, `apps/studio/src/renderer/workspace/workspace-model.ts` | Modify | Controls/labels. |
| `packages/test-fixtures/src/capture.test.ts`, `packages/dspico-contract/src/index.test.ts`, `packages/dspico-contract/src/custom-compiler-v1.test.ts`, `apps/studio/src/studio-ipc.test.ts`, `apps/studio/src/portable-project-store.test.ts`, `e2e/lifecycle.spec.ts` | Modify | Coverage. |

## Interfaces / Contracts

`LauncherParityProjectV1` is the sole persisted/IPC type; `LauncherParityStateV1` does not exist. It stores schema/version, stable ID, history, metadata, profile, acknowledgments, evidence, and `MaterialV1 | CustomVisualV1`. Replay returns an internal, unpersisted view. Material operations cover RGB8 `primaryColor`, boolean `darkTheme`, metadata, migration decisions, and acknowledgments. Save As stores legacy bytes at `evidence/sha256/<hash>.json` with mappings/exclusions.

Diagnostics sort `error < warning < suggestion`, then rule ID, document, pointer, fingerprint. Fingerprints hash canonical `[profileId,tag,commit,manifestSha256,ruleId,ruleVersion,severity,document,pointer,normalizedValue,ordered evidence IDs/hashes]`. Only warning fingerprints acknowledge. Any input change creates a new fingerprint; stale acknowledgments remain evidence but never satisfy validation. Material and Custom reports preserve each evidence `kind` and include `softwareFixtureOnly: true` plus `hardwareParityClaimed: false` when no physical receipt exists.

Preview labels each property `launcher-vector-backed` only when an accepted v1.3.0 claim's pinned vector/fixture hash and semantic ID match the manifest. A physical receipt may corroborate, never promote an unpinned property. Missing, drifted, browser-only, or receipt-only support selects `Chromium approximation`; preview never controls export.

Custom uses all-or-absent spec objects and closed 12-file `VisualSlot` records containing length, geometry, codec, and source hash. PNGs reuse rights records and `assets/sha256/<hash>.png`. Safe integers are `x=0..255`, `y=0..191`, width `1..256-x`, RGB `0..255`. `CodecPolicyV1` fixes little-endian XBGR555, round-half-up alpha, transparent index/padding 0, no dithering, integer median-cut (R/G/B ties), lexical palettes, nearest-color/lowest-index ties, and A3I5/A5I3 packing.

Later `BgmAssetV1` preserves original bytes at `assets/sha256/<hash>.bcstm` and passes accepted bytes unchanged to bundle-relative `bgm/<hash>.bcstm`, reporting launcher destination `/_pico/themes/<theme>/bgm/<hash>.bcstm`. A strict parser accepts only pinned-evidence header/chunk structure and metadata ranges; anything malformed/unknown blocks export. Sorted metadata, manifest, diagnostics, hashes, and report bytes are deterministic. No conversion, playback preview, or playback-parity claim exists. Availability requires valid profile, complete visuals, and their cartridge receipt.

Capture requires canonical configured root, exact clean HEAD/tag, `git show <commit>:<path>`, and matching hashes/digest; any drift fails without fallback.

## Testing Strategy

| Layer | What / approach |
|---|---|
| Unit (`pnpm test`) | Schema/replay/migration, diagnostics, labels, codec goldens, 12 slots, deterministic Linux x64 repeats, and strict BCSTM pass-through. |
| Integration (`pnpm test`) | Four guards, unchanged legacy bytes, atomic rollback, drift refusal. |
| Runtime (`pnpm test:e2e`, packaged harness) | Material/history/Save As; Custom open/save with zero writes; gated Custom/BCSTM. |
| Hardware | Scoped visual and later BCSTM receipts; absent receipt means no claim. macOS/Windows are not current supported hosts. |

## Threat Matrix

| Boundary | Applicability | Safe/failure behavior and planned RED tests |
|---|---|---|
| Documentation-like paths | N/A — allowlisted bytes are never executed. | No task. |
| Git repository selection | Applicable | Relative/absolute `git -C` must resolve to configured root; hostile/moved roots fail before `show`. RED: selectors/metacharacters. |
| Commit state | Applicable | Exact clean HEAD/tag passes; staged/unstaged/untracked fails; no `commit -a`/write verb. RED: each state/argv. |
| Push state | N/A — no push. | No task. |
| PR commands | N/A — no PR automation. | No task. |

## Migration / Rollout

Dependency slices, not topology: (1) profile/Custom block; (2) project/Save As/Material/preview/diagnostics; (3) codecs with Custom blocked; (4) receipt-gated Custom; (5) BCSTM after visual proof. Each preserves V1/V2 readers and rolls back independently; the block remains until slice 4. Sources are never rewritten. The exact v1.3.0 12-file cartridge scope is unchanged. Selector assets, preview/icon, WAV, transitions/animation, fonts, global covers, SD installation, launcher mutation, and AI/cloud remain unsupported.

## Open Questions

None.
