<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-685592968cc85efff6772fc6a1899d3e"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-25-graphql-usage-measurement-spike-design.md"
artifact_commit: "b0e9c6897f09418bef886e505c369fd02a341b9f"
artifact_blob: "3dccf9eae14c5060df42956268a561b22dc3bef0"
artifact_digest: "sha256:863337a74957ab88a549e1d4cc693c7af873c13c682e5fd9695e282a87f10e04"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:289b97773b3782d3b2dfef33780a310c9f141f7ae855f5bf9039f7c43aa3c8dc"
  identity_source: "declared"
started_at: "2026-09-25T21:59:54.999Z"
submitted_at: "2026-09-25T22:03:06.240Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

This is a strong specification. Its central virtue is that every quantity it
reports carries an explicit account of what it does not know: opaque invocations
are never counted as HTTP requests, a returned response cost is never promoted to
an invocation total, mutations record `mutation-cost-unavailable` rather than a
fabricated zero, and the total-point ranking gate is set at complete coverage with
a predeclared volume fallback that must say outright that point ranking was not
achieved. The prior round's session-context, file-overhead, and ranking-gate
resolutions are all present in the artifact at this commit and are coherent with
each other.

I verified the code claims the specification rests on rather than taking them from
the author response:

- `scripts/task-tracker/lib/action-capture.mjs:65` classifies GraphQL by
  `/^\s*mutation\b/i` and falls through to `read()` for everything else, so the
  specification's claim that the current regex would confidently misclassify a
  leading comment or unsupported syntax as a query is accurate.
- `prepareActionCaptureEnv` (`action-capture.mjs:198-204`) returns the environment
  unmodified unless a repository, an active issue, **and** the per-issue enablement
  marker are all present, so the shim is not installed on PATH at all without an
  active issue. The specification's requirements that usage work with no active
  issue and that collection never depend on an active-issue marker are therefore
  genuine changes to existing behavior, correctly presented as implementation work.
- `action-capture.mjs:216-225` carries `AITM_CAPTURE_INVOCATION_ID` and no session
  field, confirming the author's turn-2 verification claim.
- `actionCaptureRoot` (`action-capture.mjs:115-118`) does resolve to the main
  worktree's `.tmp/aitm/action-capture`, supporting the specification's honest
  concession that `.tmp` can aggregate worktrees and that the common-directory
  root is a user-directed choice rather than a technical necessity.
- `scripts/gh/init-project-config.sh` contains exactly 25 `gh api graphql` sites.
- The shim (`scripts/task-tracker/action-capture-bin/gh`) is one process per
  invocation, completes capture in the `close` handler before resolving, and
  preserves exit code and signal, so the specification's synchronous-caller
  argument — that `execFileSync` in `scripts/gh/verify-priority-p3.mjs` is covered
  because the parent blocks until the shim has flushed — holds on the current code.
- This working directory is a linked worktree
  (`.git` → `…/ai-task-manager/.git/worktrees/ai-task-manager13`), so sibling
  linked worktrees do share one Git common directory, which is the premise AC3
  depends on. Finding 1 below concerns the case where that premise does not hold.

Two required changes remain. Finding 1 is a real gap in the coverage-honesty story
that I do not believe a prior round addressed; Finding 2 is an internal
inconsistency between two acceptance criteria. Both are small edits.

Evidence method: read-only inspection at artifact commit
`b0e9c6897f09418bef886e505c369fd02a341b9f`. No Git command, no mutating command,
no GitHub call, and no edit to the artifact, index, refs, or any file other than
this pending reviewer response.

## Findings

1. **R1-F001 — Observations and reports carry no common-root identity, so a
   participant enrolled against a *different* Git common directory is
   indistinguishable from one that crashed or never ran.**

   The specification resolves the storage root per participant, from that
   participant's own Git context: "Resolve Git from the consuming project/worktree
   context… Resolve the absolute path with `git rev-parse --path-format=absolute
   --git-common-dir`." That is correct for linked worktrees of one repository,
   which share a common directory. It is not correct across separate clones or
   checkouts of AITM, which resolve to *different* common directories. Separate
   checkouts are the realistic case here, not a hypothetical: the fleet described
   in the Problem section shares one user token, and the token is what is scarce —
   nothing about the budget respects clone boundaries.

   In that case every guardrail in the specification reports success. The
   reachability probe runs in the second checkout's own subtree and passes.
   Enrollment succeeds and is cached with a "normalized common-root identity,"
   but that identity is held only in the process tree's environment and is never
   written to an observation. The operator records enrollment success in the
   participant manifest. Writes succeed. The records land in a root the report
   never opens.

   The report does not go silently wrong — the manifest join catches it, since the
   row's IDs match no observations and "unknown or unmatched IDs are unaccounted
   participants and cannot satisfy session coverage," which forces the lower-bound
   label. That is the correct *outcome*. The defect is that the specification
   cannot name the *cause*. Everywhere else it is careful to separate causes that
   look alike — `shared-root-out-of-sandbox-scope` from `shared-root-access-denied`
   from disabled collection from disk failure; an unclosed writer from a proven
   crash; incomplete cost coverage from a null point cost. Here, a participant that
   enrolled cleanly and wrote its data to another root presents exactly as one that
   died before its first call, and the operator has no field to tell them apart.
   AC3's "two worktrees emit into the same Git common directory" and the baseline's
   "two enrolled, permitted worktrees" can also both be read as satisfied by
   manifest enrollment alone, while the data can never show both participants.

   Required: add a non-secret normalized common-root identifier to the raw event
   schema alongside `worktreeId` and `enrollmentId`, record the same identifier on
   participant manifest rows, and require the report to state the single common
   root it aggregated and to classify manifest participants whose recorded root
   differs from it as out-of-root participants — a named coverage class distinct
   from missing or unknown coverage. The minimum-concurrency sample should require
   the two enrolled worktrees to share the report's root.

2. **R1-F002 — AC6 asserts point reductions unconditionally and contradicts AC5's
   gate.**

   AC5 was updated to condition total-point rankings on the complete-coverage gate
   and to name the insufficiency and volume fallback. AC6 still closes with "Its
   comparison procedure supports measured call and point reductions with matched
   coverage and workload," with no dependence on that gate. The body of the
   specification agrees with AC5 — "Rank known-point contributions as lower
   bounds," and a volume-based outcome "must explicitly say that point ranking was
   not achieved. This is a valid spike finding, not evidence of point savings."
   AC6 is the one place left where a reader closing the story could hold the work
   to a point-reduction claim the rest of the document forbids. Because acceptance
   criteria are the close-time contract, the disagreement matters more than its
   size.

   Required: mirror AC5's condition in AC6 — the comparison procedure supports
   measured point reductions only when the complete-coverage gate holds for the
   compared group, and call/volume reductions with stated coverage limits
   otherwise.

## Required changes

1. Add a normalized, non-secret common-root identifier to the raw event schema and
   to participant manifest rows; require the report to declare the common root it
   aggregated and to classify out-of-root participants as their own coverage class;
   require the minimum-concurrency sample's two worktrees to share the report's
   root. (R1-F001)
2. Condition AC6's point-reduction claim on the same complete-coverage gate AC5
   uses, with call/volume reductions as the stated fallback. (R1-F002)

## Optional suggestions

1. **State the mutation consequence of the point gate in one sentence.** GitHub
   exposes `rateLimit` on `Query` and not on `Mutation`, which the specification's
   own external reference confirms. Combined with the `mutation-cost-unavailable`
   rule, this means a mutation observation can never reach `costCoverage:
   complete-observation`, and therefore any predeclared candidate group containing
   a mutation can never pass the total-point gate — not merely as a matter of
   measurement quality, but by construction. Every premise is already in the
   document, including "a high mutation share may therefore limit point-based
   prioritization," but the reader has to assemble them. Saying it directly in
   Decision sufficiency and fallback would stop an implementer from budgeting a
   smoke run to evaluate a point-ranked mutation group whose answer is already
   known.

2. **Name the minimum Git version, or degrade more gracefully.**
   `git rev-parse --path-format=absolute` requires Git 2.31 or newer. On an older
   Git the command fails, which the specification correctly treats as no Git
   context and therefore unavailable collection with a diagnostic — it fails safe,
   not silently. But the failure would take out collection for an entire
   participant for a reason that has nothing to do with sandboxing, permissions, or
   disk, and the diagnostic classes currently offered would not suggest the real
   cause. Either state the minimum Git version as a precondition checked at
   enrollment, or fall back to plain `git rev-parse --git-common-dir` resolved
   against the worktree's directory when `--path-format` is unsupported.

3. **Disambiguate one sentence about builder/shim record ownership.** "A builder
   can pass a private observation context to the shim so it owns the single usage
   record and extracts any already-added cost field; only the builder strips its
   private response alias before returning business data." The antecedent of "it"
   reads as the shim, which is consistent with "Ownership belongs to the lowest
   observable boundary," but the sentence is the one place where the
   no-double-counting rule is stated through a pronoun. Naming the shim explicitly
   would remove the ambiguity from the rule that AC2's "without double counting"
   depends on.

## Decision

revisions-requested
