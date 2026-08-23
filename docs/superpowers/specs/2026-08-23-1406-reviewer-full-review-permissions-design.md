# Reviewer Full Review Permissions Design

**Issue:** #1406
**Status:** Revised after manual review round 3; pending reviewer round 4
**Date:** 2026-08-23

## Review Context

The official co-review runtime cannot provide an authoritative review of its
own repair because the current reviewer Bash policy is the defect under review.
The specification therefore uses a manual author/reviewer loop until #1406 is
implemented. Each reviewer pass runs in a separate interactive provider
session rooted in the isolated #1406 worktree, but does not claim an official
co-review turn. After implementation, a fresh official co-review must validate
the repaired boundary end to end.

## Problem

AITM currently applies its co-review mutation policy to every Bash request
while a reviewer holds a live claim. The Bash target parser recognizes a
deliberately small single-command grammar and treats commands it cannot prove
read-only as ambiguous mutations. The reviewer policy then denies those
commands before they execute with:

```text
reviewer mutation destinations are incomplete or ambiguous
```

That ambiguity default-deny is the root cause. It blocks ordinary evidence
gathering such as pipelines, `sed`, `find`, additional Git queries, Node
scripts, and test commands. A reviewer can fall back to Read, Glob, and a few
simple shell commands, but cannot perform the dynamic repository inspection
required for a deep independent review.

Issue #1365 added a narrow exception for exact co-review lifecycle commands. It
did not restore general review capability, and its boundary regression invoked
only `bash-guard.mjs` rather than the complete installed Bash hook chain.

The repair must also acknowledge an unavoidable trust boundary: arbitrary Bash
is arbitrary process execution. A same-user hook cannot both grant general
shell execution and guarantee that a cooperative provider cannot indirectly
modify local protocol or repository files. Static target checks can prevent
obvious accidental writes, but they are not a security boundary against a
provider deliberately modifying protocol state and its locally stored digests
together.

## Design Decision

`#1406` is a focused reviewer-permission boundary repair. It changes the matching
reviewer's Bash path and only the activity permissions necessary for deep
review. It does not add a total non-reviewer freeze, repository-wide snapshot
validation, claim expiry, claim release, cross-worktree repository-set locks,
or protocol-schema changes.

Those broader controls are independently valuable, but combining them here
would introduce new deadlock, recovery, compatibility, cross-worktree, and
hot-path costs that are not required to remove the ambiguity refusal. They are
recorded as deferred convergence concerns in this specification; no successor
issue is created by this design.

## Design Goals

1. A session-bound reviewer can perform deep repository inspection and execute
   verification through Bash without a co-review shell allowlist or ambiguity
   refusal.
2. A live reviewer grant permits `RUN_TESTS` and `RUN_BUILD` regardless of the
   bound issue's kanban state.
3. Dangerous-command, path-scope, worktree-binding, governed GitHub, AITM
   command-path, commit-ownership, and installed-guard protections remain
   effective.
4. Direct file-writing tools remain limited to the exact session-bound pending
   review artifact. If a readable index still identifies the current
   provider/session as claimant but protocol integrity invalidates the live
   grant, direct file-writing tools fail closed for that claimant.
5. Explicitly detected Bash writes to protocol, authority, archive, and
   reviewed-artifact paths remain denied as defense in depth.
6. Existing non-reviewer mutation, cross-worktree handoff, human-authority,
   lifecycle, and wait behavior is not broadened or newly restricted.
7. Protocol role separation, provider/session ownership, locking, evidence
   hashes, and archive validation remain governance controls within the stated
   cooperative-provider trust model.
8. The complete installed hook chain proves the permission boundary.

## Non-Goals

- Treating shell parsing as a tamper-proof sandbox for a malicious or
  compromised same-user process.
- Adding cryptographic signing, a remote authority service, operating-system
  filesystem isolation, or a separately privileged protocol daemon.
- Adding repository-wide snapshot fields or changing the existing
  `aitm.co-review/v1`, `aitm.co-review-event/v1`, or
  `aitm.co-review.archive/v1` schemas.
- Adding reviewer-claim TTLs, heartbeats, release, reassignment, or abandoned
  claim recovery.
- Adding an index-wide or repository-set-wide author freeze.
- Changing the #1369 cross-worktree runtime and handoff contract.
- Granting reviewer implementation authority. The reviewer role remains
  prohibited from using Bash to edit source, the authoritative artifact,
  protocol state, authority files, or archives even where an indirect command
  cannot be statically resolved.
- Removing ordinary dangerous-command, path-scope, task-state, worktree,
  GitHub-governance, AITM-command, commit-ownership, or installed-guard
  protections.
- Granting Edit, Write, NotebookEdit, or apply_patch authority over source,
  reviewed artifacts, protocol files, authority files, archives, or unrelated
  scratch files.
- Hot-patching an active #1381 co-review runtime or treating evidence produced
  under the constrained boundary as equivalent to evidence produced after the
  correction.

## Trust and Integrity Model

The reviewer provider is a trusted governance principal, not hostile code. A
reviewer is expected to follow its role contract just as an author is expected
not to forge review prose. The implementation provides layered protection
against mistakes and ordinary drift:

1. direct file-writing tools have an exact-path authorization boundary;
2. statically resolved Bash destinations receive protected-path checks;
3. existing non-reviewer mutation restrictions remain in place;
4. protocol commands validate role, provider, session, lock, lifecycle, and
   evidence agreement; and
5. terminal evidence is archived and compared by the protocol.

These controls do not establish independent authenticity against deliberate
same-user Bash tampering. The protocol state and its digests are local mutable
files. Strong adversarial tamper evidence would require one of the explicitly
out-of-scope external or operating-system boundaries. Documentation and error
messages must not claim otherwise.

## Permission Model

### Matching-reviewer Bash

When provider and session identity match the live reviewer grant, co-review
does not deny a command merely because its mutation destinations are ambiguous,
the command is compound, or the command is absent from a single-command
allowlist. Bash continues through the ordinary guards:

- unconditional dangerous-command refusal;
- repository and home-directory path scope;
- active-task worktree binding;
- governed GitHub and issue-lifecycle command policy;
- AITM command-path policy;
- commit ownership; and
- installed-guard self-protection.

The activity guard continues to classify the command. A session-bound live
reviewer grant permits `RUN_TESTS` and `RUN_BUILD` in every valid kanban state,
including Refine, Plan, Review, and Done. It does not grant `WRITE_CODE`,
`COMMIT_CODE`, `WRITE_DOCS`, `WRITE_ISSUE`, or `WRITE_OTHER` beyond what the
ordinary state matrix already permits. The exception is keyed to the verified
reviewer grant, not to a particular state name.

The Bash target extractor remains only as defense in depth. If it resolves a
concrete destination under the co-review runtime, authority files, archive, or
authoritative reviewed artifact, the command is denied. An empty target set or
an ambiguous parse is not itself a refusal for the matching reviewer. The
reviewer handoff states that indirect Bash mutation of protected or source
files violates the reviewer role even when the hook cannot infer the
destination.

Ordinary source and documentation destinations are not added to the co-review
protected-path list. When `classifyBash()` recognizes such a destination, the
unchanged state matrix decides whether it is permitted. Commands whose indirect
effects `classifyBash()` cannot recognize, such as some `sed -i` or embedded
Node writes, may pass under the cooperative-provider trust model. They remain a
reviewer-role violation, not an enforcement guarantee. This makes correct
continuation into activity classification load-bearing even though activity
classification is not a complete shell sandbox.

### Non-reviewer and human-authority behavior

`#1406` does not introduce a new total non-reviewer Bash freeze. In the owning
worktree, when the existing `hasLiveReviewerClaim()` predicate is healthy and
true, non-grant mutation attempts that the current policy detects remain
denied. The current parser treats many `npx`, `npm`, `node`, `sed`, and `find`
commands as ambiguous mutations, so an owner agent is already unable to run
those commands through guarded Bash while the reviewer claim is live. Read,
Glob, and the parser's explicitly read-only Bash shapes remain available.

`#1406` does not repair or widen the existing owner command surface.
Specifically, it does not change the protocol semantics or human authorization
of:

- `co-review status`, `help`, or `wait`;
- `set-max-turns`, `supplement`, or `continue`;
- owner or reviewer `claim` and `handoff` lifecycle commands;
- finalization or authenticated human intervention; or
- #1369 absolute-runtime cross-worktree handoff.

When those commands are invoked through an owner agent's guarded Bash during a
healthy reviewer claim, the current ambiguity policy may refuse them before
the protocol CLI runs. Human invocation outside the agent hook boundary remains
governed by the protocol's authentication and lifecycle checks. The regression
tests must pin this actual baseline rather than describing it as newly
available.

This design neither repairs nor strengthens the current non-reviewer policy
into a repository-set concurrency lock and does not claim that parser blind
spots are eliminated for non-reviewer sessions.

### Direct file-writing tools

Edit, Write, NotebookEdit, and apply_patch continue through
`evaluateCoReviewWrite()`. A live reviewer grant permits only the exact
canonical pending review artifact registered for that provider and session.
The policy continues to reject:

- the reviewed artifact;
- source or documentation outside the pending review file;
- protocol, fleet-authority, and archive files;
- other `.tmp/**` paths;
- mixed targets;
- malformed patches;
- symlink aliases or drift; and
- wrong-provider or wrong-session writes.

These decisions run before ordinary scratch or activity allowances.

### Unreadable or corrupt authority

Index authority and protocol integrity have different failure semantics:

- If the co-review index cannot be read or parsed, the guard cannot determine
  whether any provider owns a claim. Preserve the existing global fail-closed
  result with `co-review-authority-unreadable` for Bash and direct writes.
- If the index is readable but grant resolution itself throws, fail closed with
  `co-review-grant-invalid`.
- If the index is readable and names the current provider/session as reviewer,
  but `statusProtocol().integrity.ok` is false and therefore no live grant
  resolves, deny that indexed claimant's direct file-writing tools with
  `co-review-claim-integrity-invalid`. Do not grant reviewer-specific Bash
  permissions.
- For other providers during protocol-integrity drift, preserve today's
  claim-liveness and ordinary-policy behavior. Do not introduce an index-wide
  freeze.

None of these failures may be reported as the ambiguity refusal. Protocol
integrity drift does not become index unreadability and does not change
`liveActive()` or `hasLiveReviewerClaim()` semantics.

Recovery is an explicit operator boundary: preserve the index and protocol
files, stop the official co-review, and use the manual author/reviewer workflow
until authority is repaired through a separately approved recovery path.
`#1406` does not add that recovery path.

## Architecture Changes

### `activity-guard.mjs`

- Keep direct-write target extraction and `evaluateCoReviewWrite()` for Edit,
  Write, NotebookEdit, and apply_patch.
- Scope the existing `coReview.decision === 'allow'` early exit to direct
  file-writing tools only. Bash context evaluation must never reach that exit.
- Resolve Bash through the dedicated context result. `reviewer-context` records
  the matching live grant and continues into `classifyBash()`; `deny` blocks;
  `not-applicable` follows ordinary classification without reviewer elevation.
- Never interpret `reviewer-context` as permission to skip activity
  classification.
- Permit `RUN_TESTS` and `RUN_BUILD` whenever that matching live reviewer grant
  exists, regardless of the recorded kanban state.
- Apply every other activity class through the unchanged state matrix.
- Do not add a lifecycle-command classifier to the activity guard. Once
  matching-reviewer ambiguity returns `reviewer-context`, generated lifecycle
  commands naturally continue and classify as `READ_*`.
- Preserve existing non-reviewer Bash behavior; do not add a total freeze or a
  new human-command allowlist.

### `bash-guard.mjs`

- Resolve a matching reviewer grant before applying the ambiguity refusal.
- For that matching reviewer only, ignore `ambiguousMutation` and an empty
  target set as denial reasons.
- Return `reviewer-context`, never `allow`, for ordinary matching-reviewer Bash.
- Continue to deny statically resolved protected destinations.
- Keep every subsequent ordinary Bash guard in its existing order for ordinary
  reviewer Bash; matching reviewer authority alone is not an early success
  exit.
- Retain the existing early authorization only for an exact generated
  lifecycle command whose runtime, provider, session, actor, review path,
  reviewed commit, decision, and summary boundary match #1365/#1369 authority.
- Preserve existing non-reviewer and cross-worktree lifecycle behavior.

### Co-review policy modules

Separate the two contracts without changing protocol schemas:

- `co-review-write-policy.mjs` remains the direct file-writing authority;
- a focused Bash-context policy resolves matching reviewer ownership,
  unreadable authority, and concrete protected targets without an ambiguity
  default-deny for that reviewer; and
- the existing non-reviewer decision path remains behaviorally unchanged.

The Bash-context policy has a closed result vocabulary:

- `{ decision: 'deny', code, reason }` blocks the request;
- `{ decision: 'reviewer-context', grant }` marks ordinary matching-reviewer
  Bash for continued guard and activity evaluation; and
- `{ decision: 'not-applicable' }` applies no reviewer elevation and continues
  through ordinary policy.

It never returns `allow`. `allow` remains valid only for the exact pending
review artifact in the direct-write policy and for the Bash guard's existing
strict lifecycle-command compatibility lane. The activity guard's direct-write
`allow` exit cannot consume a Bash-context result.

`mutation-targets.mjs#extractBashWriteTargets` remains only for concrete
defense-in-depth destinations on the matching-reviewer path. Its
`ambiguousMutation` result cannot deny that reviewer.

Add a readable-index claimant lookup that does not require
`statusProtocol().integrity.ok`. It exists only to keep direct file-writing
tools fail-closed for the exact provider/session already named as reviewer when
integrity prevents a live grant. It does not grant Bash elevation, establish a
live claim, freeze other providers, or change lifecycle decisions.

Retain the strict lifecycle-command classifier only for the explicit #1365 and
`#1369` compatibility lane. Rename
`reviewer-co-review-command.mjs` to `co-review-lifecycle-command.mjs` and narrow
its documented purpose to recognizing exact generated status, help, and
reviewer-handoff commands that need target-runtime authorization. It must not
classify or authorize ordinary reviewer Bash. `bash-guard.mjs` consumes this
classifier for the narrow compatibility lane. `activity-guard.mjs` does not;
its matching reviewer receives `reviewer-context`, continues naturally, and
classifies the lifecycle command as `READ_*`. Complete-chain tests prove the
two paths permit the same exact generated command. The protocol CLI remains
responsible for final actor, runtime, review path, reviewed commit, decision,
summary boundary, lock, and lifecycle validation.

### Generated handoffs and documentation

Replace the `Arbitrary Bash remains blocked` reviewer text in
`scripts/review/lib/start.mjs#renderReviewerHandoff`. The generated reviewer
handoff must say:

- Bash inspection, tests, and builds are available to the session-bound
  reviewer under the ordinary guards;
- test/build permission follows the live reviewer grant rather than kanban
  state;
- direct Edit/Write/NotebookEdit/apply_patch writes are limited to the pending
  review artifact;
- the reviewer must not use Bash to mutate source, reviewed artifacts,
  protocol, authority, or archive files;
- protected-path shell checks are defense in depth rather than a hostile-code
  sandbox; and
- co-review lifecycle commands remain validated by the protocol.

Update assertions in `scripts/tests/fixtures/co-review-start-cases.mjs` and
`scripts/tests/fixtures/co-review-handoff-cases.mjs`. Do not change generated
owner waiting, intervention, recovery, or human-authority instructions.

## Command Flow

For matching-reviewer Bash:

```text
Claude Bash request
  -> evaluate Bash context
  -> unreadable index or invalid grant resolution: deny with a distinct code
  -> exact #1365/#1369 lifecycle command:
       validate target-runtime authority through the shared compatibility lane
       then execute the protocol command through the existing narrow path
  -> matching ordinary reviewer: return reviewer-context, never allow
  -> deny a concrete protected destination, if statically resolved
  -> never deny solely for ambiguity, composition, or an empty target set
  -> ordinary bash-guard policies
  -> ordinary activity classification
  -> reviewer-context grants only RUN_TESTS/RUN_BUILD state exceptions
  -> execute or refuse
```

For all other Bash:

```text
Bash request
  -> existing non-reviewer co-review decision path
  -> existing ordinary guard path
  -> no new freeze, exemption set, or cross-worktree rule
```

For direct writes:

```text
Edit/Write/NotebookEdit/apply_patch request
  -> read index and resolve live reviewer provider/session grant
  -> canonicalize every target
  -> matching reviewer: allow only the exact pending review artifact
  -> indexed claimant plus invalid protocol integrity: deny every direct write
  -> otherwise preserve the existing co-review decision
  -> continue through ordinary policy when not already decided
```

For reviewer handoff:

```text
reviewer Bash capability
  -> npx aitm co-review handoff
  -> protocol role, claim, review hash, review-of SHA, lock, lifecycle,
     integrity, and archive validation
```

## Failure Handling

- A pre-fix ambiguity refusal remains attributable to #1406 and must not be
  relabeled as an ordinary repository-policy refusal.
- An ordinary guard refusal remains a normal repository-policy refusal and must
  not be relabeled as a co-review mutation failure.
- Unreadable or malformed index authority fails closed globally with
  `co-review-authority-unreadable`.
- Grant-resolution exceptions fail closed with `co-review-grant-invalid`.
- Protocol-integrity drift preserves current claim-liveness behavior, with one
  targeted addition: a readable index's exact claimed provider/session cannot
  use direct file-writing tools and receives
  `co-review-claim-integrity-invalid`.
- Concrete protected-path writes are denied when statically resolved.
- Artifact or protocol-integrity drift retains its current lifecycle refusal
  behavior; #1406 does not change claim-liveness semantics.
- A lifecycle command from the wrong actor, provider session, runtime, review
  path, or reviewed SHA remains a protocol refusal.
- A dead or abandoned reviewer claim remains an operator escalation under the
  current protocol. #1406 neither worsens it with a total freeze nor introduces
  an unreviewed release mechanism.
- Policy-level results expose the structured `code`. Installed hooks serialize
  the same code in the refusal reason as `[task-tracker:<code>] <reason>` so the
  operator and subprocess tests observe the canonical diagnostic.
- No fallback may impersonate the reviewer, silently repair authority, delete
  evidence, or mutate terminal evidence.

## Test Strategy

### Failing complete-hook-chain regression first

Create an integration test that reads the installed Bash PreToolUse hook list
and invokes the complete chain in its installed order against a real temporary
repository and a live claimed reviewer protocol. The fixture must pin:

- provider and session identity for owner and reviewer;
- the authoritative artifact commit;
- a clean repository checkout at fixture start; and
- `TT_SKIP_NETWORK=1` so commit-assignee or other network work cannot obscure
  the guard result.

Before the fix, a representative pipeline must fail specifically with
`reviewer mutation destinations are incomplete or ambiguous`. This prevents a
fixture, identity, network, or state setup failure from masquerading as the
required red.

After the fix, the claimed reviewer must successfully run through the complete
installed chain:

- a Git or ripgrep pipeline;
- `sed` and `find` inspection;
- `git branch --show-current` or an equivalent Git query;
- a focused `node --test` command;
- a representative build command; and
- reviewer status and handoff commands.

The sequence must reach a durable accepted or changes-requested protocol state
and validate the existing immutable review evidence and archive.

### Grant-scoped activity regression

Focused activity-policy cases must prove:

- ordinary matching-reviewer Bash returns `reviewer-context` and reaches
  `classifyBash()`; it never returns or consumes `allow`;
- `RUN_TESTS` and `RUN_BUILD` are permitted for the matching live reviewer in
  every valid kanban state;
- the same commands retain ordinary state-matrix behavior without that grant;
- no additional write or commit activity class is granted; and
- wrong provider, wrong session, stale lifecycle, unreadable authority, and
  invalid integrity never receive the exception.

### Reviewer and non-reviewer boundary regression

Focused policy and complete-chain cases must prove:

- matching-reviewer ambiguity alone never refuses Bash;
- a concretely resolved write to protocol, authority, archive, or reviewed
  artifact is refused;
- ordinary dangerous-command, path, worktree-binding, governed GitHub, AITM,
  commit-ownership, and installed-guard refusals remain effective;
- concrete source/document writes recognized by `classifyBash()` reach the
  ordinary state matrix rather than bypassing it;
- existing non-reviewer mutation cases retain their decisions, including the
  current ambiguity refusals for guarded owner-agent `npx`, `npm`, `node`,
  `sed`, and `find` shapes during a healthy reviewer claim;
- existing successful exact lifecycle and #1369 cross-worktree cases retain
  their decisions; human protocol commands are tested at their actual current
  hook boundary rather than assumed to be available; and
- direct file-writing tools can write only the pending review artifact and
  still refuse source, reviewed artifact, authority, protocol, archive, mixed,
  malformed, symlink, and wrong-session targets.

Authority-failure cases must separately prove:

- unreadable/malformed index: global fail-closed
  `co-review-authority-unreadable`;
- grant-resolution exception: `co-review-grant-invalid`;
- readable indexed claimant plus protocol-integrity drift: direct writes deny
  with `co-review-claim-integrity-invalid`, Bash receives no reviewer-context,
  and other providers retain current behavior; and
- none of these cases reports the ambiguity refusal.

Unit policy tests pin the structured `code`. Complete installed-hook subprocess
tests pin the serialized `[task-tracker:<code>]` token and reason text emitted
by both guards.

### Zero-drift fixture assertion

The complete-chain fixture must assert that its representative test, build,
and co-review lifecycle leave tracked repository files unchanged. This is a
test-harness honesty check, not a new protocol snapshot contract. In
particular, the assertion covers tracked `.ai-task-manager/**` files without
adding them to protocol state or guard hot paths.

### Explicit test-corpus maintenance

Replace or rewrite
`scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs`
as the complete installed-chain reviewer Bash boundary regression. Move the
remaining strict lifecycle-classifier cases to the renamed
`co-review-lifecycle-command.mjs` test surface. Trim Bash grammar cases from
`scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs`, retain
its direct-write and non-reviewer cases, and add focused tests for the new
Bash-context policy.

Add, move, or remove matching
`scripts/tests/fixtures/test-corpus-post-snapshot/**` records and run
`scripts/tests/unit/meta/test-corpus-membership.test.mjs`. Update
`scripts/task-tracker/test-impact-manifest.json` so changes to the Bash guard,
activity guard, Bash-context policy, lifecycle-command compatibility module,
and handoff renderer select their load-bearing regressions.

### Repository verification

Run focused red/green tests during development, followed by the fast suite,
slow suite, lint, documentation lint, spelling, and formatting before Test
admission.

## Deferred Convergence Concerns

The manual review identified broader co-review concerns that #1406 records but
does not implement:

- dead reviewer claims have no TTL, heartbeat, release, or reassignment path;
- claim liveness currently depends on `statusProtocol().integrity.ok`;
- non-reviewer mutation protection is worktree-scoped and parser-dependent;
- a repository-family concurrency lock must account for #1369 cross-worktree
  actors without freezing unrelated worktrees;
- repository snapshot validation would affect protocol state, events, status,
  archives, compatibility, and guard-path performance; and
- existing v1 runtime and archive compatibility must be explicit before any
  future protocol-schema evolution.

These are convergence-analysis findings, not successor defects created by this
specification. Before #1406 closes, the implementation workflow must hydrate
them into the durable convergence analysis on issue #1381, with a citation to
this specification and no successor issue per individual finding. The #1381
body or a single authoritative #1381 planning comment must enumerate every
bullet above so the concerns survive branch cleanup and later replanning.

## #1365 Disposition

`#1406` supersedes `#1365`'s narrow command exception as the general reviewer
permission model; it does not erase the historical reason `#1365` was accepted.
The strict generated lifecycle-command lane remains for #1369 cross-worktree
compatibility. The Bash guard retains its strict classifier; the activity guard
permits the same command by resolving `reviewer-context` and reaching ordinary
`READ_*` classification. Implementation must annotate the `#1365` plan or
durable issue evidence with that narrowed disposition. Historical commits and
review evidence remain unchanged.

## Rollout and Rollback

Implement and verify this change only in the isolated #1406 worktree. Do not
alter the active #1381 review runtime or its worktree while the constrained
review is preserved as forensic evidence.

After the correction is integrated into the branch used for review, start a
fresh official co-review. The new runtime must use the corrected hook chain
from its first reviewer claim. Do not import or reuse acceptance from a runtime
created under the old boundary.

Disable the repaired official co-review path and return to the manual
author/reviewer workflow if any of these occur:

- a reviewer bypasses an ordinary dangerous, path, worktree, GitHub, AITM,
  commit-ownership, or installed-guard refusal;
- direct file-writing authority expands beyond the pending review artifact;
- a non-reviewer command gains authority it did not have before #1406;
- existing wait, lifecycle, human-authority, or #1369 cross-worktree behavior
  regresses; or
- legitimate deep-review commands remain blocked by a co-review ambiguity
  decision.

Rollback means reverting the #1406 implementation as a governed change and
marking official co-review unavailable pending diagnosis. It must not silently
restore the constrained runtime and count its review as authoritative.

## Acceptance Summary

The change is accepted when a session-bound reviewer can deeply inspect the
repository and run tests and builds in every kanban state through the complete
installed hook chain without an ambiguity-based refusal; ordinary reviewer
Bash returns `reviewer-context` and still reaches activity classification;
direct file-writing tools remain bound to the exact pending review artifact or
fail closed for an indexed claimant whose live grant is invalidated by
integrity; concrete protected Bash destinations and all ordinary guards remain
enforced; and existing non-reviewer, wait, human-authority, lifecycle,
cross-worktree, protocol, and archive behavior shows no regression.

The acceptance evidence must also state the cooperative-provider trust
boundary: this design prevents accidents within the paths it can resolve, but
does not claim adversarial tamper resistance against arbitrary same-user Bash.
