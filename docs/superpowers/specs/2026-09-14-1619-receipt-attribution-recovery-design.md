# #1619 Receipt Attribution Recovery Design

## Context

AITM's v1 delivery path requires two independent classes of evidence:

- safety authority: issue and worktree ownership, accepted Test and Review SHA, pull-request identity, complete source inventory, required hosted CI for current-head delivery, merge topology, tree equivalence, merge-commit reachability from freshly fetched trunk, and exact receipt read-back; and
- audit convention: bracketed issue tokens in source subjects and a terminal canonical `Attribution:` line in the merge message.

The audit convention is valuable when AITM authorizes merge bytes before the provider effect. It is not independently stronger than the complete provider and Git proof available after an external merge. Today both classes are hard gates. Consequently, a valid externally merged delivery with missing—but nonconflicting—attribution metadata can obtain a receipt only after rewriting immutable source history and creating another pull request.

The same retry loop exposes a timing defect. A Review failure can pause the local binding and demote the issue to Develop. Rebinding in the same second then writes `demoted:develop`, `resumed`, and `develop:started`. The middle row contributes no time or words and has no interruption to close, so Agent Review correctly reports an active-to-active doubled step. The current healer can remove a synthetic departure/reengagement pair, but not this standalone redundant return.

## Decision

Use evidence-weighted external recovery. Missing attribution may become a durable warning only after all safety-authority predicates succeed. A present attribution claim remains strict and can never be downgraded to a warning.

The implementation uses the existing recovery-after-Review path. It does not add a Test-stage merge-intent command or permit provider effects before the existing Review and approval gates.

## Recovery Eligibility

### Source subjects

Canonical delivery remains unchanged: every source subject is parsed by `buildDeliveryCommitText`, the target token must be present, and the generated merge bytes remain exact.

An already-merged external recovery may use a target-only reconstructed token set when all of these conditions hold:

1. the pull request's source inventory is complete, nonempty, and terminates at the accepted head;
2. every source subject is structurally readable;
3. no source subject contains a bracket attribution claim beginning with `[#`; and
4. the ordinary canonical parser failed only because attribution is wholly absent.

If any source subject contains a canonical or malformed bracket claim, the full canonical parser remains authoritative. A partial set, missing target, duplicate token, malformed token, or extra issue token refuses. Recovery never combines observed tokens with a synthesized target.

This exception is available only to `validateMergedDeliveryPreflight` and historical no-intent reconstruction. Open pull requests and historical recovery backed by prior authorized intent bytes retain strict source attribution.

### Merge message

The existing external semantic fallbacks remain the only accepted missing-trailer shapes:

- a topology-proven single-source squash with exact source/merge tree and parent evidence;
- a topology-proven multi-source GitHub-default squash whose complete observed bracket-token set equals the authorized set;
- a topology-proven GitHub-default two-parent merge with exact PR, owner, head-ref, and token-set identity; or
- the already-supported exact legacy escaped-message shape.

Canonical `Attribution:` claims keep precedence and byte-exact validation. A malformed, duplicated, reordered, indented, nonterminal, missing-token, or extra-token claim refuses without falling through to semantic recovery.

## Receipt Schema and Warning Semantics

Historical `aitm.delivery-receipt/v1` records remain byte-exact and fully readable. Ordinary new receipts without warnings remain v1.

A recovery that crosses an audit-convention exception emits `aitm.delivery-receipt/v2`. V2 adds one required field:

```json
{
  "metadataWarnings": ["missing-source-attribution", "missing-merge-attribution-trailer"]
}
```

The warning list is nonempty, unique, sorted, and restricted to known bounded codes. It is part of the immutable receipt marker and therefore participates in canonical JSON, duplicate/conflict detection, exact read-back, and retry idempotency. The visible receipt text names the warning codes so an operator does not need to inspect HTML comments.

Warnings do not alter delivery result, accepted head, PR, merge commit, merge method, verified trunk, provider, session, or timestamp fields. Receipt correlation remains identical across v1 and v2.

## Actionable Failure Contract

Stable category prefixes remain compatible: callers and tests may continue matching `delivery-preflight:<category>` and `delivery-verification:<category>`.

Delivery authority errors additionally expose:

- `predicate`: the concrete failed condition, such as `source-attribution-conflict`, `merge-message-attribution-conflict`, `required-check-head`, or `trunk-reachability`; and
- `recoveryAction`: a supported next action that does not recommend rewriting immutable history when warning recovery is eligible.

The human-readable error appends both fields. Missing evidence instructs the operator to refresh or supply that evidence and retry. Conflicting immutable attribution instructs the operator to use a governed non-delivery disposition or a new corrective delivery; it never suggests that Full-Auto can override the conflict.

## Timing Prevention

`shouldSuppressActiveBindEvent` will recognize one exact paused-rebind case:

- the Timing Log is readable and has no open interruption;
- its last row is `demoted:develop`;
- the bind timestamp and that row are in the same whole second; and
- the proposed return would be `resumed`.

That return row is suppressed. The subsequent `develop:started` remains the active lifecycle entry. Other paused binds, unreadable logs, real departure rows, terminal Review handoffs, and suspicious gaps keep their current behavior.

## Timing Repair

`heal-timing-departure` gains an explicit `--recover-redundant-same-second-reengagement` mode. Dry-run remains the default; `--apply --yes` retains the existing blast-radius confirmation and per-issue timing lock.

The pure transform removes exactly one selected `resumed` row only when:

1. the previous row is `demoted:develop` and the next row is `develop:started`;
2. all three rows are physically adjacent and share one whole-second timestamp;
3. the selected row carries `row-sec: a=0 i=0`, blank Active/Idle cells, and zero word delta;
4. word and full-word cursors are identical across all three rows; and
5. validating the transformed Timing Log produces no sequence failures.

Every near miss refuses before mutation. Apply mode re-reads the exact updated comment and validates it again. The existing two-row synthetic-pair recovery stays unchanged under its existing flag; no general row-delete API is introduced.

## Data Flow

1. `deliver` resolves the accepted Test/Review SHA and the unique PR as today.
2. Merged preflight first attempts canonical source attribution.
3. If and only if attribution is wholly absent, the external recovery classifier returns a target-only token set plus `missing-source-attribution`; any present claim remains strict.
4. Live verification independently proves CI, topology, tree, trunk, method, and inspected merge bytes.
5. A semantic missing-trailer fallback returns `missing-merge-attribution-trailer`; a present conflicting claim throws.
6. `deliver` combines and sorts warning codes, builds a v2 receipt only when the list is nonempty, appends it after the external intent, and verifies exact read-back.
7. A retry projects the same intent and receipt and returns `already-delivered`; divergent warning bytes refuse as receipt divergence.

## Compatibility

- Existing v1 intents and receipts parse and project unchanged.
- Existing canonical provider-action delivery emits the same v1 receipt bytes.
- Existing semantic external-recovery successes begin emitting warning-bearing v2 receipts, making their prior implicit exception explicit.
- Existing category-prefix consumers remain compatible with enriched error messages.
- Evidence-v2 remains protocol-selected and is not weakened; its content/tree authority is documented as the forward model.

## Testing

Delivery tests prove:

- wholly absent source and merge attribution succeeds only in merged external recovery and emits both warning codes;
- canonical open delivery remains strict;
- partial, malformed, duplicate, missing-target, extra, or conflicting tokens refuse before any intent or receipt write;
- wrong head/PR/base, incomplete inventory, pending or failed required checks, unproved method, changed tree, and unreachable merge keep refusing;
- v1 receipt compatibility and exact v2 warning validation, parsing, projection, duplicate/conflict detection, visible rendering, and retry idempotency; and
- enriched failures retain stable category prefixes and name predicate plus supported action.

Timing tests prove:

- the same-second paused demotion rebind is suppressed and the three-row shape validates after prevention;
- real pauses, older demotions, open interruptions, and unreadable logs are not suppressed;
- dry-run and apply remove the exact legacy standalone row with exact read-back;
- changed time, duration, delta, cursors, adjacency, neighbor events, or remaining validator failures refuse without writes; and
- the old synthetic pair recovery remains compatible.

The issue's focused commands, fast and slow suites, lint, format, and commit checks run at the exact committed Test head.

## Documentation

`workflow.md`, `architecture-overview.md`, and `settings-guide.md` will state that accepted SHA, lifecycle receipts, PR identity, CI, topology, tree, and trunk reachability are safety authority; attribution trailers are audit conventions whose total absence may be warning-recovered only through the bounded external path. The docs will list both warning codes and explain that any present conflict remains fatal.

## Alternatives Rejected

### Keep canonical attribution as an absolute gate

Rejected because it requires destructive rewrites and repeated provider effects after stronger independent evidence already proves the delivery.

### Accept a leading issue token alone

Rejected because title text alone does not prove the source inventory, accepted tree, merge method, or absence of conflicting attribution.

### Ignore all attribution during external recovery

Rejected because present conflicting metadata is evidence, not absence. It must fail closed.

### Add a Test-stage merge provider action

Rejected for this issue because it would broaden the lifecycle and provider-effect surface. Equivalent evidence recovery after existing Review approval solves the observed loop without weakening stage gates.

### Store warnings only in visible prose

Rejected because prose is not canonical, correlated, or idempotently projected. Warning bytes belong in the receipt record.

### General Timing Log row deletion

Rejected because it could launder real active or idle time. The healer recognizes one historical artifact and proves zero contribution before deletion.

## Dependency Map

Depends on: none.

Blocks: none recorded in GitHub native dependencies.
