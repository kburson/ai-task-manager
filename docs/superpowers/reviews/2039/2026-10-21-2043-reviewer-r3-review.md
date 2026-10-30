**P2 — Validate the repository root of an inherited native issue lock — ADDRESSED.** `scripts/task-tracker/lib/story-cache/stage-body.mjs:138-139` retains the resolved runtime root; line 179 requires the active native owner’s repository to equal `root.mainRoot`. The shared revalidation runs before reading the locked generation, after that read, after the awaited body callback, immediately before persistence, and after commit (`:184-186`, `:206`, `:237-242`). An inherited same-number lock from another repository therefore refuses before the callback or durable changes.

**Regression coverage — adequate.** `scripts/tests/integration/task-tracker/lib/story-cache/stage-body.integration.test.mjs:503-539` covers body and title staging while another native operation holds the correct repository’s physical lock. Each case verifies the foreign owner, expects `native-lock-owner`, and checks that the complete persisted generation remains unchanged. Lines 540-568 positively cover a lock acquired through a legitimate linked worktree resolving to the shared main root.

**New breakage in the fix diff — None found.** The production change adds the missing repository predicate to the existing guard without changing payload construction, capability retention, no-op handling, publication status, or public callers. Its scope check matches the native predecessor at `scripts/task-tracker/lib/story-cache/writer-registry.mjs:309`.

**Out-of-scope observations — None.**

**Verification evidence checked —** Read the supplied diff package once, the task brief and report, complete R1/R2 reviews and dispositions, implementation notes, relevant native lock/root code, and retained verification output. The RED log shows both foreign-repository cases failing with “Missing expected rejection,” while the linked-worktree control passes. The GREEN log names all three cases and reports 47 passed, zero failed. The broader logs report all 989 fast test files passing, lint completing through guidance-release with zero new test-reach offenders, and successful formatting checks. These are inspected author-run outputs; I did not independently rerun those commands or verify their reported process exit codes.

**Additional tests — None run.** Source inspection and existing focused outputs answered the lock-scope question; no unanswered doubt justified another test invocation.

**Declined-to-judge behaviors, each reconsidered:**

1. **Public legacy writer activation and CLI migration:** deferred by Task 10; this fix does not activate callers.
2. **Comment adoption, ownership, intents, and mutation:** owned by #2058; unchanged by this repair.
3. **Operation-capability issuance, scope validation, and composite retention:** owned by #2059; this repair preserves the conservative refusal boundary.
4. **Timing ingestion, arithmetic, projection, and publication:** separately owned; the lock repair changes none of these.
5. **Publication transport, saga effects, reconciliation, delayed requests, and receipts:** later slices own external effects; local staging supplies no publication evidence.
6. **Confirmed retained-batch settlement:** belongs to its owning settlement path; this repair neither clears nor bypasses journals.
7. **Remote assignment drift:** acquisition and transition boundaries own cloud freshness; offline staging does not establish it.
8. **Read-only issue observation classification:** accepted native observation contract remains unchanged; this repair grants no comment ownership.
9. **Existing pure-validator semantics:** unchanged native validators remain outside this fix review; their established behavior receives no expanded approval here.
10. **Reserved payload migration:** unsupported encodings remain a separate explicit migration concern; the repair changes no encoding.
11. **Hostile injected stores:** arbitrary dependency effects exceed the cooperating native-store contract; no security guarantee against malicious JavaScript is inferred.
12. **Same-user filesystem edits and physical lock tampering:** outside cooperating APIs. The ordinary native cross-repository nesting defect was within scope and is repaired.
13. **Thrown internal-error impersonation:** unchanged failure diagnostics cannot establish staged success or publication authority.
14. **Live workflow authorization, historical audit truth, exact-head CI, and release acceptance:** not established by this read-only local review; no lifecycle or cloud verification was performed.

**Scope compliance — PASS.** Reviewed only the R2 finding, fix diff, and directly relevant supporting contracts. No source, index, HEAD, branch, session, binding, issue, or cloud mutation; no report file written; no subagents dispatched.

**Task quality — PASS for this scoped repair.** The change is minimal, follows the accepted native predecessor, and includes meaningful negative and positive native-fixture coverage.

**Fix round — All findings addressed, no new Critical/Important breakage.** No findings remain open in this round. This technical verdict does not satisfy native acceptance gates or authorize merge or release.
