## Exploration: Custom assets and audio authoring

### Current State
The product has one composite compatibility profile, not selectable official-only and extension variants. Visual behavior remains pinned to official tag `v1.3.0`, commit `b087565651c83081dd65552863f5efc2f28e489c`. Theme UI sounds are a separately evidenced component inside that profile, proven on installed hardware target SHA-256 `12a357324cab401a8f100d50198b33bfeba93fbaf53261bc7456ebe863d96342`. The profile must cite each component independently and must not inherit unrelated post-v1.3 launcher features.

Repository history confirms the sound lineage. Commit `59e0af2f62cff26e1b4d21f500837d36c4d22810` introduced navigation playback and the strict WAV parser. Commit `7a75b4d408b43b62201236576d00e1429d6c32aa` generalized it to `ThemeSoundPlayer`, moved navigation to `sounds/navigation.wav`, added `sounds/launch.wav`, and documented that both one-shots share hardware channel 2 while streamed BCSTM remains separate. Current source loads both paths from the active theme; navigation plays when a committed selection change occurs, and launch stops navigation and BGM before playing once during launch/fade. BCSTM streams on channels 0/1 from an unordered `bgm` set and is randomly selected at startup.

The installed cartridge physically confirmed both WAV paths. Accepted files are RIFF/WAVE, PCM format 1, mono, 22,050 Hz, signed 16-bit little-endian, block align 2, and byte rate 44,100. Source enforces non-empty even PCM data up to 11,024 bytes and a complete file up to 16 KiB. The observed launch fixture reached 11,024 data bytes and 11,102 total bytes; the validated navigation fixture used the same format. These observations prove the installed extension, not the official tag, and must remain distinguishable from source-only or desktop evidence.

The Studio has no WAV model, validator, portable storage, IPC, preview, provenance flow, or receipt UI. Its current profile explicitly excludes WAV because it models only the official tag; main specs therefore need a later composite-profile amendment rather than silently reinterpreting `dspico-launcher-v1`.

The existing Custom visual core is otherwise reusable. It imports RGBA8 PNGs, persists them by SHA-256, and composes top/bottom layers. The 12 launcher outputs derive from seven logical RGBA sources: two 256×192 backgrounds, unselected/selected 64×64 grid cells, unselected/selected 256×49 banner cells, and one 8×42 scrim; five palette files are deterministic derivatives. Today the latter five source images are transparent placeholders, and there is no palette inspection, post-codec decode preview, or slot-specific editor.

BCSTM support exists only in the contract package. It strictly parses little-endian v2 DSP-ADPCM, extracts channels/rate/loop/block metadata, preserves source bytes, and creates deterministic pass-through paths. It intentionally performs no conversion, decode, or playback. The existing visual prerequisite and source-matching BCSTM receipt remain valid gates.

Physical evidence is not yet an end-user workflow. Main reads a visual receipt only from `DSPICO_VISUAL_RECEIPT_PATH`; receipts, target identity, and sound evidence cannot be captured or persisted in the UI. The approved separate `NOT READY — CARTRIDGE TEST ONLY` handoff resolves the receipt cycle without weakening ordinary export.

### Affected Areas
- `apps/studio/src/renderer/renderer.tsx` — add visual slots, separate UI Sounds and Background Music sections, provenance, metadata, receipts, and explicit readiness stages.
- `apps/studio/src/renderer/workspace/read-only-workspace.tsx` — retain layered editing for backgrounds, but add fixed-geometry slot editors and equivalent keyboard/numeric controls.
- `apps/studio/src/renderer/workspace/workspace-model.ts` — model slot view state, selected/unselected comparison, zoom/grid, and post-codec preview surfaces.
- `apps/studio/src/renderer/studio.css` — support a cartridge asset bench and channel-aware audio inventory without losing focus visibility, responsive behavior, or reduced motion.
- `apps/studio/src/studio-ipc.ts` and `apps/studio/src/preload.ts` — add narrow typed commands for PNG, WAV, BCSTM, receipts, and test handoffs; never expose raw paths or filesystem access.
- `apps/studio/src/main.ts` — own file dialogs, profile selection, validation ordering, hashing, portable bytes, and fail-closed handoff/publication.
- `apps/studio/src/png-import.ts` — keep normalized RGBA8 PNG as the visual source boundary and expose slot-specific dimension/normalization diagnostics.
- `apps/studio/src/portable-project-store.ts` — persist typed PNG, WAV, BCSTM, and receipt assets atomically, verify media type/hash, and reopen without process memory.
- `packages/theme-core/src/model-v2.ts`, `packages/theme-core/src/history-v2.ts`, and `packages/theme-core/src/render-plan-v2.ts` — add versioned operations for slots, transforms, deterministic palettes, two named UI sounds, one BCSTM BGM, and evidence references.
- `packages/dspico-contract/src/codecs-v1-3.ts` — add deterministic decode/inspection support and explicit palette-policy inputs while preserving current encoder defaults and bytes.
- `packages/dspico-contract/src/custom-v1-3.ts` and `packages/dspico-contract/src/index.ts` — compile all seven logical sources into the exact 12-file package, report lineage, and gate current-manifest publication.
- `packages/dspico-contract/src/profile-v1-3.ts` — evolve from a monolithic official-tag profile to one composite manifest with separately cited visual, UI-sound, and BGM authorities.
- `packages/dspico-contract/src/theme-sounds-v1.ts` — add PCM WAV intake, deterministic trim/fade/gain/downmix/resampling, canonical output, metadata, path identity, diagnostics, and extension-target evidence.
- `packages/dspico-contract/src/bcstm-v1-3.ts` — reuse strict parse/pass-through contracts behind the visual prerequisite and independent source receipt.
- `apps/studio/src/export-writer.ts` — keep publication atomic and keep the approved test handoff physically and semantically separate from Export.
- `openspec/specs/dspico-compatibility-validation/spec.md`, `offline-material-authoring/spec.md`, and `deterministic-theme-export/spec.md` — currently exclude WAV; later spec work must add the extension without broadening the official visual baseline.
- `openspec/config.yaml` — its empty/testless repository context is stale and should be refreshed in a later SDD phase.

### Approaches
1. **Composite asset bench** — keep seven PNG visual sources with 12-output visibility, add two prepared WAV slots, and manage one BCSTM as separate BGM under one component-aware profile.
   - Pros: matches actual installed hardware; preserves official visual authority; exposes real channel/path semantics; keeps provenance, persistence, receipts, and export gates explicit.
   - Cons: requires profile versioning, WAV contracts, typed audio persistence, component-specific evidence, and several UI stages.
   - Effort: High

2. **Official-tag profile plus opaque extension files** — leave the profile unchanged and merely copy WAV files when present.
   - Pros: smaller initial model and UI change.
   - Cons: falsely attributes WAV authority to v1.3.0, cannot explain hardware target/channel behavior, weakens receipts, and makes project reopening and diagnostics ambiguous.
   - Effort: Medium

3. **General media converter** — accept arbitrary image/audio formats and convert them into launcher assets.
   - Pros: lowest friction for casual inputs.
   - Cons: substantially expands codec, licensing, determinism, resampling, clipping, metadata, and preview claims; BCSTM conversion remains unsupported; output lineage becomes harder to review.
   - Effort: Very High

### Recommendation
Choose approach 1. Define one immutable composite profile whose manifest has three evidence components:

| Component | Authority | User-facing contract |
|---|---|---|
| Custom visuals | Official v1.3.0 commit `b087565...` plus pinned source/fixtures | Seven PNG sources deterministically generate the exact 12 files |
| Theme UI sounds | Source lineage `59e0af2...` → `7a75b4d...`, installed target `12a357...`, and physical capability evidence | Optional prepared `sounds/navigation.wav` and `sounds/launch.wav` one-shots on shared channel 2 |
| Background music | Official v1.3 BGM source plus strict BCSTM contract and source receipt | One unchanged DSP-ADPCM `.bcstm` file in `bgm`, streamed separately on channels 0/1 |

The profile must pin exact evidence bytes and claims. It must not absorb theme selector, icons, launch-transition customization, or other commits merely because the sound branch contains them.

Supported first-release sources should be intentionally narrow:

- **Visuals:** non-interlaced RGBA8 PNG only. The already approved non-destructive crop/transform model remains; pixel painting stays excluded.
- **UI sounds:** uncompressed PCM RIFF/WAVE source only. Deterministic preparation applies non-destructive trim, gain, and fades, then deterministic downmix/resampling/quantization to PCM format 1, mono, 22,050 Hz, signed 16-bit LE. Canonical output must have non-empty even PCM data no larger than 11,024 bytes and a complete file no larger than 16 KiB. MP3, OGG, FLAC, compressed WAV, and unsupported PCM variants fail closed. The 11,102-byte launch observation remains evidence, not a replacement for the parser limit.
- **BGM:** one structurally valid BCSTM DSP-ADPCM file, preserved byte-for-byte. No conversion, decoding, waveform playback, or playback-parity claim.
- **Evidence:** versioned JSON receipts bound to the composite profile, component authority, installed target identity, and exact asset/output hashes. Visual receipts are reusable across projects only when the complete visual manifest, profile hash, and codec/policy hashes match exactly.

The 12-position visual output rail remains the signature interaction. Seven source slots are editable; five palettes are locked/generated. Deterministic palette presets and inspection are approved, while manual palette editing/reordering remains excluded. Preview must decode compiled visual bytes and label hardware-unknown properties honestly.

Audio must be shown as two distinct systems, not one generic playlist:

| Asset | Runtime behavior | Preview claim |
|---|---|---|
| Navigation WAV | Retriggerable one-shot when committed selection changes; shared channel 2 | Waveform and local playback labeled `Desktop audition`; installed-target behavior is hardware-backed |
| Launch WAV | Replaces any navigation one-shot, stops BGM, and plays once during launch/fade on channel 2 | Waveform and local playback labeled `Desktop audition`; installed-target behavior is hardware-backed |
| BCSTM BGM | Separate streamed background on channels 0/1; looping follows BCSTM metadata | Metadata only; no Studio playback parity |

Persist original PNG, source WAV, prepared WAV, BCSTM, and receipt bytes as immutable hash-addressed assets. Persist semantic assignments, non-destructive visual transforms, deterministic palette policy/version, WAV preparation parameters, two named prepared-WAV references, one BCSTM reference, and evidence references in project history. Reopen must verify every hash, transform recipe, and media contract before editing/export. Rights/provenance must be explicit for every imported media asset; the current renderer’s automatic “User supplied” rights assertion must be removed.

The exact recommended user workflow is:

1. Create/open a Custom bundle targeting the named composite profile and inspect both profile component identities.
2. Work through the seven source slots; each import validates PNG shape/limits and collects rights/provenance before assignment.
3. Edit backgrounds in the layered 256×192 workspace; edit grid, banner, and scrim in their fixed canvases; compare selected/unselected states without relying on color alone.
4. Inspect generated palette swatches, quantization/alpha diagnostics, all 12 output statuses, and the decoded post-codec preview.
5. Open **UI sounds** and independently import Navigation and Launch PCM WAVs. Adjust non-destructive trim, gain, and fades; deterministically prepare canonical mono 22,050 Hz signed-16 LE output; inspect source/output hashes, duration, limits, provenance, and shared-channel behavior; use waveform/local playback labeled `Desktop audition`. Absence remains valid because source treats both as optional.
6. Save/reopen and run component-aware diagnostics. Missing visual slots, invalid media, stale assets, incomplete rights, warnings, or profile drift remain blocking.
7. Generate the approved **NOT READY — CARTRIDGE TEST ONLY** handoff containing visual candidates, optional WAVs, target identity, hashes, test instructions, and no publishable ZIP or compatibility claim. The app never installs directly to SD.
8. Test visual states on the installed target and capture the visual receipt. Visual receipts may be reused when the entire manifest, composite-profile hash, and codec/policy hashes are identical. WAV publication reuses the existing hardware capability evidence and does not require a per-project cartridge receipt; optional listening observations may be attached without becoming a gate.
9. After the visual prerequisite passes, import one BCSTM BGM. Show structural metadata and loop semantics, then use a separate handoff and source-hash receipt for playback/loop validation.
10. Enable final atomic publication only when every included component passes its own validation, rights, acknowledgments, and required receipt policy before destination selection.

The first useful release should include complete visual slot authoring **and both validated WAV slots**, portable save/reopen, component-aware diagnostics, the safe cartridge handoff, and receipt capture. The WAV extension already has source and physical authority, so deferring its import workflow behind BCSTM would be artificial. BCSTM remains the next stacked release because it has a distinct visual prerequisite and source-specific playback receipt.

With `auto-chain`, `stacked-to-main`, and the 400-line review budget, task planning should isolate composite profile/evidence, portable media model/store, visual authoring, deterministic WAV preparation/UI, handoff/receipts, and single-BCSTM BGM as independently reviewable work units.

Final product decisions:

- The separate `NOT READY — CARTRIDGE TEST ONLY` handoff is authorized and may not produce a publishable ZIP or compatibility claim.
- Visual editing is PNG import plus non-destructive crop/transform only; pixel painting is excluded.
- Indexed palettes use deterministic inspectable presets; manual palette edits/reordering are excluded.
- One composite profile combines official v1.3 visuals with the physically validated WAV extension at target `12a357...`.
- WAV authoring deterministically prepares PCM WAV input through trim/fade/gain, downmix, resampling, and signed-16 LE quantization; waveform and local playback are labeled `Desktop audition`.
- WAV publication reuses existing hardware capability evidence; no per-project WAV cartridge receipt is required, while optional listening observations remain non-blocking.
- The initial BGM capability accepts exactly one BCSTM source.
- Visual receipts are reusable only by exact complete visual manifest, composite-profile hash, and codec/policy hashes.

Every physical receipt must contain: receipt/schema version and component; tester identity; device/cartridge and launcher build identity; ISO-8601 test date; the complete ordered manifest with file SHA-256 values plus profile/codec hashes; non-empty observations; and explicit pass/fail. Failures should identify affected files or checks. Photos/video and cryptographic or handwritten signatures are optional unless a later evidence policy explicitly requires them. Receipt validity is determined by exact identities and hashes, never project name or filesystem path.

### Risks
- Treating the sound extension as official v1.3.0 would falsify authority; treating its branch as a whole would accidentally admit unrelated post-v1.3 features.
- The installed target hash, exact source lineage, source evidence, and physical receipt must travel together or the composite profile is not reproducible.
- Current compilation silently fills five logical source images with transparency, so an apparently complete export is not an authored 12-file package.
- Post-codec preview can still overpromise DS blending/palette behavior unless evidence labels are attached to specific properties rather than the whole preview.
- Deterministic WAV preparation must pin resampling, downmix, gain, fade, rounding, clipping, chunk ordering, and metadata stripping or repeated output will drift.
- Navigation and launch share channel 2, while BCSTM uses channels 0/1 and is stopped at launch; a generic audio preview would teach incorrect runtime behavior.
- Portable storage currently hard-codes `.png`; adding WAV, BCSTM, and receipts without typed media records could create extension confusion, orphan leaks, or unsafe references.
- The current renderer auto-asserts generic provenance and export rights; retaining that shortcut would make publication evidence untrustworthy.
- Receipt staleness must be component-scoped: visual edits invalidate reusable visual evidence unless every identity/hash still matches; WAV preparation changes alter project output but use capability evidence; BCSTM replacement invalidates its source receipt.
- Main specs currently prohibit WAV; proposal/spec phases must amend the boundary explicitly before implementation.
- The combined change is well above 400 authored lines and needs stacked work units; mixing visual, WAV, receipt, and BCSTM concerns in one review would be unsafe.

### Ready for Proposal
Yes. All genuine product decisions identified by exploration are resolved. The proposal should carry forward one composite profile, PNG-only non-destructive visual authoring, deterministic palettes, deterministic prepared WAV authoring with desktop audition, capability-level WAV evidence, one BCSTM, exact-hash reusable visual receipts, conservative receipt fields, the approved non-ready handoff, component-scoped staleness, and fail-closed publication.
