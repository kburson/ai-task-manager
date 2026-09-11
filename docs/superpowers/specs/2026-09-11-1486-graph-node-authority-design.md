# #1486 — Epic Graph-Node Authority Adapter Design

## Status

Approved for implementation under the user's explicit Full-Auto authorization on 2026-09-11. The user will review the document after delivery.

## Problem

Five production workflows independently translate GitHub sub-issue evidence and issue-body worktree markers into the synchronous graph-node shape consumed by `resolveEpicLineage`:

- `cut-child-worktree.mjs` fetches the parent body and lets authority parser errors propagate.
- `merge-back.mjs` repeats that fetch, adds own-worktree authority, and captures parser failures.
- `epic-base-edit-guard.mjs` hand-builds a synchronous GraphQL query and parses both bodies inline.
- `close-gates-lineage.mjs` maps a raw GraphQL response, preserves rich child metadata, and captures parent parser failures.
- `decomposition-delivery-readiness.mjs` synthesizes a one-node graph from an epic body and translates failures into `branch-authority:` blockers.

The duplicated logic encodes the same authority rule with different query and error shapes. A future parser or graph change can therefore fix one workflow while leaving another divergent. #1485 intentionally repaired only merge-back; #1486 performs the deferred consolidation without changing lineage semantics.

## Goals

- Establish one pure graph-node authority mapper for parent, children, own worktree authority, and parent branch authority.
- Establish one injectable asynchronous parent-body fetcher for callers that do not already possess the body.
- Migrate the five named production sites onto that shared boundary.
- Preserve each caller's current outward error presentation.
- Preserve canonical `feature/epic/<N>` fallback when no durable parent marker exists.
- Preserve fail-closed handling for malformed or ambiguous current authority.
- Preserve rich close-gate child metadata and synchronous hook execution.

## Non-Goals

- Changing `resolveEpicLineage` roles, branch naming, or fallback policy.
- Changing `resolveCurrentIssueWorktreeLocation` parsing or record selection.
- Introducing graph caching, persistence, retries, or a repository-wide graph service.
- Migrating `cut-epic-branch.mjs` or `sync-epic.mjs`, which do not duplicate the parent-body authority branch identified by this story.
- Changing Git mutation order in cut-child or merge-back.

## Alternatives

### Shared mapper and injectable parent-body fetcher — selected

Add a focused module that owns normalization and authority parsing. Asynchronous callers share its body fetcher; callers with an existing synchronous or raw query pass the evidence directly to the mapper. This removes the duplicated authority rule without forcing all workflows into one I/O model.

### Mapper-only extraction

This would reduce parser duplication but leave multiple parent-body GraphQL queries and missing-body policies. It does not satisfy the story's audited fetch boundary and would preserve the most likely source of future drift.

### Stateful graph repository

A graph repository could own batching, caching, and all lineage reads. That is broader than this behavior-preserving refactor, introduces cache coherency questions, and changes independently governed workflows. It is deliberately excluded.

## Shared Module

Create `scripts/task-tracker/lib/graph-node-authority.mjs` with two public boundaries.

### Pure mapper

`buildGraphNodeAuthority({ parent, children, ownBody, parentBody, mapChild })` returns the graph node consumed by `resolveEpicLineage`.

- `parent` is normalized to a positive integer or `null`; invalid values throw.
- `children` is an array and is mapped through `mapChild`. The default mapper returns positive integer issue numbers. Close gates inject a mapper that retains `{ number, title, closeReason }`.
- When `ownBody` is a string, the mapper parses the current worktree location. A valid marker adds `authoritativeBranch` and `authoritativeWorktree`; malformed or ambiguous evidence adds `authorityError` and stops own/parent authority mapping.
- A non-null parent requires `parentBody` to be a string. Missing evidence is not equivalent to an issue body with no marker and throws before fallback can be selected.
- A valid parent marker adds `parentAuthoritativeBranch`.
- A malformed or ambiguous parent marker adds `parentAuthorityError`.
- A parent body with no marker adds neither optional outcome, preserving canonical fallback.
- `parentAuthoritativeBranch` and `parentAuthorityError` are mutually exclusive.

The mapper never synthesizes branch names and never decides how an error is presented to an operator.

### Injectable parent-body fetcher

`fetchParentIssueBody({ parentIssue, cfg, deps })` owns the reusable parameterized GraphQL query. `deps.gql` and `deps.splitRepo` are injectable; production defaults use `scripts/gh/lib/github-projects.mjs`.

- `null` parent returns `undefined` without network access.
- A positive parent returns its body string.
- Missing repository/issue/body evidence throws `graph-node-authority: parent #N body unavailable`.
- Transport errors propagate unchanged.

This is deliberately an issue-body fetcher, not a graph service. Parent and child relationship discovery remains with the existing tested helpers.

## Consumer Migration

### Cut child worktree

`realGraphNode` continues to fetch the numeric parent and children. It obtains the parent body through `fetchParentIssueBody`, maps through `buildGraphNodeAuthority`, and throws the captured `parentAuthorityError` before returning. This preserves the current direct parser-error behavior and prevents Git mutation.

### Merge back

`buildMergeBackGraphNode` remains as a compatibility export but delegates completely to the shared mapper with `ownBody`. `realGraphNode` uses the shared fetcher. The two-node prefetch map and every Git/test/cleanup step remain unchanged.

### Epic base edit guard

The hook keeps its synchronous `gh api graphql` call because hook evaluation is synchronous. `realGraph` delegates the response mapping to `buildGraphNodeAuthority`, including own and parent bodies. `computeEvaluation` already treats either authority error as unresolved and remains the caller policy boundary.

### Close gates

`closeGraphNodeFromQuery` remains as a compatibility export and delegates to the shared mapper with the rich-child mapper. Its return shape and lazy graph-factory behavior remain unchanged.

### Decomposition delivery readiness

`evaluateBranch` passes the epic body as the representative child's parent body to the shared mapper. It converts `parentAuthorityError` into the same thrown message inside its existing catch, preserving the `branch-authority:` blocker prefix.

## Error Contract

The shared boundary distinguishes three states:

1. Valid current marker: return recorded authority.
2. Valid body with no marker: return no authority outcome and allow downstream canonical fallback.
3. Unreadable, malformed, ambiguous, or unavailable evidence: return error evidence or throw for unavailable input; callers fail closed.

No consumer may treat state 3 as state 2. Consumer wrappers may translate the shared error evidence only to preserve their existing public contract.

## Test Strategy

The new shared unit suite defines normalization, child mapping, own authority, valid parent authority, no-marker fallback, malformed/ambiguous exclusivity, missing parent body, and injected fetch behavior.

Each existing consumer suite proves its own unchanged boundary:

- cut-child: custom authority and parser failure before Git.
- merge-back: own and parent authority, canonical fallback, captured error, and two-node prefetch.
- edit guard: valid custom authority plus malformed/ambiguous unresolved evaluation.
- close gates: rich child metadata, fallback, and captured parent error.
- decomposition readiness: recorded branch, canonical fallback, and `branch-authority:` blocker.
- lineage: unchanged canonical and custom branch semantics.

A structural assertion scans the five production files and fails if they retain direct `resolveCurrentIssueWorktreeLocation`/`resolveCurrentIssueWorktreeBranch` calls or their own parent-body query fragment. The shared module is the only allowlisted authority-mapping site.

The governed Test action then runs the issue's focused command, the shared unit suite, lint, format, fast tests, and slow tests in an exact-SHA sandbox.

## Delivery

The story uses its isolated `codex/issue-1486-graph-node-authority` branch and worktree. After exact-SHA Test and Review, it will open a PR to current `trunk`, wait for hosted CI and CodeQL, merge only through the AITM provider-action envelope, verify the delivery receipt, and close through the governed transaction.
