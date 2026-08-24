# SHA-Bound Co-Review Orchestration Design

**Issue:** #1406
**Status:** Claude amendment review changes incorporated; re-review pending
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
capability-policy approach. Manual round 7 accepted the reframed architecture
at `f7b28588` with three non-blocking should-fix items. This revision
incorporated those items without changing the accepted authority model.

Implementation then exposed a false premise in that accepted model. Task 5
could not prove that both participants' terminal evidence was bound to the
provider session that produced it. The CLI resolved provider/session only for a
reviewer claim, the operational co-review index stored only that reviewer pair,
and protocol claims, handoffs, events, state, and archives carried neither
role's durable provider/session evidence. A disposable owner-claim reproduction
also succeeded with every recognized provider session variable removed and
persisted only role, actor, process, host, and time.

The original specification simultaneously required every claimed turn to record
provider/session provenance and prohibited protocol or archive schema changes.
Those statements cannot both be true in the current architecture. This
development amendment corrects that contradiction by making provider/session
provenance an additive version-1 profile owned by the protocol. It does not
restore capability policing or create a successor defect.

Independent Claude Opus 5 review of amendment commit `ada007b7` returned
changes requested with findings A1-A5 and B1-B5. This revision incorporates all
ten findings: cache upsert and failure taxonomy, provider-native session
resolution, cross-role session separation, imported-unclaimed initialization,
handoff-sourced archive provenance, complete envelope naming, legacy re-init
refusal, named replay refusal, explicit #1381 ancestry, and #1406-specific
Plan-approval wording. The corrected commit requires independent re-review.

## Development Amendment

The amendment preserves the reviewed implementation already completed on the
issue #1406 branch:

- `b57c04c3` — one-worktree protocol roots;
- `de5fcdd6` — clean tracked state and single-artifact handoffs;
- `0fb856d5` — co-review capability-policy retirement;
- `6bc346cc` and `623ec40b` — generated relay and reviewer-write guidance; and
- `079d1125` and `495c0496` — routed handoff-idempotency repair and refusal
  semantics.

The remaining implementation must first add authoritative claim provenance,
then resume installed-chain and A-to-B acceptance. Issue #1406 remains in
Develop: the sanctioned lifecycle has no Develop-to-Plan transition, and
`plan-approve` cannot mint a second approval for #1406 in Develop. Its narrow
out-of-Plan forecast-backfill branch does not apply because #1406's existing
approval already freezes a forecast record. The historical
`aitm-plan-approved` marker therefore remains untouched and is not represented
as approval of this amendment. Approval of the exact revised specification and
plan will instead be recorded visibly in those artifacts, in updated Plan
Metadata, and in a durable issue comment.

The focused forecast increases from 13 to 17 hours. The frozen XL/32-hour board
estimate is not reduced. In the #1381 convergence discovery chain, #1406 is the
first and final defect hop for this concern; it creates no successor defect. A
new in-scope failure is repaired in its owning plan task; an unowned failure
reopens this specification and plan as flawed. Deferred convergence
observations remain only in #1381.

## Problem

AITM currently treats co-review as both:

1. an orchestration and evidence protocol; and
2. a same-user capability sandbox for the reviewer and waiting author.

The orchestration protocol records useful authority: artifact commit and hash,
roles, ordered rounds, immutable responses and reviews, explicit decisions,
locks, turn budgets, waits, and terminal archives. It intends to record
provider/session provenance, but current production stores only reviewer
provider/session in an operational occupancy index. That cache is not immutable
protocol or archive evidence and contains no owner provenance.

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

Every new runtime declares the additive profile
`claimProvenance: "provider-session/v1"`. The profile keeps the existing
version-1 state, event, start-manifest, prepared-archive, and terminal-archive
envelopes while making provider/session evidence mandatory for new claims,
handoffs, and terminal archives. The protocol is the authority; the co-review
index remains an operational occupancy cache.

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
11. Persist and validate each role's exact provider/session claim through the
    handoff and terminal archive that contain its evidence.

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
- Adding repository-wide snapshot state or introducing new protocol, event, or
  archive envelope versions. #1406 makes a focused additive v1 extension.
- Migrating or reusing an active legacy runtime that lacks the provenance
  profile.
- Treating provider/session evidence as cryptographic provider attestation or a
  defense against a malicious same-user process.
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

Owner and reviewer identities remain distinct. For a profiled runtime, the CLI
first resolves the active provider adapter, then resolves `sid` only from that
adapter's declared provider-native `sessionIdEnvKeys`. It does not accept
`AI_TASK_MANAGER_SESSION_ID`, another adapter's key, a transcript-basename
fallback, or `default-session` as profiled co-review provenance. Claude and
Codex therefore use their native session environment keys as required inputs
for profiled turns even though their general task-tracker adapters retain legacy
fallback behavior; Grok retains its existing required native key. A missing
native value refuses with `co-review:provider-session-id-required` before every
claim and handoff.

The protocol library receives the resolved provider and `sid` as required
inputs; an arbitrary configured actor name is not a substitute. The pair
`{provider, sid}` is the session identity because session-ID namespaces are
provider-specific.

The live claim is:

```js
{
  revision,
  role,
  actor,
  provider,
  sid,
  pid,
  host,
  at,
}
```

The claim event stores that exact record. A successful owner or reviewer
handoff requires the caller's provider and `sid` to equal the live claim, then
copies an immutable claim reference into the handoff before clearing
`state.claim`. That reference contains the claim revision, role, actor,
provider, `sid`, and claim timestamp. The corresponding response or review is
therefore attributable to one persisted turn claim rather than merely to a
freely supplied actor string.

An exact claim retry from the same provider/session is idempotent. A different
provider/session cannot take over an already claimed turn and receives
`co-review:claim-conflict`. At each new claim after a peer handoff, the proposed
`{provider, sid}` must differ from the opposite role's claim reference on that
handoff; equality refuses before state advance with
`co-review:session-role-conflict`. The same owner session and same reviewer
session may each reclaim their own later rounds, but one provider session cannot
serve both roles.

Exact handoff replay also requires the provider/session recorded by the
completed handoff; a second session cannot replay another session's submission.
A live or replayed handoff whose provider/session differs from its claim
reference refuses with `co-review:handoff-session-mismatch`. Wrong actor,
provider, session, runtime, canonical worktree, round, review path, claim
reference, or `review-of` commit is a protocol refusal.

Provider/session values are opaque audit identifiers, not credentials. The
protocol never persists access tokens or transcript contents. Environment-based
provider detection remains cooperative host provenance, not cryptographic
attestation against a malicious same-user caller.

The claim controls protocol mutation, not general tool permissions. A session
may inspect files and execute verification without asking the co-review policy
for permission. Only a successful protocol handoff can advance the review.

### Provenance profile and legacy compatibility

New initialization always records
`state.initialization.claimProvenance = "provider-session/v1"`. State, event,
handoff, start-manifest, prepared-archive, and terminal-archive validation treat
the profile as a fail-closed contract: if it is present, every required
provider/session and claim-reference field must be present and internally
consistent, except for the single explicitly marked imported-unclaimed
initialization handoff defined below.

Existing version-1 runtimes and archives without the profile remain readable.
An already accepted legacy runtime may use its existing finalization path, but
an active legacy runtime cannot claim or hand off after upgrade. It refuses with
`co-review:provenance-profile-required` and directs the operator to start a
fresh runtime. #1406 does not synthesize missing provenance, migrate an active
turn, or count legacy evidence as fresh-runtime acceptance. Re-initializing an
existing profile-less runtime also refuses with that same diagnostic before the
exact-JSON initialization comparison; it is not silently upgraded and does not
return a misleading idempotent success. Exact re-initialization remains
idempotent only when the existing runtime already carries the same profile and
initialization record.

Imported-review initialization remains supported because it is input context,
not a claimed turn. Its single synthetic initial reviewer handoff records
`provenance.mode = "imported-unclaimed/v1"` plus the existing imported review
path, digest, exact `review-of` commit, and initialization time; it carries no
invented provider or `sid`. This is the only profiled handoff allowed without a
provider-session claim reference. The existing `maxReviewTurns >= 2` rule
ensures a later real reviewer claim and handoff before reviewer-consensus or
human-good-enough acceptance. Terminal evidence selection must reject an
imported-unclaimed handoff, so imported evidence cannot satisfy #1406's
fresh-runtime acceptance or appear as either selected role provenance in a
profiled terminal archive.

The main-worktree co-review index remains an operational cache for reviewer
occupancy. It is not a provenance ledger. The CLI first persists the reviewer
claim through `claimTurn()`, then derives the cache update from the returned
authoritative state and claim. The post-claim operation is an upsert under the
index lock: it re-registers an absent row from the authoritative protocol state,
repairs a same-identity stale lifecycle row, and then records the reviewer
claim. A row whose registration identity conflicts with protocol state is never
overwritten.

If a retryable filesystem publication failure occurs after the protocol claim,
the CLI exits 1 with `co-review:index-publication-pending`, states that the
claim is durable, and prints the identical claim retry. That retry appends no
second claim event and reattempts only the cache upsert. An unreadable index or
conflicting registration identity exits 1 with
`co-review:index-authority-conflict`; the claim remains durable, the suspect
cache bytes are preserved, and automatic retry is not represented as repair.
The operator must restore or rebuild the operational cache from authoritative
protocol state before occupancy can be granted. The owner does not receive a
second index row, and the single-row task occupancy store is not used to infer
either role's terminal evidence provenance.

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
command and approval evidence. The additive fields introduced by #1406 record
agent claim provenance only and create no human-approval field or marker.

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
  -> resolves a real owner provider/session and claims the owner turn
  -> commits artifact A
  -> proves clean tracked state and HEAD A
  -> writes immutable owner response
  -> hands off A
  -> starts a bounded repeated-wait episode

reviewer session
  -> starts in the same canonical worktree at clean HEAD A
  -> a wait poll wakes and status identifies A
  -> resolves a distinct real reviewer provider/session and claims the turn
  -> reads A and owner response directly from recorded paths
  -> performs unrestricted deep review under ordinary guards
  -> writes immutable reviewer review citing A
  -> hands off changes-requested or accepted
  -> starts a new bounded repeated-wait episode when active

author session
  -> a wait poll wakes and status identifies the exact review
  -> reclaims with its real provider/session
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
- required provider/session claim profile and exact claiming-session handoff
  rule;
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
- Do not recognize or classify co-review lifecycle commands after retirement.
  The Bash guard's only co-review obligation is to avoid an early exit or path
  scope expansion; canonical-worktree enforcement belongs to the protocol.

### `runtime-root.mjs` and `protocol.mjs`

- Change `resolveRuntimeRoot()` from a linked-worktree resolver into the
  one-worktree boundary. Resolve the canonical caller root and derive the
  target runtime root from the runtime path's nearest existing ancestor so a
  not-yet-created runtime is still checked. Refuse unless
  `callerRoot === root`; delete the same-common-directory acceptance branch.
- Remove the now-unused `commonDirectory()` operation from
  `REAL_REPOSITORY_BOUNDARY`, its memory fixture, and its focused boundary
  tests.
- Route initialization through `protocolRoot()` instead of calling
  `repositoryRoot(cwd)` directly. Keep `protocolRoot()` as the single protocol
  entry point that converts a mismatch into a `repository-identity` refusal.
  Initialization, status, claim, wait, handoff, intervention, finalization, and
  archive-snapshot commands therefore cross the same caller-root check.
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
claim-liveness behavior used by `allowsCoReviewOccupancy()` as an operational
reviewer-occupancy check; it is not protocol evidence authority.

### `co-review.mjs` and `index.mjs`

- Add a co-review-specific resolver that detects the active provider and reads
  only that adapter's provider-native `sessionIdEnvKeys`. Do not call the
  general task-tracker fallback chain for profiled claims or handoffs. Pass the
  resulting provider and `sid` into the protocol library; actor alone is
  insufficient.
- Move reviewer-index preparation after the authoritative protocol claim. Build
  its provider, `sid`, role, round, and pending-review path from the returned
  persisted claim rather than from pre-mutation assumptions.
- Replace the update-only reviewer-claim write with an atomic upsert that accepts
  authoritative protocol state plus its returned claim. Re-register an absent
  row, repair stale fields only when registration identity matches, and refuse
  conflicting identity or an unreadable store without rewriting it.
- Convert retryable post-claim publication failure to
  `co-review:index-publication-pending` with exit 1 and the exact retry command.
  Convert unreadable or conflicting cache authority to
  `co-review:index-authority-conflict` with exit 1 and no claim that retry alone
  will repair it.
- Keep `recordReviewerClaim()` reviewer-specific because it supports the
  occupancy exception, not evidence authority. Do not add an owner row or treat
  `claimedProvider`/`claimedSid` as terminal provenance.
- Extend human-readable and JSON status surfaces to expose the live claim's
  role, actor, provider, `sid`, revision, and time without exposing credentials
  or transcript contents.

### Protocol and generated handoffs

- Preserve SHA, blob, digest, role, lock, round, decision, budget, and archive
  validation. Make the previously asserted provider/session relationship real
  through the additive provenance profile.
- Stamp new initialization and start manifests with
  `claimProvenance: "provider-session/v1"` while retaining the version-1 state,
  event, start-manifest, prepared-archive, and terminal-archive envelope names.
- When an existing runtime lacks the profile, refuse re-initialization before
  `sameInitialization()` with `co-review:provenance-profile-required`. Preserve
  exact idempotent initialization for already-profiled identical state.
- Represent the initial handoff created by `--import-review` as
  `imported-unclaimed/v1`, never synthesize provider/session for it, and prohibit
  that synthetic record from terminal evidence selection.
- Extend `claimTurn()` with required `provider` and `sid` inputs. Persist the
  complete claim in state and the claim event, including the claim revision.
  Same-actor replay is idempotent only when provider and `sid` also match.
- Refuse a new claim when its `{provider, sid}` equals the opposite role's most
  recent handoff claim reference. Preserve each role's ability to reuse its own
  persistent session in later rounds.
- Extend both handoff APIs with required `provider` and `sid` inputs. Compare
  them to the live claim before consuming evidence; copy the exact claim
  reference into the handoff before clearing `state.claim`.
- Extend handoff replay recognition to compare the recorded provider/session
  and claim reference. Preserve the existing stale-event refusal rule so only
  the immediately completed matching handoff is replayable.
- Extend event/state integrity checks so a profiled live claim and a profiled
  completed handoff agree with their corresponding event records.
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
- Extend terminal archive evidence for both `ownerResponse` and
  `reviewerReview` with role, actor, provider, `sid`, claim revision, claim time,
  and handoff revision. Copy the provenance profile into the manifest and
  validate the complete relationship before preparation, publication, or
  foreign-archive recovery.
- Source each evidence record only from the claim reference embedded in that
  role's selected handoff event. Never re-resolve the current environment, copy
  from `state.roles`, or consult the co-review or occupancy index. Any mismatch
  between selected handoff provenance and manifest evidence refuses before
  preparation, publication, and recovery.
- Accept a profile-less version-1 archive only as legacy evidence. A profiled
  manifest with missing or mismatched provenance is invalid, and a profiled
  runtime cannot emit a legacy-shaped archive.

### Operator guidance

- Update `docs/guides/github-native-coordination.md` and
  `docs/guides/grok-provider.md` to remove the exact-pending-review-artifact
  capability policy and describe normal repository capabilities, cooperative
  reviewer role separation, the one-worktree protocol boundary, and immutable
  SHA-bound evidence.
- Update provider/documentation coverage assertions to match the retired
  modules and replacement guidance. Historical specifications, plans, reviews,
  and evidence remain immutable.

## Failure Handling

- Wrong artifact, commit, blob, digest, actor, provider, session, round,
  review path, claim reference, or decision refuses the protocol mutation with
  no state change.
- A missing provider-native session key, a general orchestrator override without
  that native key, a transcript-derived basename, a fallback value, or a
  malformed provider/session refuses claim or handoff before evidence is
  consumed or state is advanced.
- A profiled claim may be retried only by the same actor, provider, and `sid`.
  A conflicting caller receives `co-review:claim-conflict`; there is no implicit
  takeover, release, or reassignment.
- One `{provider, sid}` cannot serve both roles. Equality with the opposite
  role's latest handoff claim reference receives
  `co-review:session-role-conflict` before mutation.
- A handoff or handoff replay from a provider/session other than the recorded
  claim receives `co-review:handoff-session-mismatch` before evidence is
  consumed or replay success is returned.
- A retryable reviewer-index publication failure after a successful protocol
  claim reports `co-review:index-publication-pending`, exit 1, and the exact
  retry. The retry appends no second event and reattempts only the cache upsert.
  An unreadable or identity-conflicting cache reports
  `co-review:index-authority-conflict`, exit 1, preserves both protocol and
  cache evidence, and requires operator repair rather than promising that retry
  will converge.
- An active profile-less runtime refuses claim and handoff with
  `co-review:provenance-profile-required`. Status remains readable, and an
  already accepted legacy runtime retains its existing finalization path.
  Re-initialization of a profile-less runtime receives the same refusal; it is
  not silently upgraded.
- An imported-unclaimed initialization handoff is allowed only as the single
  synthetic initial context record. It cannot be selected as profiled terminal
  owner/reviewer evidence or satisfy fresh-runtime acceptance.
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
- A profiled archive missing either role's provider/session provenance, or
  disagreeing with the selected claim, handoff, participant, evidence, or event
  relationship, is refused as invalid. The writer never silently downgrades a
  profiled runtime into a legacy manifest or re-derives provenance at archive
  time.
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
nested-worktree calls, including initialization when the target runtime folder
does not exist yet. Every protocol verb, including initialization, must inherit
the `callerRoot === runtimeRoot` refusal through `protocolRoot()`; no special
Bash shape may bypass it. Imported-review tests must refuse a reachable ancestor
and accept only `review-of === HEAD` at initialization.

Repository-boundary contract tests must cover `trackedChanges()` and
`changedPathsBetween()` in both the real Git boundary and the in-memory fixture,
while preserving the fixture's zero Git and zero Node subprocess assertion.

### Provider/session provenance regression

Focused protocol and CLI tests must prove:

- new initialization stamps the provenance profile in state and the start
  manifest without changing the version-1 envelope names;
- profiled owner/reviewer commands accept only the active adapter's native
  session key and refuse a global orchestrator override alone, another
  adapter's key, a transcript-derived basename, or a fallback value;
- each persisted claim event contains the exact role, actor, provider, `sid`,
  claim revision, process, host, and timestamp from `state.claim`;
- an exact same-session claim retry is idempotent, while another provider or
  `sid` receives a pre-mutation conflict;
- an owner and reviewer cannot use the same `{provider, sid}`, while each role
  can reclaim its own persistent session in later rounds;
- both handoffs require the provider/session that owns the live claim, copy the
  exact claim reference, and reject another session before reading new evidence;
- exact handoff replay requires the recorded provider/session and claim
  reference, returns `co-review:handoff-session-mismatch` for another session,
  and keeps stale or conflicting replay refused;
- event/state integrity detects missing or altered claim provenance;
- reviewer-index publication occurs after protocol claim, derives its inputs
  from that claim, upserts an absent or same-identity stale row, and is
  repairable through an identical retry after injected transient publication
  failure;
- unreadable and identity-conflicting index fixtures preserve their bytes and
  produce terminal cache-authority diagnostics without undoing or duplicating
  the durable protocol claim;
- imported review initialization records imported-unclaimed provenance, still
  enforces exact-HEAD import, and cannot supply selected profiled terminal
  evidence;
- exact re-initialization succeeds for an identical profiled runtime but a
  profile-less runtime receives the profile-required refusal before the
  initialization sameness check; and
- an active legacy runtime refuses mutation, while status and already-accepted
  legacy finalization remain compatible.

Archive tests must prove that a fresh profiled A-to-B relay preserves distinct
owner and reviewer provider/session identities through claim events, handoffs,
prepared evidence, publication, deterministic reinspection, and foreign-archive
recovery. Delete or alter each provenance field in turn and require a precise
refusal. They must also prove each manifest provenance record is copied from its
selected handoff claim reference and never from the current environment,
configured actor strings, or either operational index. Existing profile-less
archive fixtures remain readable only through the explicit legacy path and
cannot satisfy the fresh-runtime acceptance case.

Provider adapter tests must prove the concrete native-key contract for Claude
(`CLAUDE_CODE_SESSION_ID` or `CLAUDE_SESSION_ID`), Codex (`CODEX_THREAD_ID` or
`CODEX_SESSION_ID`), and Grok (`GROK_SESSION_ID`) across owner claim, reviewer
claim, owner handoff, and reviewer handoff. General task-tracker legacy fallback
behavior stays unchanged outside profiled co-review. The test environment
supplies opaque fake IDs; no credential or transcript content enters fixtures.

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
   provider/session, claim reference, round, decision, and SHA relationship.
   Existing session timing evidence separately proves the bounded wait episodes;
   the additive provenance profile does not copy elapsed timing or transcript
   content into the archive.
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
12. Initialization from the main root into a nested linked worktree runtime, or
    from one sibling worktree into another, is refused before protocol files are
    created, including when the requested runtime folder does not yet exist.

### Human-authority semantics

Tests must prove that session routing creates no human review-approval marker,
that existing authenticated continuation evidence retains its current narrow
meaning, and that only the explicit repository review-approval workflow can
create human semantic-approval evidence.

### Test-corpus maintenance

Remove or rewrite reviewer mutation-parser and co-review write-policy tests.
Update `scripts/tests/fixtures/test-corpus-post-snapshot/**` and
`scripts/tests/unit/meta/test-corpus-membership.test.mjs` expectations. Remove
the retired-module required-asset assertions from
`scripts/tests/unit/meta/package-test-corpus.test.mjs` and
`scripts/tests/unit/providers/coverage-provider-adapter.test.mjs`; update the
latter's operator-guidance assertion for the replacement model. Add a net-new
`scripts/task-tracker/test-impact-manifest.json` rule whose sources cover the
Bash guard, activity guard, source-edit gate, runtime-root resolver, repository
boundary, co-review protocol, archive path, handoff generator, and updated
operator guides, and whose tests cover the new load-bearing integration and
focused regressions.

Run focused red/green tests, then the fast suite, slow suite, lint,
documentation lint, spelling, and formatting before Test admission.

## Deferred Convergence Concerns

After the specification and implementation plan receive independent review
acceptance, the #1406 author must update #1406 Plan Metadata to their exact
commits, record the human-approved development amendment in a durable issue
comment, and hydrate the reviewed references and findings below into the single
durable convergence analysis on issue #1381. The existing Plan-approval marker
is historical and is neither replaced nor reinterpreted. No successor issue is
created for an individual finding:

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
must present distinct real provider/session identities, retain those identities
through their handoffs, and start their bounded repeated-wait episodes. Do not
import acceptance from an old or profile-less runtime.

Disable official co-review and return to the manual relay if:

- ordinary dangerous, path, worktree, GitHub, AITM, commit-ownership, or
  installed-guard protection regresses;
- an artifact can inherit approval from another commit;
- wrong-role or wrong-session evidence advances the protocol;
- either terminal evidence record lacks its exact claim provider/session;
- a profiled runtime or archive can silently downgrade to legacy provenance;
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
session through an immutable claim and handoff reference; ordinary repository
guards must retain their behavior; terminal evidence must be complete and
idempotent; and routing or continuation by the human must never be mislabeled as
human semantic approval.
