# GraphQL Usage Measurement Spike Design

## Status and relationship to the backlog epic

This is a standalone AITM story. It can be implemented, deployed, and measured
before the backlog cache and archive epic is planned or activated. Its output is
evidence for that epic, not a dependency on its implementation. No GitHub issue
number has been assigned to this specification. Before implementation starts,
create and refine its standalone issue through the governed AITM workflow, with
Size and Estimate set; this specification review does not create that issue.

## Problem

Several concurrent AITM worktrees use one authenticated GitHub user's GraphQL
budget. We have observed frequent pressure on the usual 5,000-point hourly user primary
limit (actual limits depend on authentication and are read from response headers), especially during creation, hydration, refinement, and planning, but do
not yet know which AITM operations, lifecycle stages, or bursts consume the
budget. Counting HTTP calls is insufficient because a GraphQL call can cost
more than one primary-limit point. Cumulative rate-limit header differences
cannot safely attribute a point cost to one call while other worktrees or tools
use the same user token.

## Goals

1. Attribute the primary GraphQL point cost of each AITM-owned GraphQL request
   where GitHub exposes an exact same-response cost, and explicitly account for
   unknown costs elsewhere. Attribute observations to operation, time, worktree,
   session or process, and issue state where known without additional API calls.
2. Persist raw observations under the repository's shared Git common directory,
   outside tracked files and routine `.tmp` cleanup. The established main-worktree
   `.tmp/aitm` root is also shared, but this spike deliberately uses the
   user-requested Git common directory as described below.
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

## Relationship to existing action capture

Extend the existing process interception boundary in
`scripts/task-tracker/lib/action-capture.mjs` and
`scripts/task-tracker/action-capture-bin/gh`; do not install a second competing
`gh` PATH shim. The shipped `aitm.github-action-capture/v1` subsystem (#1295)
is issue-scoped, opt-in action evidence, with payload storage and a main-worktree
`.tmp/aitm/action-capture` root. Reuse its executable resolution, recursion
prevention, argv/stdin extraction, signal forwarding, and exit preservation.
Its current leading-`mutation` regex is not sufficient for all GraphQL documents:
unknown/unsupported syntax must not default to a confidently classified query.
Retain its public classification behavior for existing consumers while adding
safe telemetry-specific classification and tests for comments and selected
operations.

GraphQL usage is a separate metadata-only sink attached to that shared boundary.
It needs a different schema and root because it aggregates repository/fleet
traffic without an active issue, stores no payloads, and has no global action
sequence or action-replay semantics. Do not reuse action-capture's payload writer
or global sequence lock for usage JSONL. Reports read usage records only and do
not merge action-capture records into point totals. Optional correlation uses a
non-secret invocation ID; it does not create another counted observation.

Enable usage at the repository level independently of issue capture; extend the
existing bootstrap so usage works with no active issue and when action capture
is off. The usage switch never turns on action-capture payload storage. If a user
separately enables legacy action capture, its existing payload policy and location
remain separately disclosed; the spike's no-bodies rule applies to all usage
records/diagnostics and introduces no new payload persistence. Verify usage-only,
action-only, both-enabled, and both-disabled modes. Existing action-capture
regression checks must pass.

The shared shim covers shell and synchronous callers as opaque invocations when
installed in their inherited PATH. Wire the repository usage bootstrap into all
inventoried AITM launch routes, including `bin/aitm.mjs`, `bin/cli.mjs` launching
`scripts/gh/init-project-config.sh`, and supported direct-script invocations.
Provide a documented measurement launcher that applies the same bootstrap for
standalone shell/Node entry points; direct execution without that launcher or an
inherited measurement environment is explicitly uncovered. Never rely on an
active-issue marker to install usage collection. Inventory absolute-path `gh`
calls and environment overrides that bypass PATH as uncovered until an adapter
is demonstrated.

All 25 current `gh api graphql` sites in `scripts/gh/init-project-config.sh`,
including its page loop, are in scope at the shim boundary. The synchronous
`execFileSync` call in `scripts/gh/verify-priority-p3.mjs` is also covered through
the launcher/inherited shim: its parent waits while the shim records and flushes
the completed observation before exiting with the child's status. This does not
require an async flush in the synchronous parent. Test both shapes by spawning
the real shell/synchronous caller against a fake `gh` binary and verifying
observations exist immediately on normal return.

Direct HTTP callers such as `scripts/reports/generate-value-report.mjs` use the
shared metadata sink through an HTTP adapter. For query cost augmentation, the
first implementation supports known Node request builders with compatibility
fixtures; the shim alone does not rewrite arbitrary shell query text or buffered
stdout. Other shim calls retain explicit unavailable cost until safe augmentation
is demonstrated. A builder can pass a private observation context to the shim so
it owns the single usage record and extracts any already-added cost field;
only the builder strips its private response alias before returning business
data. The shim preserves original child stdout, and neither caller nor shim may
log a second usage record. Internal CLI retries remain opaque.

## Collection design

The implementation introduces a shared observation interface with adapters for
existing transport boundaries. Distinguish a directly observed HTTP attempt from
one CLI invocation whose internal attempts or pagination cannot be seen. An
opaque invocation is never counted as one HTTP request. Each visible retry or
page gets a separate observation; retries share a logical operation ID and
pages carry a page index where known. Ownership belongs to the lowest observable
boundary, so a wrapper and its caller cannot both count the same observation.
An exact cost extracted from one visible CLI response is the cost of that
response's operation only; it does not prove the total cost of an invocation
with hidden attempts. Mark `costCoverage` as `complete-observation`,
`visible-response-only`, or `unknown`, and keep unknown hidden request count
explicit. Never treat one returned cost as the total of an opaque invocation.
If several page responses are visible, split their observations when identities
can be preserved; otherwise keep the invocation opaque and decline an exact
aggregate. HTTP ownership requires evidence that each request is observed.
Record GraphQL errors (including HTTP 200 with errors), HTTP failures, local
spawn failures, timeouts, and partial responses without changing caller behavior.
For pre-dispatch failures mark dispatch as not sent; for timeouts with ambiguous
dispatch or completion mark it unknown, never infer server success or zero cost.

For supported queries, obtain exact cost from GitHub's same-response
`rateLimit { cost }` query field. Mutations do not expose that query-root field:
leave mutations unchanged and record `pointCost: null` with
`costUnknownReason: mutation-cost-unavailable`, unless a supported exact
same-response source is demonstrated. Never append a query-root field to a
mutation, send a second query, or subtract cumulative header values. A high
mutation share may therefore limit point-based prioritization; mutation call
volume remains useful evidence.

Query augmentation must respect the selected operation, fragments, aliases,
existing selections, and variables. Use a collision-free alias and strip only
the added telemetry field before returning business data. Unsupported query
forms execute unchanged with explicit unknown cost. Prove functional and error
compatibility on the actual adapters before enabling augmentation. The measured
cost belongs to the instrumented request; record the augmentation version and
use the same method in later comparisons. Capture available `x-ratelimit-limit`,
`remaining`, `used`, `reset`, and `resource` headers solely as budget context.
The shim does not normally expose response headers; leave header context absent
with an explicit transport-unavailable reason. Do not add `--include` where it
would change stdout contracts. Direct HTTP adapters can read headers without
changing payloads. Do not assume augmentation leaves the original query's cost
unchanged: report instrumented-request cost, with overhead unknown until a
controlled authorized comparison establishes otherwise. That comparison belongs
to verification, not per-observation collection.
Do not enable raw CLI debug/HTTP dumps to obtain metrics, because they can expose
credentials and bodies. Preserve existing stdout, stderr, exit and exception
contracts; diagnostics use a bounded local side channel.

Instrumentation failures must never replace the original result or exception.
Expose local coverage diagnostics for disabled collection, storage failure,
unsupported contexts, and dropped observations, including counts when known.
Loss whose size cannot be established remains unknown; a missing log is never
proof of zero traffic. Collection can be locally disabled without changing
GitHub behavior, and the baseline records that setting.

Resolve issue number and lifecycle state from the current command's known
arguments or local state only. Record the state source and `unknown` when no
trustworthy state is available. Capture context at dispatch; do not label a
cross-issue query with an unrelated active issue. Mark multi-issue context as
such and do not divide its cost among issues. Never read GitHub solely to decorate a metric.
The operation name is a stable AITM call-site identifier; record a query
fingerprint when a stable name is unavailable. Do not store query variables,
raw queries, request or response bodies, tokens, or issue text. Fingerprints
exclude literal values as well as variables; hash a normalized query structure
with literals replaced, not potentially sensitive inline text. Use an allowlist
for diagnostic and error classes, never raw exception messages.

### Raw event schema

Each line is one versioned JSON object with at least:

| Field                                                                   | Meaning                                                                    |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `schemaVersion`, `callId`, `logicalOperationId`                         | Parser version, unique observation, retry grouping                         |
| `startedAt`, `endedAt`, `durationMs`                                    | UTC call timing and latency                                                |
| `worktreeId`, `sessionId`, `processId`                                  | Local attribution; unavailable IDs are explicit                            |
| `repository`, `issueNumber`, `draftId`, `lifecycleState`, `stateSource` | Work context, with nulls where unknown                                     |
| `operation`, `queryFingerprint`, `kind`                                 | Stable call identity and query or mutation                                 |
| `outcome`, `httpStatus`, `errorClass`                                   | Success, failure, and retry analysis without sensitive error bodies        |
| `pointCost`, `costSource`, `costUnknownReason`                          | Exact primary points or explicit unknown                                   |
| `rateLimit`                                                             | Response header limit, remaining, used, reset, and resource, when supplied |

Additional required fields are `observationKind` (HTTP attempt or opaque CLI
invocation), `dispatchStatus` (sent, not sent, unknown), nullable `pageIndex`,
`contextScope` (single issue, multiple issues, repository, unknown), and the
collector/augmentation version. `kind` also permits `mixed` and `unknown` for
opaque invocations; `httpStatus` is null when unavailable, never the CLI exit
code (record that separately as `processExitCode`). Include the endpoint host and a locally supplied
non-secret `budgetScopeId` when known; never derive it from a token. Unknown
budget identity cannot establish a shared account. Keep budget contexts separate
across hosts and known identities even when displaying repository-wide traffic.

### Shared storage and concurrency

The user explicitly requires Git common-directory storage. The existing
`actionCaptureRoot()` already shares main-worktree `.tmp/aitm` state; no claim is
made that `.tmp` cannot aggregate worktrees. The chosen root instead keeps this
measurement history outside routine runtime-output cleanup and anchors it to the
Git repository's shared administration directory. This is a narrow user-directed
exception to `CLAUDE.md`'s general runtime-state rule. Implementing this story must
amend that rule with: "Exception: GraphQL usage metadata and its collection
control/coverage metadata may live only under
`<git-common-dir>/aitm/graphql-usage/`; no scratch, request/response payloads, or
other runtime output is authorized there." This amendment is an implementation
deliverable; this spec-only review does not edit `CLAUDE.md` or relocate legacy
action-capture data.

Shared-root reachability is an explicit precondition. Before enrolling a
worktree/session, verify that its actual runtime permission context can create,
append, flush, and read a small metadata probe in that dedicated subtree, then
remove the probe. Git path resolution alone is insufficient. A confirmed scope
denial is `collection-unavailable: shared-root-out-of-sandbox-scope`; an access
failure without proven sandbox cause is `shared-root-access-denied`; disabled
collection and disk/write failures remain distinct. Never bypass a sandbox or
silently stage usage records in another root. An operator arranges authorized
access to this exact subtree for participating sessions; if that is unavailable,
restrict the run to permitted sessions and disclose the selection bias.

Resolve Git from the consuming project/worktree context, never from the installed
AITM package directory or the current directory of an unrelated subprocess.
Propagate that context through child commands. Resolve the absolute path with `git rev-parse --path-format=absolute
--git-common-dir`; do not assume `<cwd>/.git` is a directory. Store files under
`<git-common-dir>/aitm/graphql-usage/v1/<worktree-id>/<session-id-or-unknown>/`.
Each process incarnation uses a random unique writer ID in its append-only
JSONL filename, so PID reuse cannot collide. Serialize writes within that
process, including overlapping async calls. This avoids
a cross-worktree append lock and permits a reader to aggregate complete lines
from many active writers. IDs used in paths are normalized or hashed, never
unsanitized external input. A partial final line is reported and ignored until
complete; earlier lines remain readable. The directory is machine-local and
must not be put in Git's tracked worktree, Git objects, hooks, or config files.
Use owner-only directory/file permissions where supported. No Git context means
collection is unavailable with a diagnostic, never a fallback into a package's
repository. Flush completed observations before normal command exit. Abrupt
termination can lose buffered or in-flight observations; report that limitation
and do not promise crash-proof exactly-once delivery. Keep data until explicit
local cleanup after export; report bytes used and storage failures. Cleanup must
exclude active writers and disclose removed observation intervals. Check and
report total retained bytes during baseline preflight and periodically during the
run; configure and disclose a soft-cap warning for that run. Do not silently
truncate records or delete historical data to meet it. Any operator-directed
collection pause or cleanup is a disclosed coverage gap.

## Reporting and baseline

An offline command reads the JSONL files without GitHub API calls. It reports:

- observed HTTP attempts and opaque invocation counts separately, and exact points by hour (UTC and selectable local time), worktree,
  session, issue, lifecycle state, and operation;
- peak rolling 60-minute call volume and known point consumption, plus daily
  and hourly charts;
- mean, median, and high-percentile point cost and latency per operation;
- retries, failures, unknown costs, unknown states, and uncovered call sites;
- account-budget context from response headers without attributing other
  clients' usage to AITM.

Bucket by `startedAt`; use UTC half-open intervals and rolling windows
`(t - 60 minutes, t]` evaluated at observation start times. Local displays retain
UTC offsets to distinguish repeated daylight-saving hours. Count known dispatched
HTTP attempts separately from uncertain/not-sent attempts and opaque invocations.
Point percentiles use only known costs and show sample counts; latency statistics
separate HTTP observations from whole CLI invocation latency. Validate schema and
nonnegative finite values; report malformed lines and unsupported versions without
abandoning other valid files. Deduplicate identical `callId` records, and flag
conflicting duplicates as invalid rather than choosing a value. Snapshot each
file's readable extent so active appends do not make a report unbounded.

Each sum includes an explicit known-cost subtotal and unknown-cost observation count.
The report cannot display a partial sum as a complete total. Show incomplete
cost coverage independently from null point costs: an opaque invocation may
have a known returned-response cost and still have unknown additional costs.
No known-cost percentage may imply all HTTP traffic was observed when opaque
invocations, uncovered sites, or collection gaps exist. A baseline report
records the instrumentation version, observation interval, covered call-site
inventory, and number of active worktrees. It must capture at least one real
creation-to-planning workflow and an overlap period with multiple worktrees
before it is used to rank epic work. Record collector versions and enabled/disabled
intervals for every participating worktree, the completed workflow's stages and
operation mix, inventory coverage, and unknown-cost rates per operation/kind.
Report only observed active worktrees unless an explicit participant manifest
proves the fleet size. For a decision-grade baseline, a local operator-maintained
participant manifest is required, listing every intended worktree/session and
its enrollment result, including denied or unreachable participants whose writers
cannot report centrally. Unknown enrollment outcomes remain unknown. Report
counts for each denial class, and label observed fleet size and concurrency as
lower bounds if any participant is denied, missing, or has unknown coverage.
The minimum concurrency sample is two enrolled, permitted worktrees with active
collectors over a declared overlapping 60-minute observation window and observed
AITM traffic from both. Report actual traffic/activity durations; a 60-minute
collector window does not imply continuous request load. If only unsandboxed
sessions qualify, disclose that restriction; do not generalize the result to the
entire fleet. Rank known-point contributions as lower bounds; do not
rank two operations' total point costs when missing costs prevent the comparison.
A shorter or insufficiently covered run is preliminary evidence. Compare later
runs with the same collector, coverage, workload/stage mix, interval definitions,
and relevant configuration, normalizing by completed comparable workflows and
showing raw totals, sample sizes, and remaining confounders.

## Acceptance criteria

1. A read-only call-site inventory lists all AITM-owned production GraphQL
   paths, marks covered, opaque, and out-of-scope paths, and is checked by a
   source-level inventory check scanning shipped Node and shell sources, plus
   injected transport/launcher tests. Include shared `gql`, direct `gh` callers,
   shell, synchronous subprocess, HTTP, and opaque high-level CLI surfaces;
   a wrapper-only or Node-only inventory is insufficient.
2. A query and a mutation each produce one observation per observable attempt
   or explicitly opaque invocation, with GitHub-reported primary point cost or
   an explicit unknown reason; mutations remain valid, and failures, pagination,
   retries, and ambiguous dispatch are represented without double counting.
3. In healthy-storage, normal-exit concurrency tests, two worktrees emit into
   the same Git common directory without interleaved or lost completed records,
   while each retains independent session attribution. Crash and storage-failure
   cases report the separate best-effort durability limits.
4. Recording and aggregation make no extra GitHub calls, preserve the existing
   GraphQL result and error behavior, and never persist secrets or issue bodies.
5. A local report and graph identify peak hourly usage and the highest-volume
   and highest-point operations, with coverage and missing-cost counts visible.
6. The baseline report includes a real creation-to-planning workflow and
   concurrent worktree interval with coverage limits, or explicitly states that
   measurement remains pending/preliminary. The spike's evidence deliverable is
   not complete until that baseline exists. Its comparison procedure supports
   measured call and point reductions with matched coverage and workload.
7. Disabled logging, no Git context, disk/write failures, malformed records,
   duplicate records, and mixed collector versions are visible as coverage
   limitations while original command results remain intact. Record writer
   start and normal-close markers as local diagnostic metadata; an unclosed
   writer is active or unclean, never proof of an exact crash or lost-call count.
   If storage itself fails, emit a bounded redacted stderr warning as the fallback
   diagnostic, preserving business stdout and original exit/result semantics.
   Reports mark absent/unreadable collector metadata as unknown coverage.
8. Usage collection reuses the action-capture shim without enabling body capture,
   works without an active issue, and passes both-mode compatibility tests. Shell
   and synchronous launcher tests verify completed records before parent return.
9. The implementation includes the narrow `CLAUDE.md` exception, an actual-runtime
   shared-root reachability check, and baseline participant manifest with denial
   counts and lower-bound/selection-bias disclosures.

## Verification

Use injected GraphQL transports to exercise query, mutation, error, retry,
unknown-cost, opaque CLI, pagination, nested-wrapper deduplication, and concurrent writer cases without consuming live quota. Make
one controlled live query and one controlled live mutation only in an
authorized test workflow, compare the query cost with GitHub's same-response
value, verify that the unchanged mutation records explicit unavailable cost,
and verify redaction. An implementation fixture must cover named/shorthand
queries, fragments, aliases and inline literals, plus successful and failing
`gh` and direct HTTP adapters. Use a disposable authorized test resource for the
live mutation and account for its cleanup as normal observed traffic. The baseline run is observational; it does not
mutate the backlog solely to generate traffic.

## External references

- [GitHub GraphQL rate and query limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)
  defines primary cost reporting and distinguishes secondary limits.
- [GitHub's published schema mirror](https://github.com/octokit/graphql-schema/blob/master/schema.graphql)
  exposes `rateLimit` on `Query`, not `Mutation`; implementation must recheck its
  target GitHub host's supported schema before changing request selection sets.
