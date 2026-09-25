<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-e9e2aa0015cbae662dfb0e828179b031"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-25-graphql-usage-measurement-spike-design.md"
artifact_commit: "34ccf5450d56b0e973c1aeb298759f070493fb13"
artifact_blob: "5650a855fa5117dfcfbca926519c5aeecaba13e3"
artifact_digest: "sha256:61145d35efc7b0404d39a0bd26bf61620bd98206dbac4b32e9ae2f5af3a22475"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:ee5a665a5fa33ba576c25696f7f811a12dfb91eceaf00e3c1944a8104a19d54e"
  identity_source: "declared"
started_at: "2026-09-25T21:17:30.939Z"
submitted_at: "2026-09-25T21:23:01.672Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The specification is unusually disciplined about measurement honesty. Its treatment
of cost attribution is the strongest part: the separation of an observed HTTP
attempt from an opaque CLI invocation, the refusal to infer a total from one
visible response, the refusal to subtract cumulative rate-limit headers, the
explicit `mutation-cost-unavailable` path grounded in the published schema's
placement of `rateLimit` on `Query` and not `Mutation`, and the rule that no
known-cost percentage may imply full observation. Those constraints are correct and
should survive revision unchanged. The reporting section's insistence on known-cost
subtotals, lower-bound ranking, and matched-coverage comparison is likewise sound,
and the boundary statements (no caching, no throttling, no lifecycle authority, no
extra GitHub calls to decorate a metric) keep the spike honestly scoped.

The problems are not in the measurement epistemics. They are in the specification's
engagement with the repository it will be implemented in. I verified the design
against the actual AITM tree at artifact commit `34ccf5450d56b0e973c1aeb298759f070493fb13`
and found that a substantial, already-shipped subsystem solves much of this
specification's collection problem, is never mentioned, and has already made a
different — and better-justified — decision on the single storage question this
specification treats as novel. Separately, the chosen storage root conflicts with a
tracked repository rule, is unreachable from the sandboxed worktree sessions that
constitute the fleet being measured, and the collection design has no mechanism at
all for the largest single concentration of GraphQL call sites in the repository,
which is written in Bash.

These are structural, not cosmetic. Two of them (R1-F001, R1-F002) can change what
gets built; one (R1-F003) can make the baseline systematically understate the very
concurrency the spike exists to quantify, while appearing internally consistent. I
recommend revisions.

Evidence method: read-only inspection of the worktree at
`/Users/kpburson/.codex/worktrees/2d7c/ai-task-manager`. I ran no mutating command,
made no GitHub call, and did not touch the artifact, the index, or any ref.

## Findings

### R1-F001 — The specification does not acknowledge the shipped `aitm.github-action-capture/v1` subsystem, which already implements most of the proposed collection design

`scripts/task-tracker/lib/action-capture.mjs` (marked `@story #1295`) and its PATH
shim `scripts/task-tracker/action-capture-bin/gh` already provide, in production
today:

- A process-boundary interception of every `gh` invocation. `prepareActionCaptureEnv`
  (`action-capture.mjs:194-230`) prepends the shim directory to `PATH` and passes the
  real binary through `AITM_CAPTURE_REAL_GH`, so the shim sees the complete argv and
  piped stdin of each invocation.
- GraphQL-aware classification. `classifyApi` (`action-capture.mjs:61-72`) detects
  `args[1] === 'graphql'`, and `graphqlDocument` (`action-capture.mjs:44-59`) already
  extracts the query document from JSON stdin, from `-f/-F/--field/--raw-field`
  `query=` forms, and from a bare `query=` argument. `classifyGhCall` then splits
  query from mutation via `/^\s*mutation\b/i`. That is precisely the `kind` field
  this specification proposes to introduce, already implemented and already
  covering both the `--input -` shape used by `gql()` and the `-f query=` shape used
  by the direct callers.
- A versioned record schema (`ACTION_CAPTURE_SCHEMA = 'aitm.github-action-capture/v1'`,
  `action-capture.mjs:27`), invocation IDs via `createRecordId`, and per-repository,
  per-issue record directories (`captureIssueDir`, `action-capture.mjs:129-136`).
- A redaction policy enforced at write time. `canStore`/`writePayload`
  (`action-capture.mjs:236-256`) run `assertNoCredentialValues` before persisting and
  record `{bytes, sha256, stored, redacted}` when the payload is withheld;
  `safeMetadata` (`action-capture.mjs:293-301`) runs `assertNoSecretRecordData`.
- Cross-process concurrency control. `allocateSequence` (`action-capture.mjs:258-291`)
  implements a `mkdir`-based lock with a staleness timeout and atomic counter writes.
- Opt-in enablement with a local off switch, via marker files
  (`isActionCaptureEnabled`/`setActionCaptureEnabled`, `action-capture.mjs:152-169`).
- Preservation of the wrapped command's contracts. The shim streams stdout and stderr
  through unmodified, forwards `SIGINT`/`SIGTERM`/`SIGHUP`, re-raises a terminating
  signal on itself to preserve exit semantics, and degrades to a bounded stderr
  warning when capture is unavailable (`action-capture-bin/gh:78-140` and `12-16`).

Compare that list against this specification's Collection design, Raw event schema,
Shared storage and concurrency, and acceptance criterion 4 and 7. The overlap is
large. The specification proposes a new observation interface, a new versioned JSONL
schema, a new redaction allowlist, a new concurrency story, a new enable/disable
switch, and a new "preserve original result and exception" guarantee, without stating
whether any of this extends, replaces, or runs in parallel with `#1295`.

This is a genuine design fork, and the specification currently does not know it is
standing at one. The consequence of leaving it unresolved is two concurrent
GitHub-traffic telemetry systems in the same repository, with two schema versions,
two redaction policies, two storage roots, and two enablement switches — which is
also two places for a future reader to be misled about coverage.

I am not asserting that action-capture is a drop-in substitute. It is not, and the
differences are material and worth stating precisely, because they are the honest
argument for building something new:

- It is enabled per active issue and keyed to `state.active` (`action-capture.mjs:199-205`),
  whereas the spike wants continuous fleet-wide observation including cross-issue and
  repository-scoped queries.
- It stores request and response payloads to disk when they pass the credential
  check. This specification deliberately forbids storing request or response bodies,
  queries, variables, and issue text. That is a real policy divergence, and this
  specification's position is the more conservative one.
- The shim captures stdout, stderr, and exit status only. It does not capture
  response headers, so it cannot supply the `x-ratelimit-*` budget context this
  specification wants, and it cannot by itself see a `rateLimit { cost }` value
  unless that field is already in the document being sent.
- Every observation it produces is, in this specification's own vocabulary, an
  opaque CLI invocation. It cannot see per-page or per-retry HTTP attempts inside one
  `gh` process.

Those four differences are a sufficient basis for a decision either way. What is not
acceptable is making the decision silently.

### R1-F002 — The chosen storage root is forbidden by a tracked repository rule, and the repository already contains a better answer to the exact problem that motivated it

The specification stores under
`<git-common-dir>/aitm/graphql-usage/v1/<worktree-id>/<session-id-or-unknown>/`, and
Goal 2 justifies this as being "outside any individual worktree's disposable
`.tmp/aitm` tree."

Two problems.

First, the location is disallowed by the repository's own tracked instructions.
`CLAUDE.md:154` reads: "Keep machine-local runtime state and generated output in
`./.tmp/` (for example `.tmp/aitm/`, `.tmp/reports/`, and `.tmp/coverage/`). Do not
write scratch under `.git/` or confuse disposable `.scratch/` work with runtime
`.tmp/` artifacts." The specification's storage design is machine-local runtime state
written under `.git/`. It satisfies the letter of "outside tracked files" — Git never
tracks its own directory — while contradicting the rule that actually governs this
class of data. The specification's Shared storage section enumerates what it must not
disturb inside `.git` (tracked worktree, objects, hooks, config), which shows the
author considered the hazard, but it never confronts the prohibition itself.

Second, and more decisive: the repository already solved the cross-worktree
aggregation problem without going into `.git`. `actionCaptureRoot`
(`action-capture.mjs:115-118`) is:

```
path.join(findMainWorktreePath(projectDir), '.tmp', 'aitm', 'action-capture')
```

`findMainWorktreePath` comes from `scripts/task-tracker/fleet-registry.mjs`. Resolving
the *main worktree* and writing to its `.tmp/aitm/` yields a root that is shared
across every linked worktree, machine-local, gitignored (`.gitignore:6` lists
`.tmp/`), compliant with `CLAUDE.md:154`, and outside `.git`. It delivers every
property Goal 2 asks for. Goal 2's phrasing — excluding "any individual worktree's
disposable `.tmp/aitm` tree" — is true of a *per-worktree* `.tmp/aitm`, but the
established pattern is not per-worktree; it is main-worktree-anchored precisely to be
shared.

So the specification rejects the repository's convention on a premise that the
repository's own code contradicts. Either the main-worktree root should be adopted, or
the specification must argue explicitly why `git rev-parse --git-common-dir` is
superior to `findMainWorktreePath` for this data and carry an amendment to
`CLAUDE.md:154` as part of the story's scope. I lean toward adoption: it is one fewer
convention to break, one fewer rule to amend, and it reuses a resolver that is already
tested.

I confirmed the resolution empirically in this worktree. `git rev-parse
--path-format=absolute --git-common-dir` returns
`/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.git` — a path outside this
worktree entirely. That is the intended aggregation behavior, and it is also the
setup for R1-F003.

### R1-F003 — The common directory is unreachable from sandboxed worktree sessions, which are the population the baseline is meant to measure

This is the finding I consider most damaging to the spike's evidentiary value,
because it fails in a direction that looks like success.

In this very worktree, a read-only `ls` of the resolved common directory is refused
by the session's filesystem scope:

```
ls -d /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.git
-> Access to path outside allowed scope:
   /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.git
   (reads permitted in project root, ~/.claude/, and system binaries)
```

The `git rev-parse` call itself succeeds, because the Git subprocess is permitted.
So the failure mode is not "no Git context." It is: the collector resolves a
perfectly valid absolute path and is then denied when it writes there. Under the
specification's own rules that is a storage failure, which produces a bounded stderr
warning and a coverage limitation — per session, for the entire run.

Now follow that through the reporting rules. "Report only observed active worktrees
unless an explicit participant manifest proves the fleet size" is the correct
guardrail, and it will do its job. But the resulting baseline will report a smaller
fleet and lower concurrency than reality, with every individual honesty rule
satisfied. Acceptance criterion 3 will pass, because it is stated in terms of
"healthy-storage" conditions and will be exercised by tests that run unsandboxed.
The Problem statement's premise — "several concurrent AITM worktrees use one
authenticated GitHub user's GraphQL budget" — is exactly what gets truncated.

Note that R1-F002's proposed remedy does not by itself fix this: the main worktree path is
also outside a scoped worktree session. The fix is specification-level, not
path-level:

- State filesystem reachability of the shared root as an explicit precondition of the
  spike, alongside the existing Git-context precondition.
- Introduce a coverage class distinct from both "disabled" and generic "storage
  failure" — for example `collection-unavailable: shared-root-out-of-sandbox-scope` —
  so a permission-scoped session is never conflated with a deliberately disabled one
  or with a disk error.
- Require the baseline report to state the number of sessions or worktrees in that
  class, and require it to mark fleet size and concurrency as lower bounds whenever
  the count is nonzero.
- Say how the baseline run will be conducted such that participating worktrees can
  actually reach the root — whether by granting scope, by an agreed per-worktree
  staging location that a reader later merges, or by restricting the baseline to
  unsandboxed sessions and disclosing that restriction as a confounder.

The specification already has the right instincts here; it simply has not noticed
that this particular unavailability is correlated with the thing being measured
rather than random.

### R1-F004 — No collection path exists for the Bash call sites, which are the largest concentration of GraphQL calls in the repository

Scope and boundaries commits to instrumenting "direct `gh api graphql` calls." The
Collection design then describes "a shared observation interface with adapters for
existing transport boundaries," and every mechanism it names — wrapper ownership,
async write serialization, flush before normal command exit — presumes a Node
process.

`scripts/gh/init-project-config.sh` contains 25 `gh api graphql` invocations. It is
production code shipped by the package: `bin/cli.mjs:1768` resolves and runs it. At
1631 lines it is the largest file in the repository (`docs/code-review/evidence.md:119`).
Its GraphQL traffic includes project and field discovery, field creation and update
mutations, and a paginated item read loop (`init-project-config.sh:553-567`). This is
first-run and repair traffic, and it is plausibly a meaningful share of the budget
pressure the Problem section describes.

No JavaScript adapter can observe those calls. The specification neither instruments
them nor declares them out of scope, so acceptance criterion 1's inventory would
either omit them silently or mark 25 sites opaque with no stated collection story.

Note also that AC1's inventory check, "a lightweight source-level or injected-transport
test so new paths are visible," must scan `*.sh` as well as `*.mjs`. An inventory test
that walks only Node sources will report full coverage of a call-site set that is
missing its largest member — a false green in exactly the shape this specification is
otherwise careful to prevent.

The PATH shim from R1-F001 is the natural mechanism here, since it intercepts at the
process boundary and is indifferent to the caller's language. That is a further
reason to resolve R1-F001 before settling the collection architecture.

### R1-F005 — Synchronous call sites have no described observation or flush path

`scripts/gh/verify-priority-p3.mjs:43` issues a GraphQL query through
`execFileSync`. The Collection design's concurrency rule is stated as "Serialize
writes within that process, including overlapping async calls," and durability is
"Flush completed observations before normal command exit."

A synchronous call site has no async interleaving to serialize and may exit
immediately after its check, so it needs a synchronous write-and-flush path or an
explicit statement that such sites are inventoried as uncovered. This is smaller than
R1-F001 through R1-F004, but it bears directly on AC1's completeness claim.

Note also that `verify-priority-p3.mjs` calls `execFileSync` directly rather than
going through the `ghClient` seam in `scripts/gh/lib/gh-client.mjs`, so it would be
invisible to any adapter installed at that seam. The repository's GraphQL callers are
split between `gql()` in `scripts/gh/lib/github-projects.mjs:53-59` and a long tail of
direct `gh api graphql` invocations — including `scripts/task-tracker/verbs/deliver.mjs`
(three sites), `scripts/task-tracker/lib/close-disposition.mjs` (two),
`scripts/task-tracker/lib/blocked-by-field.mjs` (two),
`scripts/task-tracker/lib/close-gates-lineage.mjs`,
`scripts/task-tracker/lib/apply-reevaluate.mjs`,
`scripts/task-tracker/commit-trail-handler.mjs`,
`scripts/task-tracker/gh-timing-comment.mjs`,
`scripts/task-tracker/epic-base-edit-guard.mjs`, and
`scripts/maintenance/heal-closed-issues.mjs`. The specification's "ownership belongs
to the lowest observable boundary" rule is correct, but the inventory work it implies
is larger and more heterogeneous than the Scope section's mention of "the shared
`scripts/gh/lib/github-projects.mjs` wrapper" suggests.

## Required changes

1. **Resolve the relationship to `aitm.github-action-capture/v1` (#1295) explicitly.**
   Add a section stating whether this spike extends action-capture, runs parallel to
   it, or supersedes it, with reasons. If a new schema and storage tree are
   introduced alongside the existing one, justify the duplication and state how a
   future reader distinguishes the two coverage surfaces. If the PATH shim is reused,
   state which of its current behaviors change — in particular the payload-storage
   policy, which this specification's no-bodies rule would tighten. (R1-F001)

2. **Change the storage root, or justify the exception and carry the rule amendment.**
   Either adopt the established `findMainWorktreePath(projectDir) + .tmp/aitm/...`
   pattern from `action-capture.mjs:115-118`, or state explicitly why
   `--git-common-dir` is required, and include amending `CLAUDE.md:154` in this
   story's scope rather than leaving the specification in silent conflict with a
   tracked instruction. Correct Goal 2's premise, which currently reads as though the
   only `.tmp/aitm` option were per-worktree. (R1-F002)

3. **Add shared-root reachability as a stated precondition, with its own coverage
   class.** Distinguish `shared-root-out-of-sandbox-scope` from both "collection
   disabled" and generic storage failure; require the baseline to report the count of
   sessions or worktrees in that class; and require fleet size and concurrency to be
   marked lower bounds whenever that count is nonzero. Describe how the baseline run
   will be arranged so that participating worktrees can reach the root, or disclose
   the restriction as a confounder. (R1-F003)

4. **Give the Bash call sites a stated disposition.** Either specify a collection
   mechanism that covers `scripts/gh/init-project-config.sh`'s 25 `gh api graphql`
   invocations, or declare that surface out of scope and require it to appear in the
   AC1 inventory as explicitly uncovered with its call count. Amend AC1 so the
   inventory check scans shell sources as well as Node sources. (R1-F004)

5. **Specify the synchronous call-site path.** State how an `execFileSync` GraphQL
   caller such as `scripts/gh/verify-priority-p3.mjs:43` is observed and flushed, or
   inventory such sites as uncovered. Broaden the Scope section's description of the
   call-site surface beyond the `github-projects.mjs` wrapper to reflect the direct
   `gh api graphql` tail. (R1-F005)

## Optional suggestions

1. **Reuse the existing GraphQL argv/stdin parsers rather than writing new ones.**
   `graphqlDocument` and `classifyGhCall` (`action-capture.mjs:44-93`),
   `scripts/task-tracker/lib/gh-project-guard.mjs`, and
   `scripts/task-tracker/lib/gh-edit-guard.mjs:700` each already parse `gh api graphql`
   invocations. Building the call-site inventory and the `kind`/`operation`
   fingerprinting on one of these reduces the chance that guard logic and telemetry
   logic drift into disagreeing about what counts as a GraphQL mutation.

2. **State that header-derived budget context requires a response-header-bearing
   transport.** The PATH shim captures stdout, stderr, and exit status only, so
   `x-ratelimit-limit/remaining/used/reset/resource` are unavailable through it unless
   `gh api --include` is used or the direct HTTP adapter handles the call. Making this
   explicit prevents an implementer from assuming header context is universally
   available and then quietly recording it as absent.

3. **State whether the augmented document's cost equals the unaugmented cost.** The
   specification handles the comparison problem well ("record the augmentation version
   and use the same method in later comparisons"), but Goal 1 and the epic
   prioritization both want production cost in absolute terms. A sentence on whether
   adding an aliased `rateLimit { cost }` selection perturbs the reported point cost —
   and on what is recorded if it does — would close the last gap between "cost of the
   instrumented request" and "cost of the request we actually ship."

4. **Bound retention.** "Keep data until explicit local cleanup after export; report
   bytes used" has no ceiling. A long baseline across several worktrees appends
   without limit into a shared root. Consider a disclosed soft cap with explicit
   truncation accounting, since a silent drop at the filesystem level would violate
   this specification's own coverage-honesty rules and would be discovered only as an
   unexplained gap.

5. **File the tracking issue before Develop.** The Status section notes no GitHub
   issue number is assigned. This repository requires an issue with `Estimate` and
   `Size` set before work starts, and the specification's own acceptance criteria are
   detailed enough to size now.

6. **Consider naming the concurrency-observation window.** AC6 requires "an overlap
   period with multiple worktrees" without a minimum duration or worktree count.
   Given that R1-F003 can suppress participants, a stated floor — with the lower-bound
   caveat attached — would make it harder to accept a thin overlap as sufficient.

## Decision

revisions-requested
