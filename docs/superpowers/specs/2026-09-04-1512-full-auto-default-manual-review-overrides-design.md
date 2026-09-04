# Full-Auto Default and Manual Review Overrides Design (#1512)

**Status:** Approved for implementation under explicit Full-Auto authority

## Goal

AITM starts new sessions in Full-Auto mode. Operators can independently opt into manual plan review, manual code review, or manual task review without turning unrelated gates back on.

The three phrases have distinct boundaries:

| Request              | Gate                                | Required evidence                                     |
| -------------------- | ----------------------------------- | ----------------------------------------------------- |
| `manual plan review` | Plan → Develop                      | Existing human plan-approval evidence                 |
| `manual code review` | Green required CI → merge authority | Eligible human PR approval on the exact accepted head |
| `manual task review` | Review → Done                       | Existing human final-task approval evidence           |

Manual code review replaces spawned-agent PR implementation review as merge authority. The normal in-process Agent Review Gate remains a structural lifecycle check; it is not a substitute for the requested human PR approval.

## Policy model

Extend the two-gate model with `pullRequestReview`:

```js
{
  analysisToDevelopment: false,
  pullRequestReview: false,
  reviewToDone: false
}
```

`false` means Full-Auto; `true` requires a human. Resolution remains session override → explicit project config → built-in default. Existing two-gate session files hydrate `pullRequestReview: null` and therefore inherit project/default policy. Existing project keys keep their explicit meaning; a missing new key defaults to Full-Auto.

The first-bind `PROMPT_REQUIRED: auto-mode` behavior is retired. A deterministic default means a bind no longer needs an operator decision.

## Session controls

`/task auto` remains the single control surface.

- `both` disables all three gates.
- `plan` preserves its legacy intent: Plan is automatic; final task review is manual; PR review remains automatic.
- `review` preserves its legacy intent: Plan is manual; final task review is automatic; PR review remains automatic.
- `off` enables all three manual gates.
- `reset` clears all overrides and falls back to project/default policy.
- `manual-plan`, `manual-code`, and `manual-task` enable one gate without changing the others.
- `auto-plan`, `auto-code`, and `auto-task` disable one gate without changing the others.

The task skill translates the exact natural-language phrases to the corresponding additive choice. The latest explicit request for a gate wins for that gate.

## Manual code-review authority

Project config adds `manualCodeReviewer`, defaulting to `@me`. At delivery, `@me` resolves through the authenticated GitHub account.

An acceptable PR approval must satisfy every condition:

1. The reviewer login equals the resolved configured reviewer.
2. The reviewer is a human account and is not the PR author.
3. The review's commit OID equals the immutable accepted Test/Review SHA and current PR head.
4. The latest applicable review state is `APPROVED`; later `CHANGES_REQUESTED` or `DISMISSED` evidence invalidates it.

Review assignment is only an affordance. It never grants authority.

## Delivery ordering

The open-PR delivery path remains fail-closed and ordered:

1. Resolve one accepted local/Test/Review SHA and one exact-head PR.
2. Validate ownership, lineage, cleanliness, merge configuration, attribution, and required CI.
3. If manual code review is disabled, continue unchanged.
4. If enabled and the exact-head human approval exists, continue unchanged.
5. If enabled and approval is missing, request the eligible reviewer once, emit `PROMPT_REQUIRED: manual-code-review`, create no delivery intent, and emit no merge provider action.
6. On retry, reread the PR. Only current approval permits the existing immutable merge intent/action.

If the configured reviewer is the PR author, is a bot, cannot be resolved, or review evidence is unreadable, AITM refuses with specific remediation. A pushed replacement head automatically invalidates the old approval because its commit OID no longer matches.

## Audit and compatibility

Manual plan and task review keep their existing durable approval markers. Manual code review uses GitHub's server-authored PR review, reviewer identity, submission time, state, and commit OID as durable evidence. The session gate file records the selected policy and timestamp.

No existing exact-SHA, required-CI, worktree, ownership, Agent Review, delivery-intent, provider-action, receipt, or close requirement is weakened. Existing `/task auto` callers and two-gate files remain readable.

## Documentation and tests

Focused tests cover default policy, additive overrides, reset, precedence, legacy hydration, reviewer eligibility, exact-head freshness, assignment idempotence, CI-before-request ordering, and the absence of merge authority while waiting. Documentation contract tests protect the exact three phrases and their distinct boundaries.
