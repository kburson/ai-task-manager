<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-b57970a7c94c1361badac64a34cc751b"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-11-05-2157-timing-reengagement-repair-design.md"
artifact_commit: "18b2c4d36968f06175534b0bf3b2697a11bf24ba"
artifact_blob: "87f7fc0b9537bcb83b1302b1167612dfb6f79c2a"
artifact_digest: "sha256:58ed42a650e2a23757277484fd346220f8c9019205f50ddd3f10d080d4d0bce1"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:98faf62d9aab0f6315ac31cb8bd2cee591251bf6085de8cc965d3ae4d2afea79"
  identity_source: "runtime"
started_at: "2026-11-05T13:37:29.051Z"
submitted_at: "2026-11-05T13:39:07.908Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The spec is narrow in the right places. It reuses the unchanged `recoverRedundantSameSecondReengagement` predicate (verified at `scripts/task-tracker/lib/heal-timing-departure.mjs:272`), validates the whole candidate, requires correlated readback, retains evidence before mutation and does not promise atomicity it cannot deliver. I checked its claims against the referenced code: `locks.mjs`, `paths.mjs#timingLockPath`, `gh-timing-comment.mjs#postTimingEvent` and `readCanonicalTimingSource`, `verbs/review.mjs#resolveReviewVerificationEvidence`, `lib/runtime-storage.mjs#runtimeStoragePaths` and `.gitignore`. That check turned up three gaps that matter. The proposed lock lease interacts badly with the current acquire loop and with concurrent native appenders. The lock scope (per worktree) does not match the evidence scope (shared main root), and the spec does not say so. The evidence namespace is not gitignored. Each one can produce a hang, a dropped timing row or a dirty tree in normal use, so the spec should settle them before planning.

## Findings

1. **The lease directory is non-empty, which makes the current acquire loop spin forever.** In `scripts/task-tracker/locks.mjs:53-62`, an acquirer that sees a lock older than `LOCK_STALE_MS` calls `rmdirSync` and, on any failure, runs `continue` *before* the deadline check at line 66, with no sleep. The lease design puts `lease-mode` and owner records inside the acquisition directory, so `rmdirSync` fails with ENOTEMPTY. That has two consequences:
   - (a) Any process still running the pre-change module (another session or worktree with an older installed package or self-link) busy-spins without end once a leased repair lock passes 30s. That is exactly the long-held case the lease exists for.
   - (b) The spec deliberately leaves a "discriminator without complete owner record" directory "fail-closed for inspection". Old-code acquirers spin on it forever. New-code acquirers refuse, which permanently blocks every native timing append for that issue until a human intervenes.

   The spec says "Existing callers keep their API; lease-free old locks keep existing behavior", but it never addresses how an old-code *acquirer* behaves when it meets a *leased* directory. It also gives no operator recovery path for the fail-closed state.
2. **The spec does not say what happens to blocked native timing writers.** `postTimingEvent` (`gh-timing-comment.mjs:986-987`) waits at most `max(timeoutMs*3, 5000)` ms for the same lock. The repair holds that lock across a paginated census, Review evidence resolution, the full prospective gate, the remote update and readback. That can easily exceed the native wait. Admission requires an active timer, so the bound session may emit timing rows while the repair runs. The spec does not say whether those appends fail, retry, queue or get suppressed. If a departure or resume row is dropped, the repair leaves a missing-row corruption behind — the kind of defect this tooling exists to prevent. The proposed lease change makes this more likely, not less, because it removes the 30s escape hatch.
3. **The lock is per worktree, but the evidence store is shared across worktrees.** `paths.mjs:202,222` resolves `timingLockPath` under `tmpAitmDir(projectRoot)`, which belongs to one worktree. The spec puts retained evidence under `sharedRuntimeRoot` (main root, shared by all worktrees). As a result, the lock excludes only writers in the same physical worktree. Writers for the same issue in another registered worktree are not excluded, for example the reserved `timing-repair-2157` worktree or the eventual #2147 owner's worktree. The spec says the lock "excludes cooperating native writers at the established scope" but never names that scope. It also never states that cross-worktree exclusion depends on the exclusive-occupancy check alone, or that occupancy must be re-asserted inside the lock immediately before and after the write. (The spec does list occupancy in the re-observation set, but it does not name it as the cross-worktree barrier.)
4. **The evidence namespace is not ignored by Git.** `.gitignore` ignores `.tmp/`, `/.ai-task-manager/runtime/test-fixtures/` and `/.ai-task-manager/runtime/test-sandboxes/`, but not `.ai-task-manager/runtime/` as a whole. `sharedRuntimeRoot/evidence/timing-reengagement-repair/...` therefore shows up as untracked content in the main worktree. In a single-checkout install it shows up in the operator's own worktree. The tracked-clean check still passes, but this invites an accidental commit of retained timing bodies. In consumer projects, whether the path is ignored depends on how the installer seeds `.gitignore`. The spec should require ignore coverage for this namespace in both the repo and installer output, and it should include that in the npm-pack/scratch-exclusion assertion it already mandates.
5. **The `timingLockPath` reference is ambiguous.** Six modules export or define a `timingLockPath` (`paths.mjs`, `gh-timing-comment.mjs`, `heal-timing-departure.mjs`, `heal-timing-log.mjs`, `heal-timing-interval.mjs`, `heal-timing-starts.mjs`). Most of them sanitize the issue key before delegating to `paths.mjs`; `paths.mjs` itself does not. `withLock(timingLockPath(issue, projectDir))` should name the exact resolver. The spec should also require a test asserting that the path is byte-identical to the one `postTimingEvent` uses, so the claimed shared exclusion is proven rather than assumed.
6. **"Refuse normalization requests that would change the issue body" is undefined.** The spec does not say which component issues such a request (prospective gate validators, Agent Review registry auto-fixes, body-invariant healing), or how it is detected. A builder could read this as string-filtering gate output, which the spec forbids elsewhere. It should name the mechanism, for example by running the gate in a mode where any body mutation is a typed refusal.
7. **Minor clarity problems.** Line 25 has run-together tokens ("index55", "indices54 and56", "cursor8646", "cursor510751", "delta0", "move911ca443-..."). Line 69 mixes coordinator dispatch scheduling (#2159) into the product spec. That is process state, not a requirement, and it will go stale.

## Required changes

1. Specify how the acquire loop behaves when it meets a leased directory, for both new and already-running old code. At minimum, fix `locks.mjs` so that a failed stale reclaim falls through to the deadline check and sleep instead of a bare `continue`. State how mixed-version processes are handled: the lease must not cause unbounded spinning in any acquirer. Also define an operator recovery path for the fail-closed "discriminator without owner" state, with a typed refusal that names the directory, so one crash cannot permanently block native timing appends for the issue.
2. Define what native timing writers (`postTimingEvent` and its hook callers) do while the repair holds the lock: fail-and-retry, queue, or a pre-admission requirement that the bound session emit no timing rows during the transaction. Also add a test showing that no timing row is silently lost when an append contends with a long-running repair.
3. State explicitly that the timing lock is worktree-local. Name exclusive occupancy, re-asserted inside the lock immediately before and after the write, as the cross-worktree barrier. Add an integration case where a second registered worktree for the same issue attempts a native timing append or a repair during the transaction.
4. Require ignore coverage for `.ai-task-manager/runtime/evidence/` (or the whole runtime evidence subtree) in this repo and in installer-seeded consumer `.gitignore`. Add an assertion that a successful apply leaves `git status --porcelain` unchanged in both the operator worktree and the main worktree.
5. Name the exact `timingLockPath` resolver and require a test that its output equals `postTimingEvent`'s lock path for the same issue and project directory.
6. Replace "refuse normalization requests" with a concrete mechanism and refusal code.

## Optional suggestions

1. Confirm in the spec that the motivating consumer (#2147 after re-delivery) will hold `receipt-v1` Test authority. The command refuses `github-records-v1`, so if #2147's fresh Test runs under the directory-records authority, the delivered command cannot serve its stated purpose. A one-line statement prevents a dead-on-arrival delivery.
2. Fix the run-together tokens on line 25, and move the #2159 dispatch note on line 69 out of the spec and into the issue or plan.
3. State that each selected index must point at a `resumed` row whose two neighbors are not themselves selected. That makes the "overlapping/conflicting neighborhoods" rule concrete. The existing predicate already implies it, because neighbors are never `resumed`, but the plan should test it directly.

## Decision

revisions-requested
