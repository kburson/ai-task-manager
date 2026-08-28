# Governed Delivery Convergence Design

- **Issue:** #1381
- **Parent incident:** #939
- **Date:** 2026-08-23
- **Status:** Draft for Codex/Claude co-review; not implementation-approved
- **Review branch:** `codex/1381-governed-delivery-convergence-spec`
- **Return branch:** `codex/939-full-auto-merge` at
  `ec160af0b03df8453fa0a1ad7f91b7138aeda38d`

## Decision Summary

Issue #1381 is the sole convergence and end-to-end acceptance story for the #939
delivery/close incident. It integrates the point fixes already discovered in
issues #1384 through #1403, adds the missing reused-branch acceptance harness,
restores interrupted historical receipt recovery, and supplies a truthful
terminal disposition for issue code that reached trunk without complete
issue-local delivery evidence.

The design keeps one immutable authority rule:

> The accepted issue SHA and its issue-local evidence identify a delivery.
> Mutable local HEAD and branch-wide pull-request history are observations, not
> substitutes for that authority.

The required acceptance uses the existing real incident artifacts as well as a
deterministic integration harness:

```text
issue A / accepted SHA A / PR A
  -> intent A
  -> one sanctioned expected-head provider action
  -> merged PR A
  -> receipt A

same source branch advances

issue B / accepted SHA B / PR B
  -> intent B
  -> one sanctioned expected-head provider action
  -> merged PR B
  -> receipt B

local HEAD remains at B or later
  -> close issue A from immutable authority A
  -> retry close issue A
  -> no duplicate provider, record, timing, lifecycle, close, or binding effect
```

No successor defect is created for another guard failure found during this
convergence. The failure and its resolution remain part of #1381's reviewed
analysis, implementation, and acceptance evidence.

## Relationship to the Existing Designs

This design extends, rather than replaces, the approved #939 delivery model:

```text
durable intent
  -> sanctioned expected-head provider action
  -> independent GitHub and trunk verification
  -> durable receipt
  -> governed close
```

The following point-fix designs remain valid local decisions:

- normalize GitHub PR and comment timestamps at adapter boundaries;
- select delivery and close PRs by exact accepted head;
- verify governed squash attribution against the authorized merge bytes;
- project delivery comments under the selected PR context;
- derive historical close authority from matching Test and Review evidence;
- resolve close approval against the accepted SHA, not current local HEAD.

Issue #1381 closes the architectural gaps between those fixes. In particular, the
current delivery orchestrator still selects by local HEAD before it can discover
an older pending intent, and the repository has no single test that advances a
reused branch through two PRs and then closes the earlier issue idempotently.

## Authoritative Incident Baseline

This baseline was re-read from GitHub issue bodies, delivery comments, PR live
state, and `origin/trunk` on 2026-08-23. “On trunk” means the implementation is
present in an identified squash merge or later trunk content. A source branch
SHA is not expected to be an ancestor of trunk after a squash merge.

| Issue | Lifecycle state           | Accepted SHA                                                                                | PR                                                          | Merge SHA                                            | Delivery intent                                                                           | Receipt                                                                                 | Approval authority                                                               | Current blocker or required disposition                                                                         | Code on trunk            |
| ----- | ------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------ |
| #1378 | Closed / Done             | —                                                                                           | —                                                           | —                                                    | None                                                                                      | None                                                                                    | None                                                                             | Superseded by #1380; retain as historical evidence                                                              | N/A                      |
| #1379 | Closed / Done             | —                                                                                           | —                                                           | —                                                    | None                                                                                      | None                                                                                    | None                                                                             | Superseded by #1381; retain as historical evidence                                                              | N/A                      |
| #1380 | Open / Review             | `addee5d923c4f64abc1808d2598c91c20cd1ea50`                                                  | No exact-head PR; carried by #1385                          | `7c508fb6258390c577ad1091fa4827500e4e70e4` (carrier) | None                                                                                      | None                                                                                    | Full-Auto evidence for accepted SHA; standing policy must be revalidated if used | Incorporated, not independently delivered                                                                       | Yes, via #1385           |
| #1381 | Open / Backlog            | —                                                                                           | —                                                           | —                                                    | None                                                                                      | None                                                                                    | None                                                                             | This convergence spec, reviewed plan, implementation, and acceptance                                            | No new #1381 code yet    |
| #1382 | Open / Test               | `e810084f0978de511078403406f008d1683fc10a`                                                  | No exact-head PR; carried by #1385                          | `7c508fb6258390c577ad1091fa4827500e4e70e4` (carrier) | None                                                                                      | None                                                                                    | None; never reached Review                                                       | Incorporated, not independently delivered                                                                       | Yes, via #1385           |
| #1383 | Open / Test               | `e810084f0978de511078403406f008d1683fc10a`                                                  | No exact-head PR; carried by #1385                          | `7c508fb6258390c577ad1091fa4827500e4e70e4` (carrier) | None                                                                                      | None                                                                                    | None; never reached Review                                                       | Incorporated, not independently delivered                                                                       | Yes, via #1385           |
| #1384 | Open / Ready for Planning | —; observed fix commit `10286f2c10b814e9318d48958bb8e393a3828124`                           | No issue-local PR; carried by #1385 under #1383 attribution | `7c508fb6258390c577ad1091fa4827500e4e70e4` (carrier) | None                                                                                      | None                                                                                    | None                                                                             | Incorporated, not independently delivered                                                                       | Yes, via #1385           |
| #1386 | Closed / Done             | —                                                                                           | —                                                           | —                                                    | None                                                                                      | None                                                                                    | None                                                                             | Superseded by #1387; retain as historical evidence                                                              | N/A                      |
| #1387 | Closed / Done             | —                                                                                           | —                                                           | —                                                    | None                                                                                      | None                                                                                    | None                                                                             | Superseded by #1388; retain as historical evidence                                                              | N/A                      |
| #1388 | Open / Review             | `aefc07e612b2ec8d542fdc98419d5dd6ee587e83`                                                  | No exact-head PR; carried by #1385                          | `7c508fb6258390c577ad1091fa4827500e4e70e4` (carrier) | None                                                                                      | None                                                                                    | Full-Auto evidence for accepted SHA; standing policy must be revalidated if used | Incorporated, not independently delivered                                                                       | Yes, via #1385           |
| #1389 | Open / Review             | `ac36528f7cc526f81e34da1350f62e6e7f6a7c34`                                                  | #1385                                                       | `7c508fb6258390c577ad1091fa4827500e4e70e4`           | [Present](https://github.com/kburson/ai-task-manager/issues/1389#issuecomment-5384099505) | Missing                                                                                 | Full-Auto evidence for accepted SHA; standing policy must be revalidated         | Recover exactly one receipt, then ordinary close                                                                | Yes, exact PR head #1385 |
| #1390 | Open / Review             | `8e738e8decb3baedd278b172592265800cfe2b54`                                                  | No exact-head PR; carried by #1391                          | `b441b9340e1497ab0e73fe82831308ab08f731c4` (carrier) | None                                                                                      | None                                                                                    | Full-Auto evidence for accepted SHA; standing policy must be revalidated if used | Incorporated, not independently delivered                                                                       | Yes, via #1391           |
| #1392 | Open / Review             | `5ca29105b58fa385b8bf213a17174d50d553e03e`                                                  | #1391                                                       | `b441b9340e1497ab0e73fe82831308ab08f731c4`           | [Present](https://github.com/kburson/ai-task-manager/issues/1392#issuecomment-5384523410) | Missing                                                                                 | Full-Auto evidence for accepted SHA; standing policy must be revalidated         | Recover exactly one receipt, then ordinary close                                                                | Yes, exact PR head #1391 |
| #1393 | Open / Review             | `3ca54e31440412a506e6e1e9079f8100f74d9f47`                                                  | #1394                                                       | `7b7cf0d894e2662f995baeed4cd4d4a3d15ad52d`           | [Present](https://github.com/kburson/ai-task-manager/issues/1393#issuecomment-5384840436) | [Valid](https://github.com/kburson/ai-task-manager/issues/1393#issuecomment-5384842433) | Full-Auto evidence for accepted SHA; standing policy must be revalidated         | Hold for convergence proof, then ordinary close                                                                 | Yes, exact PR head #1394 |
| #1395 | Open / Review             | `2e5d25cd2be83df2756dfc3caf8525671993780e`                                                  | #1396                                                       | `d5b6fbebc70f0af00be0855df564d66ae279d330`           | [Present](https://github.com/kburson/ai-task-manager/issues/1395#issuecomment-5385119077) | [Valid](https://github.com/kburson/ai-task-manager/issues/1395#issuecomment-5385120784) | Full-Auto evidence for accepted SHA; standing policy must be revalidated         | Hold for convergence proof, then ordinary close                                                                 | Yes, exact PR head #1396 |
| #1397 | Open / Review             | `2d2f6440db590d1051786592d7edef876f7be7ee`                                                  | #1398                                                       | `a2eb01f02a38bc0fcbab886d62653ff9ca498549`           | [Present](https://github.com/kburson/ai-task-manager/issues/1397#issuecomment-5385261175) | [Valid](https://github.com/kburson/ai-task-manager/issues/1397#issuecomment-5385262789) | Full-Auto evidence for accepted SHA; standing policy must be revalidated         | #1403 and the convergence proof, then ordinary close                                                            | Yes, exact PR head #1398 |
| #1399 | Closed / Done             | `53ae182ea24a29439c6d8127117ef7160f2d9edc`                                                  | #1400                                                       | `e1310dc2b1debf4d242b38c43a123bf456e2a465`           | [Present](https://github.com/kburson/ai-task-manager/issues/1399#issuecomment-5385469503) | [Valid](https://github.com/kburson/ai-task-manager/issues/1399#issuecomment-5385471145) | Full-Auto evidence for accepted SHA                                              | None; retain delivered terminal evidence                                                                        | Yes, exact PR head #1400 |
| #1401 | Closed / Done             | `de579d0fafa0d553c4bd1f68d2860ea96afaf5b1`                                                  | #1402                                                       | `558ea82ab8743b3e1be33c656dc3abae7c923060`           | [Present](https://github.com/kburson/ai-task-manager/issues/1401#issuecomment-5385593997) | [Valid](https://github.com/kburson/ai-task-manager/issues/1401#issuecomment-5385595415) | Full-Auto evidence for accepted SHA                                              | None; retain delivered terminal evidence                                                                        | Yes, exact PR head #1402 |
| #1403 | Open / Develop            | Test started at `ec160af0b03df8453fa0a1ad7f91b7138aeda38d`; no accepted Test/Review SHA yet | #1404 open and green at the same SHA                        | —                                                    | None                                                                                      | None                                                                                    | None                                                                             | Finish through the existing issue and PR; repair the invalid declared unit-test path, do not create a successor | No                       |

The associated PR baseline is:

| PR    | Source SHA                                 | Merge SHA                                  | State                     | On trunk |
| ----- | ------------------------------------------ | ------------------------------------------ | ------------------------- | -------- |
| #1385 | `ac36528f7cc526f81e34da1350f62e6e7f6a7c34` | `7c508fb6258390c577ad1091fa4827500e4e70e4` | Merged, checks successful | Yes      |
| #1391 | `5ca29105b58fa385b8bf213a17174d50d553e03e` | `b441b9340e1497ab0e73fe82831308ab08f731c4` | Merged, checks successful | Yes      |
| #1394 | `3ca54e31440412a506e6e1e9079f8100f74d9f47` | `7b7cf0d894e2662f995baeed4cd4d4a3d15ad52d` | Merged, checks successful | Yes      |
| #1396 | `2e5d25cd2be83df2756dfc3caf8525671993780e` | `d5b6fbebc70f0af00be0855df564d66ae279d330` | Merged, checks successful | Yes      |
| #1398 | `2d2f6440db590d1051786592d7edef876f7be7ee` | `a2eb01f02a38bc0fcbab886d62653ff9ca498549` | Merged, checks successful | Yes      |
| #1400 | `53ae182ea24a29439c6d8127117ef7160f2d9edc` | `e1310dc2b1debf4d242b38c43a123bf456e2a465` | Merged, checks successful | Yes      |
| #1402 | `de579d0fafa0d553c4bd1f68d2860ea96afaf5b1` | `558ea82ab8743b3e1be33c656dc3abae7c923060` | Merged, checks successful | Yes      |
| #1404 | `ec160af0b03df8453fa0a1ad7f91b7138aeda38d` | —                                          | Open, checks successful   | No       |

## Root-Cause Families

### 1. Mutable branch state was mistaken for immutable issue authority

Several paths assumed one branch implied one current delivery identity:

- delivery rejected multiple historical PRs before exact-head selection;
- close rejected historical PRs or projected their records under the wrong PR
  before accepted-head selection;
- close required the accepted Test/Review SHA to equal later local HEAD;
- review authorization was nulled when local HEAD advanced;
- delivery cannot currently recover a pending intent whose accepted PR is no
  longer the branch's local HEAD.

The general repair is not another special case. Every delivery or close
decision must first resolve the issue's accepted SHA, then select the unique PR
and records bound to that SHA.

### 2. GitHub adapter values crossed a strict domain boundary unnormalized

GitHub exposed valid whole-second RFC 3339 instants while the internal record
domain intentionally accepts one canonical millisecond representation. PR
`mergedAt` and issue-comment `created_at` values must be normalized at their
GitHub adapter boundaries; core record parsers and verifiers remain strict.

### 3. Squash attribution used the wrong evidence source

The generic attribution engine searches commit subjects. Governed squash
delivery authorizes exact title and message bytes, including a canonical final
`Attribution:` line. Receipt verification must inspect the reachable merge
commit and compare those authorized bytes. The generic subject search remains
correct for other commit-trace consumers.

### 4. Local fixes were not exercised as one transaction

Each point failure had focused coverage, but no deterministic harness composed
intent creation, provider delivery, receipt creation, branch reuse, historical
selection, close authorization, terminal ordering, and retry idempotence. The
incident therefore advanced one guard at a time in live use.

Spec verification exposed the same contract-drift family in the convergence
story itself: #1381 currently declares `npm run lint:docs`, but `package.json`
has no such script. The repository's existing Markdown verifier is
`npm run lint:md`. After this specification is approved, the governed #1381
verification list must be corrected to `npm run lint:md`; adding a redundant
alias would create a second name for the same authority. This finding remains
in #1381 and does not receive a successor defect.

### 5. Lifecycle and provenance drift had no truthful convergence lane

Some fixes reached trunk cumulatively under a later PR or another issue token.
Those issues cannot truthfully produce a delivery receipt, but the current
terminal options are also inaccurate:

- `Delivered` claims issue-local governed delivery;
- `Replaced` says another issue took over abandoned work;
- `Discarded` says no retained delivery;
- `Duplicate` says the issue duplicates another issue.

The missing outcome is **Incorporated**: the implementation is retained on
trunk, but the issue was not independently delivered under its own accepted
authority.

## Authority Model

The convergence design distinguishes immutable authority from live observation:

| Concern                      | Authority                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| Accepted implementation      | Matching Test and Review evidence for one 40-hex SHA                                  |
| Approval                     | Human evidence, or Full-Auto evidence for that same SHA plus current standing policy  |
| Authorized provider mutation | Live, issue-local delivery intent for that SHA and PR                                 |
| PR identity                  | Exactly one branch-associated PR whose immutable `headRefOid` equals the accepted SHA |
| Delivery result              | Live merged PR plus merge commit reachable from freshly fetched `origin/trunk`        |
| AITM delivery observation    | One valid issue-local receipt linked to the live intent and exact PR                  |
| Current workspace            | Well-formed, clean observation; authoritative only for a new current-head delivery    |
| Terminal lifecycle           | Board state, GitHub state, disposition, timing, and durable close transaction         |
| Incident reconciliation      | One explicitly approved #1381 ledger and issue-local reconciliation records           |

The core resolver returns a value shaped conceptually as:

```js
{
  issueNumber,
  acceptedSha,
  observedLocalHeadSha,
  headRelation: 'current' | 'advanced',
  pullRequest,
  lifecycleEvidence,
  approval,
  records,
}
```

`observedLocalHeadSha` must be a valid commit SHA and the governed worktree must
remain clean. It equals `acceptedSha` only for a new current-head delivery. It
must not replace `acceptedSha` during receipt recovery or close.

## Delivery Selection and Recovery

### Selection order

`/task deliver #N` changes its read order:

1. Load the issue, lineage, binding, branch, local HEAD, and all PRs associated
   with the governed branch.
2. Resolve the issue's accepted Test and Review SHA without requiring it to
   equal local HEAD.
3. Select exactly one PR whose `headRefOid` equals that accepted SHA.
4. Parse delivery comments using that selected PR number as record context.
5. Resolve approval against the accepted SHA.
6. Choose one of the explicit modes below.

Zero exact-head PRs, multiple exact-head PRs, divergent Test/Review SHAs,
wrong-SHA approval, malformed records, or conflicting live intents fail before
an external action or durable write.

### Mode 1: current-head delivery

This is the existing mutation-authorizing mode. It requires:

- accepted SHA equals local HEAD and the selected PR head;
- issue open in Review, correct singleton owner, active binding, and running
  timer;
- clean worktree, exact accepted Test/Review/approval evidence, readable green
  checks, correct base and branch, non-draft mergeable PR, allowed merge method,
  and deterministic attribution bytes.

It may create or adopt a pending intent and emit the one structured sanctioned
provider action. A retry while the PR remains open may re-emit only the exact
same action after re-running preflight. It never selects a newer or older PR by
recency.

### Mode 2: historical pending-intent receipt recovery

This mode exists only when local HEAD has advanced beyond the accepted SHA. It
requires all of the following:

- a unique exact-head PR for the accepted SHA;
- that PR is already merged;
- one valid live pending intent whose issue, repository, PR, branch, base,
  expected head, merge method, attribution tokens, and authorized commit bytes
  match the accepted authority;
- accepted Test, Review, Agent Review, and approval evidence still match the
  intent SHA;
- the merge timestamp is not earlier than the intent comment's server timestamp;
- the merge commit is reachable from freshly fetched trunk and its exact bytes,
  merge method, and attribution match the intent;
- no conflicting or divergent receipt exists.

Historical recovery emits **no provider action**. It verifies live GitHub and
trunk, then appends exactly one receipt using the existing lookup-before-create
and exact-readback rules. A lost comment-create response is reconciled by
re-reading the issue; the retry adopts the one byte-identical receipt rather
than creating another.

If the receipt already exists and matches, delivery returns an idempotent
`already-delivered` result. A duplicate byte-identical receipt or any divergent
receipt remains a fail-closed record-integrity error; idempotence means avoiding
the duplicate, not accepting duplicate authority after it exists.

### Deliberately unsupported historical actions

When local HEAD has advanced, delivery must not:

- create a new intent for an older open PR;
- emit a provider action for an older open PR;
- synthesize an external recovery intent for an already-merged historical PR
  that never had an issue-local intent;
- infer exact delivery from cumulative inclusion in a later PR.

Those cases lack a durable historical mutation authority. They are either
completed through their still-current exact head before branch advancement or
classified through the reviewed incident reconciliation lane.

The existing “already merged before intent” external recovery remains valid
only when the issue's accepted SHA is still the current local and PR head and
all ordinary merged-delivery preflight evidence passes.

## Close Resolution and Idempotence

### Historical close

For an open Review issue, close performs read-only authorization before any
terminal mutation:

1. Run the ordinary non-terminal Review exit gates so the delivery receipt
   cannot mask an unrelated lifecycle refusal.
2. Resolve the accepted SHA from matching Test and Review evidence. Local HEAD
   is validated as an observation but may be later.
3. Resolve human or Full-Auto approval against the accepted SHA. Full-Auto
   evidence remains valid only while current session/project policy supplies
   standing authorization.
4. Select exactly one merged PR by accepted head.
5. Project records under that PR and require one linked intent and one valid
   receipt for the accepted SHA and merge commit.
6. Fetch trunk and independently verify merge reachability and attribution.
7. Only then begin the existing terminal transaction: timing, estimation
   outcome, lifecycle checkboxes, Done, `Disposition=Delivered`, GitHub close,
   label cleanup, and binding release.

No close decision compares the accepted SHA to the later local HEAD, counts all
branch PRs as candidates, or parses records using a PR selected by recency.

### Idempotent retry

After an authorized close completes, the same `/task close #A` retry is a
terminal convergence read, not a new Review transition. A fully converged
GitHub-closed, board-Done, Delivered issue with a complete close transaction:

- performs no provider action;
- writes no intent, receipt, approval, timing row, estimation outcome, marker,
  disposition, board transition, issue-close mutation, label mutation, or
  binding release;
- leaves every immutable record byte unchanged;
- returns a successful already-closed result.

The retry may re-read GitHub, project, receipt, and trunk evidence. It does not
require a new approval after terminal authority was durably established. A
partially completed close uses the existing close transaction to converge only
the missing terminal step; it never replays a completed step. Conflicting or
malformed terminal records fail closed instead of being treated as a no-op.

## Incorporated Terminal Disposition

### New disposition

Add `Incorporated` as a fifth project `Disposition` option:

> Implementation retained on trunk, but not independently delivered under this
> issue's complete accepted-delivery authority.

`Incorporated` is terminal and queryable, but it is not a synonym for
`Delivered`, `Replaced`, `Discarded`, or `Duplicate`. Installation and
`init-repair` must add or reconcile the field option without changing existing
values.

### Sanctioned lane

Extend the existing disposition close surface with:

```text
/task close #N --as incorporated --of #1381
```

`--of` is required and identifies the approved convergence authority. Before
mutation, the lane must:

1. load the effective approved #1381 reconciliation ledger;
2. find exactly one `incorporated` row for #N;
3. verify the target issue, source evidence, carrier PR, carrier merge SHA, and
   freshly fetched trunk observation agree with the row;
4. verify the row records why ordinary issue-local delivery evidence is
   incomplete;
5. refuse if a valid exact-head delivery receipt exists, because that issue
   belongs in the ordinary Delivered close lane;
6. refuse missing, unapproved, malformed, duplicated, conflicting, or stale
   ledger authority.

After authorization it writes an append-only issue-local incorporated record,
flushes timing, writes `Disposition=Incorporated`, moves the item to Done,
closes the GitHub issue with completed semantics, posts the audit result, and
releases the binding. It does not tick or invent Test, Review, approval,
delivery intent, delivery receipt, or ordinary Delivered evidence.

The operation is re-entrant. The issue-local record has a deterministic key of
`repository + issue + convergenceIssue + ledgerId`. A retry adopts an exact
record and converges missing terminal effects; divergent records refuse.

### Why not reuse `supersede`

`supersede` states that the original work was abandoned and taken over. That is
accurate for #1378, #1379, #1386, and #1387, and those closed shells remain
unchanged. It is inaccurate for issues whose implementation is already present
on trunk and whose remaining defect is missing issue-local delivery provenance.

## Reconciliation Ledger

### Durable records

Issue #1381 owns two append-only record types on the convergence issue:

- `aitm.delivery-incident-ledger/v1` — the observed matrix, intended outcome,
  immutable evidence references, and baseline trunk SHA;
- `aitm.delivery-incident-ledger-approval/v1` — explicit human approval of the
  ledger ID and canonical SHA-256 digest.

The ledger has one row per incident issue and exact keys for:

```text
issueNumber
observedGitHubState
observedBoardState
acceptedSha
prNumber
prHeadSha
mergeSha
intentUrl
receiptUrl
approvalMode
approvalSha
codeOnTrunk
codeOnTrunkBasis
blocker
intendedOutcome
```

Nullable values are explicit `null`, not omitted. Rows are sorted by issue
number. The canonical record also binds repository, incident parent #939,
convergence issue #1381, baseline `origin/trunk` SHA, record ID, and schema. The
GitHub comment server timestamp is authoritative; local generation time is
diagnostic only.

Approval is over the exact canonical ledger digest. Replacing an observation
requires a new ledger record and a new explicit approval. Forked approvals,
multiple approved tips, unknown rows, or rows outside the reviewed issue set
fail closed. Co-review of this design or implementation does not silently
approve a later live ledger.

### Required outcomes

The approved ledger must encode exactly these disposition families:

| Outcome              | Issues                                   | Execution rule                                                                                |
| -------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `retain-superseded`  | #1378, #1379, #1386, #1387               | Read-only verification; preserve closed records                                               |
| `incorporated`       | #1380, #1382, #1383, #1384, #1388, #1390 | Use the sanctioned Incorporated lane; never create a delivery receipt                         |
| `recover-then-close` | #1389, #1392                             | Recover exactly one receipt from the existing intent and exact merged PR, then ordinary close |
| `close-delivered`    | #1393, #1395, #1397                      | Ordinary close using the existing exact-head receipt after convergence proof                  |
| `retain-delivered`   | #1399, #1401                             | Read-only verification; preserve Done/Delivered records                                       |
| `finish-existing`    | #1403                                    | Finish through the existing #1404; no successor defect                                        |
| `convergence-owner`  | #1381                                    | Close only after all ledger rows and acceptance evidence verify                               |

An execution summary is appended to #1381 and links each issue-local terminal
record or unchanged historical result. The verifier compares the approved
ledger, live issue and project state, exact PR/merge/trunk evidence, and outcome
records. It is read-only unless an explicitly separate governed mutation verb
is invoked.

## Real Reused-Branch Acceptance

The live acceptance reuses the incident's already-governed provider actions
instead of creating disposable successor defects:

- **Issue A:** #1397
- **Accepted SHA A:** `2d2f6440db590d1051786592d7edef876f7be7ee`
- **PR A:** #1398
- **Merge A:** `a2eb01f02a38bc0fcbab886d62653ff9ca498549`
- **Issue B:** #1401
- **Accepted SHA B:** `de579d0fafa0d553c4bd1f68d2860ea96afaf5b1`
- **PR B:** #1402
- **Merge B / observed trunk baseline:**
  `558ea82ab8743b3e1be33c656dc3abae7c923060`
- **Reused branch:** `codex/939-full-auto-merge`

Both PRs already have sanctioned provider actions, exact intents, verified
receipts, successful checks, and trunk merges. After #1403 is integrated, the
acceptance closes #1397 while the shared branch is at B or later, then retries
the same close and records the absence of every duplicate effect.

Historical receipt recovery is proven live with both #1389 / PR #1385 and
Issue #1392 / PR #1391. Each already has a pending intent and an exact merged PR but
no receipt. Recovery must append one receipt without a provider action, and the
ordinary historical close must then succeed.

Issue #1381's own implementation PR proves that the final convergence code can be
delivered normally. It does not replace PR A or PR B in the historical
acceptance trace.

### #1403 sequencing prerequisite

Issue #1403 and PR #1404 are currently the exact current-head pair at
`ec160af0b03df8453fa0a1ad7f91b7138aeda38d`. Because this design deliberately
forbids creating a new provider action for an older open PR after local branch
advancement, #1403 must finish its existing Test, Review, approval, delivery,
and close path before any #1381 implementation commit advances the return
branch. Specification and plan co-review commits remain isolated on
`codex/1381-governed-delivery-convergence-spec`; they do not advance the
return branch or PR #1404. Generating and co-reviewing these artifacts does not
authorize #1403 delivery or implementation hydration onto the return branch.

## Deterministic Integration Harness

The integration harness uses injected GitHub, project, git, timer, binding, and
provider boundaries while retaining the production record parsers and decision
functions. It models two issues and one reused branch:

1. issue A reaches Review at SHA A with green checks and approval;
2. current-head delivery creates intent A and emits action A once;
3. the provider snapshot changes PR A to merged; retry verifies trunk and writes
   receipt A once;
4. the branch and local HEAD advance to SHA B;
5. issue B reaches Review and delivers PR B through the same sequence;
6. issue A closes from local HEAD B using accepted authority A;
7. the exact close command is retried;
8. every mutating spy proves zero additional calls on retry.

A second scenario interrupts after intent A and provider merge but before
receipt creation, advances the branch to B, and then retries delivery A. It
asserts one recovered receipt and zero provider calls.

Adversarial variants cover:

- no exact-head PR and duplicate exact-head PRs;
- an older and newer PR in both array orders;
- missing, malformed, forked, or divergent intent projection;
- missing, duplicate, or conflicting receipt projection;
- wrong Test, Review, or approval SHA;
- disabled Full-Auto standing policy;
- wrong branch, base, PR, merge SHA, merge method, or attribution bytes;
- unreadable or non-reachable trunk state;
- malformed GitHub timestamps before and after adapter normalization;
- partially completed terminal transactions;
- missing, stale, conflicting, or unapproved reconciliation ledgers;
- attempts to use Incorporated when a valid delivery receipt exists.

The harness asserts ordering, not only final state. No timing, estimation,
checkbox, Done, disposition, GitHub close, label, or binding mutation may occur
before all ordinary and delivery gates pass.

## Failure and Recovery Matrix

| Condition                                                       | Result                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Current accepted head, open exact PR, green preflight           | Create/adopt intent and emit exact provider action                                          |
| Current accepted head, exact PR merged, no intent               | Existing external-recovery verification may create a classified recovery intent and receipt |
| Historical accepted head, merged exact PR, valid pending intent | Verify and append/adopt exactly one receipt; no provider action                             |
| Historical accepted head, open exact PR                         | Refuse; no new historical intent or provider action                                         |
| Historical accepted head, merged exact PR, no intent            | Refuse; use reviewed Incorporated disposition if ledger-authorized                          |
| Zero or multiple exact-head PRs                                 | Refuse and report ambiguity                                                                 |
| Wrong-SHA or non-standing approval                              | Refuse before delivery or terminal mutation                                                 |
| Lost intent/receipt create response                             | Re-read and adopt one byte-identical server record                                          |
| Duplicate or divergent receipt already present                  | Refuse record integrity                                                                     |
| Merge not reachable from fresh trunk                            | Refuse receipt and close                                                                    |
| Fully converged closed issue retried                            | Read-only successful no-op                                                                  |
| Partial close with valid transaction                            | Converge only missing terminal effects                                                      |
| Incorporated row lacks approved ledger                          | Refuse all terminal mutation                                                                |
| Valid receipt exists for an Incorporated target                 | Refuse Incorporated; require ordinary close                                                 |

## Record and Adapter Boundaries

The strict delivery intent and receipt schemas remain version 1. Historical
recovery does not edit old records or add a permissive schema. It changes the
orchestration authority passed into existing strict parsing and verification.

GitHub adapters continue to normalize provider timestamps to canonical
millisecond instants before domain parsing. Invalid non-null timestamps fail
with adapter-specific errors. Core canonical-instant validation remains strict.

The new incident ledger and incorporated records use the repository's canonical
JSON envelope and append-only GitHub comment store. Their parsers require exact
keys, bounded strings and arrays, safe issue numbers, full lower-case SHAs,
canonical HTTPS URLs where present, canonical record IDs, and deterministic
projection. Provider output and local caches are never lifecycle authority.

## Security and Governance Properties

1. No path invokes or disguises `gh pr merge`.
2. New provider actions still require current-head equality and expected-head
   protection.
3. Historical recovery can observe and receipt a completed authorized action
   but cannot authorize another action.
4. Missing issue-local evidence never becomes cumulative-delivery evidence.
5. Close still requires exact lifecycle, approval, PR, intent, receipt, merge,
   and trunk agreement before Delivered.
6. Incorporated is explicit, ledger-approved, non-delivery evidence and cannot
   satisfy a delivery receipt gate.
7. Retries reconcile durable provider and issue state instead of trusting a
   transport response or local cache.
8. Terminal mutations remain ordered after all authorization gates.
9. Local worktree or branch cleanup remains outside `deliver` and `close`.
10. Further incident guard failures remain in #1381 rather than multiplying
    partially integrated defect stories.

## Documentation Contract

Update workflow and architecture documentation to define:

- Review → deliver → receipt → close;
- current-head delivery versus historical receipt recovery;
- accepted SHA as immutable issue authority;
- exact-head PR selection on a reused branch;
- approval provenance and Full-Auto standing-policy revalidation;
- adapter normalization versus strict domain parsing;
- ordinary Delivered, Incorporated, Replaced, Discarded, and Duplicate outcomes;
- approved incident-ledger authority and idempotent reconciliation;
- terminal retry and partial-close recovery;
- explicit refusal to treat cumulative inclusion as exact delivery.

Command help must describe the historical recovery result and the Incorporated
close lane without implying that either can manufacture missing delivery
evidence.

## Verification Contract

Focused verification must include the commands declared on #1381:

```text
node --test scripts/tests/integration/task-tracker/verbs/deliver-close.integration.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/deliver-pr-selection.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/close-delivery-gate-input.test.mjs scripts/tests/unit/task-tracker/verbs/close-delivery-receipt.test.mjs scripts/tests/unit/task-tracker/verbs/close-convergence-wiring-finalize.test.mjs
node --test scripts/tests/unit/task-tracker/lib/delivery-real-pr-evidence.test.mjs
node scripts/task-tracker/verify-delivery-incident-reconciliation.mjs --issue 1381
npm run lint:md
npm test
npm run test:slow
npm run lint
npm run format:check
git log --oneline -1
```

The issue currently names the nonexistent `npm run lint:docs`; the first
post-approval governed issue update must replace it with the existing
`npm run lint:md` command shown above. The plan generated after spec approval
must add focused tests for the new ledger and Incorporated contracts and
reconcile any final filenames with the actual implementation surface. A missing
declared verifier is a Test failure, not an acceptable documentation
discrepancy.

Live acceptance records, at minimum:

- repository and reused branch;
- issues A and B;
- PR A and PR B;
- accepted source and merge SHAs;
- CI URLs and conclusions for each exact source SHA;
- provider action identity and expected head;
- intent and receipt URLs;
- approval provenance;
- branch disposition;
- first close result and resulting terminal state;
- retry result and before/after side-effect counts;
- every incident-ledger outcome and issue-local terminal record.

## Compatibility and Migration

- Existing version 1 intent and receipt comments are preserved byte-for-byte.
- Existing Delivered, Replaced, Discarded, and Duplicate values retain their
  meaning.
- Project initialization and repair add `Incorporated` idempotently and refuse
  the lane until the option is readable.
- Existing closed superseded and delivered issues are not rewritten.
- No source branch, historical PR, merge commit, issue body evidence, intent, or
  receipt is rewritten for reconciliation.
- Existing top-level current-head delivery and child-to-epic delivery remain
  unchanged outside the shared authority resolver.

## Rejected Approaches

### Treat the newest PR as authoritative

Rejected. Recency is mutable and cannot identify which code an issue accepted.

### Treat any later cumulative PR as the issue's delivery

Rejected. Inclusion can prove code presence, but it cannot manufacture the
issue's Test, Review, approval, intent, provider action, or receipt chain.

### Relax close to accept code-on-trunk without a receipt

Rejected. This would collapse Incorporated into Delivered and weaken the core
issue #939 audit boundary.

### Create recovery receipts for every stranded issue

Rejected. #1380, #1382, #1383, #1384, #1388, and #1390 do not have complete
issue-local exact-head delivery authority. A receipt would be invented evidence.

### Supersede every stranded issue with #1381

Rejected. Their implementation was retained on trunk; calling it abandoned or
replaced is materially inaccurate.

### Create more point defects during acceptance

Rejected. The incident demonstrated that isolated point stories can move the
failure to the next untested guard. #1381 owns convergence until the complete
scenario passes.

### Advance the branch before #1403 finishes

Rejected. It would turn the existing open exact-head PR into a historical
provider action without a durable prior intent, a mode this design intentionally
does not authorize.

## Acceptance Mapping

| #1381 acceptance criterion                         | Design coverage                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| Two PRs on one reused branch; close A from B       | Authority model, historical close, integration harness, real acceptance |
| Idempotent second close                            | Close resolution and idempotence                                        |
| Pending-intent historical receipt recovery         | Delivery selection and recovery                                         |
| Exact-head selection, never branch count           | Selection order and authority model                                     |
| Live sanctioned two-PR evidence                    | Real reused-branch acceptance                                           |
| Truthful outcome for every incident issue          | Baseline matrix, Incorporated disposition, reconciliation ledger        |
| No successor guard defects                         | Decision summary and governance properties                              |
| Workflow and architecture documentation            | Documentation contract                                                  |
| Focused, full, slow, lint, and format verification | Verification contract                                                   |

## Scope Boundary

This specification authorizes design review only. It does not authorize
implementation, issue promotion, provider action, merge, issue close, project
field mutation, reconciliation mutation, plan generation, push, or branch
cleanup. The implementation plan is generated only after this specification
receives explicit co-review approval.
