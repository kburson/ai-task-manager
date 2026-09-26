<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-92eca7ce2202bb05859f0500d8f550b3"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-26-1818-graphql-usage-measurement-spike.md"
artifact_commit: "6a3a335b5ef246c95a986145bd6e3ae6fc77347f"
artifact_blob: "25c8b6bda1e77928899502f7f773f72051a21197"
artifact_digest: "sha256:c50ae4522cbd67a33cb60d782018d9db7d4814893b29a6c6b8e35352f74343f9"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:cd918182f9a46461b0e6b12fd197f51635a0c1147cff068b271eab0573fe60ac"
  identity_source: "runtime"
started_at: "2026-09-26T17:16:28.221Z"
submitted_at: "2026-09-26T17:30:06.788Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Round 2 requests two narrow revisions. All four original requests have been
substantively addressed; two new sentences overconstrain the ratified spec's
session fallback and permitted-participant baseline.

Reviewed the full revised plan sealed at
`6a3a335b5ef246c95a986145bd6e3ae6fc77347f` and the durable author-response-1.md
in this review directory, then checked the relevant spec passages directly.
No artifact edits, Git commands, or tests were performed. This is normal commit
mode with authority assurance unavailable.

### Prior finding dispositions

- R1-F001: Resolved for the original missing workflow, minimum-duration, and
  completion requirements. The parent AC now requires both permitted worktrees,
  a 60-minute collector overlap, observed traffic, measured activity durations,
  and a real workflow. Task 5 owns predeclaration and comparison evidence.
  R2-F002 below addresses a new unconditional denial rule, not those fixes.
- R1-F002: Resolved. Task 4 selects one canonical root, excludes foreign rows,
  and gates point rankings on relevant coverage limitations independently of
  known-cost percentages. Negative fixtures cover the requested failure modes.
- R1-F003: Resolved. Storage/enrollment is Task 2 and production wiring is
  Task 3. Injected records provide an independent storage completion boundary.
  The session fallback wording introduced here is addressed in R2-F001 below.
- R1-F004: Resolved. Task 3 and final integrated verification now name the
  actual integration and slow action-capture suites plus usage integration
  suites. The final checks no longer depend on the unit-only fast lane to
  establish integration compatibility.

The estimates sum to 46 hours, matching metadata. The runtime compatibility
wording and traceability table are useful clarifications. Omission of the old
storage rationale also removes the misleading implication about shared .tmp.

## Findings

1. **R2-F001 [P2] - Restore the explicit measurement-launcher session fallback.**

   Plan Task 2 lines 234-236 says missing or invalid runtime identity must
   produce unknown attribution. That collapses two different cases from the
   spec's Relationship to existing action capture section (lines 90-101):
   absence of a trustworthy provider/AITM session ID causes the measurement
   launcher to allocate a random process-tree measurement-session ID with
   `sessionSource: measurement-launcher`; missing/invalid inherited context
   yields unknown attribution and a diagnostic. A measurement session is not
   a fabricated provider runtime identity.

   Following the plan literally makes standalone launcher runs with no agent
   identity unaccounted sessions. That undermines manifest joins, independent
   sessions within one worktree, and the launcher's intended coverage path.

   Distinguish trusted runtime identity, launcher-allocated measurement
   identity, and missing/invalid inherited context. Explicitly own and test
   all three: preserve a normalized trusted runtime ID; allocate once per
   launcher process tree when runtime identity is unavailable, with the
   correct source and manifest row; diagnose unknown context in descendants
   instead of inventing a runtime identity. Test propagation to nested children
   and different IDs for independent launcher sessions.

2. **R2-F002 [P2] - Do not make any denied participant an unconditional baseline failure.**

   Task 5 lines 382-384 says a denied participant keeps parent completion
   pending/preliminary. The spec expressly permits restricting the run to
   permitted sessions with selection-bias disclosure (Shared storage and
   concurrency, lines 265-268). Reporting and baseline also permits an
   unsandboxed-only sample with explicit limits on generalization, and defines
   denied/missing coverage as a lower-bound fleet claim. Task 4 correctly scopes
   ranking restrictions to relevant coverage gaps and comparable groups.

   The new Task 5 sentence instead blocks completion even when two permitted
   worktrees meet the full sample, an adequately covered predeclared restricted
   group supports volume prioritization, and an excluded third participant's
   denial is honestly recorded. It silently removes the spec's permitted-run
   fallback and can leave the spike permanently pending because one excluded
   session cannot reach the common root.

   Make completion depend on sufficient evidence for the declared permitted
   population and candidate group. Keep all intended participants, including
   denials, in the manifest; preserve selection-bias and lower-bound disclosures
   and forbid fleet-wide generalization. A denial affecting coverage of the
   declared comparison group must still fail that group's sufficiency gate.
   Do not permit post-run removal of poorly measured candidates to manufacture
   success. Add paired tests: a predeclared restricted permitted sample with a
   disclosed excluded denial may support scoped volume evidence, while a denial
   that leaves the declared group's coverage inadequate remains preliminary.

## Required changes

1. Resolve R2-F001 in Task 2 session/context ownership and fixtures.
2. Resolve R2-F002 in Task 5 completion wording and paired sufficiency fixtures.

The Astra author should record dispositions and make the plan edits. No spec
amendment is requested; these changes retain the existing spec's alternatives.

## Optional suggestions

Clarify that Task 5 completion-gate tests validate the report/runbook evidence
and use existing AITM gates, rather than introducing a new lifecycle policy.
The plan already lists lifecycle policy changes as out of scope.

## Decision

revisions-requested
