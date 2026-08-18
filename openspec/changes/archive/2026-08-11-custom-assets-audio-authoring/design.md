# Design: Custom Assets and Audio Authoring

## Technical Approach

Introduce strict V3 project/history contracts over immutable typed media. Main owns dialogs and bytes; the deterministic core owns migration, compilation, WAV preparation, profile/evidence validation, receipts and gates; the renderer receives bounded models and prepared audition PCM. Legacy sources are read-only and can become V3 only through explicit save-as.

## Architecture Decisions

| Option | Tradeoff | Decision and rationale |
|---|---|---|
| Mutate V2 | Smaller; changes strict semantics | V3 with explicit V1/V2/`LauncherParityProjectV1` migrators preserves old readers and source hashes. |
| Infer V2 roles | Fast; invents lineage | Multi-layer documents require user assignment and confirmation; no arbitrary mapping or flattening. |
| Browser conversion | Convenient; nondeterministic | Versioned integer/fixed-point visual/WAV recipes; WebAudio only plays prepared PCM as `Desktop audition`. |
| Shared output path | Risks readiness leakage | Separate folder-only handoff writer; ordinary export remains independently fail-closed. |

## Sequence Diagrams / Validation Order

Legend: R renderer, P frozen preload/IPC, M main, C core, S store, G registry, H handoff writer, E export writer.

```text
Import:  R→P→M[trust+exact payload]→M[file dialog]→C[type/hash/rights/recipe]→S[stage, verify, atomic media+project commit]→P→R
Receipt: R→P→M[trust+payload]→M[file dialog]→C[schema, component, manifest/profile/policy hashes]→G[exact-key atomic insert]→S[receipt ref commit]→P→R
Handoff:R→P→M[trust]→S[verified reads]→C[compile; profile/media/rights/full-manifest gates]→M[destination dialog]→H[stage, hash, NOT READY label, no ZIP, commit]→R
Export:  R→P→M[trust]→S[verified reads]→C[compile; errors/warnings/rights/component gates]→G[exact receipt lookup]→C[final report]→M[destination dialog]→E[stage, hash-verify, atomic folder+ZIP swap]→R
```

Trust/payload failures occur before dialogs. Import/receipt validation failures mutate nothing. Handoff/export preflight failures occur before destination dialogs or writes; writer failure rolls back.

## File Changes

| Files | Action | Description |
|---|---|---|
| `packages/theme-core/src/model-v3.ts`, `packages/theme-core/src/history-v3.ts`, `packages/theme-core/src/migration-v3.ts`, `packages/theme-core/src/render-plan-v3.ts`; `packages/theme-core/src/index.ts` | Create/Modify | Typed media, operations, three legacy migrators, compiled preview plan and exports. |
| `packages/dspico-contract/src/theme-sounds-v1.ts`, `packages/dspico-contract/src/receipts-v1.ts`; `packages/dspico-contract/src/profile-v1-3.ts`, `packages/dspico-contract/src/codecs-v1-3.ts`, `packages/dspico-contract/src/custom-v1-3.ts`, `packages/dspico-contract/src/bcstm-v1-3.ts`, `packages/dspico-contract/src/index.ts` | Create/Modify | WAV DSP, receipts, composite authorities, palettes/decoders, seven-source lineage, one BCSTM and gates. |
| `packages/test-fixtures/src/composite-profile-v1.ts`, `packages/test-fixtures/evidence/dspico-theme-sounds-v1-capability.json`; `packages/test-fixtures/src/capture.ts` | Create/Modify | Bind official visual capture to separately hashed installed-WAV evidence; fail closed on unavailable/drifted authority or evidence. |
| `apps/studio/src/handoff-writer.ts`, `apps/studio/src/receipt-registry.ts`; `apps/studio/src/main.ts`, `apps/studio/src/studio-ipc.ts`, `apps/studio/src/preload.ts`, `apps/studio/src/portable-project-store.ts`, `apps/studio/src/png-import.ts`, `apps/studio/src/project-file-session.ts` | Create/Modify | Narrow commands, dialogs, typed storage, save-as sessions, registry and separate writers. |
| `apps/studio/src/renderer/custom-asset-bench.tsx`, `apps/studio/src/renderer/custom-output-rail.tsx`, `apps/studio/src/renderer/audio-workbench.tsx`; `apps/studio/src/renderer/renderer.tsx`, `apps/studio/src/renderer/workspace/read-only-workspace.tsx`, `apps/studio/src/renderer/workspace/workspace-model.ts`, `apps/studio/src/renderer/studio.css` | Create/Modify | Accessible seven-slot bench, locked palettes, 12-output preview, audition and BGM metadata. |

## Interfaces / Contracts

`MediaRefV1` binds hash, length, media type and derived path. `VisualRecipeV1` binds role/crop/transform/palette policy. `WavRecipeV1` fixes trim→fade/gain→integer downmix→rational 22,050-Hz resample→saturating half-away rounding→signed-16 LE and canonical `fmt `/`data` chunks. Component gates remain independent; WAV uses capability evidence, visuals/BCSTM exact receipts.

## Testing Strategy

| Layer | Exact ownership |
|---|---|
| Core | Add `packages/theme-core/src/media-authoring-v3.test.ts`, `packages/theme-core/src/migration-v3.test.ts`, `packages/dspico-contract/src/theme-sounds-v1.test.ts`, `packages/dspico-contract/src/receipts-v1.test.ts`, `packages/dspico-contract/src/profile-v1-3.test.ts` (component identity/no fallback); extend `packages/dspico-contract/src/codecs-v1-3.test.ts`, `packages/dspico-contract/src/custom-compiler-v1.test.ts`, `packages/dspico-contract/src/bcstm-v1-3.test.ts`. |
| Evidence/process | Extend `packages/test-fixtures/src/capture.test.ts` for wrong HEAD/tag, dirty/staged/untracked, moved root, source/capability hash drift and missing evidence; extend `apps/studio/src/project-file-session.test.ts`, `apps/studio/src/portable-project-store.test.ts`, `apps/studio/src/studio-ipc.test.ts`; add `apps/studio/src/handoff-writer.test.ts`, `apps/studio/src/receipt-registry.test.ts`. |
| E2E/accessibility | Extend `e2e/lifecycle.spec.ts` for source-byte preservation, mandatory migration save-as/role confirmation, keyboard/non-color states, audition label, handoff separation, receipt reuse and blocked export. |

## Threat Matrix

| Boundary | Minimum adversarial cases | Applicability | Safe/failure behavior | Planned RED tests |
|---|---|---|---|---|
| Documentation-like paths | `requirements.txt`, `CMakeLists.txt`, executable MDX, `README.sh` | N/A: captured, never executed | None | N/A |
| Git repository selection | `git -C`, relative/absolute paths | Applicable | Canonical root and inert argv; moved/non-repo fails before reads | `capture.test.ts` selectors/hostile path |
| Commit state | staged, `commit -a`, empty index | Applicable | Only clean pinned HEAD/tag proceeds; dirty or changed HEAD fails before reads | `capture.test.ts` state matrix |
| Push state | tracking, first push, explicit refspec | N/A: no push | None | N/A |
| PR commands | `--head`, environment prefix, composed commands | N/A: no PR automation | None | N/A |

## Migration / Rollout

Open V1, V2 and `LauncherParityProjectV1` as immutable source bytes plus hash; create an in-memory V3 candidate with no save target. V1/parity map only evidenced semantics; V2 preserves compositions as legacy evidence. Any multi-layer document blocks completion until every required role is assigned and confirmed. Ordinary Save is disabled; **Save migrated copy…** always selects a new root, atomically writes there, verifies reopen, then switches the session—never overwriting the source. Auto-chain: profile/evidence; V3 migration/store; visuals; WAV; handoff/export; dependent BCSTM. Each slice carries evidence/tests and independent rollback; fallback restores the Custom export block while legacy readers remain.

## Open Questions

None.
