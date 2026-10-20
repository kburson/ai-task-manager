# Local estimation and guarded cloud publication — #2039

- Issue: [#2039](https://github.com/kburson/ai-task-manager/issues/2039).
- Date: 2026-10-19, America/Chicago.
- Status: specification draft for owner review; no implementation or Plan approval.
- Investigated source: `a69f054c80394a9650469da6a7033791df19cd7f`.
- Session scope: bind, investigate offline, and produce this specification. Keep Backlog state and implementation acceptance criteria unchecked.

## Intent and required outcome

Owners must be able to estimate from local evidence without exhausting the shared GitHub allowance on historical discovery. Disabling the rubric must stop estimation before indirect network work. AITM may still publish authorized changes to the current issue, provided it compares the cloud body with its retained baseline, refuses drift, and verifies the result before advancing local authority.

Success requires zero cloud backlog/history/calibration reads in every estimation mode, explicit disabled or unavailable results, bounded target publication traffic, and retained evidence for conflicts and uncertain writes. Preserve lifecycle, assignee, ownership, decomposition, proof, timing and Unknown semantics. Local estimates and cached observations are evidence, never permission to skip safeguards.

This changes estimation input and publication interfaces. The owner requested a specification; implementation and its detailed execution plan are later stages.

## Evidence and reproduction

### Independently inspected source

| Surface                                                                                                     | Finding                                                                                                                                            | Consequence                                                                                     |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `scripts/task-tracker/lib/estimation/runtime-adapter.mjs`, corpus queries and `loadProjectEstimationCorpus` | Pages all project items and fields, selects Done issues, then fetches their record comments with further pagination.                               | Filtering comparable IDs after discovery cannot prevent the scan.                               |
| `runtime-adapter.mjs`, `createAdaptivePlanRuntime`                                                          | Rejects nonpositive rubric IDs; rubric refresh loads a fresh cloud corpus, while comparable lookup shares a per-runtime promise.                   | Memoization does not enforce the no-scan requirement or define whole-command disabled behavior. |
| `scripts/task-tracker/lib/estimation/rubric-refresh.mjs`                                                    | Zero returns an unconfigured bootstrap rubric locally; enabled refresh retains the last 50 outcomes after discovery.                               | A cohort limit is not a transport budget; bootstrap output cannot imply an enabled rubric.      |
| `scripts/task-tracker/lib/estimation/plan-estimate-authority.mjs`, `executeAdaptivePlanEstimate`            | Reads Refine state before rubric/comparable loading, then calculates and publishes.                                                                | Dispatch policy belongs before this sequence.                                                   |
| `scripts/task-tracker/verbs/plan-estimate.mjs`                                                              | Evidence-file path constructs the runtime; compatibility path may read live board values.                                                          | Cover both entrypoints, callers and hooks.                                                      |
| `scripts/task-tracker/lib/decomposition-authority.mjs`, `readProject`/`readForecast`                        | Epic project authority loads children; forecast authority loads a separate projection.                                                             | Full authority collection has a substantial read set.                                           |
| `scripts/gh/lib/wave-admission.mjs`, `fetchEpicChildren`                                                    | Child query includes bodies, labels, memberships and nested project field values.                                                                  | Repeating this query per publication effect amplifies cost.                                     |
| `scripts/task-tracker/lib/estimate-writer-publication.mjs` and `decomposition-writer-registry.mjs`          | Publication/predecessor checks collect complete authority even for a single effect/before-record.                                                  | Replace these reads with resource-specific observations.                                        |
| `scripts/task-tracker/lib/decomposition-adaptive-writer.mjs`, effect reader                                 | Each effect independently calls `readProjection()`.                                                                                                | Consumers duplicate projections within one observation phase.                                   |
| `scripts/task-tracker/lib/decomposition-hook-authority.mjs`                                                 | Hook query includes comments, children, dependencies and nested project fields.                                                                    | A runtime-only patch misses an earlier dispatch path.                                           |
| `scripts/task-tracker/lib/body-version.mjs`                                                                 | Missing marker parses as numeric zero.                                                                                                             | Permissive parsing cannot establish verified mutation authority.                                |
| `scripts/task-tracker/lib/versioned-issue-write.mjs` and `issue-body-mutate.mjs`                            | Expected version is optional; fetch/push/read-back can automatically rebase and retry. There is no mandatory persistent baseline at this boundary. | Cached-version equality and explicit reconciliation are not enforced.                           |

Two injected in-memory probes ran without GitHub transport:

1. `versionedWriteBody` with no expected version or cached baseline, starting with an externally changed version-2 body, performs one write and returns `ok`, version 3. This confirms the missing baseline requirement; it does not demonstrate a live lost update.
2. `createAdaptivePlanRuntime` with rubric ID `0` throws `estimation-runtime:rubric-issue-unconfigured` instead of returning a typed disabled result. This alone does not measure caller/hook traffic.

### Reported incident evidence and access limits

The live issue reports 1,599 returned-cost points in the retained parent window, including 1,400 attributed to one `plan-estimate 225`: 50 child-graph observations at 22 points, 196 one-point projections and 50 one-point child-identity reads. It also reports 522 opaque CLI observations, including 120 with unknown cost. These are retained response observations, not necessarily complete or nonoverlapping HTTP totals. The REST snapshot does not establish GraphQL recovery.

The source SHA in that handoff matches this checkout. Original AIPR evidence is outside this session's permitted read scope; contents and counts were not independently reopened. Preserve these absolute paths:

- `/Users/kpburson/.codex/worktrees/aipr-journal-refactoring/ai-peer-review/.superpowers/sdd/2026-10-18-222-review-journal-refactoring/225-graphql-hotspot-analysis.md`
- `/Users/kpburson/.codex/worktrees/aipr-journal-refactoring/ai-peer-review/.superpowers/sdd/2026-10-18-222-review-journal-refactoring/225-graphql-hotspot-analysis.json`
- `/Users/kpburson/.codex/worktrees/aipr-journal-refactoring/ai-peer-review/.superpowers/sdd/2026-10-18-222-review-journal-refactoring/225-parent-current-usage-snapshot.json`
- `/Users/kpburson/.codex/worktrees/aipr-journal-refactoring/ai-peer-review/.superpowers/sdd/2026-10-18-222-review-journal-refactoring/graphql-usage-review-index.md`
- `/Users/kpburson/.codex/worktrees/aipr-journal-refactoring/ai-peer-review/.superpowers/sdd/2026-10-18-222-review-journal-refactoring/progress.md`
- `/Users/kpburson/.codex/worktrees/story-225-journal-inventory/ai-peer-review/.scratch/plan/225-actual-native/009-current-plan-estimate.log`
- `/Users/kpburson/projects/Vibe-Coding/ai-peer-review/.git/aitm/graphql-usage/`

Do not rerun the costly command live. Build bounded offline fixtures from source and, where accessible, sanitized retained evidence. Label synthetic counts separately from incident observations.

## Approach selection

1. **Recommended: local calculation plus guarded target publication.** Remove network capabilities from calculation; retain guards through narrower observations and explicit unavailable outcomes.
2. **Read coalescing alone.** Improves amplification but retains prohibited corpus discovery and optional baseline enforcement. Insufficient.
3. **Global network/CLI disable.** Stops traffic but blocks authorized issue updates and leaves the architecture broken. Insufficient.

## Estimation boundary

Introduce a pure mode resolver before transport construction, estimation authority collection, estimate-specific preflight and hooks. Rubric ID `0` means disabled; a positive integer means local. Missing, negative, noninteger or malformed configuration means unavailable/config-invalid. Never normalize invalid configuration into enabled mode.

Calculation receives immutable local inputs and pure functions. It has no GraphQL/REST client, `gh` executor, comment store or lazy network loader. Return a discriminated result:

- `disabled`, reason `rubric-disabled`: no inferred estimate, calibration, bootstrap publication or automatic forecast write.
- `unavailable`, with concrete missing/invalid input reasons: no generated estimate or partial publication.
- `estimated`, containing size/hours, input digest, model/policy identity and reproducible local provenance.

Disabled mode stops automatic estimation. Explicit human estimates remain eligible for the existing governed manual/compatibility publication path with human attribution, without enabling rubric loading. Preserve existing estimates. Disabled/unavailable never means zero hours, erased values or a fabricated forecast-ready marker. Update CLI rendering and exit handling for these results.

Local inputs comprise the selected plan at its recorded commit/digest, retained Refine values, supplied evidence, retained rubric and retained outcomes. Validate repository identity, schema, lineage, hashes, plan identity and timing completeness. Keep missing durations Unknown. Rubric-based calculation requires a valid local rubric; no cloud fallback or guessed bootstrap estimate. Comparable evidence may be empty only if the existing model explicitly supports it and records that limitation.

Use a versioned local evidence bundle/index under native durable runtime storage, resolved through existing root/storage identity APIs. Populate it from verified records already observed during ordinary issue work or explicit local file import. Import is offline, validates provenance and grants no lifecycle authority. Cache misses, invalid selected-plan evidence or unsupported schemas return unavailable. No automatic cloud hydration, scheduled warmup or relocated backlog scan.

Remove project corpus loading from all calculation/calibration chains. Preserve cloud readers only if non-estimation consumers still require them, with tests proving they are unreachable from estimation or evidence refresh. Rubric refresh consumes validated local outcomes and records its result locally.

## Commands, preflight and guards

Map each public entrypoint to its transports before implementation: evidence-file and compatibility `plan-estimate`, Refine, Plan, reevaluation/inflation/manual estimate writers, Plan approval/exit, start/resume/Explain, and command/source activity hooks. Cover direct and packaged entrypoints. Decide calculation mode before estimate-specific preflight.

- **Calculation:** zero remote dispatches across every transport, including local rubric refresh and estimation decomposition inputs.
- **Publication:** only the target issue, its configured project item and owned record comments. No child graph, other issue projections, project enumeration or historical discovery.
- **Lifecycle admission:** preserve native ownership, state and decomposition gates. Use target observations and validated plan structure where sufficient. If a gate requires fresh child/dependency authority, report unavailable and require the separate governed action; never silently traverse the graph from estimation or admit development from cached evidence. Independent wave-admission commands retain their guards.

The narrow publisher may assess accepted size/hours and the selected plan without children. For epic estimation, use explicit local decomposition evidence; absent required child evidence means unavailable. Publication cannot stamp unrelated lifecycle/decomposition readiness. Explain must distinguish publication availability from permission to develop or advance state.

Do not use `TT_SKIP_NETWORK`, suppress telemetry, remove activity guards or relax failures to achieve zero calls. Test prohibited dispatch before the verb runner as well as inside it. Ordinary target ownership/state checks remain separately attributable; they cannot carry estimation corpus or graph reads.

## Durable baseline and intent journal

Add a versioned issue-body baseline store and mutation-intent journal through native durable runtime storage resolution. Records survive restart and worktree replacement. Share per-repository/issue records across linked worktrees under a cross-process claim. Recovery evidence must not live only in purgeable `.tmp/aitm`. Register ownership and retention with runtime storage machinery. Keys include canonical repository, GitHub host and issue; project effects additionally bind project/item identities. Reject ambiguity.

A baseline contains schema, identity, exact returned body, explicitly present body version, digest, observation time and available provider metadata. Missing/invalid markers are unverifiable, never trusted version zero. Reject duplicate/malformed markers and unsafe integers. Keep legacy parsing for unaffected readers; use strict parsing for authority. Compare digests and versions: human edits may leave AITM's marker unchanged. Timestamps/ETags supplement evidence and are not presumed CAS tokens.

An intent contains operation ID, target, baseline generation/version/digest, declarative mutation description/patch, intended body/digest, relevant guard/input digests, timestamps and effect outcomes. Persist before the first write with atomic replacement and user-only access. Retain complete proposed bytes or a replayable patch; do not serialize executable closures. Failed persistence/corruption refuses mutation.

A normal target read may seed an absent baseline before intent construction. Mutation without a valid baseline refuses `baseline-unavailable`; fetching a new baseline cannot silently legitimize an old intent. Drift retains the old intent and new observation, marks reconciliation required and prohibits automatic baseline adoption/retry. Explicit targeted reconciliation establishes a new baseline generation and reviewed/recomputed intent through governed interfaces.

### Body write protocol

1. Acquire repository/issue claim; validate retained baseline, durable intent and native gates.
2. Immediately before the effect, fetch the target body. Require matching identity, strict version and digest. Missing, failed, incomplete or unequal observations refuse before writing. The read may serve same-phase consumers; old admission observations cannot substitute.
3. Derive the candidate from the validated baseline; run existing mutation, marker, proof, section-loss and reviewed-scope guards; stamp the next version. No-op verifies/refreshes the same baseline without pushing or bumping.
4. Persist dispatch intent, push once, then read the same target back. Require strict version and full body equality using only the existing trailing-whitespace transport normalization.
5. Atomically persist verified returned body/version/digest and confirmed journal outcome. Expose success only after cloud confirmation and local persistence. Later effects use this new generation.

Route `mutateIssueBody`, direct `versionedWriteBody` calls and supported body adapters through this mandatory boundary. Derive expected version from the baseline; no optional production bypass. Tests may inject an in-memory store. Keep one lower-level implementation. Inventory direct issue-body CLI/GraphQL writers and route each through it or document a creation-only exception. New issue creation is a separate protocol, not mutation with fabricated version zero.

### Conflict, uncertainty and concurrency

Remove automatic rebase/retry on changed cloud bodies, including disjoint edits. Return typed conflict and preserve intent/evidence for explicit reconciliation. Preserve already committed effects; never roll back by overwriting newer cloud content.

A timeout may mean a write landed. Record uncertain and allow one bounded target recovery read, without blind replay. Exact intended body/version confirms the effect; unchanged baseline means not observed as landed and requires explicit validated retry; different content means conflict. Failed recovery reads leave uncertainty. Cloud success plus local persistence failure means recovery required, not clean success. Restart reconciles before another write. Operation IDs and resource checks prevent duplicate owned comment/forecast effects.

A local claim serializes cooperating processes sharing this store, not GitHub users, bots, other machines or independent stores. Separate compare/write leaves a time-of-check/time-of-use window: an edit after validation can still be overwritten even when later read-back matches. Read-back detects some races but cannot establish that no intervening edit occurred. **This is optimistic conflict detection, not atomic compare-and-swap or an absolute no-overwrite guarantee.** Owner acceptance must acknowledge this limitation or require a provider-supported atomic primitive. Do not assume REST conditional writes or GraphQL offer one without verified provider evidence and a design revision.

Comments/project fields are separate resources; body version does not version them. Revalidate the target body before each actual cloud mutation, plus each resource's native ownership/predecessor/expected-value checks and read-back. Journal partial outcomes using the existing publication protocol. Never present this as a transaction across body, comments and project fields.

## Publication reads, budgets and freshness

Replace full-authority effect readers with resource-specific target reads: body for before-records, configured item fields for project effects, owned comments for forecasts. Reconcile predecessors from one observation per unchanged resource phase. Share projection promises within a phase; invalidate after corresponding writes, failed reads, conflict, restart or drift. Never reuse prewrite validation across mutations or make cached admission evidence indefinitely fresh.

Attribute attempts/completions/failures to operation, phase, purpose, resource and target. Count operations separately from returned GraphQL points. Keep HTTP/CLI coverage, unknown costs and opaque subprocess observations visible. Never sum overlapping collector views as independent cost or treat missing cost as zero.

These are proposed offline acceptance ceilings, not measured improvements:

| Fixture                                                          | Ceiling                                                                                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Disabled/invalid/unavailable calculation                         | 0 remote operations and mutations; no point observations                                                                                     |
| Enabled local calculation/rubric refresh                         | 0 remote operations across every transport                                                                                                   |
| Valid-baseline body no-op                                        | 1 targeted read; 0 writes                                                                                                                    |
| Successful body mutation                                         | 1 prewrite read + 1 write + 1 verify read                                                                                                    |
| Baseline/version/digest conflict                                 | At most 1 targeted read; 0 writes                                                                                                            |
| Full epic publication, one-page target fixture                   | At most `6 + 4M` remote operations; `M` counts every cloud effect, including journal/body-marker writes. Zero child/corpus/other-issue reads |
| Increase unrelated history 0→1,000 or local child evidence 1→100 | Same publication operations for the same effects; no backlog-dependent growth                                                                |
| Additional target record pages                                   | Add exactly declared pages `P`, with hard page/byte limits and refusal on incomplete authority                                               |

The six fixed operations cover target identity/authority setup and final convergence. Each effect allows separate body validation, resource validation, write and verification; combined responses should reduce this. For six effects the ceiling is 30 before declared pages. Count actual journal effects, not just business effects. Fit existing guards into the declared budget or seek design review before raising it. No-op/conflict ceilings apply to the body writer, not unrelated command setup.

Set target-owned record pagination ceilings to 10 pages and 4 MiB returned UTF-8 data per publication invocation. Refuse before fetching page 11; stop on a response that crosses the byte bound and refuse mutation from incomplete observations. Require sequential pagination so parallel dispatch cannot exceed the page cap. These ceilings deliberately trade availability for bounded cost; display a targeted reconciliation/record-maintenance need rather than truncating evidence. No automatic cleanup is authorized.

Assign each mock response a known synthetic cost; assert exact returned-cost sums separately from request counts. Repeat without cost data and require unknown coverage. Synthetic costs establish no production point ceiling. Record source-fixture before/after counts and costs with fixture/coverage identity. Include actual CLI preflight/hooks and publisher, not only a pure calculator. Fail on unclassified transport. After-fix measurements remain implementation work.

## Verification and acceptance mapping

Write failing offline tests before implementation. Spies cover GraphQL, REST, `gh` and spawned entrypoints; injected runtime clients alone cannot catch production-import bypasses.

| Issue requirement   | Regression evidence                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC1 disabled        | Rubric `0` across evidence-file/manual compatibility, Refine, Plan, approval/exit and activity hooks. Fail on remote calculation dispatch; separately identify bounded target publication. No bootstrap/forecast side effects.                                                                                                                                                                                                                   |
| AC2 local-only      | Valid/missing/corrupt/wrong-repository local evidence; forbidden corpus/history/comparable/rubric transport; local recent-outcome calibration; history-independent operation counts.                                                                                                                                                                                                                                                             |
| AC3 cached body     | Missing/duplicate/malformed markers, absent/corrupt cache, unchanged version with changed content, identity mismatch, no-op and verified success refresh.                                                                                                                                                                                                                                                                                        |
| AC4 recovery/guards | External edits between operations and validation/read-back; timeouts before/after landing; failed reads; local persistence failure; crash at every journal transition; restart; linked-worktree concurrency; explicit reconciliation; partial body/board/comment effects and idempotent replay. Preserve ownership/lifecycle/proof/marker/section/reviewed-scope guards and Unknown values. Demonstrate the residual undetectable race honestly. |
| AC5 budgets         | Full epic publication and predecessor recovery with source-shaped adapters; multiple effect counts; exact ceilings; page/byte boundaries; same-phase sharing and postwrite invalidation; known/unknown synthetic costs.                                                                                                                                                                                                                          |
| AC6 reviewability   | Diff checks, source-to-test map, retained evidence paths and access limitations.                                                                                                                                                                                                                                                                                                                                                                 |

Extend existing plan-estimate authority, adaptive integration, mutate-issue-body, body-version, versioned writer and hook/decomposition publication tests. Add store/journal/dispatch-budget tests under canonical discovery with `@story #2039`. Update the issue's governed Verification Commands during implementation to enumerate actual files; the intake list alone cannot prove the matrix.

Run targeted offline tests first, then normal fast/slow test, lint and formatting lanes during implementation. No implementation suite pass or production improvement is claimed by this specification. Later live confirmation requires separately bounded authorization, an operation budget and stop condition. No quota polling or replay of the expensive command is needed.

## Delivery boundaries and acceptance decision

Three coordinated implementation units: local calculation/input storage and dispatch policy; mandatory baseline/journal writes; resource-specific publication and budgets. Keep units independently testable, integrate all three before claiming #2039 fixed, and map every entrypoint/effect in the later implementation plan. Decide there whether governed child issues are required; this session creates none.

Update existing callers/messages rather than preserving permissive fallbacks. Keep cloud history and records. Baseline setup/reconciliation remains explicit and target-scoped. Insufficient local evidence stays unavailable until offline import supplies it.

Owner review must resolve the residual race guarantee. The enforceable promise is refusal of detected stale/missing authority, bounded verification and recoverable intent. Absolute prevention of every external overwrite is not established here.

Out of scope: AIPR hydration, backlog scans, live calibration, timing repair, quota polling, state advancement, merge/release, global shutdown or product implementation in this session.
