# Governed PR Delivery Design

**Issue:** #939
**Date:** 2026-08-21
**Status:** Approved in discussion; awaiting written-spec review
**Branch:** `codex/939-full-auto-merge`

## Problem

AITM's Full-Auto PR path cannot reliably deliver an approved story to trunk.
The current implementation attempts to enable GitHub auto-merge from
`/task close`, but the Review-to-Done guard first requires the story's
attributing commit to exist on `origin/trunk`. An off-trunk PR therefore fails
the guard before the merge code is reachable.

Moving the merge block earlier inside `close` would not repair the design:

1. `gh pr merge --auto` is asynchronous. Enabling it does not make the commit
   immediately visible on `origin/trunk`, so the same invocation would race the
   trunk-presence guard.
2. `close` currently emits terminal timing evidence, rolls up fields, and
   flushes the issue queue before it attempts the merge. A merge failure can
   leave terminal-looking audit evidence on an open, undelivered issue.
3. Claude Code's auto-mode classifier blocks both immediate and `--auto`
   `gh pr merge` Bash commands independently of Bash allow rules. Hiding the
   operation behind shell or Node indirection would evade a host safety policy
   and is prohibited.
4. AITM's Node process cannot call host-owned connector tools. The active agent
   can call those tools, so any portable solution needs an explicit,
   machine-readable handoff between the script-backed workflow and the host
   adapter.

The installed GitHub integration supplies a sanctioned
`merge_pull_request` operation. It accepts an expected head SHA, an explicit
merge method, and optional commit title and message. GitHub rejects stale-head
merges and independently enforces the repository ruleset. A zero-risk probe
against already-merged PR #1363 confirmed that the provider operation is
available and idempotently reports the existing merge result.

The architectural defect is therefore not only command choice or source order.
AITM conflates **delivery** (put the reviewed artifact on its authoritative
parent branch) with **closure** (finalize timing, move the board, classify the
outcome, and close the issue).

## User Story

As an operator delegating reviewed PR work to Full-Auto,
I want AITM to deliver the exact reviewed PR head through a sanctioned provider
action before it closes the story,
So that unattended batches can reach trunk without classifier evasion, stale
head risk, or partial terminal audit state.

## Goals

1. Make delivery a distinct, governed operation while the issue remains in
   Review.
2. Merge only the exact reviewed PR head after required checks are green.
3. Use host-provided GitHub integration tools instead of classifier-blocked
   merge commands.
4. Preserve a durable intent and independently verified delivery receipt on the
   issue.
5. Keep `/task close` responsible only for terminal workflow mutations.
6. Make every step idempotent and recoverable after interruption, compaction,
   provider failure, or ambiguous transport output.
7. Preserve commit-attribution behavior for solo stories and squash-delivered
   epics.
8. Keep the existing eight-state lifecycle unchanged.

## Non-goals

- Adding a ninth Delivery board state.
- Bypassing or disguising a classifier-blocked Bash command.
- Embedding provider credentials or a GitHub SDK inside AITM.
- Replacing GitHub branch rules, required checks, or mergeability enforcement.
- Auto-approving human review without the existing Full-Auto approval audit.
- Changing child-to-epic local delivery or the authorized local-trunk lane.
- Making a connector response authoritative without verifying GitHub live state.
- Building a general workflow engine for arbitrary provider actions.

## Decision

Add a `/task deliver #N` operation that runs while a PR-delivered issue remains
in Review. Delivery is not a state transition. It is a two-phase governed
transaction:

```text
Review + approved exact SHA + green CI
  -> /task deliver #N
  -> durable delivery intent
  -> structured provider-action request
  -> host GitHub integration merges expected head SHA
  -> /task deliver #N (retry/finalize)
  -> verify live PR + fetch origin/trunk + verify attribution
  -> durable delivery receipt
  -> /task close #N
  -> terminal timing + Done + Delivered + issue closed
```

`/task close` no longer initiates or enables a PR merge. For a top-level issue
with a PR delivery path, it requires a valid receipt and independently retains
the existing trunk-attribution guard. The receipt explains how delivery
happened; the live trunk check proves where the result exists.

## Lifecycle Boundary

Delivery is an operation within Review:

```text
Develop -> Test -> Review
                    |
                    +-- review approval
                    +-- deliver exact PR head
                    +-- delivery receipt
                    +-- close -> Done
```

The issue remains open and its board status remains Review throughout the
delivery transaction. Delivery does not write terminal timing rows, completion
estimates, Done markers, disposition, or lifecycle checkboxes.

Child issues that deliver to an epic branch continue through the existing
`merge-back` path and do not invoke provider PR delivery. The top-level story or
epic that owns the trunk PR invokes `/task deliver` once for that PR.

## Command Contract

### `/task deliver #N`

The command is deliberately re-entrant. The same invocation handles every
recoverable phase:

- no intent and PR open: validate, persist an intent, emit the provider action;
- pending intent and PR open at the same head: re-emit the same action;
- pending intent and PR already merged: verify and write the receipt;
- valid receipt already present: verify it still agrees with live GitHub and
  return success;
- PR merged before AITM created an intent: verify the merge and create a
  recovery receipt that names the observed external delivery.

No `--force`, `--steal`, or unchecked receipt-acceptance mode is provided.
Every first emission and re-emission reruns the live delivery preflight. A
pending intent authorizes no mutation by itself; it must still agree with the
current PR head, accepted review SHA, checks, ownership, and configuration.

### Structured action output

When external action is required, stdout contains one parseable line and a
human-readable explanation:

```text
AITM_PROVIDER_ACTION_REQUIRED: {"schema":1,"intentId":"...","action":"github.merge-pull-request","repository":"owner/repo","issueNumber":939,"prNumber":1234,"baseRef":"trunk","headRef":"codex/939-full-auto-merge","expectedHeadSha":"<40-hex>","mergeMethod":"squash","commitTitle":"[#939] ...","commitMessage":"..."}
```

The command exits with a dedicated documented code. The exit means "workflow
paused for an adapter action," not failure and not proof of delivery.

The shared task rule defines the action schema and retry behavior. Each provider
adapter maps `github.merge-pull-request` to its sanctioned GitHub integration
when available. A provider without that capability reports the exact missing
capability and leaves the intent pending for another provider or a human merge.
It never falls back to a hidden `gh pr merge` invocation.

## Delivery Preflight

Before writing an intent, AITM verifies all of the following from live state:

1. The command targets the active issue and the timer is running.
2. The issue is open, in Review, and assigned to the local singleton owner.
3. Required agent review and human or Full-Auto approval evidence is present.
4. The issue is a top-level trunk delivery, not a child that delivers to an epic
   branch.
5. Exactly one PR is associated with the current governed branch.
6. The PR is open, not draft, and targets the configured trunk branch.
7. The PR head branch matches the governed worktree branch.
8. The local HEAD, remote PR head, Test receipt SHA, and accepted review SHA
   agree exactly.
9. The PR is mergeable and every required check for that exact SHA is green.
10. The worktree has no issue-scoped dirty overlap.
11. The configured merge method is permitted by repository settings.
12. The deterministic merge title/message preserve required issue attribution.

Unknown mergeability, unreadable checks, ambiguous PR selection, or provider
configuration failure blocks before the intent is written.

## Merge Method and Attribution

Provider-mediated immediate merge is the primary Full-Auto transport. The
workflow already waits for CI before delivery, so immediate merge avoids the
additional asynchronous state and head-drift window of auto-merge. GitHub still
enforces required checks and branch rules at the mutation boundary.

The existing `fullAutoMerge.mergeMethod` setting remains the merge-method
authority. Provider delivery adds a `provider-action` mechanism:

```jsonc
"fullAutoMerge": {
  "mechanism": "provider-action",
  "mergeMethod": "squash"
}
```

`local-trunk-lane` remains available only with its current explicit operator
authorization. The classifier-blocked `gh-auto-merge` mechanism is deprecated
and rejected for new Full-Auto PR delivery after the migration window.

For squash delivery, AITM supplies deterministic commit text rather than
depending on mutable repository defaults:

- the title begins with the top-level `[#N]` token;
- the message contains the validated attribution tokens required by the
  current commit trail, including child tokens for an epic;
- the PR number and source head SHA are included as provenance;
- the provider may not invent or normalize the text.

For merge or rebase delivery, AITM still validates that the resulting trunk
history preserves every required attribution token.

## Durable Intent

The intent is an append-only GitHub issue comment. Local state may cache its ID
for fast retry, but the issue comment is authoritative across sessions and
providers.

Schema 1 records:

```json
{
  "schema": 1,
  "intentId": "01...",
  "issueNumber": 939,
  "repository": "owner/repo",
  "prNumber": 1234,
  "baseRef": "trunk",
  "headRef": "codex/939-full-auto-merge",
  "expectedHeadSha": "40-hex",
  "mergeMethod": "squash",
  "attributionTokens": ["#939"],
  "commitTitle": "[#939] deterministic title",
  "commitMessage": "Deterministic bounded delivery message",
  "commitTitleSha256": "64-hex",
  "commitMessageSha256": "64-hex",
  "provider": "codex",
  "sessionId": "provider-session-id",
  "createdAt": "ISO-8601"
}
```

The visible comment explains that delivery is pending and names the PR and
expected head. A hidden `aitm-delivery-intent` marker carries canonical JSON.
The authoritative record stores the exact bounded commit title, commit message,
and sorted attribution-token set. Their hashes provide an integrity check; they
are not a substitute for recoverable bytes. The same strings are re-emitted in
the structured action output after AITM verifies their hashes. Local scratch may
cache the record but is never required to reconstruct it.

The deterministic message is intentionally bounded. It carries the validated
issue tokens and delivery provenance, not a copy of every source commit body.
This keeps the issue comment below GitHub limits while preserving the tokens the
message-based attribution engine requires.

Only one pending intent may exist for an issue. A new PR head never updates the
old intent in place. AITM records it as superseded and creates a new intent only
after fresh Test, review, and check evidence covers the new SHA.

## Provider Action

The adapter calls the provider's sanctioned GitHub merge operation with the
intent bytes:

```text
repository_full_name = intent.repository
pr_number             = intent.prNumber
expected_head_sha     = intent.expectedHeadSha
merge_method          = intent.mergeMethod
commit_title          = exact authorized title
commit_message        = exact authorized message
```

An expected-head mismatch is a hard refusal. The agent does not refresh the SHA
and retry; it returns to AITM so the old intent can be superseded through the
governed path.

The connector result is useful diagnostic data but not lifecycle authority.
After any success, failure, timeout, or ambiguous result, the adapter reruns
`/task deliver #N`. AITM then determines truth from GitHub.

## Delivery Verification and Receipt

AITM finalizes an intent only after all of these checks pass:

1. The PR is closed with `merged=true`.
2. The PR's recorded pre-merge head equals the intent's expected head SHA.
3. The merge method agrees with the intent where GitHub exposes it.
4. The merge commit SHA is available.
5. `git fetch origin <trunk>` succeeds without mutating local `trunk`.
6. The merge commit or resulting trunk history is reachable from
   `origin/trunk`.
7. Message-based attribution on `origin/trunk` contains the top-level issue and
   every required child token.
8. The observed merge happened after the intent was created, unless this is an
   explicitly classified already-merged recovery receipt.

The completion record is another append-only issue comment:

```json
{
  "schema": 1,
  "intentId": "01...",
  "issueNumber": 939,
  "prNumber": 1234,
  "expectedHeadSha": "40-hex",
  "mergeCommitSha": "40-hex",
  "baseRef": "trunk",
  "mergeMethod": "squash",
  "verifiedTrunkRef": "origin/trunk",
  "provider": "codex",
  "sessionId": "provider-session-id",
  "verifiedAt": "ISO-8601",
  "result": "delivered"
}
```

The hidden `aitm-delivery-receipt` marker is accepted only through the same
versioned GitHub-record parser used by the close gate. Malformed, duplicated,
conflicting, or head-mismatched records fail closed.

## `/task close` After Delivery

For a top-level PR-delivered issue, `close` changes as follows:

1. It runs ordinary Review exit gates excluding terminal trunk-delivery proof.
2. It requires one valid delivery receipt for the accepted review SHA.
3. It independently runs the existing `origin/trunk` attribution guard.
4. Only then does it emit terminal timing evidence, roll up fields, flush the
   queue, freeze the estimation outcome, move the board to Done, write
   `Disposition=Delivered`, close the GitHub issue, and release the binding.

The existing `enableFullAutoMergeForClose()` call is removed from `close`.
Provider action, waiting, and merge retries cannot occur after terminal timing
has begun.

Interactive delivery remains compatible: a human may merge the exact PR through
GitHub, then run `/task deliver #N`. AITM verifies the live merge and writes an
external-delivery recovery receipt before `close` proceeds.

## Failure and Recovery Matrix

| Condition                                     | Result                                                        |
| --------------------------------------------- | ------------------------------------------------------------- |
| CI pending or failing                         | Refuse before intent; remain in Review                        |
| PR draft, conflicted, or mergeability unknown | Refuse before intent                                          |
| Multiple candidate PRs                        | Refuse and list candidates                                    |
| Provider capability unavailable               | Keep intent pending; request capable provider or human action |
| Provider denies merge                         | Keep intent pending; surface provider reason                  |
| Provider times out                            | Re-run `deliver`; inspect live PR before another action       |
| PR head changed                               | Supersede intent only after fresh Test/review evidence        |
| Merge succeeded but response was lost         | Re-run verifies GitHub and writes receipt                     |
| PR was already merged before intent           | Verify exact head/trunk and write recovery receipt            |
| Receipt exists but trunk fetch is stale       | Fetch and retry verification; do not close                    |
| Attribution missing after merge               | Refuse close; preserve evidence for repair                    |
| Repeated `/task deliver` after receipt        | Idempotent verified success                                   |

No recovery path deletes intent or receipt comments. Corrections append a
superseding record that names the prior record and reason.

## Provider Boundary

The provider registry remains data-driven. It gains a declarative external
action capability rather than provider-name conditionals at call sites. The
minimal shape is:

```js
externalActions: {
  'github.merge-pull-request': {
    adapterContract: 'skill',
    expectedHeadSha: true,
  },
}
```

The shared delivery rule owns the action schema. Provider-specific skill
adapters own tool discovery and invocation wording. The Node workflow never
imports a Codex plugin, Claude MCP client, or provider credential.

Capability declarations describe the adapter contract AITM installs; live tool
availability is still checked by the host session. A declared-but-unavailable
connector fails visibly and leaves the intent recoverable.

## Audit and Authority

Authority is deliberately split:

- GitHub PR live state owns whether a merge occurred.
- `origin/trunk` owns whether the result is delivered to trunk.
- Test and review receipts own which head SHA was accepted.
- The delivery intent owns which external mutation was authorized.
- The delivery receipt owns AITM's verified observation of that mutation.
- The issue board owns lifecycle Status.
- `/task close` owns terminal timing, disposition, and issue closure.

Neither provider output nor local cache may override a conflicting authority.

## Security Properties

1. The external mutation is explicit in the provider tool surface; it is not
   hidden inside Bash or a child process.
2. Expected-head SHA prevents merging unreviewed branch drift.
3. Required checks are verified before the request and enforced again by
   GitHub's active trunk ruleset.
4. Deterministic commit bytes preserve audit attribution.
5. Append-only intent and receipt comments make retries and provider changes
   recoverable from the issue record.
6. AITM re-verifies the remote result instead of trusting an agent assertion.
7. The issue remains in Review until delivery is proven.

## Testing Strategy

### Pure unit tests

- delivery-plan construction from issue, PR, checks, config, and review receipt;
- deterministic provider-action JSON and commit-message hashes;
- merge-method and child-attribution preservation;
- intent/receipt parsing, conflict detection, and supersession;
- stale-head, wrong-base, draft, ambiguous-PR, and non-green-check refusals;
- close-gate decision with missing, valid, malformed, and mismatched receipts.

### Verb tests with injected boundaries

- off-trunk reviewed PR creates an intent before any terminal close mutation;
- pending intent re-emits byte-identical action output;
- ambiguous provider result is reconciled from live PR state;
- merged exact head fetches `origin/trunk` and writes one receipt;
- repeated delivery is idempotent;
- changed head never reuses the old intent;
- child-to-epic delivery skips provider PR action;
- `close` never calls the retired Full-Auto merge executor.

### Cross-component regression

A deterministic harness exercises:

```text
Review/off-trunk
  -> deliver intent
  -> provider merge result
  -> live verification + receipt
  -> close
  -> Done/closed
```

It asserts that terminal timing, Done, Delivered, and issue closure are absent
until after the delivery receipt exists.

### Real-PR verification

Final acceptance uses a disposable or issue-owned real PR:

- CI is green for the exact head;
- the provider integration merges with `expected_head_sha`;
- the resulting trunk commit preserves required attribution;
- `/task deliver` records the verified merge receipt;
- `/task close` completes without `gh pr merge` or human merge action.

The real-PR test records repository, PR, source SHA, merge SHA, provider action,
and close result in #939's evidence.

## Documentation and Migration

Update:

- `docs/guides/workflow.md` with the Review -> Deliver -> Close sequence;
- `docs/guides/settings-guide.md` with `provider-action`, merge method, and
  fallback behavior;
- `docs/guides/architecture-overview.md` with the provider-action boundary;
- the shared task router and a JIT `rules/deliver.md` contract;
- provider adapters with action handling and capability failure guidance;
- command help for `deliver` and the dedicated action-required exit code.

Existing projects configured with `gh-auto-merge` receive an actionable
migration refusal pointing to `provider-action`. AITM does not silently change
their merge transport. `local-trunk-lane` remains unchanged.

Existing issues already merged without a receipt can recover through
`/task deliver`: exact live PR and trunk evidence produces a classified recovery
receipt. No historical issue-body migration is required.

## Considered Approaches

### Reorder the current merge block inside `close`

Rejected. It leaves asynchronous auto-merge racing the trunk gate and preserves
partial terminal audit mutations around an external failure.

### Structured provider request emitted by `close`

Better than the current Bash executor but rejected as the primary boundary.
`close` would still become a resumable external-action workflow while also
owning terminal lifecycle mutation. Recovery and testing remain entangled.

### GitHub auto-merge as the primary provider action

Retained only as a possible future asynchronous transport. It is idempotent and
CI-gated, but it does not accept an expected head SHA in the available provider
contract, introduces a waiting phase, and may merge a later pushed head after
fresh checks. Immediate provider merge after exact-SHA CI verification is
smaller and stronger.

### Repository-owned GitHub Actions merge workflow

Not selected. It could be provider-independent, but it adds privileged workflow
configuration, event-trigger security concerns, token policy, and maintenance
for behavior GitHub's merge API already supplies. It remains a possible adapter
for installations whose providers expose no merge capability.

### Dedicated governed delivery operation

Selected. It matches AITM's script-backed, single-authority architecture and
gives external delivery an explicit transactional and audit boundary.

## Acceptance Criteria

1. An off-trunk, reviewed, CI-green PR reaches `/task deliver` before any
   terminal close mutation, and the verb emits a durable intent plus structured
   provider action for the exact head SHA.
2. Provider-mediated delivery uses a sanctioned GitHub integration with
   expected-head protection and never invokes or disguises `gh pr merge`.
3. AITM independently verifies the merged PR and `origin/trunk`, then records a
   versioned delivery receipt containing the expected head and merge commit.
4. `/task close` refuses PR-delivered work without a valid matching receipt and
   completes only after both receipt and live trunk attribution pass.
5. Stale head, non-green checks, wrong base, ambiguous PR, unavailable provider,
   and ambiguous transport outcomes fail closed without terminal timing, Done,
   Delivered, or issue closure mutations.
6. Solo and epic squash delivery preserve all required `[#N]` attribution
   tokens through deterministic commit title/message bytes.
7. A real PR is delivered and closed end-to-end in Full-Auto through the
   provider integration, with exact source and merge SHA evidence and no human
   merge action.

## Scope and Decomposition

This design is broader than the legacy #939 three-AC repair. It introduces a new
verb, a provider-action protocol, durable GitHub records, a close-gate contract,
adapter updates, and real-PR verification. Refinement should re-estimate the
work and run the repository's decomposition gate before Plan. If decomposition
is required, #939 remains the defect/coordination parent and children own:

1. delivery intent, receipt, and pure decision model;
2. `/task deliver` orchestration and provider-action contract;
3. provider adapter handling and configuration migration;
4. `/task close` receipt gate and legacy executor retirement;
5. cross-component and real-PR verification plus documentation.
