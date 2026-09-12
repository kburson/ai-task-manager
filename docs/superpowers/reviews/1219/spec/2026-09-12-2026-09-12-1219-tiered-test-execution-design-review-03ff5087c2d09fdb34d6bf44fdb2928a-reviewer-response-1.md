<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-03ff5087c2d09fdb34d6bf44fdb2928a"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-12-1219-tiered-test-execution-design.md"
artifact_commit: "487966729b913b364bd3e87428aabee95e9c1077"
artifact_blob: "046d1a17492a5d6cbba276ebeaedea08e8b60e9e"
artifact_digest: "sha256:94e3c570211fe67254328b2a2dca480a272a883603186da792c7caaea076023c"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:b442aba55add2575a307df23836f008c2fd2f4224f4758748bf984fd912fefe5"
  identity_source: "runtime"
started_at: "2026-09-12T17:17:14.905Z"
submitted_at: "2026-09-12T17:22:16.514Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007","R1-F008","R1-F009"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The specification is coherent, unusually disciplined about the difference
between durable intent and obsolete historical commitments, and its
current-code claims hold up. I independently verified the load-bearing
repository assertions at the pinned baseline rather than accepting them:

- Inventory is exactly 845 Unit, 158 Integration, 52 Slow, 1,055 total
  (`git ls-files` per lane directory) — matching section 2.2 precisely.
- `verify-develop.mjs:23` diffs `--name-status --find-renames -z HEAD` plus
  `git ls-files --others --exclude-standard`, with no `merge-base` anywhere in
  the file. The section 3 claim that committed branch changes are missing from
  the change interval is correct.
- `test-impact-selector.mjs:225-233` does fall through to a
  `no-verification-impact` reason when no rule, mapping, or graph edge matched,
  with no affirmative-exclusion requirement. Section 3 and section 6.1 describe
  this accurately.
- `npm test` resolves to `run-tests.mjs --lane fast`, documented in that file as
  "unit only". Section 3 is right, and `run-tests.mjs:24` additionally states
  that no `test:all` script exists, which reinforces the point that "complete"
  needs an explicit new definition.
- `run-tests.mjs:10-12` confirms the `@slow-parallel-safe` subset bounded at two
  workers, which section 3 correctly flags as contradicted by the forced
  sequential-Slow decision.
- `.github/workflows/ci.yml:39` is literally
  `Fast lane (format, lint, unit + integration)`, with a docs-only classifier at
  line 72 and nightly `cron: '0 7 * * *'` Slow at line 31.

I could not verify the live ruleset (`Protect trunk`, 20694244) or the native
issue graph from this session; those remain author observations.

The design decisions themselves are sound. Two-mode operation with `full-pr` as
the new-project default is the right call, the freshness-as-obligation-deadline
model is a genuine improvement over a fixed age limit, and the repeated
insistence that deferral is an explicit obligation rather than a local pass is
the correct safety posture.

My objections are about under-specified mechanism at four load-bearing points,
not about direction. The most serious is that the PR-time health gate is
described as trusted while GitHub's `pull_request` semantics place the job body
under candidate control. The others are a lease schema that cannot represent the
UNKNOWN incidents the state table admits, an undefined cadence value set that the
deadline formula depends on, and a missing cheap recovery path from a
scheduler-outage UNKNOWN.

## Findings

### R1-F001 — The in-PR health-validation job is candidate-controlled, so trusted admission cannot rest on it

Section 9.4 places a "lightweight health-validation job" in `ci.yml` and makes
the required final gate depend on its success. Section 5.1 asserts that "the
effective policy for a candidate comes from the protected base and trusted
runtime," and section 12 (Compatibility) requires that "candidate code cannot
evaluate or replace trusted authority."

For same-repository pull requests, GitHub runs workflow definitions as they exist
on the PR head, not on the protected base. A candidate branch can therefore
rewrite the body of the health-validation job — or the final gate's dependency
expression — while preserving the job names that the ruleset requires. The
required-context name matches, the check goes green, and the protected-base
policy was never consulted. The same exposure applies to the "executed inventory"
evidence the coordinator reads in section 7, if that evidence is produced by
head-authored steps.

Sections 5.1 (policy digest recording), 7 (trusted workflow identity), and 9.4
(configuration validation of "referenced trusted workflow identity") all gesture
at this problem, but each operates either at configuration time or on identity
metadata. None of them states the PR-time mechanism by which a head-modified job
body is detected and refused.

This needs an explicit resolution in the document, choosing and naming the
mechanism. The plausible candidates, and their real limits, should be stated:

- Move the trusted logic into a reusable workflow pinned by commit SHA. This
  narrows but does not close the gap, because the `uses:` reference itself lives
  in the head's `ci.yml` and can be repointed or the job deleted outright.
- Rely on the coordinator's independent read. Section 9.4 already has AITM
  rereading health at every governed mutating preflight and immediately before
  its delivery action. This is the only step in the design that is genuinely
  outside candidate control, and it is where the trust should be stated to live.
- Compare the candidate's `ci.yml` against the protected base and refuse on any
  divergence in the managed portion, tying this to the old/proposed policy
  digests section 5.1 already records.

Whichever is chosen, the specification should stop describing the in-CI health
job as an enforcement boundary and describe it as an early-failure convenience
whose success is necessary but never sufficient. Section 12's Protection row
should then require proof that a candidate which rewrites the health job body
still cannot obtain delivery.

### R1-F002 — The repair-lease record cannot represent the UNKNOWN incidents section 9.2 admits to repair

Section 10 defines one expiring repair lease and enumerates its recorded fields:
"repository, incident/health epoch, failed run and SHA, holder, issue, literal
branch, permitted base, unique nonce, acquisition, expiry, and heartbeat."

Section 9.2 admits "diagnosis/recovery or authorized repair only" under UNKNOWN,
and section 9.2 enumerates UNKNOWN causes that include missing or corrupt
authority, inconsistent records, an overdue obligation, and indeterminate
execution. Several of those have no failed run and no failed SHA to record. A
corrupt data-branch record or a lost executor produces an incident whose lease
cannot be populated under the stated schema.

Section 10 compounds this by describing the exit condition purely in failure
terms: "Health remains RED until that new complete result passes and is accepted
for the incident," and "Infrastructure/evidence incidents may authorize a
reasoned recovery run without a source change." The second sentence implies a
non-failure incident class exists, but the lease schema and the clearing rules
are written only for RED.

Specify the incident taxonomy explicitly — at minimum a failure incident and an
authority/infrastructure incident — and state for each which lease fields are
required, which are null, what the authorized remediation is (source repair
versus authority reconciliation versus a recovery complete run), and what
observation clears it. Section 9.2's existing rule that a deadline-only UNKNOWN
can be cleared by a fresh trusted schedule observation should be located inside
that taxonomy rather than standing apart from it.

### R1-F003 — The permitted cadence value set and the slot anchor are undefined, and the freshness deadline depends on both

Section 8.1 allows "fixed UTC slots from every six hours through once a week."
Section 1 repeats "every six hours through once a week; default every eight
hours." Section 8.3 makes the admission window
`next required scheduled slot + configured dispatch/completion/publication
allowance`, so "next required scheduled slot" is the load-bearing term for every
freshness decision in the design.

A continuous six-hour-to-one-week range cannot produce fixed UTC slots. Six,
eight, twelve, and twenty-four hours divide a day; a week divides a week; a
thirty-six or forty-eight hour cadence divides neither and has no defined anchor.
The specification never says whether the allowed set is an enumeration or a
range, nor what the slots are anchored to (UTC midnight, a configured epoch, the
start of the ISO week), nor how a weekly cadence picks its day and hour.

Section 8.1 already warns against deriving a weekly schedule from an invalid
day-of-month step expression, which shows the author is aware of the cron
translation hazard, and section 8.1 requires that "generated workflow triggers
and the coordinator's slot calculations must agree." That agreement is
unverifiable while the permitted values are open-ended.

Replace the range with an enumerated set of permitted cadences, state the anchor
each is computed from, state how weekly selects day-of-week and hour, and require
configuration validation to reject any value outside the set rather than
approximating it. Section 12's Schedule row currently tests only six-hour,
eight-hour, daily, and weekly policies, which suggests the enumeration is already
the intended design.

### R1-F004 — A scheduler outage produces a deadline-only UNKNOWN with no cheap documented exit

Section 8.3 acknowledges that "GitHub scheduled workflows can be delayed or
dropped" and correctly requires readers to compute expiry themselves. Section 9.2
then makes a missed check or overdue run UNKNOWN at admission time, and UNKNOWN
blocks essentially all governed work under section 10.

Section 9.2 provides the cheap exit: "A deadline-only UNKNOWN can be reconciled
by a fresh trusted schedule observation that proves the same compatible
successful head remains current and no failure or other obligation intervened."
But a schedule observation is, throughout section 8.1, something the scheduled
coordinator produces at a due slot. If the scheduler is the thing that failed,
that path is unavailable. The only forcing mechanism the document offers is
section 8.1's "Explicit manual, release-candidate, bootstrap, repair, and
recovery requests can force execution at an unchanged head" — that is, forcing
the complete suite, which section 1 says "may take an hour or more."

The consequence is that a dropped GitHub schedule on a repository whose trunk has
not changed at all costs an hour of blocked work and a full suite execution to
recover a state that a trusted thirty-second head comparison could establish.
Section 14 says finite deadlines can block work during outages "with a bounded
recovery route," but that route is not specified for this case.

Add an explicit operator-initiated trusted schedule-observation operation:
manually dispatchable, producing exactly the section 8.1 step 1 unchanged-trunk
check with the same trust requirements and the same prohibition on inventing a
run, and usable to clear a deadline-only UNKNOWN. State plainly that it cannot
clear RED, cannot clear any other UNKNOWN cause, and cannot satisfy a due
obligation created by a changed trunk.

## Required changes

1. Resolve R1-F001. Name the PR-time mechanism that keeps health admission
   outside candidate control, stop describing the head-authored `ci.yml` job as
   an enforcement boundary, and add the corresponding proof to section 12's
   Protection row.
2. Resolve R1-F002. Define the incident taxonomy, the lease fields required and
   nulled per class, the authorized remediation per class, and the clearing
   observation per class.
3. Resolve R1-F003. Enumerate permitted cadences, define the slot anchor and the
   weekly day/hour selection, and require configuration validation to reject
   values outside the set.
4. Resolve R1-F004. Specify the operator-initiated trusted schedule-observation
   operation and bound exactly what it can and cannot clear.

## Optional suggestions

### R1-F005 — Reconcile "protected" with fast-forward publisher pushes on the data branch

Section 9.1 calls `aitm/tia-data` a "protected same-repository orphan branch" and
section 9.3 has the publisher perform "validated single-parent fast-forwards with
an expected previous head." A GitHub ruleset strong enough to be called
protection typically requires a pull request and blocks direct pushes, which
would stop the publisher. State the intended protection shape — most plausibly a
ruleset that blocks deletion and non-fast-forward updates while permitting the
publisher workflow's `GITHUB_TOKEN` to push — and note that this is an external
ruleset operation subject to section 12's separate-review rule. Consider also
making the branch name configuration rather than a literal, for the same reason
section 1 forbids hard-coding the default branch name.

### R1-F006 — State the offline and unreachable-health behavior for local governed preflights

Section 9.4 has AITM reread health "at every governed mutating preflight and
immediately before its delivery action," and section 9.3 requires readers to fail
closed when native evidence cannot be read. Together these imply that in tiered
mode a developer or agent with no network reaches UNKNOWN and is blocked from all
governed work, including operations that never touch the remote. That may well be
the intended trade, but it is a significant operating consequence and is not
listed among section 14's disclosed consequences. If a bounded read cache keyed
to the health epoch and deadline is acceptable, say so and bound it; if not, say
plainly that tiered mode requires connectivity for every governed mutation.

### R1-F007 — Name the host-shared namespace the admission mechanism must use

Section 6.4 requires admission across "this repository's clones and worktrees on
the same physical host" and correctly forbids relying on clone-local lock files.
It does not say where the shared state lives. This matters more than it looks,
because this repository's own conventions confine runtime state to `.tmp/` and
disposable work to `.scratch/`, both of which are per-checkout and therefore
exactly the thing section 6.4 rules out. Specify that the admission record lives
in a user-scoped host path outside any checkout, keyed by a stable repository
identity rather than by path, so that two clones of the same repository contend
and two unrelated repositories do not.

### R1-F008 — Add acceptance rows for the admission read path

Section 12 covers health persistence, bootstrap, and repair, but has no row for
the reader side under stress: health unreadable at preflight, health changing
between preflight and the delivery action (the revalidate-or-refuse rule in
section 9.4), and a reader observing a partial state while the publisher is
mid-write between the data commit and the issue projection. Section 9.3 already
specifies that last case yields UNKNOWN until idempotent reconciliation; it
deserves an observable proof obligation.

### R1-F009 — Disclose the `full-pr` per-PR cost at this repository's scale

Section 1 presents `full-pr` as the low-overhead default and notes it "does not
require a health data branch, health issue, repair lease, ML model, or background
scheduler," which is true and is the right default. But at the audited inventory
of 1,055 files with 52 Slow files forced sequential per section 8.2, every PR
pays the complete-suite cost that section 1 elsewhere describes as possibly "an
hour or more." Section 14 says full-pr "pays the full suite cost on each
candidate" without quantifying it. A sentence giving the order of magnitude, and
noting that this is what makes `full-pr` a small-team-and-small-suite default,
would keep an adopter from selecting it on the basis of operational simplicity
alone.

## Decision

revisions-requested
