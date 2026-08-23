# SHA-Bound Co-Review Orchestration Design

**Issue:** #1406
**Status:** Reframed after the manual-review design decision; pending reviewer
validation
**Date:** 2026-08-23

## Review Context

The official co-review runtime cannot authoritatively review this repair
because its current reviewer capability policy is the defect under review. The
specification therefore uses a manual author/reviewer loop in separate
interactive sessions until #1406 is implemented.

That manual loop exposed the simpler target architecture. The human has been
copying complete author and reviewer outputs between sessions without
performing a semantic review of every claim. The human is providing routing and
continuation authority; the independent agent sessions are performing the
substantive review. Automating that relay does not require constraining either
agent to a shell-command keyhole.

Commit `04cd9dfe` and its pending manual review describe the superseded
capability-policy approach. The next review must evaluate this reframed
specification from its new commit rather than accepting or amending that older
design.

## Problem

AITM currently treats co-review as both:

1. an orchestration and evidence protocol; and
2. a same-user capability sandbox for the reviewer and waiting author.

The orchestration protocol records useful authority: artifact commit and hash,
roles, provider/session claims, ordered rounds, immutable responses and
reviews, explicit decisions, locks, turn budgets, waits, and terminal archives.

The capability sandbox is counterproductive. It parses every Bash request with
a deliberately small grammar and denies commands it cannot prove read-only
with:

```text
reviewer mutation destinations are incomplete or ambiguous
```

That denial blocks pipelines, `sed`, `find`, Git queries, Node scripts, tests,
builds, and the owner-side polling and intervention commands needed by the
protocol itself. It prevented a deep review while providing no adversarial
security boundary: a process with arbitrary Bash can indirectly modify any
same-user local file, including protocol state and locally stored digests.

The manual author/reviewer loop performed a materially deeper review because
both sessions retained normal capabilities. Its missing properties are
automation, immutable routing, idempotency, recovery, and durable evidence—not
additional shell policing.

## Design Decision

Co-review is an automated, SHA-bound orchestration and evidence protocol. It is
not an agent capability sandbox.

A co-review claim establishes role and provenance. It does not grant or remove
Bash, Edit, Write, NotebookEdit, or apply_patch permissions. Claimed sessions
use the same ordinary repository safeguards as any other session. Co-review
does not parse arbitrary shell effects, maintain a reviewer command allowlist,
or block a command merely because its destinations are ambiguous.

The protocol protects correctness by binding every response, review, and
decision to immutable Git and content identities. If the author advances from
commit A to commit B, a review of A remains evidence about A and cannot approve
B. This is the concurrency boundary; freezing all possible author or reviewer
commands is not.

## Design Goals

1. Automate the successful manual author/reviewer relay without requiring the
   human to copy substantive content between sessions.
2. Preserve independent author and reviewer sessions with explicit provider,
   session, and role provenance.
3. Bind each review to the exact repository identity, artifact path, commit,
   blob, and SHA-256 digest presented by the author.
4. Reject stale approval when the artifact or reviewed commit has advanced.
5. Allow the reviewer to inspect the repository deeply and run tests and
   builds under ordinary repository safeguards.
6. Allow both roles to use status, wait, lifecycle, and authenticated
   intervention commands without a co-review-specific shell grammar.
7. Preserve ordered rounds, bounded waits, turn budgets, immutable evidence,
   locks, idempotent handoffs, and terminal archives.
8. Distinguish human routing or continuation authority from human semantic
   review approval.
9. Preserve #1369 cross-worktree lifecycle commands through one narrow,
   documented transport adapter.
10. Prove the complete installed hook chain and end-to-end two-session relay.

## Non-Goals

- Treating a malicious or compromised same-user author or reviewer process as
  safely confined.
- Inferring every filesystem or process side effect of arbitrary Bash.
- Preventing a trusted reviewer from violating its role contract through an
  indirect shell command.
- Replacing ordinary dangerous-command, path-scope, worktree-binding, GitHub,
  AITM-command, commit-ownership, or installed-guard protections.
- Treating human routing as human approval of the reviewed content.
- Automatically creating or controlling provider chat windows through
  provider-specific private APIs. A human may still start each persistent
  interactive session and give it the thin runtime handoff.
- Adding reviewer-claim TTL, heartbeat, release, or reassignment in #1406.
- Adding repository-wide snapshot state or changing the existing protocol and
  archive schemas.
- Hot-patching or reusing the active #1381 constrained runtime.
- Creating successor issues for each deferred co-review concern.

## Authority Model

### Normative artifact authority

An owner handoff records:

- canonical repository identity;
- canonical artifact path;
- immutable Git commit;
- artifact blob identity;
- SHA-256 digest of the artifact bytes at that commit; and
- owner response digest and round.

The reviewer handoff must cite that exact commit as `review-of`. The protocol
loads authoritative artifact bytes from Git rather than trusting mutable
working-tree bytes. A decision for commit A cannot satisfy a handoff or archive
for commit B, even when both commits came from the same reused branch.

Working-tree drift remains useful diagnostic evidence, but it cannot silently
change a review's target. The operator either restores the reviewed commit or
starts a new round for the new commit.

### Role and session authority

Owner and reviewer identities remain distinct. Each claimed turn records the
provider and session identifier that produced its evidence. Only the claimed
role may submit that turn's handoff. Wrong actor, provider, session, runtime,
round, review path, or `review-of` commit is a protocol refusal.

The claim controls protocol mutation, not general tool permissions. A session
may inspect files and execute verification without asking the co-review policy
for permission. Only a successful protocol handoff can advance the review.

### Human authority

AITM records human actions according to what the human actually authorized:

- starting or connecting independent sessions is operational routing and
  creates no review-approval marker;
- budget expansion, supplements, refocus, or intervention continuation retain
  their existing authenticated-human provenance and mean only what their
  command records; and
- human semantic approval exists only when the human explicitly invokes the
  repository's review-approval workflow.

Copying an agent review between sessions or approving another automated round
does not produce a human review-approval marker. This distinction uses existing
command and approval evidence; #1406 adds no protocol or archive schema field.

## Capability Model

### Ordinary session safeguards

Co-review adds no capability decision for Bash or direct file-writing tools.
The installed ordinary guards continue to enforce:

- unconditional dangerous-command refusal;
- filesystem path scope;
- active-task worktree binding;
- governed GitHub and issue-lifecycle commands;
- sanctioned AITM command paths;
- commit ownership;
- installed-guard self-protection; and
- ordinary activity-state policy.

The reviewer handoff instructs the reviewer to use a fresh session without an
unrelated bound task. The co-review claim is its work context. Under the
existing no-active-task policy, `RUN_TESTS`, `RUN_BUILD`, documentation writes,
issue writes, and reads are available while `WRITE_CODE` and `COMMIT_CODE`
remain refused when recognized.

Verification is safe and useful in every lifecycle stage. `RUN_TESTS` and
`RUN_BUILD` become universally permitted activity classes, like `READ_*`, so a
legitimately bound reviewer or operator is not prevented from reproducing
evidence solely because the issue is in Refine, Review, or Done. This is an
ordinary activity-policy decision, not a co-review grant override.

### Reviewer role contract

The reviewer may use normal Bash, Read, Glob, tests, builds, and repository
inspection. The reviewer writes new review evidence under the protocol runtime
and must not edit or commit the normative artifact, implementation source,
prior response or review files, protocol state, authority indexes, or archives.

This is a cooperative-provider rule backed by immutable handoff validation and
ordinary guards where they recognize the activity. It is not represented as a
same-user security guarantee.

### Cross-worktree lifecycle transport

`#1369` supports an interactive reviewer whose current directory differs from
the runtime's linked worktree. Exact generated `co-review status`, help, and
reviewer-handoff commands may require access to the canonical target runtime
outside the caller's ordinary path scope.

Retain one narrow lifecycle transport adapter in `bash-guard.mjs`. It recognizes
only the generated single-command shapes, resolves the target runtime within
the same Git common directory, and verifies provider/session targeting before
allowing the command to reach the protocol CLI. It does not inspect or
authorize ordinary reviewer Bash. Final actor, artifact, review, lock,
lifecycle, and archive validation remains inside the protocol.

## Automated Relay

The shared protocol runtime replaces the human clipboard as the substantive
transport.

```text
author session
  -> commits artifact A
  -> writes immutable owner response
  -> hands off A
  -> enters bounded wait

reviewer session
  -> wait wakes and status identifies A
  -> reads A and owner response directly from recorded paths
  -> performs unrestricted deep review under ordinary guards
  -> writes immutable reviewer review citing A
  -> hands off changes-requested or accepted
  -> enters bounded wait when active

author session
  -> wait wakes and status identifies the exact review
  -> reads the review directly from the runtime
  -> revises and commits B when required
  -> writes response citing the prior review
  -> hands off B
```

No substantive response or review text is copied through a human prompt. The
human supplies each new persistent session only a thin handoff containing the
worktree, runtime, actor, and instruction to start its bounded wait timer.

Every generated author and reviewer handoff includes:

- canonical worktree and runtime paths;
- actor identity and current role;
- exact status, claim, wait, and handoff commands;
- authoritative artifact commit and evidence paths;
- the remaining turn and bounded-wait budgets;
- instructions to read peer evidence directly from disk;
- instructions to start the turn timer immediately; and
- the role and human-authority distinctions above.

Both participants must keep separately observable bounded wait timers active
while the other owns the turn. A successful handoff wakes the waiting role.
Timeout is an observable checkpoint, not permission to reset the counter or
steal the turn.

## Architecture Changes

### `activity-guard.mjs`

- Remove imports and evaluation of `mutation-targets.mjs` and
  `co-review-write-policy.mjs`.
- Remove all provider/session co-review capability decisions.
- Continue directly from tool parsing into the ordinary activity classifier.
- Make `RUN_TESTS` and `RUN_BUILD` universally allowed activity classes.
- Retain every other state-matrix and installed-guard behavior.

### `source-edit-gate.mjs`

- Remove co-review target parsing, provider/session resolution, and
  `evaluateCoReviewWrite()` decisions.
- Continue applying ordinary source-edit, worktree, state, and installed-copy
  protections.
- Preserve the existing `.tmp/**` scratch behavior used for new response and
  review artifacts.

### `bash-guard.mjs`

- Remove arbitrary Bash target extraction and
  `evaluateCoReviewWrite()` evaluation.
- Remove ambiguity-based and destination-completeness refusals.
- Keep the strict #1369 lifecycle transport adapter as the only co-review-aware
  Bash path.
- Keep every ordinary Bash guard in its current order.

### Retired capability-policy modules

Delete `co-review-write-policy.mjs` and `mutation-targets.mjs` after confirming
they have no non-capability consumers. Remove their imports, fixtures, and
focused policy tests.

Rename `reviewer-co-review-command.mjs` to
`co-review-lifecycle-transport.mjs`. Its only contract is recognizing and
validating the exact #1369 transport shapes. It must not classify arbitrary
review commands or become a replacement Bash allowlist.

Remove `resolveReviewerGrant()` or `hasLiveReviewerClaim()` exports from
`scripts/review/lib/index.mjs` only if production consumer analysis proves they
are unused after the capability policy is retired. Preserve the private
claim-liveness behavior required by occupancy and protocol authority.

### Protocol and generated handoffs

- Preserve SHA, blob, digest, role, provider/session, lock, round, decision,
  budget, and archive validation.
- Preserve #1369 canonical runtime resolution.
- Update author and reviewer handoffs to describe normal capabilities and
  direct file-based relay rather than arbitrary Bash prohibition.
- Require the reviewer to start unbound from unrelated task work and to start
  its bounded wait timer.
- State plainly that routing and continuation do not constitute human semantic
  approval; preserve existing command provenance and approval markers.
- Do not change protocol or archive schemas in #1406.

## Failure Handling

- Wrong artifact, commit, blob, digest, actor, provider, session, round,
  review path, or decision refuses the protocol mutation with no state change.
- Repeating the same handoff with identical evidence is idempotent; conflicting
  reuse is refused.
- Artifact advancement never inherits approval from the previous commit.
- Ordinary guard refusals remain ordinary repository-policy refusals and are
  never relabeled as co-review failures.
- A reviewer command is never refused merely because arbitrary shell effects
  are ambiguous.
- Index, protocol, lock, or archive corruption remains a protocol refusal for
  lifecycle commands; it does not remove ordinary repository capabilities.
- A dead reviewer session may leave the protocol turn claimed, but it no longer
  freezes the worktree or blocks ordinary tools. Preserve evidence and fall
  back to the manual relay until a separately approved release/reassignment
  design exists.
- No recovery path may impersonate a reviewer, rewrite immutable evidence, or
  silently convert agent review into human approval.

## Test Strategy

### Red-before-green guard regression

Create a real temporary repository with a live claimed reviewer and invoke the
complete installed hook chain in its configured order. Pin provider/session
identity and `TT_SKIP_NETWORK=1`.

Before the fix, a representative pipeline must fail specifically with
`reviewer mutation destinations are incomplete or ambiguous`.

After the fix, the same claimed reviewer must successfully run:

- a Git or ripgrep pipeline;
- `sed` and `find` inspection;
- `git branch --show-current`;
- a focused Node test;
- a representative build; and
- ordinary `status`, `wait`, and handoff commands.

The installed chain must still refuse representative dangerous, path-scope,
wrong-worktree, governed GitHub, forbidden source-write, and commit-ownership
cases for the same session under ordinary policy.

### Capability-policy retirement regression

Tests must prove that:

- Bash, Edit, Write, NotebookEdit, and apply_patch outcomes are identical with
  and without a live co-review claim, except for the documented #1369 lifecycle
  transport adapter;
- no installed guard imports or calls the retired co-review write policy;
- no ambiguity or incomplete-destination refusal remains in production guard
  code or generated handoffs;
- direct review-file creation under the protocol runtime follows ordinary
  `.tmp/**` policy; and
- tests and builds are allowed in every kanban state while other activity
  classes retain their existing matrix decisions.

### Automated two-session acceptance

Run the full relay without copying substantive content through a human prompt:

1. Author session hands off artifact commit A and enters bounded wait.
2. Reviewer session claims, reads A and the owner response from recorded paths,
   performs deep inspection, submits `changes-requested` against A, and waits.
3. Author wait wakes, reads the review from the runtime, commits revised
   artifact B, submits a response linked to the prior review, and waits.
4. Reviewer wait wakes, reads B and the response, submits `accepted` against B,
   and the protocol archives terminal evidence.
5. A stale acceptance citing A for B is refused.
6. Repeating an identical handoff is idempotent; conflicting evidence is
   refused.
7. Status and archive evidence prove every artifact, response, review, actor,
   provider/session, round, decision, and SHA relationship. Existing session
   timing evidence separately proves the bounded wait episodes; #1406 does not
   add them to protocol or archive schemas.

### Human-authority semantics

Tests must prove that session routing creates no human review-approval marker,
that existing authenticated continuation evidence retains its current narrow
meaning, and that only the explicit repository review-approval workflow can
create human semantic-approval evidence.

### Test-corpus maintenance

Remove or rewrite reviewer mutation-parser and co-review write-policy tests.
Update `scripts/tests/fixtures/test-corpus-post-snapshot/**`,
`scripts/tests/unit/meta/test-corpus-membership.test.mjs` expectations, and
`scripts/task-tracker/test-impact-manifest.json` for the retired modules and new
load-bearing integration tests.

Run focused red/green tests, then the fast suite, slow suite, lint,
documentation lint, spelling, and formatting before Test admission.

## Deferred Convergence Concerns

The implementation workflow must hydrate these findings into issue #1381's
single durable convergence analysis before #1406 closes, without creating one
successor issue per finding:

- dead reviewer claims lack human-authorized release or reassignment;
- claim liveness depends on protocol integrity;
- provider chat startup and wake-up remain host-adapter responsibilities;
- strong adversarial tamper evidence would require external or OS authority;
- repository snapshot review may eventually use a dedicated detached reviewer
  worktree; and
- existing constrained runtimes must never be reused as acceptance evidence.

## #1365 Disposition

`#1406` supersedes `#1365`'s reviewer Bash allowlist and single-guard boundary as a
general permission model. The strict lifecycle shape remains only as the
renamed #1369 cross-worktree transport adapter. Historical commits and evidence
remain unchanged; durable #1365 evidence must be annotated with this narrowed
disposition during implementation.

## Rollout and Rollback

Implement and verify only in the isolated #1406 worktree. Do not mutate the
active #1381 constrained runtime or its worktree.

After integration into the branch used for review, start a fresh official
co-review from a new runtime. Both persistent sessions must use the corrected
installed hooks from their first claim and must start their bounded wait
timers. Do not import acceptance from an old runtime.

Disable official co-review and return to the manual relay if:

- ordinary dangerous, path, worktree, GitHub, AITM, commit-ownership, or
  installed-guard protection regresses;
- an artifact can inherit approval from another commit;
- wrong-role or wrong-session evidence advances the protocol;
- substantive content again requires human copy/paste between active turns;
- either participant lacks an observable bounded wait timer; or
- a legitimate deep-review command receives a co-review-specific refusal.

Rollback means reverting #1406 as a governed change and marking official
co-review unavailable pending diagnosis. A constrained runtime must not be
silently restored and counted as authoritative review.

## Acceptance Summary

`#1406` is accepted when two independent persistent sessions can complete the
author A -> reviewer changes-requested -> author B -> reviewer accepted flow
using shared immutable files and bounded wait timers, without substantive human
copy/paste and without co-review-specific restrictions on ordinary tools.

Every decision must remain bound to its exact artifact commit and provider
session; ordinary repository guards must retain their behavior; terminal
evidence must be complete and idempotent; and routing or continuation by the
human must never be mislabeled as human semantic approval.
