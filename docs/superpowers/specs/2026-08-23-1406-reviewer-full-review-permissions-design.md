# Reviewer Full Review Permissions Design

**Issue:** #1406
**Status:** Revised after manual review; pending second reviewer pass
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
obvious accidental writes, and repository snapshots can detect ordinary drift,
but neither is a security boundary against a provider deliberately modifying
the protocol state and its locally stored digests together.

## Design Goals

1. A claimed reviewer can perform deep repository inspection and execute
   verification through Bash without a co-review shell grammar or ambiguity
   refusal.
2. A claimed reviewer can run tests and builds while the bound issue is in
   Review, in addition to the capabilities ordinary state policy already
   permits.
3. Dangerous-command, path-scope, worktree-binding, governed GitHub, AITM
   command-path, and installed-guard protections remain effective.
4. Direct file-writing tools remain limited to the exact session-bound pending
   review artifact.
5. A non-reviewer provider session cannot hot-patch or otherwise operate on the
   worktree while another provider owns the live reviewer claim; it may only
   observe co-review status or help.
6. Explicitly detected Bash writes to protocol, authority, archive, and
   reviewed-artifact paths remain denied as defense in depth.
7. Owner handoff, reviewer claim, reviewer handoff, and finalization revalidate
   a clean immutable Git snapshot of the repository under review.
8. Protocol role separation, provider/session ownership, locking, evidence
   hashes, and archive validation remain governance controls within the stated
   cooperative-provider trust model.
9. The complete installed hook chain proves the permission boundary.

## Non-Goals

- Treating shell parsing as a tamper-proof sandbox for a malicious or
  compromised same-user process.
- Adding cryptographic signing, a remote authority service, operating-system
  filesystem isolation, or a separately privileged protocol daemon.
- Granting reviewer implementation authority. The reviewer role remains
  prohibited from using Bash to edit source, the authoritative artifact,
  protocol state, authority files, or archives even where an indirect command
  cannot be statically resolved.
- Removing ordinary dangerous-command, path-scope, task-state, worktree,
  GitHub-governance, AITM-command, or installed-guard protections.
- Granting Edit, Write, NotebookEdit, or apply_patch authority over source,
  reviewed artifacts, protocol files, authority files, archives, or unrelated
  scratch files.
- Allowing the author or another provider to continue work in the review
  worktree while the reviewer claim is live.
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
3. non-reviewer sessions are frozen while the reviewer claim is live;
4. protocol commands validate role, provider, session, lock, lifecycle, and
   evidence agreement;
5. lifecycle operations revalidate a clean Git snapshot and immutable artifact
   digests; and
6. terminal evidence is archived and compared by the protocol.

These controls do not establish independent authenticity against deliberate
same-user Bash tampering. The protocol state and its digests are local mutable
files. Strong adversarial tamper evidence would require one of the explicitly
out-of-scope external or operating-system boundaries. Documentation and error
messages must not claim otherwise.

## Permission Model

### Reviewer Bash

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

The activity guard continues to classify the command. A session-bound reviewer
grant adds only `RUN_TESTS` and `RUN_BUILD` while the bound issue is in Review.
It does not grant `WRITE_CODE`, `COMMIT_CODE`, or `WRITE_OTHER`. Commands already
permitted by the ordinary state matrix remain permitted. This makes the
capability claim precise: a focused `node --test`, `npm test`, or build may run
in Review, while unrelated task-state restrictions remain in force.

The Bash target extractor remains only as defense in depth. If it resolves a
concrete destination under the co-review runtime, authority files, archive, or
authoritative reviewed artifact, the command is denied. An empty target set or
an ambiguous parse is not itself a refusal. The reviewer handoff states that
indirect Bash mutation of protected or source files violates the reviewer role
even when the hook cannot infer the destination.

### Non-reviewer sessions during the claim

While another provider/session owns the live reviewer claim, all non-reviewer
Bash is denied except exact non-mutating co-review status and help commands.
This freeze does not depend on recognizing mutation targets, so `sed -i`,
`node -e`, relative-path writes, and other parser blind spots cannot silently
re-open author hot-patching. Read, Glob, and other non-writing inspection tools
may remain available, but the author must not continue work during the
reviewer's turn.

Direct Edit, Write, NotebookEdit, and apply_patch requests from the
non-reviewer session remain denied while the reviewer claim is live.

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

## Repository Snapshot Contract

The owner handoff records the authoritative artifact commit and repository tree
and requires the review worktree to have:

- `HEAD` at the declared reviewed commit;
- an index matching that commit;
- no tracked working-tree changes; and
- no non-ignored untracked files outside the protocol runtime.

Reviewer claim, status, handoff, and finalization revalidate the same snapshot.
Snapshot drift produces a distinct refusal such as
`repository-snapshot-drift`, separate from artifact drift. Tests may create
ignored outputs, but they must not change tracked files or create non-ignored
repository inputs. The protocol never deletes reviewer or user files to repair
drift; it reports the exact paths and requires an explicit operator decision.

This contract ensures that ordinary review reads and test execution use the
same Git snapshot the owner handed off. It detects accidental or cooperative
mid-turn changes at lifecycle boundaries. It does not claim to detect a
malicious process that also rewrites the local protocol authority.

## Architecture Changes

### `activity-guard.mjs`

- Stop feeding Bash ambiguity into `evaluateCoReviewWrite()`.
- Resolve a lightweight co-review Bash context containing live-claim,
  provider/session ownership, and protected-path results.
- Freeze non-reviewer Bash during a foreign live reviewer claim except exact
  status/help observation commands.
- For the matching reviewer, continue into `classifyBash()` and the ordinary
  task-state decision path.
- Permit only `RUN_TESTS` and `RUN_BUILD` as the reviewer-specific Review-state
  override.
- Retain existing direct-write evaluation for Edit, Write, NotebookEdit, and
  apply_patch.

### `bash-guard.mjs`

- Replace the current reviewer-command allowlist and ambiguity refusal with the
  same co-review Bash-context decision used by the activity guard.
- Deny concrete protected destinations as defense in depth.
- Freeze a non-reviewer provider during the live reviewer claim except exact
  status/help observation commands.
- Keep every subsequent ordinary Bash guard in its existing order; a matching
  reviewer context is not an early success exit.

### Co-review policy modules

Split the contracts explicitly:

- `co-review-write-policy.mjs` governs direct file-writing tool envelopes only;
- a dedicated Bash-context policy resolves reviewer ownership, foreign-session
  freeze, observation commands, and concrete protected targets without an
  ambiguity default-deny; and
- `mutation-targets.mjs#extractBashWriteTargets` remains only for concrete
  defense-in-depth destinations. Its `ambiguousMutation` result cannot deny a
  matching reviewer.

Remove `reviewerCommandMismatch()` and all Bash-only grant branches from
`co-review-write-policy.mjs`. Remove
`reviewer-co-review-command.mjs#classifyReviewerCoReviewCommand`; replace it
with a deliberately smaller observation-command recognizer for exact status
and help commands used by the frozen non-reviewer session. Do not retain a
hidden second reviewer Bash allowlist.

### Protocol snapshot validation

Extend protocol state and lifecycle validation with the repository snapshot
contract. Snapshot data is recorded by protocol code, projected into status
and events, revalidated at claim/handoff/finalize, and included in archived
evidence. Snapshot validation reports drift without attempting cleanup.

### Generated handoffs and documentation

Replace the `Arbitrary Bash remains blocked` reviewer text in
`scripts/review/lib/start.mjs#renderReviewerHandoff`. The generated reviewer
handoff must say:

- Bash inspection, tests, and builds are available under the defined ordinary
  guards and Review-state override;
- direct Edit/Write/NotebookEdit/apply_patch writes are limited to the pending
  review artifact;
- the reviewer must not use Bash to mutate source, reviewed artifacts,
  protocol, authority, or archive files;
- protected-path shell checks are defense in depth rather than a hostile-code
  sandbox; and
- co-review lifecycle commands remain validated by the protocol.

Generated owner guidance must state that the owner session is frozen during a
live reviewer claim except for status/help observation. Update the assertions
in `scripts/tests/fixtures/co-review-start-cases.mjs` and
`scripts/tests/fixtures/co-review-handoff-cases.mjs` to match.

## Command Flows

For matching-reviewer Bash:

```text
Claude Bash request
  -> resolve live reviewer provider/session grant
  -> deny a concrete protected destination, if statically resolved
  -> never deny solely for ambiguity or composition
  -> ordinary bash-guard policies
  -> ordinary activity classification
  -> Review-state RUN_TESTS/RUN_BUILD override, when applicable
  -> execute or refuse
```

For non-reviewer Bash during the claim:

```text
Bash request
  -> resolve foreign live reviewer claim
  -> exact status/help observation command: continue through ordinary guards
  -> every other Bash command: refuse before execution
```

For direct writes:

```text
Edit/Write/NotebookEdit/apply_patch request
  -> resolve live reviewer provider/session grant
  -> canonicalize every target
  -> matching reviewer: allow only the exact pending review artifact
  -> non-reviewer during claim: refuse
  -> otherwise continue through ordinary policy
```

For reviewer handoff:

```text
reviewer Bash capability
  -> npx aitm co-review handoff
  -> protocol role, claim, review hash, review-of SHA, lock, lifecycle,
     repository snapshot, integrity, and archive validation
```

## Failure Handling

- A pre-fix ambiguity refusal remains attributable to #1406 and must not be
  relabeled as an ordinary repository-policy refusal.
- An ordinary guard refusal remains a normal repository-policy refusal and must
  not be relabeled as a co-review mutation failure.
- Missing or invalid reviewer authority fails closed for direct file-writing
  tools and reviewer-specific Review-state test/build permission.
- A non-reviewer Bash request during a foreign reviewer claim fails closed
  unless it is an exact status/help observation command.
- Concrete protected-path writes are denied when statically resolved.
- Repository, artifact, or protocol-integrity drift refuses lifecycle
  progress with distinct diagnostics.
- A lifecycle command from the wrong actor, provider session, runtime, review
  path, or reviewed SHA remains a protocol refusal.
- No fallback may impersonate the reviewer, silently repair drift, delete
  evidence, or mutate terminal evidence.

## Test Strategy

### Failing complete-hook-chain regression first

Create an integration test that reads the installed Bash PreToolUse hook list
and invokes the complete chain in its installed order against a real temporary
repository and a live claimed reviewer protocol. The fixture must pin:

- provider and session identity for owner and reviewer;
- a bound issue in Review state;
- the authoritative artifact commit and clean repository snapshot; and
- `TT_SKIP_NETWORK=1` so commit-assignee or other network work cannot obscure
  the guard result.

Before the fix, a representative pipeline must fail specifically with
`reviewer mutation destinations are incomplete or ambiguous`. A separate
assertion must prove that the same-state focused test is refused by the
ordinary Review-state matrix when no reviewer grant exists. This prevents a
fixture, identity, network, or state setup failure from masquerading as the
required red.

After the fix, the claimed reviewer must successfully run through the complete
installed chain:

- a Git or ripgrep pipeline;
- `sed` and `find` inspection;
- `git branch --show-current` or an equivalent Git query;
- a focused `node --test` command while the issue remains in Review;
- a representative build command; and
- the reviewer status and handoff commands.

The sequence must reach a durable accepted or changes-requested protocol state
and validate repository snapshot evidence, immutable review evidence, and the
archive.

### Reviewer and author boundary regression

Focused policy and complete-chain cases must prove:

- matching-reviewer ambiguity alone never refuses Bash;
- a concretely resolved write to protocol, authority, archive, or reviewed
  artifact is refused;
- ordinary dangerous-command, path, worktree-binding, governed GitHub, AITM,
  and installed-guard refusals remain effective for the reviewer;
- only `RUN_TESTS` and `RUN_BUILD` gain a reviewer-specific Review-state
  override;
- foreign owner/provider Bash is frozen during the reviewer claim except exact
  status/help observation; and
- direct file-writing tools can write only the pending review artifact and
  still refuse source, reviewed artifact, authority, protocol, archive, mixed,
  malformed, symlink, and wrong-session targets.

### Repository snapshot regression

Protocol tests must prove that tracked edits, index drift, branch drift, and
non-ignored untracked inputs introduced after owner handoff block reviewer
claim/handoff/finalization with exact diagnostics. Ignored test outputs must not
cause false drift, and the refusal must not delete or rewrite the changed file.

### Explicit test-corpus maintenance

Replace `scripts/tests/unit/task-tracker/core/reviewer-co-review-command-boundary.test.mjs`
with the complete installed-chain reviewer Bash boundary regression. Trim Bash
grammar cases from
`scripts/tests/unit/task-tracker/lib/co-review-write-policy.test.mjs`, retain
its direct-write cases, and add focused tests for the new Bash-context policy
and observation-command recognizer.

Add, move, or remove the matching
`scripts/tests/fixtures/test-corpus-post-snapshot/**` records and run
`scripts/tests/unit/meta/test-corpus-membership.test.mjs`. Update
`scripts/task-tracker/test-impact-manifest.json` so changes to the Bash guard,
activity guard, co-review Bash-context policy, observation recognizer, and
protocol snapshot logic select their load-bearing regressions.

### Repository verification

Run focused red/green tests during development, followed by the fast suite,
slow suite, lint, documentation lint, spelling, and formatting before Test
admission.

## #1365 Disposition

`#1406` supersedes `#1365`'s narrow reviewer-command exception; it does not erase
the historical reason `#1365` was accepted. Implementation must annotate the
`#1365` plan or durable issue evidence to state that its command allowlist and
single-guard regression were superseded by #1406. Historical commits and
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

- a reviewer bypasses an ordinary dangerous, path, worktree, GitHub, AITM, or
  installed-guard refusal;
- a non-reviewer session can execute non-observation Bash during the live
  reviewer claim;
- repository snapshot drift reaches accepted or finalized state;
- direct file-writing authority expands beyond the pending review artifact; or
- legitimate deep-review commands remain blocked by a co-review ambiguity
  decision.

Rollback means reverting the #1406 implementation as a governed change and
marking official co-review unavailable pending diagnosis. It must not silently
restore the constrained runtime and count its review as authoritative.

## Acceptance Summary

The change is accepted when a session-bound reviewer can deeply inspect the
repository and run tests and builds in Review through the complete installed
hook chain without an ambiguity-based refusal; a non-reviewer provider is
frozen during the reviewer claim; direct file-writing tools remain bound to the
exact pending review artifact; concrete protected Bash destinations and all
ordinary guards remain enforced; and lifecycle operations prove a clean,
unchanged repository snapshot through terminal archive publication.

The acceptance evidence must also state the cooperative-provider trust
boundary: this design prevents accidents and detects ordinary drift, but does
not claim adversarial tamper resistance against arbitrary same-user Bash.
