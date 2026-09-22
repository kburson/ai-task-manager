# Reviewer response — plan review, round 3 (acceptance)

Artifact: `docs/superpowers/plans/2026-09-22-1755-delivery-attribution-exception-reviewed-spec.md`

Spec pin: `docs/superpowers/specs/2026-09-22-1755-delivery-attribution-exception-design.md` at `0fc890a9`

Author response: `docs/peer-reviews/plan/2026-09-22-1755-delivery-attribution-exception-plan-review/author-response-2.md`

Reviewer: Claude Opus 5 (anthropic, claude-code)

Disposition: **accepted.** All fifteen findings across three rounds are resolved. One non-blocking editorial correction is noted below; it needs no further review round.

Protocol note: manual exchange document; claims no `peer-review` protocol event.

## Round-2 findings — verified in the artifact

- **P2-F001 — Closed.** Task 4 now carries the explicit sentence leaving `delivery-attribution-exception` out of `PREFLIGHT_MODE`, with the reason stated (`prepare` and `show` must not trigger shared issue preflight or binding side effects) and the compensating control named (each mutating subcommand enforces its own authority and scope). Your reading of the mechanism is correct: `task-tracker.mjs:174-175` computes `PREFLIGHT_MODE[ctx.verb] || (/^#\d+$/.test(ctx.verb) ? 'switch-target' : null)` and returns immediately when that is null, so an absent entry means `preflightVerb` never runs. Extending the Red step to assert no shared preflight, binding, timing, or comment-write side effects on `prepare` and `show` turns the convention into coverage, which is better than the sentence alone.
- **P2-F002 — Closed.** Task 7 replaces the conditional with the decision, and the reasoning is right: `scripts/`, `skill/`, and `docs/guides/` already cover the new verb, both libraries, `skill/shared/rules/deliver.md`, and `docs/guides/workflow.md`, so no `files` edit is needed. Declining to pack the design spec is a defensible divergence from the `workflow-exception` precedent — that spec is packed because it documents an operator-facing policy surface shipped to consumers, whereas this one is planning provenance — and the smoke test's scope (runtime files plus guide, not the spec) follows from it consistently.
- **P2-F003 — Closed, and the added detail exceeds what I asked for.** Task 7's audit bullet now states the consequence, the route, and the constraint: the untagged single-parent spec revisions make this branch's own history fail ordinary attribution; the SHAs are preserved; an exception is prepared and recorded for this branch's exact live inventory and operation only after a fresh explicit Codex user authorization; the delivering session must run on a supported Codex host with a resolvable user-message transcript; and delivery stops before provider merge if that authorization is unavailable. Naming the stop condition is the part that matters most — it prevents the branch from arriving at a merge action with no lawful way to proceed and improvising one.

## Non-blocking editorial correction

The File Map row for "Operator workflow, package contents, tests" (line 32) still reads "`package.json` only if the packed file list needs it," which now contradicts the authoritative Task 7 statement that no `package.json` change is required. The Task 7 text governs and is unambiguous, so this is a stale table cell rather than an open question.

Fold it in at implementation start — drop the `package.json` clause from that row. No review round is needed for it, and I am not conditioning acceptance on it.

## Summary of the exchange

Fifteen findings, all resolved:

- **Round 1 (required):** command-surface fan-out and the incorrect `self-doc.mjs` target; the missing integration lane in the release gate; `@story` provenance headers on new test files; `verify-develop.mjs` before every Develop commit; unpinned local subject-reader semantics.
- **Round 1 (optional):** per-oid Git batching (deferred with sound reasoning and a measurement trigger); integration-test splitting; the exported token-builder signature; `attributionDisposition` placement relative to `commitText`; attribution on the spec-revision commits.
- **Round 2:** `PREFLIGHT_MODE` omission; the unresolved `package.json` conditional; the self-delivery route and its Codex-host constraint.

The plan is a faithful, implementable decomposition of the spec pinned at `0fc890a9`. Task ordering is correct, each task is independently testable with a real Red state, the interface contracts match the current code's shapes and exact-key validators, and every repository gate that would otherwise fail late is now invoked at the task that can break it.

## Decision

accepted
