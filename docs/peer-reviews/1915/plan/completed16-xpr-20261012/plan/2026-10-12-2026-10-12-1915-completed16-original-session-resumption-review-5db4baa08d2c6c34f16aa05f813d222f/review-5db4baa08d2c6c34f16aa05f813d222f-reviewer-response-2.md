<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-5db4baa08d2c6c34f16aa05f813d222f"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-12-1915-completed16-original-session-resumption.md"
artifact_commit: "c308468292053cdb0fde8d3a8190f9f1eea8e6d5"
artifact_blob: "9cfb61a8dc04fcbe59f6bb804eb49286992111e9"
artifact_digest: "sha256:8e5072487814a8cccf0a89cd50c22db351b9e07de0784e7e6367ab91dc4ef892"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:a2ce79750eb9d215757281b766d25d98c5e3b065b3f573e63f17875823203b8a"
  identity_source: "runtime"
started_at: "2026-10-12T13:34:18.201Z"
submitted_at: "2026-10-12T14:07:58.536Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I re-reviewed the revised plan at artifact commit
`c308468292053cdb0fde8d3a8190f9f1eea8e6d5`
(digest `sha256:8e5072487814a8cccf0a89cd50c22db351b9e07de0784e7e6367ab91dc4ef892`)
against the author's turn-1 response, the approved spec and current source. This was
read-only inspection only. I ran no tests, made no Git or GitHub calls and did not edit
the artifact.

All four turn-1 required findings are resolved.

**R1-F001 (tail gates): resolved.** The new section "Resume frame storage and every
existing tail gate" names a distinct storage design:

- a private `completed16ResumeFrames` WeakMap, a `completed16ResumeExecution`
  AsyncLocalStorage, and `completed16TailInputs`/`completed16TailLeaves` maps;
- an explicit ban on `nativeStagePreparations`, `nativeStageIntents`, the
  `nativeStagePreparation` store and the first-entry `*Returned` flags.

Its gate table covers every rendezvous I raised and more. I confirmed each named Core
function exists at the current source:

- `beginNativeStageTailCache` (5321), `assertNativeStageTailCacheCurrent` (5328)
- private `cacheLeaf` (5315), `currentCacheOperation` (5339)
- `readNativeStageTailCacheSource` (5364), `executeNativeStageCacheOperation` (5382)

`session-state.mjs`, `cache-unpark.mjs` (which exists at `lib/move-state/`) and
`post-commit-tail.mjs` are declared as reused unchanged. The plan adds an explicit stop:
if any of them needs a change, the plan must be revised and reviewed first. That stop
correctly prevents silent ownership growth.

**R1-F002 (policy closure): resolved.** The single `originalStageEntry.check` closure
switches modes at the private frame-registration event. The switch happens through a
policy-created, identity-compared lexical handoff, and Core neither exports a registrar
nor reads a caller hook. All three callers are named (policy 243, 250 and 327). Task 3
Step 4 names policy 327, 330 and 332 as admitted catch sites, and Step 5 qualifies each.

**R1-F003 (admission boundary): resolved.** Admission is now one synchronous
registration event, and every eligibility check is placed before it. The "Fixed refusal
classification" table puts each control group on the pre-admission or admitted side, so
expected results are decided before implementation. Direct external API refusals are
correctly kept as typed exceptions, separate from in-flight substitutions.

**R1-F004 (lock release): resolved by honest narrowing.** The plan drops the follow-up
reacquisition claim, which could not be proved. In its place:

- a fixture-only `Object.getOwnPropertyDescriptors` observer records real
  acquire/release validation calls and their order;
- clean in-call dispatch17 reacquisition serves as the read-lock release oracle;
- the plan states explicitly that the observer proves only call ordering, not private
  lock contents.

This matches what the real runtime can demonstrate. The new
`acquire/releaseMemoryExistingNativeStageTransition` wrappers use the private timing lock
directly, without `stageTimingAuthority`. That is consistent with the store
(`store.mjs:1950-1957`, `3601-3609`).

The optional turn-1 suggestions are adequately dispositioned:

- **Estimate:** the 14h figure is now marked unusable for approval, and the
  decomposition gate is preserved. Declining to invent a forecast without a work
  breakdown for steps 1–15 is reasonable.
- **Test layout:** the plan preselects 24 wrappers in two closed 12-file batches.
- **Read faults:** the read label is now in the fault matrix.
- **Final-policy injection:** a named observer is assigned to each final throw site.
- **Existing map:** `originalNativeStageEntries` is now named.

I checked the wrapper layout against the source:

- `registerNativeStageCase(mode, entrypoint, fault = null)` (fixture line 43) and the
  flat `{when, suffix}` literal match existing wrappers, such as
  `native-stage-board-effect-readback-failAfter.test.mjs`.
- `discoverOriginalCases` (profiles 15–68) discovers every importing file through the
  AST and requires literal fault properties, so the 24 wrappers are discovered
  additively.
- Existing inventory consumers filter by specific modes (for example `tail-cache*`,
  `compensation*`, `late-sources`, `sentinel-late-*`). A new `completed16-resume` mode
  does not perturb those counts.
- 253 + 24 = 277 is consistent.
- `backend.replaceAuthority` exists (`store.mjs:853-856`), so the policy 327 injection
  uses a real backend API.

I found no remaining required defect. The optional notes below are precision
improvements that the plan's own "prove the named observer fired / stop and revise"
rules would catch during execution anyway.

## Findings

None.

## Required changes

None.

## Optional suggestions

1. **Pin the policy 327 arm point after Core consumes the report.** "Arm only after the
   actual resume partial return is produced" leaves a gap. Core's consumer check
   (`assertMemoryNativeStagePartialResult` → `held.current()`, which re-reads snapshot
   and authority) runs after the store returns and before control reaches policy 327.
   A `replaceAuthority` armed at the store's clone or freeze boundary will most likely
   be refused by that Core consumer check, not by policy 327. The control would then
   fail its own "named observer fired" assertion. Arm at the first policy-side frame
   after `evaluateOriginalNativeStageRestart` returns, or state that if 327 cannot be
   reached separately from the Core consumer check, the executor must stop for a plan
   revision.
2. **Name the fixture plumbing for the new mode.** `originalRetryContext` is captured
   only when `faultMode === 'recovery-from-comment' || knownPrefixEntry` (fixture
   2504–2505), and the old ordinal loop is gated on `knownPrefixEntry` (3328). Mapping
   `completed16-resume` to `known-prefix-inputs` therefore leaves the new helper without
   `originalContext` unless that condition is extended. One sentence would remove the
   guesswork: extend the capture condition to the new mode, and keep the existing
   `knownPrefixEntry` block exclusive to the original file.
3. **Align the ledger's inventory row with the 277 total.** The "Independent original
   case inventory" row still reads "baseline253", while the layout section expects 277,
   with the original 253 as an explicit subset. Restate the row as "277 total;
   original-253 filename set retained as a subset; 24 descriptor matches" so the
   verifier is not read as a count regression.
4. **Note the batch-wave arithmetic.** Each 12-file batch at `--test-concurrency=4` runs
   three waves within the 1200s batch budget, so each wrapper effectively has about
   400s, not 600s. If the authentic 1..16 capture approaches that, splitting a cluster
   into more wrappers adds waves rather than relieving the batch. The plan already
   requires re-partitioning batches on breach. Recording the ~400s per-wrapper planning
   figure would make that trigger visible early.
5. **Make the read label's fault reachability explicit.** Task 4 Step 2's
   `failBefore`/`failAfter` on `native-stage-existing-transition-read` works only if the
   read is recorded through the store's `operation()` helper, which runs the
   checkpoints. Task 1 Step 3 says only "new read-only audit label". Requiring the
   label to be recorded through `operation()` keeps Task 1 and Task 4 consistent.

## Decision

accepted
