<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-b57970a7c94c1361badac64a34cc751b"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-11-05-2157-timing-reengagement-repair-design.md"
artifact_commit: "18b2c4d36968f06175534b0bf3b2697a11bf24ba"
artifact_blob: "87f7fc0b9537bcb83b1302b1167612dfb6f79c2a"
artifact_digest: "sha256:58ed42a650e2a23757277484fd346220f8c9019205f50ddd3f10d080d4d0bce1"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6.1-sol"
  model_display: "gpt-6.1-sol"
  session_fingerprint: "sha256:7e3f9b540757d19e93899269ef7fc595e58429b1c246c9d0daceeffde9f490be"
  identity_source: "runtime"
started_at: "2026-11-05T13:36:37.688Z"
submitted_at: "2026-11-05T13:43:53.104Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revised the specification after verifying all seven findings against production source. The largest change is a smaller exclusion strategy: a bounded existing empty-directory lock instead of a new live-owner lease format. It avoids requiring already-running old modules to interpret nonempty lease directories. All changes remain design-only; no implementation or acceptance is claimed.

## Finding dispositions

The reviewer sealed no finding IDs (`finding_ids: []`), so these dispositions follow the numbered findings in reviewer-response-1.

1. Addressed by replacing the lease proposal. `locks.mjs:53-62` really does continue before deadline/sleep on failed stale reclaim. Introducing files into that directory would make old modules spin after 30 seconds, and changing new source cannot retrofit a running old module. The revised design introduces no files or new lock format. Repair critical sections have a hard 20,000 ms observation/effect budget below the existing 30,000 ms stale threshold; each provider timeout is bounded by the remaining budget. Acquired device/inode and deadline must be asserted before each call/effect and afterward, with original-directory-only release. Expiry before effects refuses; expiry after a possible remote write is uncertain, not success. New primitive code also fixes the failed-reclaim path to honor deadline/sleep. There is no partial lease state or new lease recovery operation to leave stuck. A paused process cannot extend its observation authority across a stale deadline. External GitHub CAS limitations remain explicit.
2. Addressed using the existing queue rather than a new event-model feature. Verified `runtime.mjs:355-365` delegates to `postTimingSafely`; `lib/timing-post-outcome.mjs:3-22` enqueues the exact row on publication error and returns `ok:false,queued:true` with warning. The revised spec explicitly preserves that truthful failed/queued outcome, forbids draining under the repair lock, and requires a real contention/queue/drain test proving the original row is eventually published exactly once. Direct transport callers must see the real error; repair does not mark their failed append successful or suppress hooks.
3. Addressed. The spec now names the WORKTREE-LOCAL scope, exclusive occupancy as the cross-worktree barrier and occupancy assertions inside exclusion immediately before and after the write. It requires a real second registered worktree's native hook/public repair attempt to fail as foreign, plus concurrent ownership-drift coverage. No claim is made that this path locks every registered checkout or raw foreign API caller.
4. Addressed. Verified `.gitignore` lacks the evidence subtree and `scripts/package/install-content.mjs::INSTALL_GITIGNORE_ENTRIES` is the consumer installer contract used by `bin/cli.mjs::patchGitignore`. The spec requires `/.ai-task-manager/runtime/evidence/` ignore coverage in both, actual ignore validation before retaining evidence, unchanged whole Git porcelain in operator and main worktrees after apply, and package exclusion. Missing consumer ignore coverage refuses rather than silently editing that consumer's config.
5. Addressed. The exact resolver is the exported `scripts/task-tracker/paths.mjs::timingLockPath(String(issueNumber), projectDir)` for an already-validated positive numeric issue. Test byte equality to `postTimingEvent`'s actual resolver, including the same worktree root.
6. Addressed. `runAgentReviewGate` concretely returns optional `normalizedBody`. If supplied and different from the actual input issue body, the new wrapper refuses `timing-reengagement-repair:body-normalization-required`. It never persists that output or filters prose to pretend readiness. The production registry remains fully bootstrapped.
7. Addressed. Spaced the historical row indices/cursors/move token and removed stale #2159 dispatch scheduling from product requirements. Current scheduling remains only in the operational ledger.

Optional suggestions: the current #2147 issue was inspected read-only and has one Test-receipt claim and no `aitm-directory` claim. The spec now makes receipt-v1 retention and a fresh integrated-source receipt an explicit later activation precondition; no authority-mode migration is assumed. Explicitly require every selected resumed row's neighbors to remain unselected and test the selection conflict.

## Changes made

Changed only the active specification for this author revision. The plan remains committed at its initial version and will be aligned with accepted exclusion/queue/ignore details before the package-owned phase advance selects it. No live repair, native state movement or source test execution occurred for this revision. A fresh builder follow-up read the revised exclusion/storage paragraphs and reported nothing important left to plan.

## Declined changes and rationale

Did not retain the proposed lease and add an operator lease-cleanup tool. That would add a new lock format and maintenance surface while still being unable to retrofit already-running old-code acquirers. The smaller bounded critical section preserves the current empty-directory protocol and explicitly refuses slow operations. A writer timeout remains observable and retains its exact event through the existing queue. This tradeoff favors safe refusal over a wider concurrency project. No other requested behavior was declined.

## Verification

Read production `locks.mjs`, `paths.mjs`, `runtime.mjs`, `lib/timing-post-outcome.mjs`, `gh-timing-comment.mjs`, Review verification/gate sources, `runtime-storage.mjs`, `.gitignore`, `scripts/package/install-content.mjs` and `bin/cli.mjs::patchGitignore`. Read current #2147 issue through the GitHub connector without changes, checking the actual `aitm-directory` grammar against authority-locator.mjs. Builder check found no remaining material planning ambiguity. Documentation formatting and diff checks are run before author submission; implementation and integration proof remain future work, not claimed here.
