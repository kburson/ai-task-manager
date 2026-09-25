# GraphQL Usage Measurement Spike Design

## Status and relationship to the backlog epic

This is a standalone AITM story. It can be implemented, deployed, and measured
before the backlog cache and archive epic is planned or activated. Its output is
evidence for that epic, not a dependency on its implementation. No GitHub issue
number has been assigned to this specification.

## Problem

Several concurrent AITM worktrees use one authenticated GitHub user's GraphQL
budget. We have observed frequent pressure on the 5,000-point hourly primary
limit, especially during creation, hydration, refinement, and planning, but do
not yet know which AITM operations, lifecycle stages, or bursts consume the
budget. Counting HTTP calls is insufficient because a GraphQL call can cost
more than one primary-limit point. Cumulative rate-limit header differences
cannot safely attribute a point cost to one call while other worktrees or tools
use the same user token.

## Goals

1. Attribute the primary GraphQL point cost of each AITM-owned GraphQL request
   to its operation, time, worktree, session or process, and issue state where
   known, without making an additional API request per observation.
2. Persist raw observations under the repository's shared Git common directory,
   outside tracked files and outside any individual worktree's disposable
   `.tmp/aitm` tree.
3. Report coverage, call volume, points, peaks, and cost per operation and
   lifecycle stage across concurrent worktrees.
4. Establish a repeatable baseline that can be compared with the later epic's
   changes.

## Scope and boundaries

- Instrument AITM-owned production GraphQL calls, including the shared
  `scripts/gh/lib/github-projects.mjs` wrapper, direct `gh api graphql` calls,
  and direct GraphQL HTTP calls. Inventory the production call sites first and
  record which are covered. AITM calls spawned through `gh issue` or other CLI
  commands must be identified separately if their internal GraphQL traffic is
  opaque; they cannot be silently counted as instrumented.
- The spike observes calls and produces reports. It does not cache backlog
  writes, alter lifecycle authority, throttle worktrees, or add a shared rate
  coordinator.
- REST traffic and secondary rate-limit points are outside primary GraphQL
  point totals. The report may show them only as clearly separate diagnostics.
- Manual `gh` calls, GitHub web use, and other clients sharing the user token
  may change the account's remaining budget. The report measures AITM-owned
  traffic and must not claim to reconcile the entire account unless it can
  prove that scope.

## Collection design

The implementation introduces one small observation interface at the GraphQL
transport boundary. It records a result for every attempted request, including
GraphQL errors, HTTP errors, timeouts, and retries. One logical operation with
three HTTP attempts produces three call records, linked by a logical operation
ID. Instrumentation failures must be surfaced as a local coverage diagnostic
without changing a successful GitHub operation's outcome.

The preferred exact cost source is GitHub's `rateLimit { cost }` field returned
in the same GraphQL response. The spike must prove this works for AITM's query
and mutation forms and does not change their functional results. For calls
whose cost cannot be obtained, record `pointCost: null` and a reason; do not
derive per-call cost by subtracting cumulative `x-ratelimit-used` values across
concurrent worktrees. Capture GitHub's `x-ratelimit-limit`, `remaining`, `used`,
`reset`, and `resource` headers where available as separate budget context.
Adding a cost field must not cause a second request, leak it into business
payloads, or compromise existing error handling.

Resolve issue number and lifecycle state from the current command's known
arguments or local state only. Record the state source and `unknown` when no
trustworthy state is available. Never read GitHub solely to decorate a metric.
The operation name is a stable AITM call-site identifier; record a query
fingerprint when a stable name is unavailable. Do not store query variables,
raw queries, request or response bodies, tokens, or issue text.

### Raw event schema

Each line is one versioned JSON object with at least:

| Field                                                                   | Meaning                                                                    |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `schemaVersion`, `callId`, `logicalOperationId`                         | Parser version, unique HTTP attempt, retry grouping                        |
| `startedAt`, `endedAt`, `durationMs`                                    | UTC call timing and latency                                                |
| `worktreeId`, `sessionId`, `processId`                                  | Local attribution; unavailable IDs are explicit                            |
| `repository`, `issueNumber`, `draftId`, `lifecycleState`, `stateSource` | Work context, with nulls where unknown                                     |
| `operation`, `queryFingerprint`, `kind`                                 | Stable call identity and query or mutation                                 |
| `outcome`, `httpStatus`, `errorClass`                                   | Success, failure, and retry analysis without sensitive error bodies        |
| `pointCost`, `costSource`, `costUnknownReason`                          | Exact primary points or explicit unknown                                   |
| `rateLimit`                                                             | Response header limit, remaining, used, reset, and resource, when supplied |

### Shared storage and concurrency

Resolve the absolute path with `git rev-parse --path-format=absolute
--git-common-dir`; do not assume `<cwd>/.git` is a directory. Store files under
`<git-common-dir>/aitm/graphql-usage/v1/<worktree-id>/<session-id-or-unknown>/`.
Each process writes its own uniquely named append-only JSONL file. This avoids
a cross-worktree append lock and permits a reader to aggregate complete lines
from many active writers. IDs used in paths are normalized or hashed, never
unsanitized external input. A partial final line is reported and ignored until
complete; earlier lines remain readable. The directory is machine-local and
must not be put in Git's tracked worktree, Git objects, hooks, or config files.

## Reporting and baseline

An offline command reads the JSONL files without GitHub API calls. It reports:

- calls and exact points by hour (UTC and selectable local time), worktree,
  session, issue, lifecycle state, and operation;
- peak rolling 60-minute call volume and known point consumption, plus daily
  and hourly charts;
- mean, median, and high-percentile point cost and latency per operation;
- retries, failures, unknown costs, unknown states, and uncovered call sites;
- account-budget context from response headers without attributing other
  clients' usage to AITM.

Each sum includes an explicit known-cost subtotal and unknown-cost call count.
The report cannot display a partial sum as a complete total. A baseline report
records the instrumentation version, observation interval, covered call-site
inventory, and number of active worktrees. It must capture at least one real
creation-to-planning workflow and an overlap period with multiple worktrees
before it is used to rank epic work. A shorter run may be reported as
preliminary evidence.

## Acceptance criteria

1. A read-only call-site inventory lists all AITM-owned production GraphQL
   paths, marks covered, opaque, and out-of-scope paths, and is checked by a
   lightweight source-level or injected-transport test so new paths are visible.
2. A query and a mutation each produce exactly one event per HTTP attempt with
   GitHub-reported primary point cost or an explicit unknown reason; failures
   and retries are represented truthfully.
3. Two worktrees can emit simultaneously into the same Git common directory
   without interleaved or lost JSONL records, while each retains independent
   session attribution.
4. Recording and aggregation make no extra GitHub calls, preserve the existing
   GraphQL result and error behavior, and never persist secrets or issue bodies.
5. A local report and graph identify peak hourly usage and the highest-volume
   and highest-point operations, with coverage and missing-cost counts visible.
6. A baseline comparison procedure is documented so the backlog epic can use
   measured call and point reductions rather than assumptions.

## Verification

Use injected GraphQL transports to exercise query, mutation, error, retry,
unknown-cost, and concurrent writer cases without consuming live quota. Make
one controlled live query and one controlled live mutation only in an
authorized test workflow, compare recorded cost with GitHub's same-response
value, and verify redaction. The baseline run is observational; it does not
mutate the backlog solely to generate traffic.
