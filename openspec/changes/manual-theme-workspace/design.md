# Design: Manual Theme Workspace

## Technical Approach

Add V2 replay, portable assets, shared rasterization, and Custom compilation behind main/core authority; retain the V1 lifecycle.

## Architecture Decisions

| Choice | Rejected tradeoff | Rationale |
|---|---|---|
| `<root>/project.json` + hashed assets | Sidecars split copies | One portable authority. |
| `pngjs@7.0.0`, strict RGBA8 | Browser decode varies | Pinned pixels; 64MiB RGBA/serial cap. |
| Canvas view + DOM controls | WebGL/DOM raster | Determinism plus accessibility. |
| Redo-preserving V2 Save | Save-time compaction | Save is not an edit. |

## State, Operations, and Migration

`CommittedStateV2 = ProjectStateV2 & {project:ThemeProjectV2}` exactly; persistence stores `ProjectStateV2`, while IPC/import/renderer authority uses only `CommittedStateV2`, with `project=replay(initial,operations.slice(0,cursor))`.

V1 operations are exactly `{version:1,type:"set-metadata",field:name|description|author,value:string}`, `{version:1,type:"set-token",key,value}`, `{version:1,type:"set-scene-token",sceneId,key,value}`, its identity-bearing form adding `screen:top|bottom,mode`, and `{version:1,type:"acknowledge",fingerprint}`. Their V2 union members use `version:2`: metadata and acknowledge retain shape; non-transition token → `set-material-token`; keys `coverStartScalePercent|coverFinalAlpha|scrimFinalAlpha` → `{type:"set-launch-transition-field",field,value:number}`; scene-token always includes screen/mode. Invalid transition values, absent identity for a legacy unknown scene, identity mismatch, unknown type/version, or replay failure refuses conversion unchanged. Migration sequentially replays the full V1 operation array (including redo) to derive legacy identities; maps initial and every snapshot; preserves operation order, cursor, baseRevision, snapshot revisions, IDs, metadata, profile, tokens/scenes/manifest, acknowledgments, and redo. V2 adds Material kind, empty documents/assets, and sorted notices. Root transitions become nested; defaults are `100/12/14`; unequal root/nested values block.

Format dispatch keeps canonical V1 create/open/edit/Undo/Redo/validate/export/save/reopen authoritative. Only explicit **Save as V2** writes a new bundle; source bytes remain untouched.

V2 Save preserves operations/redo/cursor/baseRevision/snapshots; it appends nothing. A new operation sets `operations=operations[0:cursor]+op`, drops later snapshots, folds exactly the oldest overflow into `initial`, increments baseRevision, and retains at most 200 operations; at revisions divisible by 20 it upserts that snapshot, then revision-sorts/uniques and retains at most 10. Reachability is the union of initial, every retained operation prefix (Undo/Redo), current, and retained snapshots; GC is separate and explicit.

## Import, Rendering, and Rights

PNG limits: 16,777,216 source bytes/file; width/height `1..4096`; 16,777,216 pixels/file; 256 assets; 268,435,456 project source bytes; 268,435,456 peak decoded-memory bytes with serial decoding. Accept only PNG signature, IHDR bit-depth 8/color-type 6/compression 0/filter 0/interlace 0; reject APNG, other types, CRC failure, and unknown critical chunks. Ignore color-management ancillary chunks without transforming samples; normalized output is top-left straight RGBA8.

Operation validation rejects crop `{x,y,width,height}` unless integer, positive, wholly inside source, and overflow-safe; authority stays unchanged. Destination is positive Q16; rasterization intersects it with `[0,256)×[0,192)`, discards others, and rejects endpoint/inverse-map overflow. `nearest-center-floor-v1` samples transparent—not an edge pixel—when an inverse-mapped destination center falls outside the valid crop/source. Composition/15bpp retain the specified fixed source-over rounding, alpha threshold 128, round-half-up q5, no dithering, little-endian packing, and 98,304 bytes/screen.

Every exportable reachable asset requires complete source, author/credit, license/terms, notice, and affirmative rights metadata. Missing fields or a `reference-only` asset reachable from an exportable layer is an error blocking validation/export. Reference-only assets may appear only on explicit non-exportable authoring-reference layers; they never enter export pixels, lineage, notices, or files.

## Persistence and Export

Transaction-owned `.transactions/<id>/` staging may be auto-deleted only before any final rename; old authority remains. After an asset/project rename, all leftover assets, staging, and journals are report-only and never silently deleted. Before project rename: old authority. After rename but before root fsync: old hash selects old; verified new hash plus all assets selects new and fsyncs; otherwise read-only block. After root fsync: new authority. Recovery is hash/phase-driven, repeatable, and mutation-free except idempotent fsync.

ZIP inherits the stored writer: DOS time `0x0000`, date `0x0021`; made-by `0x0014` (DOS,2.0), needed `20`; flags `0` (fixed ASCII names), method `0`; CRC-32 uses polynomial `0xedb88320`, init/xorout `0xffffffff`; internal/external attributes and permissions `0`; no data descriptors, extras, file/archive comments, directory entries, or Zip64. Material order is `theme.json,report.json`; Custom is `theme.json,topbg.bin,bottombg.bin,report.json`; local/central CRC and sizes are identical.

## Files, Flow, and Evidence

Create V2/render files in `packages/theme-core/src/`, compiler/report files in `packages/dspico-contract/src/`, privileged asset/IPC adapters in `apps/studio/src/`, accessible workspace files under `renderer/workspace/`, and **new** `scripts/verify-package.mjs`. Flow: `renderer→preload DTO→queued main→durable store→CommittedStateV2→shared plan`; export never captures Canvas.

Goldens under `packages/test-fixtures/goldens/custom-background-v1/` are `rgba-pack-v1` (R/G/B/transparent tiles), `alpha-127-128-v1`, and `crop-scale-clip-v1` (generated 4×4 coordinate colors, crop `1,1,2,2`, destination `-1,-1,4,4`); source generation lives in `packages/test-fixtures/src/custom-background-goldens.ts` and is tied to pinned `docs/Themes.md` evidence. Unit/property tests cover migration/history/raster/ZIP/rights; integration covers every crash/import/path case; Electron covers keyboard/preview isolation. Normal packaged acceptance reaches BrowserWindow/preload/`app://studio`, verifies CSP/network denial, and treats bootstrap as supplemental.

## Threat Matrix

Production path/IPC/CSP boundaries are applicable; hostile path, forged sender, navigation, and network RED tests require unchanged authority. Shell/subprocess/VCS are N/A in production. Fixture capture alone uses allowlisted `git -C` argv, `shell:false`, pinned clean HEAD; hostile repository/state RED tests stop. Push/PR remain N/A.

## Migration / Rollout

Before apply, the existing 1,700+ line uncommitted identity/preview baseline MUST be captured by a recorded baseline commit SHA; apply refuses without it. Rollback disables V2/Custom while V1 remains. Delivery is `auto-chain`; `chain_strategy` remains unselected.

## Open Questions

None.
