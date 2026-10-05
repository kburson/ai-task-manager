<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-e241f6ca02abf1314254c63491049e24"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-01-1859-reviewed-scope-evidence.md"
artifact_commit: "e9132c115bed26a7cf11547036c08a3320e91770"
artifact_blob: "60976e24ee22df9e50414481d106b83df3f3a77b"
artifact_digest: "sha256:01f793bafcb4abe733c971d5cd51f3d25b8a520340cbbfa279af1600141846a1"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:78e1e126efa721437702af97a20e6d900e2af0940e565273ddfdaae8f11322e9"
  identity_source: "runtime"
started_at: "2026-10-01T18:55:57.033Z"
submitted_at: "2026-10-01T18:58:42.209Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed the plan against the source at artifact commit `e9132c11`. I confirmed that every
existing file, npm script and named helper the plan cites exists. That includes
`canonicalRecordJson`, `stripMarkers`, `isAllowed` with a `WRITE_ISSUE` state matrix,
`resolveCurrentSessionWorktreeBinding`, `readWorktreeIdentity`, `readBoundState`,
`fetchAssignmentSnapshot`, `singletonOwner`, `versionedWriteBody`, `stripBodyVersion`,
`findLostMarkers`, `writeDirectoryContractOperation`, `buildSplitProposals`, the private
`renderScope`, the private `completeGuardResult` and the close-local
`evaluateCloseProjection`. The data contracts, canonical-JSON round-trip approach (which
correctly rejects duplicate keys, because `JSON.parse` keeps the last value and the
reserialization then differs), comment/pointer grammar, and CAS/retry reasoning about
`versionedWriteBody` all match the code: retries rebase and do not rerun `mutate`, and
`validateFreshBaseAsync` runs on every attempt, including the retry no-op path.

The plan is close to executable. However, the Test-exit guard integration (Task 4) and the
normalization-decision change (Task 5) contain concrete mismatches with the guard registry
and the promote verb. As written, these would let the new guard be normalized into an
untyped refusal, or be silently filtered out of `promote`'s verb surface. They would also
leave one `deriveAndRescan` consumer unmodified. These need correction before
implementation.

## Findings

1. **Guard result key is wrong (Task 4).** The plan says to "Return `typedRefusals` from the
   guard". In `scripts/task-tracker/lib/guard-registry.mjs:245-252`, the registry reads
   `result.refusals` (falling back to `[result]`) and itself *produces* `typedRefusals`.
   A guard that returns `typedRefusals` is treated as a single untyped legacy refusal.
   Because that refusal lacks `args`/`noAutomaticRemediation`, `normalizeRefusal`
   (`contract.mjs:1019-1049`) then either fails ("not fully inventoried") or, once the
   plan's legacy-inventory entry is added, collapses to `code:'unclassified-refusal', args:{}`.
   In both cases the five registered `reviewed-scope-*` codes and the `{label,reason}` args are
   lost, and so is the blocked/indeterminate distinction the plan explicitly wants to preserve.

2. **`promote` filters out blocked refusals from unmapped guard IDs (Task 4).**
   `verbs/promote.mjs:460-465` builds `mappedRefusals` as
   `guardResult.refusals.filter((r) => REFUSAL_ID_TO_STATUS[r.id])` for every non-indeterminate
   status. The table at `promote.mjs:95-103` has entries for `test-exit-dod-verified` and
   `test-exit-pre-close-completeness` but would not have one for `test-exit-reviewed-scope`.
   A *blocked* reviewed-scope result (stale/missing/comment-invalid/wrong-checkout) would
   therefore produce no verb refusal in promote, which would then delegate to the lower
   mutator. Task 4 threads ports through `promote.mjs` but never adds the status mapping,
   and its test list never drives the promote path. This defeats the plan's goal that the
   guard applies to "all transition consumers".

3. **Task 5 omits a `deriveAndRescan` consumer.** `verbs/promote.mjs:441-455` also calls
   `deriveAndRescan` and consumes `scanBody`/`persisted`. Task 5 changes
   `persistReadyNormalizations` from throwing on non-ready (`requireReady`) to returning a
   non-ready decision, but it lists only `verbs/review.mjs` and `verbs/close.mjs` as
   consumers to update. Under the new contract, promote would silently proceed to its second
   `evaluateForBody` call. That is the "rerun a second evaluator and discard the original
   cause" pattern Task 5 forbids for Review, and it would also hide the persisted=true but
   non-ready case. `scripts/tests/integration/task-tracker/lib/action-session-promote.test.mjs`
   exists and is the natural place to test this.

4. **Task 5 fixture and render source do not match real envelopes.** The example blocked
   refusal uses `code:'test-to-review-incomplete'`, `args:{labels:[...]}`, an `id` key and a
   `blockers` key. No such code is registered in `action-decision/contract.mjs`. The
   existing `test-exit-pre-close-completeness` guard returns untyped `{ok:false,reason,blockers}`,
   which the registry normalizes to `unclassified-refusal` with `args:{}`. `evaluate.mjs:486-493`
   then maps refusals to `{guardId,code,args,remediation|noAutomaticRemediation}` and drops
   `blockers`/`reason`. Because `completeGuardResult` does not validate refusal internals, a
   handwritten fixture would pass it while asserting a shape production never emits. Task 5
   also requires Review to render "its original completeness item list" from the returned
   decision, but it does not say where that list comes from: the typed decision carries no
   labels for this guard. Review currently reads raw `blockers` from the runGuards result
   (`review.mjs:1511`).

5. **`deriveAndRescan` HEAD reads are cwd-implicit.** `review-derive-rescan.mjs:29` and `:46`
   call `git rev-parse HEAD` without a `cwd`. Task 4 requires explicit
   projectDir/invokingDir threading and forbids defaulting to `process.cwd()` in library calls.
   Task 5 rewrites this module's contract but does not thread `cwd`, so a foreign-checkout
   invocation could evaluate normalization HEAD against the wrong checkout. That is the same
   drift class the reviewed-scope guard fences.

6. **File map is incomplete relative to the tasks.** The "File map and dependency order"
   modification list omits files that later tasks modify:
   `lib/action-decision/contract.mjs`, `lib/action-decision/legacy-refusals.json`,
   `verbs/promote.mjs`, `scripts/gh/move-state.mjs`, and the guard inventory location. "Add
   the guard's inventory entry" never names a file. The candidates are the
   `lib/guard-registry.mjs` header inventory table (line ~69) and
   `scripts/tests/unit/task-tracker/lib/guard-parity-mid-stages.test.mjs`, which pins the
   Test-exit guard set.

7. **Normalization return shape drops `warnings`.** `persistReadyNormalizations` currently
   returns `{decision, persisted, warnings, body}`. Task 5's interface states
   `{decision,body,persisted}`, which risks silently removing the warnings channel.

## Required changes

1. Task 4: the guard must return its typed refusals under the registry's `refusals` key,
   each with `code`, `args:{label,reason}` and
   `noAutomaticRemediation:{reason:'operator-reviewed-evidence-required'}`. Add a registry-level
   test asserting that `runGuards('test','review',…)` yields `typedRefusals` with the
   registered `reviewed-scope-*` codes (not `unclassified-refusal`) and the correct
   blocked versus indeterminate status.
2. Task 4: add `'test-exit-reviewed-scope'` to `REFUSAL_ID_TO_STATUS` in `verbs/promote.mjs`
   with a named verb status, and add a promote-path test (for example in
   `action-session-promote.test.mjs`) proving that a blocked reviewed-scope result refuses
   before any lower mutator or board move.
3. Task 5: add `verbs/promote.mjs` (and its promote integration suite) to the consumers
   updated for the non-ready normalization decision. Promote must consume the returned
   decision rather than re-evaluate and discard it, and must report persisted=true but non-ready
   truthfully.
4. Task 5: replace the handwritten blocked fixture with one produced by the real
   registry/evaluator path, or use a registered code with schema-valid args. State
   explicitly how Review obtains the original completeness label list once only the
   decision is threaded back. Either carry the raw guard `blockers` alongside the decision,
   or convert the completeness guard to a typed code with label args. Pick one and test it.
5. Task 5: thread explicit `cwd`/projectDir into `deriveAndRescan`'s `git rev-parse HEAD`
   calls (and their callers), consistent with Task 4's no-implicit-cwd rule.

## Optional suggestions

1. Reconcile the File map paragraph with every file that Tasks 1–6 touch, and name the
   guard-inventory file(s) explicitly, including `guard-parity-mid-stages.test.mjs` if it pins
   the Test exit-guard list.
2. Keep `warnings` in the normalization result interface (and `NonReadyNormalization`
   payload) so that the existing channel is not silently dropped.
3. In Task 3, note that `mutateIssueBody`'s `guardedMutate` calls `mutate` synchronously and
   skips validation for non-string returns. The reviewed-mode `mutate` must therefore be
   synchronous, with all async authority, comment and file checks confined to
   `validateFreshBaseAsync`. The plan implies this but does not state it.

## Decision

revisions-requested
