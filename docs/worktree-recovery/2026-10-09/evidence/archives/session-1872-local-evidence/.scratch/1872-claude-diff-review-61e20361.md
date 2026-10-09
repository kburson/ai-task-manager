[02:50:35]
# Review: PR #1875 / issue #1872, authorized rank-level epic admission

## SHAs, coverage and limits
- **Base:** `171c7d93866f67b58effa635be5ae737f54ef9eb`. **Head:** `61e20361c5ae533609f18491df5eeb44e938348f`. The merge you tested, `3d94ebe3`, was not re-derived here.
- **What I reviewed:** the full diff on stdin, read against the head worktree. I traced these source files directly: `promote.mjs` (`runPromote`, `runSerializedPromote`, the delegate spawn), `move-state/guard-execution.mjs`, `pull-next.mjs` `promoteSelectedChild`, `wave-admission.mjs` `mapSubIssueNodes`, `issue-worktree-location.mjs`, `worktree-relocation-guard.mjs`, `occupancy.mjs`, `transcript-resolver.mjs`, `issue-body-mutate.mjs`, `refinement-snapshot.mjs`, `artifact-write-policy.mjs` and `ci.yml`.
- **Limits:** this is static review only. I ran no tests, no CI and no git commands. I did not open the CI 37185582187 logs or receipts, and I accept your report of them as given. I am not claiming local Test passed; your report says it is still running.

## Critical
None.

## Important

**I1. A child's Test run holds the clone-wide parent lock, which blocks peers in a parallel wave.**
- **Where:** `scripts/task-tracker/verbs/promote.mjs:734-751`, `promote.mjs:229-236` and `promote.mjs:491-496`.
- **Trigger:** any promote of an epic child, for example Develop→Test.
- **Evidence:** `runSerializedPromote` takes `withEpicAdmissionLock` whenever the issue has a parent, whatever the transition. Develop→Test hands off to `/task test` via `spawnVerb`, and `spawnVerbTimeout('test')` is unbounded. The parent lock is held for the whole Test sandbox run, and Review→Done is the same via `close`.
- **Impact:** while sibling A runs Test, sibling B's R4P→Plan, Plan→Develop and Develop→Test fail after 5 seconds with `admission-lock-timeout`, and so does the orchestrator's `pull-next`. The design scopes the lock to record/refresh/revoke, R4P→Plan and Plan→Develop. As written, the feature's parallelism is defeated, which matters for the pending #107 rehearsal.
- **Remedy:** take the parent lock only for `ready-for-plan→plan` and `plan→develop`, which means reading the recorded state before choosing the lock. Add a test where a long-running sibling promote does not block a peer's admission.

**I2. A crashed lock holder leaves a permanent lock with no sanctioned recovery.**
- **Where:** `scripts/task-tracker/lib/epic-admission-lock.mjs:80-131`.
- **Trigger:** SIGINT, a crash or a host reboot while the lock is held. Combined with I1, that window includes whole Test runs.
- **Evidence:** a stale `holder.json` with a dead pid is still considered valid by `holder()`, so every later caller ends in timeout. Nothing in the code checks whether the holding process is alive. The guide says to "Repair ownership through the governing runtime workflow", but no verb exists that inspects or releases `<commonDir>/aitm-admission/epic-N.lock`.
- **Impact:** every admission for that epic, in all worktrees, refuses indefinitely until someone deletes files under `.git/` by hand.
- **Remedy:** add a registered inspect/release path that is verified (same host and the pid is provably dead), or document an explicit governed repair. Test a dead-holder lock.

**I3. Legacy sequential epics now depend on rank-wave runtime reads that can throw.**
- **Where:** `scripts/task-tracker/lib/epic-rank-wave-store.mjs:171-188`, `scripts/task-tracker/lib/epic-rank-wave-runtime.mjs:54-70` and `:137-157`, `scripts/task-tracker/lib/epic-children-gate.mjs:285-299`, and `pull-next.mjs` (the staged loop calls `observeRankWaveAdmission` outside any try).
- **Trigger:** any R4P→Plan or Plan→Develop of a child of a non-opted-in epic, and every `pull-next`. Plan→Develop is newly guarded because `states/plan.mjs` now registers the guard.
- **Evidence:** `inspectRankWavePublication` calls `readSnapshot` before it decides the epic is legacy. `readSnapshot` derives bindings for every same-rank child that has an occupancy row, plus the parent. `bindingFor` throws or mismatches on several conditions:
  - a missing location marker;
  - a removed or detached sibling worktree (`discoverRankWavePhysical` calls `realpathSync`, and its branch check sits at `epic-rank-wave-bindings.mjs:32`);
  - occupancy storing `path.resolve` paths while bindings compare `realpath` (`occupancy.mjs:101` vs `runtime.mjs:61`);
  - an unrelated edited `epic-rank-wave` comment (`listRecords` throws).
- **Impact:** the gate returns `rank-wave-observation-unavailable` for epics that never opted in, and `pull-next` throws. Before this PR, legacy Plan→Develop did not consult this gate.
- **Remedy:** decide legacy from the comment history and the body marker alone, before any binding or occupancy derivation. Make `readSnapshot` derive bindings lazily, only for prepare and ready waves.

**I4. Any reply starting with a single-letter word can count as authorization.**
- **Where:** `scripts/task-tracker/lib/epic-rank-wave-source.mjs:251-277` (labels parsed at `:166`).
- **Trigger:** an assistant message showing labeled proposals, followed by a human reply such as "A bit premature, hold off" or "a quick question first".
- **Evidence:** `selection` is `/^([A-Z])(?:[).:]|\s|$)/i` and is accepted without `affirmative`. "hold off" does not match any contradiction regex. That path sets `authorized = true` for proposal A.
- **Impact:** a human message that does not approve is recorded as host-verified authorization. The requester chooses which message IDs to reference, so this is reachable.
- **Remedy:** require the selection to be the whole reply, or a label with only trivial affirmative text, for example `^\s*([A-Z])\s*[).:]?\s*$`. Add negative tests for "A bit…", "a quick…" and "I think…".

**I5. Later human contradictions that are not referenced are never seen.**
- **Where:** `scripts/task-tracker/lib/epic-rank-wave-source.mjs:58-104` and `:208`.
- **Trigger:** the source references message 1 ("run parallel … [140,144,145]") and omits a later human message in the same session ("actually don't").
- **Evidence:** the loader enforces chronological order but not contiguity. It never inspects unreferenced human messages after the first reference. The design says "contradictory later human statements … refuse".
- **Impact:** the agent assembling the references can cherry-pick, so a revoked instruction can be recorded as authority.
- **Remedy:** scan every human message in the session after the earliest referenced message (bounded, no inference) for contradiction or revocation intent, or require references to be contiguous among human messages. Add a test with an omitted later "do not".

**I6. Every admission re-verifies all historical sources against host-local transcript files.**
- **Where:** `scripts/task-tracker/lib/epic-rank-wave-store.mjs:146-167`, called from `:176` and `:198`, with the loader in `epic-rank-wave-runtime.mjs:77-88`.
- **Trigger:** a Codex session file is archived or pruned, or admission runs on another host or in a cloud environment.
- **Evidence:** `verifyHistorySources` re-reads `~/.codex/sessions/...` for every record, at every rank, on each admission and `show`. The comment history is immutable, and once comments exist an epic can never return to legacy.
- **Impact:** one missing transcript permanently bricks rank-level admission for the whole epic. No registered verb can supersede it; even a fresh `record` re-verifies old history. Comment edits or deletions (`listRecords` provenance checks) have the same effect.
- **Remedy:** verify the source once at record time under the lock, then rely on the immutable record digest and comment provenance. Or define a governed superseding record. At minimum, document the single-host constraint and add a recovery path.

## Minor

- **M1. "Re-run failed jobs" can never pass the aggregates.** `.github/workflows/ci.yml:233`, `:238`, `:358`. Artifacts are filtered by the current `run_attempt`, so shards that passed in attempt 1 and were not re-run are missing in attempt 2, and the aggregate fails with a missing receipt. This fails closed, not masked. Remedy: select per shard by latest attempt, or document "Re-run all jobs".
- **M2. Promotes in a detached-HEAD checkout now fail.** `epic-rank-wave-bindings.mjs:32`, via `admissionLockPath` in `epic-admission-lock.mjs:20-27`. Lock-path discovery requires a branch, so any epic-child promote or `pull-next` from a detached checkout throws. Remedy: resolve the lock path with `--git-common-dir` only.
- **M3. Not-yet-admitted peers must hold live worker claims.** `epic-rank-wave-bindings.mjs:221`. Peers in Ready for Planning that are not the target need a live `sameClaim`, but the design requires live occupancy only for the target and for Plan/Develop members. One idle or closed peer session blocks admission of others until `refresh`.
- **M4. Claude transcript lookup fails under dotted paths.** `epic-rank-wave-bindings.mjs:40`. The project key only flattens `/\:`, while Claude's directory also flattens `.` (this session's project directory shows `--worktrees`). Claude-provider bindings under `.worktrees/` fail native verification.
- **M5. Out-of-scope relaxation of legacy refinement checks.** `scripts/gh/lib/wave-admission.mjs:565-568`. Adding `allowPlanProjection: true` for open children changes `hasCurrentRefinement` for every legacy caller: size and estimate drift after refinement no longer counts as stale.
- **M6. Common operations invalidate a wave's graph.** `epic-rank-wave-refinement.mjs` (priority equality check, and labels inside the identity). A priority cascade or adding any label other than BLOCKED makes the graph stale, which needs new human authorization.
- **M7. No path to replace the parent session.** `epic-rank-wave-store.mjs` `verified()` and `epic-rank-wave-authority.mjs` refresh scope. A new parent generation fails `parent-binding-changed` everywhere and `refresh` cannot change `parent`. The design does not cover this.
- **M8. A definitely-failed comment write is a dead end.** `epic-rank-wave-runtime.mjs` `reserveOperation` with `store.mjs` `writeLocked`. The journal stays `indeterminate` forever, while the guide says not to change IDs, so the guidance contradicts the only way out.
- **M9. Spurious "unknown ownership" refusals.** `epic-admission-lock.mjs:87`. Between `mkdirSync(lock)` and the `holder.json` write, a waiter that has already waited 100ms gets `admission-lock-unknown`.
- **M10. `show` exits 4 for valid states.** `verbs/epic-wave.mjs:73-75`. A read-only `show` exits 4 for revoked, expired or publication-incomplete.
- **M11. Loosened assertions in repaired tests.**
  - `slow/.../gates.test.mjs` test 5 now refuses at the foreign-root guard, so it no longer exercises review authorization.
  - `coverage-hook-handler.test.mjs` uses `recovered-unknown|paused` alternations, and its row assertions are now `[]` under `TT_SKIP_NETWORK`.
  - `guidance-recertification.test.mjs` uses a broadened `obsoleteReplayRefusal`.
  - Orphan-recovery row coverage still exists elsewhere (`integration/.../hook-session-start.test.mjs`).
- **M12. Out-of-scope Bash-guard hardening.** `artifact-write-policy.mjs:157-162`. Artifact shell writes with mixed or escaping targets now block instead of falling through to the normal guards. It is stricter, but outside #1872's scope.

## Test gaps
- **The production runtime has no tests.** No test imports `createRankWaveRuntime`, `rankWaveRepositoryAt`, `observeRankWaveNative` or `nativeRankWaveTranscript`. Every recovery, lock and route test injects fake `verifySource` and `verifyBindings` that return `verified`/`ok`. Real `readSnapshot` (bindings, parent derivation, retained-record reconcile), `listRecords` provenance, the `createRecord` REST/GraphQL round-trip, the `.git` journal and `assertParent` are all unexercised.
- **The parity test bypasses the real paths.** In `epic-rank-wave-routes.test.mjs`, `pull-next` forces `readOnly: true` and stubs the lock with `fn({})`, and "direct Plan" stubs `verbPromote`. So `runSerializedPromote` plus the move-state in-process guard under the real AsyncLocalStorage context is not covered on that path. The integration `promote` worker covers it only with stubbed `runMoveState` and `runGuards`.
- **No test for any of these:** a legacy epic whose real `readSnapshot` fails (I3); a long sibling promote holding the lock (I1); a dead-holder lock (I2); single-letter-word replies or omitted later contradictions (I4, I5); a missing historical transcript (I6); or the CI aggregates on a partial re-run (M1).

## Declined to judge
- CI run 37185582187, the receipts and the counts (944/234/55): I could not access the artifacts, so I accept your validation.
- CodeQL zero findings and the prior 77/78/79 fixes: SARIF not available.
- Merge `3d94ebe3` parentage: no git access in this review.
- Capture provenance (`sourceCommit 8b3c184b` vs head): not replayed.
- Trustworthiness of the Codex transcript files as "host-verified" authority (agents can write them): this is the existing trust model of `createCodexSessionSourceLoader`, outside this diff.
- The `braces` advisory GHSA-vfj7-8cjw-p6xm and the dev-lock bumps (markdown-it 15, entities 8): no advisory database access.
- Consumer package install and actual #107 wave admission: pending and governed separately, as you stated.
- Shard balance quality: counted by file, not by duration; this is acceptable as documented.

## Readiness verdict
**Not ready to merge.** There are no Critical findings, and the CI sharding, aggregation and runner-exit handling look sound; I found no CI masking. The blockers are I1 and I2 (the lock design defeats parallel waves and has no recovery), I3 (a regression for epics that never opted in) and I4/I5 (false-positive human authority). I6 and the untested production runtime should be fixed or explicitly accepted by the maintainer before the #107 rehearsal.
