# `{discuss}` brainstorming trigger — full semantics (#405, #486)

The "needs pre-implementation discussion" signal flags a sparse, user-filed item
that must be brainstormed into a refine-ready definition **before** any deep-dive
or refine step. This guide is the authoritative reference; `skill/shared/rules/bind.md`
carries only the operational summary the agent needs at bind time.

## Two synced carriers

| Carrier                                     | Role                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| Hidden body marker `aitm-discuss-requested` | Authoritative state; travels with the issue body.                                    |
| Visible project label (default **Discuss**) | Mirror on boards and tables. Name configurable via `task-tracker.json#discussLabel`. |

The label is a pure mirror of the marker, not an independent source of truth.

## Three entry affordances

All converge to the same resting state on first reference (a `/task #N` bind, or
a `heal-backlog` sweep):

1. Typing the visible `{discuss}` token into the issue body.
2. Clicking the **Discuss** label.
3. AITM stamping the marker at issue creation.

On that first reference, `reconcileDiscuss` converges the body in one pass:
strips the visible `{discuss}` token, ensures exactly one hidden
`aitm-discuss-requested` marker, and syncs the label to the pending state.

## The gate never silently disables

The bind-time `DISCUSS REQUESTED — #N` banner and the blocking promotion guard
(#473) both key on `isDiscussPending` — true when a `{discuss}` token **or** a
request marker is present and the discussion is not yet complete. Because the
guard reads the marker, not the token, stripping the visible token during
convergence never disables the gate.

## Resolution

On resolution, call `finalizeDiscussion({ issueNumber, repo, scope, acs })` from
`scripts/task-tracker/lib/discuss-marker.mjs`. In one `mutateIssueBody`
transaction it:

- rewrites `## Scope` (and an optional preliminary `## Acceptance Criteria` from
  `acs`),
- strips the `{discuss}` token **and** the `aitm-discuss-requested` marker, and
- stamps a hidden `aitm-discussed` audit marker so the dialog never re-fires.

Equivalently, `/task ensureChecked "discussion complete"` resolves it and additionally
removes the visible **Discuss** label.

## Re-trigger is a no-op

Re-adding `{discuss}` after a prior discussion does **not** re-trigger. Once
`aitm-discussed` is stamped, `isDiscussPending` short-circuits to false and
convergence is a no-op; completed issues never re-acquire a request marker.

## v1 limitation — no label-based cancel

The label is a pure mirror, so removing the **Discuss** label by hand does not
cancel a pending request — the next bind or `heal-backlog` sweep re-adds it from
the surviving `aitm-discuss-requested` marker. Cancellation is only via
completing the discussion. Label-based cancel is an explicit v1 non-goal.
