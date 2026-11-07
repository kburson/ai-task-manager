<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-b57970a7c94c1361badac64a34cc751b"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-11-05-2157-timing-reengagement-repair-design.md"
artifact_commit: "53201615bc53f0b22882d2d9020a3236b6a0d825"
artifact_blob: "040a50f92e0794109254107f0c99225f8a2bc46c"
artifact_digest: "sha256:0db5109d2602991cef86035ddae5827d501487a910e3aa9acc5cbd62f31f6628"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:98faf62d9aab0f6315ac31cb8bd2cee591251bf6085de8cc965d3ae4d2afea79"
  identity_source: "runtime"
started_at: "2026-11-05T13:37:29.051Z"
submitted_at: "2026-11-05T13:45:11.623Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I re-reviewed the revised spec (artifact commit `53201615`) against author-response-1. I also checked the author's new source claims against production code:
- `locks.mjs`
- `lib/timing-post-outcome.mjs::postTimingSafely`
- `lib/agent-review/review-gate.mjs` and `registry.mjs` (`normalizedBody` is set only when a normalizer changed the body)
- `scripts/package/install-content.mjs::INSTALL_GITIGNORE_ENTRIES` and `install-observer.mjs`

All seven turn-1 findings are resolved.

- **Lock design:** dropping the lease in favour of a 20,000 ms hard budget is a better design than the one I asked for. It keeps the empty-directory protocol that already-running old-code acquirers understand. It fixes the failed-reclaim spin in new code. It also leaves no partial lease state behind. Pausing the process or replacing the lock directory now invalidates the frame instead of extending it, which is the correct fail-closed behaviour.
- **Queued writes:** the native-writer contention answer relies on real code. `postTimingSafely` enqueues the exact row and returns `ok:false,queued:true`. The spec forbids draining while the repair holds the lock and requires a contention-to-exactly-once-publication test.
- **Lock scope, ignore coverage, resolver, refusal code:** the lock is now declared worktree-local, with occupancy as the cross-worktree barrier, re-asserted before and after the write. Ignore coverage is required in both the repo and the installer, with a porcelain-unchanged test. The lock resolver is named exactly, with a byte-equality test. The normalization refusal now has a concrete, grep-able code.
- **#2147 consumer:** the spec now records the consumer's authority mode as an activation precondition.

The remaining points are non-blocking and listed as optional suggestions.

## Findings

1. **Turn-1 findings 1–7: resolved.** The fixes are in spec lines 43–49 (exclusion, budget, queue), 55 (ignore coverage), 35 (normalization refusal), 25 and 73 (clarity) and 77 (consumer authority mode). The declined lease proposal is justified: new source cannot retrofit running old modules, and the bounded critical section avoids the problem entirely.
2. **A residual late-landing write window remains, small and partly acknowledged.** The repair sends its full-body `updateIssueComment` before the 20 s deadline. A cooperating native acquirer can reclaim the lock only after 30 s. A lost native row therefore needs the server to apply the repair's write more than about 10 s after the client gave up, with a native append landing in between. The repair's readback would then see exact candidate bytes and report `applied`. Meanwhile, the non-actor `postTimingEvent` path (`gh-timing-comment.mjs:974-981`) has no readback, so the erased native row would go unnoticed. The probability is low, and line 51's statement that GitHub offers no compare-and-swap (CAS) covers it in principle. Optional suggestion 1 makes the window explicit.
3. **Adding the ignore entry has an install-observer side effect.** `install-observer.mjs:203` requires *every* `INSTALL_GITIGNORE_ENTRIES` entry to be present. Adding `/.ai-task-manager/runtime/evidence/` means every existing consumer install will report its managed gitignore block as drifted until upgrade or reinstall runs `patchGitignore`. This is an expected consequence, not a defect. The builder should state it and cover it in tests, not discover it through failing install/doctor fixtures.

## Required changes

None.

## Optional suggestions

1. In the exclusion paragraph, reserve a send deadline for the final mutation. For example, refuse to send the update unless the remaining budget is at least the provider timeout. Then state the residual case in the external-edit paragraph: a server-side application delayed beyond the stale threshold can race a reclaiming native writer. That keeps the "proves exact prewrite/readback observations" claim precise.
2. Add one sentence and one test for the install-observer consequence of the new `INSTALL_GITIGNORE_ENTRIES` entry. Existing consumers should report gitignore drift until upgrade, and upgrade should add the entry idempotently.
3. A 20 s budget that covers full census, Review evidence resolution, the full prospective gate, the write and the post-write reobservation may produce "uncertain" outcomes on slow networks even when the write succeeded. The design already routes those to `already-applied` on retry. Consider stating in operator help that a single uncertain result followed by retry is the expected recovery, so operators do not escalate it as a defect.

## Decision

accepted
