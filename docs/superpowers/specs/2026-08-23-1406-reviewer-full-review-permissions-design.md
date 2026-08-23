# SHA-Bound Co-Review Orchestration Design

**Issue:** #1406
**Status:** Revised after round-6 reviewer confirmation; pending round-7
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

Commit `04cd9dfe` and its manual review describe the superseded
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
9. Require both participants to review one exact commit in one canonical
   physical worktree; cross-worktree execution is not authoritative review.
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
- Supporting multi-file implementation review or adding a declared mutable-path
  set. #1406 retains the protocol's single-authoritative-artifact model.
- Adding repository-wide snapshot state or changing the existing protocol or
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

The protocol also records one canonical physical review worktree. Both roles
must run from that exact worktree, whose `HEAD` must equal the handed-off
artifact commit during the reviewer turn. A separate worktree at the same Git
commit is not equivalent because dependencies, generated files, configuration,
and untracked state can differ.

At every owner or reviewer handoff, the canonical worktree must have no staged
or unstaged tracked changes. This protocol reviews one authoritative artifact;
after runtime initialization, the tracked diff from
`state.artifact.commit`—the predecessor commit retained until the next owner
handoff succeeds—to the proposed commit may contain only that artifact path.
During author revision that artifact is the only tracked file the role contract
permits to change. The owner makes no tracked edits while the reviewer owns the
turn. Protocol responses, reviews, state, timing evidence, and locks remain
under the ignored co-review runtime and do not enter the tracked diff.

Any other tracked path, mismatched `HEAD`, different physical worktree, or dirty
tracked state refuses handoff. Working-tree drift remains diagnostic evidence,
but it cannot silently change the review target. The operator restores the
canonical worktree or begins a new conforming round; it never substitutes a
different worktree.

Imported review evidence follows the same baseline rule. `--import-review`
requires its immutable `review-of` commit to equal canonical worktree `HEAD` at
initialization. A merely reachable ancestor is refused rather than allowing
changes between the imported commit and initialization `HEAD` to escape the
first artifact-only diff.

### Role and session authority

Owner and reviewer identities remain distinct. Each claimed turn records the
provider and session identifier that produced its evidence. Only the claimed
role may submit that turn's handoff. Wrong actor, provider, session, runtime,
canonical worktree, round, review path, or `review-of` commit is a protocol
refusal.

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

The reviewer handoff instructs the reviewer to start a fresh session in the
canonical review worktree without an unrelated bound task. The co-review claim
is its work context. Under the existing no-active-task policy, `RUN_TESTS`,
`RUN_BUILD`, `WRITE_DOCS`, `WRITE_ISSUE`, `WRITE_OTHER`, and reads are available
while `WRITE_CODE` and `COMMIT_CODE` remain refused when recognized. #1406 does
not change the repository-wide activity matrix.

That ordinary classifier is a workflow aid, not a security boundary. Its
`COMMIT_CODE` recognition covers the canonical `git commit` shape but not every
shell-equivalent form such as `git -C ... commit`, `git -c ... commit`, or
`cd ... && git commit`. The reviewer role contract and immutable handoff checks,
not complete shell-effect inference, protect review authority.

### Reviewer role contract

The reviewer may use normal Bash, Read, Glob, tests, builds, and repository
inspection in the canonical worktree. The reviewer writes one new review file
under the protocol runtime with Edit, Write, NotebookEdit, or apply_patch and
must not edit or commit the normative artifact, implementation source, prior
response or review files, protocol state, authority indexes, or archives.

This is a cooperative-provider rule backed by immutable handoff validation and
ordinary guards where they recognize the activity. It is not represented as a
same-user security guarantee.

### One-worktree review boundary

`#1369` previously allowed an interactive reviewer to issue lifecycle commands
from a different linked worktree. That convenience conflicts with the stronger
review invariant selected for #1406: both participants must inspect and verify
the same physical checkout, not merely Git objects with the same commit name.

Generated handoffs therefore direct both sessions to the canonical review
worktree before status, claim, wait, inspection, or handoff. The protocol—not
ordinary Bash path or worktree policy—enforces
`callerRoot === runtimeRoot === state.repositoryRoot` for every command. No
co-review-specific Bash transport exemption remains, and evidence produced from
another worktree cannot advance or accept the protocol. #1406 deliberately
supersedes the #1369 cross-worktree handoff behavior for authoritative review.

An advisory Edit/Write path tripwire is also deliberately omitted. It would
retain claim-aware guard coupling without creating authority. Role guidance,
tracked-diff validation, committed artifact identities, and immutable protocol
evidence provide the enforceable boundary.

## Automated Relay

The shared protocol runtime replaces the human clipboard as the substantive
transport.

```text
author session
  -> works in canonical review worktree
  -> commits artifact A
  -> proves clean tracked state and HEAD A
  -> writes immutable owner response
  -> hands off A
  -> starts a bounded repeated-wait episode

reviewer session
  -> starts in the same canonical worktree at clean HEAD A
  -> a wait poll wakes and status identifies A
  -> reads A and owner response directly from recorded paths
  -> performs unrestricted deep review under ordinary guards
  -> writes immutable reviewer review citing A
  -> hands off changes-requested or accepted
  -> starts a new bounded repeated-wait episode when active

author session
  -> a wait poll wakes and status identifies the exact review
  -> reads the review directly from the runtime
  -> revises only the artifact and commits B when required
  -> proves A..B changes only the artifact and tracked state is clean
  -> writes response citing the prior review
  -> hands off B
```

No substantive response or review text is copied through a human prompt. The
human supplies each new persistent session only a thin handoff containing the
canonical worktree, runtime, actor, and instruction to start its bounded wait
episode.

Every generated author and reviewer handoff includes:

- canonical worktree and runtime paths;
- the required canonical `HEAD`, clean tracked-state check, and artifact-only
  inter-round diff rule;
- actor identity and current role;
- exact status, claim, wait, and handoff commands;
- authoritative artifact commit and evidence paths;
- the remaining turn and bounded-wait budgets;
- instructions to read peer evidence directly from disk;
- instructions to start the turn timer immediately; and
- the role and human-authority distinctions above.

The current CLI implements waiting as repeated bounded polls, not a persistent
host wake. Each generated handoff defines one waiting episode as at most
`waitCycles` separately observed calls, each using `waitIntervalSeconds` no
greater than the CLI's 60-second limit. The current defaults are 20 calls of 60
seconds.

After each exit 3 timeout, the role records `wait cycle N/M` and reissues the
wait only while cycles remain. Exit 0 is a wake: run status and act on the
reported state. Exit 2 or a non-integrity exit 1 is a refusal and stops the
episode. Integrity exit 1 follows the existing one-time settled re-read rule,
then stops if integrity remains invalid. After the last timeout, the role runs
status, reports the stall to the human, and stops without silently starting a
new batch. Exhausting the configurable 20-minute default is an expected
operational checkpoint during a long peer turn, not evidence that the review
failed. A successful handoff starts a new bounded episode for the role that
handed off.

Exit 4 after a terminal accepted handoff means acceptance is already durable
but archive publication remains pending. Neither role repeats the terminal
handoff. The operator preserves state and runs only the exact printed finalize
retry.

## Architecture Changes

### `activity-guard.mjs`

- Move `extractApplyPatchTargets()` and its parse-error type from
  `mutation-targets.mjs` into a focused `apply-patch-targets.mjs` module because
  ordinary activity classification still consumes those targets.
- Remove Bash mutation-target extraction and all evaluation of
  `co-review-write-policy.mjs`.
- Remove all provider/session co-review capability decisions.
- Continue directly from tool parsing into the ordinary activity classifier.
- Retain the existing state matrix and every installed-guard behavior.

### `source-edit-gate.mjs`

- Import `extractApplyPatchTargets()` from the focused replacement module for
  ordinary multi-target classification.
- Remove provider/session resolution and `evaluateCoReviewWrite()` decisions.
- Continue applying ordinary source-edit, worktree, state, and installed-copy
  protections.
- Preserve the existing `.tmp/**` scratch behavior used for new response and
  review artifacts by direct Edit, Write, NotebookEdit, or apply_patch tools.
  Generated handoffs do not prescribe Bash redirection for those files because
  the ordinary Bash activity path has no equivalent `.tmp/**` carve-out.

### `bash-guard.mjs`

- Remove arbitrary Bash target extraction and
  `evaluateCoReviewWrite()` evaluation.
- Remove ambiguity-based and destination-completeness refusals.
- Remove the strict #1369 cross-worktree lifecycle classifier and exception.
- Keep every ordinary Bash guard in its current order.
- Require lifecycle commands to originate from the canonical review worktree;
  do not early-exit or expand path scope for co-review commands.

### `runtime-root.mjs` and `protocol.mjs`

- Change `resolveRuntimeRoot()` from a linked-worktree resolver into the
  one-worktree boundary. Resolve both canonical caller and runtime roots, then
  refuse unless `callerRoot === root`; delete the same-common-directory
  acceptance branch.
- Remove the now-unused `commonDirectory()` operation from
  `REAL_REPOSITORY_BOUNDARY`, its memory fixture, and its focused boundary
  tests.
- Keep `protocolRoot()` as the single protocol entry point that converts this
  mismatch into a `repository-identity` refusal. Every status, claim, wait,
  handoff, intervention, finalization, and archive-snapshot command therefore
  crosses the same caller-root check.
- Continue applying `assertRecordedRoot()` so the surviving root also equals
  both `state.repositoryRoot` and `state.worktree`.
- Preserve the existing reviewer-turn integrity check that refuses when
  canonical worktree `HEAD !== state.artifact.commit`; do not add a duplicate
  reviewer-only HEAD mechanism.

### Retired capability-policy modules

Delete `co-review-write-policy.mjs` and the original `mutation-targets.mjs`
after relocating its apply_patch parser. Delete
`reviewer-co-review-command.mjs`; no replacement Bash transport classifier is
introduced. Remove their imports, fixtures, and focused capability-policy
tests while retaining or relocating ordinary apply_patch-classification tests.

Remove public `resolveReviewerGrant()` and `hasLiveReviewerClaim()` exports from
`scripts/review/lib/index.mjs` once production analysis confirms the deleted
capability and transport paths were their only consumers. Preserve the private
claim-liveness behavior used by `allowsCoReviewOccupancy()` and protocol
authority.

### Protocol and generated handoffs

- Preserve SHA, blob, digest, role, provider/session, lock, round, decision,
  budget, and archive validation.
- Extend `REAL_REPOSITORY_BOUNDARY` with `trackedChanges(root)`, implemented by
  tracked-only Git status, and `changedPathsBetween(root, from, to)`, implemented
  by a committed name-only diff. Extend `memoryRepositoryFixture` with matching
  zero-subprocess operations and focused assertions.
- At owner and reviewer handoff, re-run `assertIgnored()` and require
  `trackedChanges(root)` to be empty. Runtime evidence remains ignored and is
  excluded because untracked files are not part of that operation.
- At owner handoff, use existing `state.artifact.commit` as the predecessor and
  require `changedPathsBetween(root, state.artifact.commit, proposedCommit)` to
  contain only `state.artifact.path`.
- During imported-review initialization, require `importedCommit` to equal
  `repository.identity(root).head`; refuse an ancestor import even when artifact
  bytes happen to match.
- Use the existing reviewer-turn integrity path to validate exact `HEAD` and
  artifact worktree/index bytes.
- Update author and reviewer handoffs to describe normal capabilities and
  direct file-based relay rather than arbitrary Bash prohibition.
- Require both roles to start in the canonical worktree. Require the reviewer
  to be unbound from unrelated task work and both roles to follow the existing
  bounded repeated-poll discipline.
- State plainly that routing and continuation do not constitute human semantic
  approval; preserve existing command provenance and approval markers.
- Do not change protocol or terminal archive schemas in #1406.

## Failure Handling

- Wrong artifact, commit, blob, digest, actor, provider, session, round,
  review path, or decision refuses the protocol mutation with no state change.
- Wrong physical worktree, mismatched `HEAD`, dirty tracked state, or a
  non-artifact tracked path from `state.artifact.commit` to the proposed commit
  refuses handoff with no state change.
- Repeating the same handoff with identical evidence is idempotent; conflicting
  reuse is refused.
- Artifact advancement never inherits approval from the previous commit.
- Ordinary guard refusals remain ordinary repository-policy refusals and are
  never relabeled as co-review failures.
- A reviewer command is never refused merely because arbitrary shell effects
  are ambiguous.
- A command issued from another worktree remains subject to ordinary path and
  worktree policy where recognized, but the protocol-level caller-root check is
  the authoritative refusal and cannot be bypassed by an unbound session.
- Index, protocol, lock, or archive corruption remains a protocol refusal for
  lifecycle commands; it does not remove ordinary repository capabilities.
- A dead reviewer session may leave the protocol turn claimed, but it no longer
  freezes the worktree or blocks ordinary tools. Preserve evidence and fall
  back to the manual relay until a separately approved release/reassignment
  design exists.
- No recovery path may impersonate a reviewer, rewrite immutable evidence, or
  silently convert agent review into human approval.
- The tracked-state and artifact-only checks apply to protocol handoffs.
  Terminal archive publication occurs only after durable acceptance and may
  create the configured non-ignored archive destination; it is explicitly
  outside the pre-handoff cleanliness rule. Exit 4 recovery finalizes that same
  archive and never reopens or repeats the accepted handoff.

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

The reviewer must run all commands from the canonical physical worktree at the
handed-off commit. A second linked worktree at the same commit is a negative
case, not a substitute acceptance environment.

The installed chain must still refuse representative dangerous, path-scope,
wrong-worktree, governed GitHub, forbidden source-write, and commit-ownership
cases for the same session under ordinary policy.

### Capability-policy retirement regression

Tests must prove that:

- Bash, Edit, Write, NotebookEdit, and apply_patch outcomes are identical with
  and without a live co-review claim;
- no installed guard imports or calls the retired co-review write policy;
- no ambiguity or incomplete-destination refusal remains in production guard
  code or generated handoffs;
- direct review-file creation under the protocol runtime follows ordinary
  `.tmp/**` policy through Edit, Write, NotebookEdit, or apply_patch;
- `extractApplyPatchTargets()` continues feeding ordinary activity and source
  classification after relocation; and
- the activity matrix remains unchanged.

With a live reviewer claim, positive owner-side tests must prove that the owner
can successfully run `status`, `wait`, `set-max-turns`, `supplement`, and
`continue`. These are explicit success assertions, not only before/after claim
equivalence checks.

Working-state tests must prove that handoff refuses a different linked
worktree, mismatched `HEAD`, staged or unstaged tracked drift, and an inter-round
commit touching any tracked path besides the authoritative artifact. They must
also prove that ignored runtime evidence does not count as tracked drift.

Runtime-root tests must exercise both sibling-linked-worktree and main-root to
nested-worktree calls. Every protocol verb must inherit the
`callerRoot === runtimeRoot` refusal through `protocolRoot()`; no special Bash
shape may bypass it. Imported-review tests must refuse a reachable ancestor and
accept only `review-of === HEAD` at initialization.

Repository-boundary contract tests must cover `trackedChanges()` and
`changedPathsBetween()` in both the real Git boundary and the in-memory fixture,
while preserving the fixture's zero Git and zero Node subprocess assertion.

### Automated two-session acceptance

Run the full relay without copying substantive content through a human prompt:

1. Author session in the canonical worktree hands off clean artifact commit A
   and starts a bounded repeated-wait episode.
2. Reviewer session starts in that same physical worktree at clean `HEAD` A,
   claims, reads A and the owner response from recorded paths, performs deep
   inspection, submits `changes-requested` against A, and starts its own bounded
   repeated-wait episode.
3. An author wait poll wakes; the author reads the review from the runtime,
   changes only the artifact, commits B, proves A..B contains only the artifact,
   submits a response linked to the prior review, and starts a new wait episode.
4. A reviewer wait poll wakes in the same canonical worktree at clean `HEAD` B;
   the reviewer reads B and the response, submits `accepted` against B, and the
   protocol archives terminal evidence.
5. A stale acceptance citing A for B is refused.
6. Repeating an identical handoff is idempotent; conflicting evidence is
   refused.
7. Status and archive evidence prove every artifact, response, review, actor,
   provider/session, round, decision, and SHA relationship. Existing session
   timing evidence separately proves the bounded wait episodes; #1406 does not
   add them to protocol or archive schemas.
8. A reviewer in a second linked worktree at A or B cannot claim, hand off, or
   provide acceptance evidence for the canonical runtime.
9. Each role's wait episode records every timeout cycle, wakes on exit 0, and
   stops with status plus a human-visible stall report after its configured
   cycle limit. Integrity refusal follows the one-time settled re-read rule.
10. An imported review whose `review-of` is a reachable ancestor of canonical
    `HEAD` is refused; an exact-HEAD import preserves that commit as the first
    artifact-only diff baseline.
11. Terminal acceptance that exits 4 remains durable, does not repeat the
    accepted handoff, and succeeds through the exact archive-finalization retry.
    Archive output after acceptance is exempt from pre-handoff tracked-state
    checks.

### Human-authority semantics

Tests must prove that session routing creates no human review-approval marker,
that existing authenticated continuation evidence retains its current narrow
meaning, and that only the explicit repository review-approval workflow can
create human semantic-approval evidence.

### Test-corpus maintenance

Remove or rewrite reviewer mutation-parser and co-review write-policy tests.
Update `scripts/tests/fixtures/test-corpus-post-snapshot/**` and
`scripts/tests/unit/meta/test-corpus-membership.test.mjs` expectations. Add a
net-new `scripts/task-tracker/test-impact-manifest.json` rule whose sources
cover the Bash guard, activity guard, source-edit gate, runtime-root resolver,
repository boundary, co-review protocol, archive path, and handoff generator,
and whose tests cover the new load-bearing integration and focused regressions.

Run focused red/green tests, then the fast suite, slow suite, lint,
documentation lint, spelling, and formatting before Test admission.

## Deferred Convergence Concerns

After the specification and implementation plan receive independent review
acceptance, the #1406 author must hydrate the reviewed spec/plan references and
the findings below into issue #1381's single durable convergence analysis
before invoking `/task plan-approve #1406`. No successor issue is created for
an individual finding:

- dead reviewer claims lack human-authorized release or reassignment;
- claim liveness depends on protocol integrity;
- provider chat startup and wake-up remain host-adapter responsibilities;
- strong adversarial tamper evidence would require external or OS authority;
- multi-file implementation review would require an explicit declared mutable
  path set rather than weakening the single-artifact boundary;
- repository snapshot review may eventually use a dedicated detached reviewer
  worktree, but such a design is non-authoritative under #1406; and
- existing constrained runtimes must never be reused as acceptance evidence.

## #1365 and #1369 Disposition

`#1406` supersedes `#1365`'s reviewer Bash allowlist and single-guard boundary as
a general permission model. It also supersedes #1369's cross-worktree
authoritative reviewer handoff: both roles must now operate in the canonical
physical review worktree. Historical commits and evidence remain unchanged;
durable #1365 and #1369 evidence must be annotated with this disposition during
implementation.

## Rollout and Rollback

Implement and verify only in the isolated #1406 worktree. Do not mutate the
active #1381 constrained runtime or its worktree.

After integration into the branch used for review, start a fresh official
co-review from a new runtime. Both persistent sessions must use the corrected
installed hooks in the same clean canonical worktree from their first claim and
must start their bounded repeated-wait episodes. Do not import acceptance from
an old runtime.

Disable official co-review and return to the manual relay if:

- ordinary dangerous, path, worktree, GitHub, AITM, commit-ownership, or
  installed-guard protection regresses;
- an artifact can inherit approval from another commit;
- wrong-role or wrong-session evidence advances the protocol;
- substantive content again requires human copy/paste between active turns;
- either participant lacks an observable bounded repeated-wait episode;
- either participant performs authoritative review from another worktree;
- a handoff accepts tracked drift outside the artifact; or
- a legitimate deep-review command receives a co-review-specific refusal.

Rollback means reverting #1406 as a governed change and marking official
co-review unavailable pending diagnosis. A constrained runtime must not be
silently restored and counted as authoritative review.

## Acceptance Summary

`#1406` is accepted when two independent persistent sessions can complete the
author A -> reviewer changes-requested -> author B -> reviewer accepted flow
in one clean canonical physical worktree using shared immutable files and
bounded repeated-wait episodes, without substantive human copy/paste and
without co-review-specific restrictions on ordinary tools.

Every decision must remain bound to its exact artifact commit and provider
session; ordinary repository guards must retain their behavior; terminal
evidence must be complete and idempotent; and routing or continuation by the
human must never be mislabeled as human semantic approval.
