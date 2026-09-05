# Continuous Agent Delivery and Retrospective Assurance Amendment

**Issue:** #1219

**Date:** 2026-09-04

**Status:** Spec-only co-review in progress

**Amends:** `2026-09-01-1219-cloud-test-stage-design.md`

## Status and Authority

This amendment governs #1219 wherever the accepted cloud Test-stage design or
portfolio plan conflicts with the lifecycle, review, merge, or assurance
boundaries defined here. The original design remains authoritative for cloud
runner topology, exact-head native Actions evidence, target-branch
serialization, integration freezes, receipt retention, and crash recovery
unless this amendment explicitly changes a boundary.

The central correction is:

> Test proves and merges the code. Review certifies the implementation record.

The original #1219 design places accepted Test evidence before Review but keeps
the PR merge behind Review and approval. That ordering couples code delivery to
collateral review, repeatedly invalidates exact-head evidence, and makes an
agent or human babysit each child through multiple otherwise mechanical gates.
This amendment moves the merge transaction into Test after hosted CI and a
fresh-agent review pass. Review becomes a post-merge, collateral-only state.

## Problem

Issue #1490 exposed a systemic failure mode rather than one unusually difficult
defect. A small delivery repair took nearly two days, visited Develop and Test
16 times each, visited Review 10 times, accumulated eight direct PRs, and
spawned a second architecture chain. Some iterations caught real defects. Much
of the remaining work came from AITM making the candidate branch participate in
authorizing itself, binding unrelated evidence to one mutable SHA, merging late
in Review, and treating partial bookkeeping failures as reasons to replay code
verification.

The current workflow has five structural problems:

1. **The candidate can become its own control plane.** A branch that changes
   delivery or evidence code may run that same changed code to certify itself.
2. **The merge happens too late.** Code can pass Test and then remain mutable
   throughout Review, so a documentation or evidence repair can invalidate code
   proof.
3. **Review mixes two concerns.** Code correctness and implementation-record
   quality are treated as one gate even though they require different evidence
   and different repair loops.
4. **Full-Auto is not operationally autonomous.** Repeated approval prompts on
   children make unattended epic delivery impossible.
5. **Independent assurance is treated as a prerequisite.** Cross-provider
   review cannot be scheduled reliably enough to sit in the critical path, but
   the durable story record makes it exceptionally valuable after delivery.

## Goals

1. Create or reuse the PR when a committed candidate enters Test.
2. Run the authoritative test suite in hosted CI rather than monopolizing the
   local workstation.
3. Refuse merge until hosted CI and a clean-context spawned-agent review both
   pass for the exact candidate SHA.
4. Route any acceptance-blocking Test finding back to Develop, regardless of
   whether its root cause was introduced by the story or was pre-existing.
5. Merge the exact accepted candidate while the story is still in Test.
6. Make Review collateral-only and prohibit code mutation or Test-suite replay
   there.
7. Make Full-Auto capable of merging, repairing the implementation record, and
   closing a child without human intervention.
8. Preserve #1512's three independent human-review controls: manual plan review
   at Plan to Develop, manual code review after green required CI and before
   merge authority, and manual task review at Review to Done. Enabling one gate
   must not enable either of the others.
9. Support optional cross-provider audits only after an issue is closed.
10. Create linked corrective defects for post-close findings without rewriting
    the original delivery record.
11. Alert humans only for critical impact, contradicted evidence, suspected
    evidence fabrication, or repeated provider-quality patterns.
12. After a successful pilot, migrate every open issue through an explicit,
    stage-aware enrollment path.

## Non-Goals

- Requiring or automatically scheduling a different AI provider before merge.
- Claiming adversarial independence between two agents from one provider.
- Replacing GitHub branch rules or required checks.
- Allowing Review to change repository-tracked files after merge.
- Treating a post-close audit as a way to retroactively decline a merged PR.
- Reopening and rewriting a closed story to hide an escaped defect.
- Running the full Test suite locally when a hosted provider is available.
- Making ordinary escaped defects generate noisy human alarms.
- Bulk-blessing legacy receipts whose original authority cannot be proven.

## Terminology

- **Candidate:** one committed story head proposed for Test, identified by its
  exact source SHA, base SHA, PR, issue, target branch, and evidence protocol.
- **Flow reviewer:** a fresh, read-only agent spawned by the authoring provider
  after hosted CI passes and before merge. It produces mandatory exact-candidate
  evidence but never human PR approval.
- **Ad hoc implementation reviewer:** the pre-amendment spawned review agent
  displaced by #1512 when manual code review is enabled. It is not the canonical
  flow reviewer introduced by this amendment.
- **Agent Review Gate:** the existing structural Review-state validator. It is
  neither the flow reviewer nor human PR approval; enrolled issues replace its
  code-oriented work with the collateral validators defined here.
- **Implementation record:** the issue-level account of intent, plan,
  acceptance criteria, delivered outcome, evidence, exceptions, estimates,
  ancestry, PR, source SHA, and merge SHA.
- **Crossover audit:** a human-initiated review by a provider of the human's
  choice against an already closed issue or epic.
- **Integrity signal:** an audit finding that indicates possible evidence
  fabrication, evidence-to-SHA mismatch, material contradiction, critical
  impact, or a repeated provider-quality pattern.
- **Collateral:** mutable GitHub issue, project, and audit content that does not
  change the merged repository tree.

## Core Invariants

1. Repository-tracked source and documentation are part of the candidate and
   freeze at merge. Only issue/project collateral may change in Review.
2. The PR is open throughout Test and is merged only after exact-head CI and
   flow review pass, plus eligible exact-head human PR approval when the
   independent `pullRequestReview` gate is enabled.
3. Every code or repository-document change creates a new candidate SHA and
   invalidates only candidate-bound CI, review, and merge authority.
4. Test may return to Develop. Review never returns to Develop in the new
   protocol.
5. A finding blocks the current story when it blocks an acceptance criterion,
   even if the defective behavior predates the story.
6. A non-blocking, pre-existing defect becomes a linked governed defect and
   does not block the current merge unless it is safety- or security-critical.
7. The flow reviewer cannot write code, alter the issue, create evidence, or
   approve a different SHA than the one it inspected.
8. The implementing agent cannot be the sole author of acceptance authority.
   Hosted CI plus the canonical flow review are minimum merge gates in every
   mode. A flow-review receipt never satisfies `pullRequestReview`.
9. A pinned trusted runtime executes outside the candidate worktree. Only that
   runtime evaluates gates, validates receipts, and performs provider mutations;
   candidate-controlled lifecycle code cannot authorize itself.
10. Merge success freezes the code proof. Review-stage collateral repair does
    not invalidate CI or flow-review evidence.
11. `analysisToDevelopment`, `pullRequestReview`, and `reviewToDone` are
    independent. Full-Auto disables all three human gates; it does not remove
    CI, flow-review, delivery, or implementation-record evidence gates.
12. A crossover audit never changes the historical terminal state. Findings are
    append-only and corrective work is issue-linked.
13. Parent epics aggregate immutable child receipts. They do not rerun or
    reinterpret each child's code verification.

## Lifecycle

### Develop

Develop owns implementation, repository-tracked documentation, targeted local
checks, and repair after a failed candidate. The local loop should be bounded:
formatting, syntax, affected tests, and explicit developer checks may run
locally, while the authoritative extended suite belongs to hosted CI.

Before entering Test, the coordinator:

1. resolves the governed issue, branch, worktree, and target branch;
2. refreshes against the target through the sanctioned branch workflow;
3. verifies a clean committed tree;
4. records the candidate source and base SHAs;
5. pushes with lease; and
6. creates or idempotently reuses one PR for that exact head and target.

The refresh occurs before the candidate freezes. A later target-branch advance
may still force another refresh, but routine collateral work cannot.

### Test

Test owns all code-quality authority and the merge transaction:

```text
committed Develop candidate
  -> push/reuse PR
  -> hosted CI for exact source SHA
  -> fresh-agent flow review for exact source SHA
  -> finding disposition
  -> eligible exact-head human PR approval when pullRequestReview=true
  -> expected-head merge
  -> live merge readback and delivery receipt
  -> Review
```

Hosted CI failure clears any awaiting-CI lease and moves the issue back to
Develop with a structured failure record. The same PR may remain open; the next
commit becomes a new candidate generation and must receive fresh evidence.

After CI passes, the authoring provider spawns a fresh reviewer with no author
conversation or chain-of-thought context. The reviewer receives only:

- the canonical issue and plan revisions;
- the exact candidate and base SHAs;
- the PR metadata and diff;
- the hosted CI conclusion and durable evidence references;
- repository guidance needed to interpret the change; and
- a versioned review protocol.

The reviewer is read-only. It returns a canonical verdict instead of editing
the implementation. The old ad hoc implementation-review agent is not spawned
for an enrolled issue. The canonical flow reviewer runs in every mode and is a
mandatory evidence gate. When manual code review is enabled, the requested
human approval is a separate, additional merge-authorization gate; neither
actor substitutes for the other.

#### Finding disposition

Disposition is based on acceptance impact first and provenance second:

| Finding                                              | Test action                                      |
| ---------------------------------------------------- | ------------------------------------------------ |
| Story-introduced acceptance failure                  | Block merge; Test to Develop                     |
| Pre-existing behavior blocks an acceptance criterion | Block merge; Test to Develop                     |
| Acceptance claim lacks adequate automated evidence   | Block merge; Test to Develop and require a test  |
| Unrelated pre-existing defect                        | Create linked defect and continue                |
| Cosmetic or optional improvement                     | Record non-blocking observation or backlog item  |
| Critical safety/security issue                       | Block merge and alert a human                    |
| Uncertain classification                             | Keep in Test and run a fresh adjudicating review |

An adjudicating review receives the same immutable input package plus the first
review's structured finding, not its free-form reasoning. After the configured
bounded retry count, unresolved ambiguity parks the issue in Test and requests
human attention. It does not silently merge or create an endless reviewer loop.

#### Merge authorization

Plan to Develop continues to use #1512's independent
`analysisToDevelopment` gate and is otherwise outside this amendment.

After required CI and flow review pass, `pullRequestReview=true` requests the
configured eligible human reviewer. No human is requested for a red or
incomplete PR. Assignment is not approval. Merge remains blocked until the
latest applicable server-authored review is `APPROVED`, belongs to the eligible
non-author, non-bot human, and names the exact current candidate head. No flow
review, Agent Review Gate result, or approval of an older head satisfies this
gate.

When `pullRequestReview=false`, passing CI and flow review authorize the
existing sanctioned expected-head provider action without human PR approval.
In both cases AITM reads the PR and target branch back, validates the resulting
commit and attribution, and records the delivery receipt before moving to
Review.

Merge conflict, stale head, changed base, or expected-head rejection retires
the candidate merge authority and returns the story to Develop for a governed
refresh. A transport timeout with an unknown result remains in Test while live
state is reconciled; it is not treated as a failed merge until readback proves
failure.

### Review

Review begins only after delivery to the immediate target branch is verified.
It validates the implementation record, not the code.

Allowed Review work:

- validate canonical issue structure, syntax, formatting, and required fields;
- reconcile acceptance criteria with the accepted Test and flow-review
  receipts;
- add missing citations, delivery links, estimates, outcomes, exceptions, and
  ancestry;
- repair GitHub issue/project projections from durable records;
- generate an epic rollup from child receipts; and
- rerun only collateral validators affected by the repair.

Forbidden Review work:

- changing repository-tracked files;
- creating a new candidate commit;
- rerunning functional or extended Test suites;
- replacing the accepted source or merge SHA;
- demoting to Develop; or
- treating a formatting repair as grounds to invalidate code proof.

If Review discovers that repository code must change, the new protocol has
been violated: the code-quality check belongs in Test. The delivered story
record remains truthful and a linked corrective defect is created. This path is
not expected during ordinary Review because Review runs no functional tests.

After all static validators pass, `reviewToDone=true` requires the existing
human implementation-record approval. When `reviewToDone=false`, AITM records
that this human gate was disabled by policy, validates the same collateral
contract, and proceeds automatically. This setting is independent of
`pullRequestReview` and `analysisToDevelopment`.

### Done

Close is an idempotent collateral transaction. It requires:

- a verified merge and delivery receipt for the immediate target;
- a passing exact-SHA CI receipt;
- a passing exact-SHA flow-review receipt;
- a complete implementation record;
- the mode-appropriate Review authorization; and
- a clean terminal transaction state.

Close does not push, merge, rebase, run functional tests, or manufacture missing
delivery evidence. Partial bookkeeping failure resumes from the first missing
collateral step and never reopens the code-quality loop.

## Hierarchical Delivery

Every issue delivers to its immediate stable target:

- a child story targets its recorded epic branch;
- a nested epic targets its parent epic branch; and
- a root epic or standalone story targets trunk.

When a nested epic's recorded branch equals its parent's recorded branch, that
tier is not a repository delivery boundary: it produces no PR or merge receipt.
Its implementation record aggregates the terminal receipts of children already
delivered to the shared branch. A child story still needs a distinct governed
head branch before it can open a PR to that shared target.

`merge-back.mjs` remains the governed child-to-parent entry surface. For an
enrolled issue it delegates to the same target-aware PR, hosted-CI, flow-review,
expected-head merge, and delivery-receipt service used by Test. Its legacy local
rebase, test, and fast-forward implementation remains available only to legacy
issues.

An enrolled target ref is append-only: it advances only by fast-forward or
merge commit and is never rebased or force-updated. A stale child refreshes its
own head against the target; it never rewrites the target beneath sibling
candidates. The enrolled merge-back path runs no local functional suite and
does not delete a child branch or worktree until live merge readback and receipt
persistence succeed.

Before enrollment, the literal immediate target ref must have active
pull-request enforcement, strict exact-head required checks, deletion
protection, and non-fast-forward protection. Recorded opaque refs such as
`cloud-test-automation` are checked literally and are never assumed to match a
conventional `feature/epic/*` pattern.

Each PR receives its own target-aware Test cycle and merge receipt. After a
child merges, its Review and close operate solely on its record. The parent
epic consumes the child's terminal receipt as an immutable input.

The parent does not rerun child suites. At a real upward repository boundary,
its own final candidate still receives hosted CI and flow review against the
combined target tree, catching integration effects before the parent merges
upward. A collapsed shared-ref tier aggregates receipts without manufacturing a
candidate, PR, or merge receipt. This creates bounded verification at each real
integration boundary without replaying every child lifecycle.

## Evidence Model

### Candidate record

```json
{
  "schema": "aitm.delivery-candidate/v1",
  "candidateId": "01...",
  "generation": 3,
  "issueNumber": 1219,
  "repository": "owner/repo",
  "sourceSha": "40-hex",
  "baseSha": "40-hex",
  "headRef": "feature/ref",
  "targetRef": "trunk",
  "prNumber": 1500,
  "createdAt": "canonical instant",
  "runtime": {
    "source": "trusted-target",
    "sha": "40-hex",
    "protocol": "continuous-delivery/v1"
  }
}
```

The logical key is `(issueNumber, generation)`. A second byte-different record
for one key is a conflict. A new source or base SHA requires a new generation.
The `runtime` entry references the existing `aitm.runtime-capability/v2`
identity and its pinned execution-root digest; it does not define a third,
parallel runtime authority concept.

### Flow-review receipt

```json
{
  "schema": "aitm.flow-review/v1",
  "reviewId": "01...",
  "candidateId": "01...",
  "issueNumber": 1219,
  "sourceSha": "40-hex",
  "provider": "provider-id",
  "model": "model-id",
  "agentId": "opaque-id",
  "protocolVersion": 1,
  "issueBodyDigest": "64-hex",
  "planDigest": "64-hex",
  "ciEvidenceIds": ["opaque-id"],
  "verdict": "pass",
  "findings": [],
  "completedAt": "canonical instant"
}
```

`verdict` is one of `pass`, `block`, `pass-with-defect`, or `uncertain`. Each
finding names affected acceptance criteria, provenance, impact, evidence, and
required action. A receipt may authorize only its exact candidate.

### Delivery receipt

The delivery receipt binds the accepted candidate to the observed mutation of
its literal target ref:

```json
{
  "schema": "aitm.delivery-receipt/v1",
  "receiptId": "01...",
  "candidateId": "01...",
  "issueNumber": 1219,
  "sourceSha": "40-hex",
  "testedBaseSha": "40-hex",
  "headRef": "feature/ref",
  "targetRef": "trunk",
  "targetHeadShaBeforeMerge": "40-hex",
  "expectedTargetHeadSha": "40-hex",
  "mergeSha": "40-hex",
  "mergeMethod": "squash",
  "prNumber": 1500,
  "ciEvidenceIds": ["opaque-id"],
  "flowReviewId": "01...",
  "humanApprovalId": null,
  "runtimeCapabilityId": "opaque-id",
  "mergedAt": "canonical instant",
  "readBackAt": "canonical instant"
}
```

The logical key is the candidate ID. The receipt is authoritative only after
live PR and target readback prove the exact source, target, resulting head,
merge method, attribution, and required evidence. Commit trailers are
non-authoritative projections: they may corroborate live evidence but can never
independently create, reconstruct, or authorize a delivery receipt.

### Implementation-record receipt

The Review receipt binds mutable collateral separately from immutable code:

```json
{
  "schema": "aitm.implementation-record/v1",
  "issueNumber": 1219,
  "sourceSha": "40-hex",
  "mergeSha": "40-hex",
  "deliveryReceiptId": "01...",
  "flowReviewId": "01...",
  "issueBodyDigest": "64-hex",
  "projectProjectionDigest": "64-hex",
  "childReceiptIds": [],
  "validatorProtocolVersion": 1,
  "verdict": "complete",
  "completedAt": "canonical instant"
}
```

Changing collateral invalidates only this receipt and affected static checks.
It does not invalidate CI, flow review, or delivery.

## Crossover Assurance

Crossover audits always target closed issues or epics and are initiated by a
human choosing one or more providers. They are outside the delivery critical
path and may run at any later time while retained evidence remains available.

An auditor loads:

- the terminal issue and its ancestry;
- the accepted plan and implementation record;
- every marked source and merge commit;
- PR and CI evidence still available;
- child receipts for an epic; and
- previous audit addenda.

The auditor writes an append-only audit report. It does not edit the historical
implementation record. Any actionable finding creates a new governed defect
linked to the audited issue, finding ID, source SHA, and merge SHA.

Ordinary escaped defects remain quiet corrective work. A human alarm is raised
only when at least one of these is true:

1. severity is critical for safety or security;
2. the finding materially contradicts a recorded acceptance or test claim;
3. evidence is fabricated, missing despite a claim, or bound to the wrong SHA;
4. a configurable repeated-quality rule fires for one authoring provider.

The alarm explains the triggering rule and evidence. It must not label an
ordinary bug as cheating or infer intent from one defect.

## Trusted Runtime Boundary

Lifecycle authorization executes from a pinned root materialized outside the
candidate worktree. The root must resolve to an immutable installed package or
to a commit on a protected ref whose literal rules satisfy the enrollment
requirements above. An unprotected target branch is never an eligible runtime
source. The runtime identity extends `aitm.runtime-capability/v2` with the pinned
root, commit or package digest, command-catalog digest, and protocol inventory.

Every gate evaluator, receipt validator, reviewer protocol, provider-mutation
adapter, migration authorizer, and close machine is spawned from that pinned
root. Candidate-controlled code may define the product under test, fixtures,
and declared verification commands, but it cannot replace the control-plane
bytes used to authorize itself.

If a story changes governance code, hosted CI tests those changes as product
code while the previously trusted runtime governs delivery. After verified
merge to an eligible protected ref, the previous runtime on the designated
`authorityHostId` may append an `aitm.runtime-activation/v1` record binding the
old and new runtime identities, protected-ref merge evidence, activation time,
and authorizing host. The proposed runtime may never author or countersign its
own activation. Only that durable activation makes the new runtime eligible for
later candidates.

## Failure Recovery

| Failure point                             | Recovery                                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Push succeeds before candidate record     | Adopt the unique exact-head PR and append the missing record                                                                                           |
| PR exists before awaiting-CI projection   | Reconstruct from PR plus candidate record                                                                                                              |
| CI red/cancelled                          | Clear parking, record disposition, return to Develop                                                                                                   |
| CI result transport ambiguous             | Poll live exact-head check state; do not infer success or failure                                                                                      |
| Flow reviewer crashes                     | Retry from the immutable review package without changing the candidate                                                                                 |
| Flow reviewer blocks                      | Persist finding, keep PR open, return to Develop                                                                                                       |
| Linked-defect creation partially succeeds | Recover the emitted issue number and finish tether/linking before merge                                                                                |
| Merge action times out                    | Read PR and target state; append receipt only after verified merge                                                                                     |
| Merge succeeds before receipt             | Reconstruct from live PR and target readback plus candidate, CI, flow-review, approval, and runtime records; commit data and trailers only corroborate |
| Review projection write fails             | Stay in Review and repair only the missing collateral projection                                                                                       |
| Close partially succeeds                  | Resume the idempotent terminal transaction at the first missing step                                                                                   |
| Crossover audit defect creation fails     | Preserve the audit finding and retry governed defect creation                                                                                          |

Every recovery path has a bounded retry count and a stable idempotency key.
Repeated identical transport ambiguity parks the issue and requests attention;
it does not generate a chain of recovery defects.

## Migration

The new protocol is piloted on a bounded, dependency-ready #1219 child path whose
own contract is not a foundation needed to run the protocol. The implementation
is first delivered under the previous trusted runtime to an eligible protected
ref, then activated by the previous runtime's durable activation record. Only
the activated runtime may run the pilot. After the pilot proves successful
hosted CI, flow review, Test-owned merge, collateral-only Review, Full-Auto
close, crash recovery, and one deliberate failure-to-Develop cycle, the
protocol becomes eligible to become the default for open issues.

Enrollment is stage-aware:

| Existing state                 | Migration behavior                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| Backlog through Plan           | Adopt the new protocol before Develop                                               |
| Develop                        | Adopt before the next Test entry                                                    |
| Test with open PR              | Create a fresh candidate generation and rerun hosted CI plus flow review            |
| Review with unmerged PR        | Perform a one-time migration reclassification to Test; this is not a Review failure |
| Review with verified merged PR | Stay in Review and build the implementation record from live delivery evidence      |
| Done                           | No lifecycle migration; eligible for optional crossover audit only                  |

Legacy evidence remains readable as historical data but cannot authorize a new
candidate unless it satisfies the new exact-record contracts. Migration never
rewrites old comments or claims that an earlier flow review occurred.
Creating a fresh candidate generation retires every prior
`acceptedHeadSha`-bound CI, flow-review, merge, and human-approval authority.

The enrollment manifest is generated and digested by the trusted runtime from
live issue, PR, target, merge, runtime, and evidence observations. Immediately
before each idempotent mutation the trusted runtime rereads live state and
refuses a hand-edited manifest, a digest mismatch, or a stale observation.

## Telemetry and Service Objectives

AITM must record enough data to distinguish product complexity from governance
waste:

- candidate generations;
- Develop-to-Test cycles;
- hosted CI attempts and wall-clock time;
- flow-review and adjudication attempts;
- blocking versus non-blocking findings;
- linked defects created during Test;
- merges, stale-head refusals, and recovery attempts;
- Review collateral repairs;
- human approvals and bypasses;
- close retries;
- crossover findings and integrity alarms; and
- wall-clock time by lifecycle state.

The routine XS/S target is one PR, one successful hosted CI candidate after the
normal development loop, one flow review, one merge, one Review record, and one
close transaction. The system reports repeated cycles as process cost rather
than collapsing them into zero avoidable waste.

## Acceptance Tests

The implementation is incomplete until automated tests prove:

1. Test entry pushes and idempotently creates or adopts one exact-head PR.
2. Hosted CI red returns the issue to Develop without merging.
3. A story-introduced flow-review defect blocks merge and returns to Develop.
4. A pre-existing acceptance blocker also returns to Develop.
5. An unrelated pre-existing defect is created through the sanctioned issue
   path, linked, and does not block a non-critical candidate.
6. A critical unrelated defect blocks merge and emits a human alarm.
7. A passing exact-head candidate merges in Test and records source and merge
   SHAs before entering Review.
8. `pullRequestReview=true` requests an eligible human only after CI and flow
   review pass, and only that human's exact-head approval satisfies the gate.
9. `pullRequestReview=false` merges without human code approval while retaining
   the same CI and flow-review evidence gates.
10. Review rejects repository mutations and never runs functional tests.
11. Review collateral repair invalidates only the implementation-record receipt.
12. `reviewToDone=false` closes a child without a human prompt after record
    validation; `reviewToDone=true` requires the existing human task approval.
13. A parent epic aggregates closed child receipts and runs one final
    CI/review/merge cycle only when it has a real upward repository boundary.
14. Crash recovery is idempotent before and after merge and during close.
15. A crossover audit runs only on a closed issue and creates a new linked
    defect for findings.
16. Ordinary crossover defects do not alarm humans.
17. critical, contradicted-evidence, fabricated-evidence, and repeated-pattern
    findings do alarm humans.
18. stage-aware migration handles every open-state row without blessing
    unverifiable legacy evidence.
19. A hostile candidate edit to lifecycle authorization code is not executed by
    the trusted runtime and cannot mint valid authority.
20. A runtime cannot author or countersign its own activation record.
21. An enrolled opaque target is literally protected and never rebased or
    force-updated; merge-back waits for readback before cleanup.
22. A delivery receipt binds exact source, tested base, target pre-head,
    expected target head, observed merge, PR, evidence, and runtime identity.
23. Migration rejects hand-edited or stale manifests and retires prior
    accepted-head approval evidence.

## Documentation Changes

Implementation updates must revise:

- `docs/guides/workflow.md` to describe Test-owned merge and collateral-only
  Review;
- create `skill/shared/rules/test.md` to define CI, flow review, finding
  disposition, and Test-owned merge;
- `skill/shared/rules/review.md` to remove functional verification and delivery
  authority;
- `skill/shared/rules/deliver.md` to route enrolled delivery through Test while
  retaining only the declared legacy behavior;
- `skill/shared/rules/full-auto.md` and its documentation contract tests to
  distinguish the displaced ad hoc reviewer, canonical flow reviewer, and
  independent human gates;
- `skill/shared/rules/close.md` to describe record-only idempotent closure;
- the #1219 portfolio plan and child contracts whose current ordering conflicts
  with this amendment.

## Rollout Gate

The pilot must publish one compact evidence bundle showing:

- candidate and trusted-runtime identities;
- hosted CI failure and successful retry;
- fresh-agent block or pass behavior;
- exact-head merge in Test;
- Review collateral repair without Test invalidation;
- Full-Auto close without a human prompt;
- crash-safe retry; and
- telemetry that reports every cycle honestly.

Before the pilot, the exported ruleset delta for every literal pilot target must
receive the explicit authenticated-maintainer approval required by #1240 and
must be applied and read back without a protection gap. This external human
dependency protects the target; it does not enable any of #1512's three
per-issue review gates.

Only after the specification reaches independent co-review consensus, the
implementation plan is rewritten from that accepted specification and receives
its own later review. Only after implementation, protected-target activation,
and the pilot bundle pass their declared gates may AITM enroll open issues.
Rollout is an explicit protocol-default change, not an undocumented config flip.
