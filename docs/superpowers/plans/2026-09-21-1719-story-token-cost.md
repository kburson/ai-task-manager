# Story-Level Agent and Automation Cost Accounting Implementation Plan

<!-- @story #1719 -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure the agent and metered automation cost of delivering a governed story to trunk, with explicit coverage gaps, separate post-trunk cost, and independent subscription utilization.

**Architecture:** Preserve Timing Log lifecycle authority and append immutable event, policy, and reconciliation envelopes through an isolated cost-comment transport. Freeze observations and complete publication identities in a durable local outbox; derive reproducible, currency-specific read models from accepted GitHub evidence. Host transcript adapters supply economic observations independently of the existing word counters.

**Tech Stack:** Node.js ESM, Node built-in assertions/test runner, filesystem journals and locks, existing GitHub REST/GraphQL ports, canonical AITM record envelopes, sanitized offline fixtures. Retain the repository's Node `>=24` floor; add no runtime dependency.

**Spec:** [Ratified design at merge commit 0f68e0c2](https://github.com/kburson/ai-task-manager/blob/0f68e0c2cc19db0b6a1cc4e94014595f3a423dea/docs/superpowers/specs/2026-09-20-1719-story-token-cost-design.md), local source `docs/superpowers/specs/2026-09-20-1719-story-token-cost-design.md`.

**Source integrity:** SHA-256 `1a47930a8c54c29d64b6b06abca9f1291d3d6f9362e6d7289b58ef18e9b990a9`; published through [PR #1727](https://github.com/kburson/ai-task-manager/pull/1727); reference recorded in [issue #1719](https://github.com/kburson/ai-task-manager/issues/1719).

**Plan status (original, 2026-09-21):** Proposed, undergoing its separately authorized XPR; implementation approval was pending. The user had authorized creation and commitment of this plan, but the plan itself did not authorize implementation or backlog hydration. Issue #1719 was then the design-and-plan deliverable.

**Current status (2026-09-24):** The plan was accepted in PR #1730. On 2026-09-21, the user separately authorized repurposing #1719 as the implementation epic and hydrating its sixteen children, #1733 through #1748, ahead of this amended artifact's Plan approval. That authorization superseded the original backlog-hydration sequence, not the per-child Plan and delivery gates. This review seeks approval of the amended Story Intent and canonical task headings; it does not itself authorize production implementation, historical backfill, live billing credentials, or provider account access. The user's subsequent delivery instruction authorizes governed implementation only after each child's required gates. Live access and backfill still require separate scope approval. The technical implementation steps are unchanged.

## Story Intent

- **Beneficiary:** delivery engineering leader
- **Capability:** see evidence-backed agent and metered automation cost for a story through delivery and Done
- **Need:** timing records do not establish provider usage, billed amounts, or complete story attribution
- **Value or failure prevented:** delivery decisions use attributable cost without treating missing evidence or fixed subscriptions as story spend

## Global Constraints

- “The existing Timing Log remains the lifecycle authority.”
- “Fixed subscription spend is not allocated to issues, stages, agents, or tokens.”
- “Binary floating-point values are not monetary authority.”
- “Version one aggregates monetary values separately by currency.”
- “The timing or lifecycle action does not fail solely because usage measurement, valuation, billing lookup, ledger append, or projection refresh failed.”
- “Feature-disabled behavior remains byte-compatible: Timing Log rows, issue records, CLI output, and lifecycle gates do not change.”
- “The reporting path performs no network mutation.”
- “Provider fixture tests use sanitized checked-in records and make no live API calls.”
- Reuse the unchanged secret policy; no new `safeKeyNames` exception. No prompts, reasoning, tool bodies, credentials, raw provider responses, or local transcript paths in durable GitHub cost records.
- Keep the envelope's scalar `predecessor` and `supersedes`. The many-to-many span replacement set belongs in the reconciliation payload.
- Read timing suffixes and isolate cost records before enabling any writer. Missing or corrupt economic evidence must never weaken or poison governance validation.
- Replay the complete frozen envelope, authority identity, marker, prose, and body. An equal payload hash alone is not successful delivery.
- All new executable files carry the child implementation issue's `@story` tag. The implementation issues now exist: before executing any task, substitute that task's child issue in every executable `@story` tag and every `[#N]` commit subject. Do not invent issue numbers or commit a `[#1719]` subject from a child's worktree. Example commands below retain the original #1719 placeholder; fixture issue numbers may remain 1719. Each child uses `Source-plan-section` set to its exact `### Task N: <title>` heading; the #1719 implementation backlog records the Task 1–16 to #1733–#1748 mapping.
- Use repository-owned worktree setup and self-link verification before execution. Keep scratch inputs in `.scratch/`, disposable runtime caches in `.tmp/aitm/`, durable cost journals in the clone-shared Git metadata directory defined below, and tests within the canonical `scripts/tests/` tree.

---

## Delivery order and release boundaries

Keep one plan because the writers, coverage inventory, and read model form one accounting contract. Deliver independently testable changes in this order:

1. Tasks 1–4: schemas, isolated records, timing compatibility, prospective policy. No live capture.
2. Tasks 5–7: pure accounting and durable capture transactions. Fixture adapters only.
3. Tasks 8–11: all timing emitters, local adapters, authoritative boundaries, append-only reconciliation. Capture remains opt-in and disabled in repository defaults.
4. Tasks 12–14: truthful reports, optional projections, separate subscription accounting.
5. Task 15: offline administrative evidence and a separately gated live-integration boundary.
6. Task 16: acceptance scenario, failure matrix, packaged compatibility, and documented prospective rollout.

Tasks 2 and 3 are hard prerequisites for Task 8. The compatible Task 10 delivery-payload reader must also ship before any enabled delivery writer. Publish these reader changes together as a reader-only release before the capture release. Do not ship an enabled writer with only some prerequisites.

The shared GitHub issue is the compatibility boundary across installed packages, linked worktrees, CI and automation. Keep the ratified `row-sec` then cost-marker order: putting cost first would change the ratified wire contract and would still require compatibility tests. A pre-upgrade reader throws `timing-row-reader:estimation-row-sec` on the ratified composed suffix. Characterize this with a pinned old-package fixture; it is not a supported mixed-version deployment. Task 16 must name the exact published reader-only package version and immutable commit in the rollout guide before enablement; that version is the minimum supported reader for a cost-enabled issue. No numeric release is invented before the release exists.

Enablement requires a repository-owner inventory of every consumer of the shared issue, including CI pins, installed packages and stale worktrees, with recorded verification that each supports the reader-only release. Unknown or unverified consumers mean capture stays disabled. Configuration exposes `readerRolloutFile` (default null), a project-local, secret-free versioned manifest containing `{ schema, readerVersion, readerCommit, consumers, confirmedAt }`; each consumer is `{ id, version }`. Task 4 validates the manifest, semver floor and locally installed reader capability `story-cost-readers/v1` before enabling either writer. This is an explicit operator attestation, not automatic discovery of every installation. A missing or invalid attestation declines capture with unchanged timing bytes and a local diagnostic. The rollout guide requires reconfirmation whenever a consumer is added or downgraded and forbids rolling any reader below the floor while cost evidence remains. Reader support is retained after capture is disabled. Each implementation task ends with its own tests and commit; plan review and implementation authorization precede all of them.

## Current repository anchors

These are implementation anchors verified against the spec's merge commit, not claims that the new interfaces already exist.

| Existing file / function                                                                                                                             | Required integration                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `scripts/task-tracker/runtime.mjs`: `flushActiveToGH`, `safePostTiming` (runtime context members), queue drain functions                             | Capture every emitted row, retain actual sample times, replay prepared rows                                                |
| `scripts/task-tracker/gh-timing-comment.mjs`: `buildRow`, `buildFlushRow`, `postTimingEvent`                                                         | Preserve old bytes when disabled; keyed append/read-back when enabled                                                      |
| `scripts/task-tracker/lib/timing-row-reader.mjs`: `splitTimingRowMarker`, `parseTimingRow`, `replaceTimingRowCells`, `ensureTimingRowFullMarkerCell` | One composed-suffix grammar, independent cost diagnostics                                                                  |
| `scripts/task-tracker/lib/github-records/record-envelope.mjs`                                                                                        | Reuse canonical JSON, validation, hashing, secret rejection, IDs, and envelope links                                       |
| `scripts/task-tracker/lib/github-records/github-comment-store.mjs`                                                                                   | Extract validated raw-node enumeration without weakening the existing generic record reader                                |
| `scripts/task-tracker/issue-mutator-lock.mjs`: `withIssueLock`, `isIssueLockHeld`                                                                    | Reuse caller authority; never recursively acquire a physical issue lock                                                    |
| `scripts/task-tracker/queue.mjs`                                                                                                                     | Preserve timing queue behavior; do not reuse its corrupt-file-to-empty or discard semantics for economic evidence          |
| `scripts/providers/transcript-resolver.mjs`, `scripts/task-tracker/word-counter.mjs`                                                                 | Reuse location/session resolution only; independently validate usage availability                                          |
| `scripts/task-tracker/lib/evidence-v2/delivery.mjs`, `record-schema.mjs`                                                                             | Add an explicitly validated verification instant for new opted-in delivery evidence; historical records retain their shape |
| `scripts/task-tracker/task-tracker.mjs`, `verbs/help-data.mjs`                                                                                       | Register reporting and explicit reconciliation commands with matching help and guards                                      |

## Module and data contracts

New accounting code lives under `scripts/task-tracker/lib/cost/`. Keep schema, arithmetic, storage, and rendering separate. Unit tests mirror that directory under `scripts/tests/unit/task-tracker/lib/cost/`; integration tests live under `scripts/tests/integration/task-tracker/lib/cost/`. No new module should exceed the repository line cap; split a responsibility into a named helper rather than adding a lint exemption.

### Immutable payloads

`schema.mjs` exports `COST_RECORD_TYPES`, `validateCostPayload(recordType, payload)`, and `validateObservation(observation)`. Validators return a deeply frozen validated value or throw `TypeError('cost:<condition>')` without incorporating input bodies in the error.

| Record type                 | Payload schema                      | Required content                                                                                                                                                   |
| --------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agent-cost-event`          | `aitm.agent-cost-event/v1`          | Event/policy/operation identity; canonical timing slug and instant; stage/visit/role; resolved source roster; observations; spans; cost lines; bounded diagnostics |
| `agent-cost-reconciliation` | `aitm.agent-cost-reconciliation/v1` | Revision identity; reason; exact input record hashes; complete removed/added span sets; corrected evidence; residuals; effective projection hash                   |
| `agent-cost-policy`         | `aitm.agent-cost-policy/v1`         | Policy identity; effective event/instant; capture mode; source selection rules; safe versioned capability projections; catalog hashes; expected run rules          |
| `subscription-capacity`     | `aitm.subscription-capacity/v1`     | Provider/account/plan/period identity; fixed spend/currency; contractual capacity and included/overage rules; accepted usage references; residuals; coverage       |

The cost allowlist contains exactly those four record types and is disjoint from capsule, contract, lifecycle, delivery, workflow-exception, and estimation record types. `schema` is a payload discriminator; it does not replace the outer `aitm.record/v1` envelope.

Use these closed shapes; optional information is represented by explicit `null`, an empty array, or a diagnostic, not omitted silently:

- **Event payload:** `{ schema, eventId, policyId, operationId, issue, timingEvent, timingRecordedAt, stage, stageVisit, eventRole, sources, observations, spans, lines, diagnostics }`. `sources` is the resolved roster even when every observation is unavailable. `eventRole` is `opening`, `ordinary`, `delivery-cutoff`, or `terminal`.
- **Policy payload:** `{ schema, policyId, effectiveEventId, effectiveAt, captureMode, sourceRules, capabilities, catalogHashes, runRules }`. Each source rule is `{ adapterId, sourceKind, match, requiredViews, scope }`; match is `{ agentProvider, billingProvider, accountRef }` with null for unconstrained fields, and scope is `session` or `run`. A capability entry is `{ adapterId, adapterVersion, capability }`, where capability has the exact fields listed in Task 4. `catalogHashes` entries are `{ rateCardId, hash }`; `runRules` is `{ kinds, requireLaunchEvidence, requireCompletionEvidence }`. No credential configuration or arbitrary object is allowed.
- **Reconciliation payload:** `{ schema, revisionId, reason, inputs, removedSpanIds, addedSpans, correctedEvidence, runFacts, residuals, projectionHash }`. `runFacts` carries explicit append-only registration/completion facts defined in Task 10. A registration has empty span replacement arrays; it is not permission to revise observed quantities. `correctedEvidence` entries are `{ recordId, payloadHash, reason, replacementObservation, replacementLines }`; null observation and an empty lines array distinguish unused correction channels. Replacement lines name existing `lineId` values and are accepted only against the input hash. `residuals` entries are `{ sourceId, periodStart, periodEnd, quantity, unit, money, reason }` and never enter an additive story subtotal without proven ownership.
- **Subscription payload:** `{ schema, periodId, provider, accountRef, planName, periodStart, periodEnd, fixedSpend, capacity, rules, usageRefs, residuals, evidenceRefs, reconciledAt }`. `rules` is `{ includedCategories, overageRates }`, with overage entries `{ category, unit, rateCardId, rateCardHash }`. `usageRefs` entries are `{ issue, recordId, payloadHash, economicKey }`, and `evidenceRefs` entries are `{ sourceLocator, evidenceHash }`. The period's derived utilization/status belongs to the report; it must be reproducible from these immutable inputs.
- **Counter:** `{ category, value }`; category is a supported adapter vocabulary value, value is a canonical nonnegative integer string. Accept safe integer inputs only at adapter boundaries and convert without loss. Never persist arbitrary provider keys.
- **Source:** `{ sourceId, sourceKind, agentProvider, billingProvider, accountRef, sessionRef, runRef, model, serviceTier, region, epoch, adapterId, adapterVersion }`. Non-applicable model/tier/region are null. Account references are opaque, non-secret IDs. `epoch` is a positive integer distinct from envelope authority epoch.
- **Observation:** `{ observationId, source, observationKind, status, precision, observedAt, periodStart, periodEnd, priorObservationId, sourceLocator, evidenceHash, nativeCounters, commonQuantities, receipts, watermark, estimateMethod, diagnostics }`. Kind is `baseline`, `interval`, or `unavailable`; status is `available` or `unavailable`; precision is `exact`, `aggregate`, `estimated-consumption`, or `unavailable`. Period bounds and watermark are nullable. `commonQuantities` uses Counter entries whose category values name the normalized quantity. `receipts` is the bounded set defined in Task 9. `watermark` is null or `{ through, sourceLocator, evidenceHash }`, backed by a source contract proving coverage through that instant. `estimateMethod` is null for measured evidence or `{ engine, encoding, version }` for explicitly estimated consumption.
- **Span:** `{ spanId, sourceId, epoch, startObservationId, endObservationId, startAt, endAt, ownerIssue, stage, stageVisit, deliveryWindow, quantities, economicKey, diagnostics }`. Unproved ownership/stage/visit are null. Boundary classification is `delivery`, `post-trunk`, `unknown`, or `not-applicable`.
- **Money:** `{ amount, currency }`; amount is an exact canonical decimal string, never a binary float. Quantity arithmetic uses integer strings/BigInt internally; JSON contains no BigInt values.
- **Line:** `{ lineId, spanId, ownerIssue, runRef, category, nativeCategory, quantity, unit, nativePrecision, money, valuationKind, rateCardId, rateCardHash, effectiveAt, formulaVersion, rounding, sourceRecordId, economicKey, includes, status, diagnostics }`. Unknown money is null; status uses `complete`, `partial`, `unavailable`, or `not-applicable`. `includes` is an array of present line IDs with proven covered components.
- **Diagnostic:** `{ code, sourceId, eventId, recordRef }`; nullable references, bounded opaque identifiers only. Never interpolate a provider body, rejected category, error stack, or envelope into a diagnostic.

Limits are explicit implementation choices: at most 32 resolved sources/event, 128 native categories/observation, 256 receipts/observation, 256 lines/event, and 128 diagnostics/event. Exceeding a bound produces a small unavailable source result and retains a continuation cursor locally; it never truncates a complete observation. Enforce the existing 256 KiB limit on escaped canonical envelope JSON, the existing 1 MiB body limit, and an additional conservative 60,000 UTF-8-byte GitHub body budget. Apply the smallest limit to the final rendered body. A batch that cannot fit is incomplete, not repeatedly attempted forever.

Source matching cannot invent a billing provider from a host name; a null unconstrained selector does not establish economic identity. Unknown source identities remain unavailable until correlation is proven.

All exported functions below take one object argument unless an exact positional signature is shown. Pure functions perform no filesystem, GitHub, provider, clock, or ID-generation I/O; inject those values at the boundary.

### Local durability and read model

Resolve the clone's common Git directory explicitly with `git rev-parse --path-format=absolute --git-common-dir`; refuse ambiguous resolution for cost persistence rather than falling back to a second checkout-local cursor. Store the shared journal under `<git-common-dir>/aitm-cost/`, with directories mode 0700 and files 0600. This is machine-local, ignored Git metadata, not tracked authority. Store disposable report snapshots under `<worktree>/.tmp/aitm/cost-cache/`. Use a schema/versioned journal; never interpret parse failure as an empty journal.

An atomic frozen-event file is the commit point for both observations and cursor advancement. Source heads are derived from committed frozen files; a head-index file is a rebuildable cache, never a second authoritative commit. Intent, frozen, and delivered acknowledgments use separate atomic files keyed by the same operation ID. An intent without a frozen file is recoverable but is not a historical observation. Unknown remote outcome remains pending until exact read-back resolves it. Never purge pending data during ordinary cleanup. Deleting or re-cloning the common Git directory loses undelivered frozen evidence; GitHub cannot reconstruct unobserved quantities. This accepted local durability limit must surface as missing coverage, never measured zero. Canonicalize the resolved common directory with `realpathSync`, using `evidence-v2/execution-context.mjs` as a resolution reference; do not copy its sandbox-specific containment root, since a linked worktree legitimately shares Git metadata outside the worktree.

The spec reporting section calls for GitHub evidence while its security tests forbid network calls on the default report path. Resolve those requirements by reading a verified local snapshot by default and using explicit GitHub-only refresh; do not reinterpret default reporting as implicit network access. Report defaults are deliberately offline: `npx aitm cost 1719 [--json]` reads the last verified GitHub evidence snapshot, reports its `asOf` time and freshness limitations, and performs no network call. A fresh checkout first runs `npx aitm cost 1719 --refresh`; this explicitly reads GitHub timing, policy, session/run, delivery, and cost evidence, writes only the local cache, and then renders. No report option calls provider billing APIs or writes GitHub. Missing cache yields unavailable coverage, not zero. A whole-story summary is never complete for an active story with an unproven Done cutoff; a covered subwindow may be complete. Completeness is always qualified to the fetched authority snapshot, not a claim about unseen later edits.

### Task 1: Closed schemas and safe fixture vocabulary

#### Story Intent

- **Beneficiary:** delivery engineer
- **Capability:** validate closed cost evidence shapes and build safe representative fixtures
- **Need:** malformed, unsupported, or secret-bearing observations could enter accounting records
- **Value or failure prevented:** delivery engineers can trust cost records without leaking prompt or credential content into public issue evidence

#### Implementation Steps

**Files:** Create `scripts/task-tracker/lib/cost/schema.mjs`, `diagnostics.mjs`, `scripts/tests/helpers/cost/fixtures.mjs`, `scripts/tests/fixtures/cost/README.md`, and `scripts/tests/unit/task-tracker/lib/cost/schema.test.mjs`.

**Interfaces:** Produce the three schema exports above, `makeDiagnostic({ code, sourceId = null, eventId = null, recordRef = null })`, and test factories `eventFixture(overrides = {})`, `observationFixture(overrides = {})`, `lineFixture(overrides = {})`. Factories return complete valid objects following the contracts above, use fixed IDs/times, and apply overrides last. Fixture native counters use `input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `output_tokens`, and `reasoning_output_tokens` only when the selected adapter contract supports them.

- [ ] Create the complete baseline event fixture with policy/event/operation IDs, issue 1719, `develop:started`, stage `develop`, visit 1, role `opening`, a source roster, one baseline observation, no spans or money, and empty diagnostics. Use `2026-09-21T00:00:00.000Z` for its fixed instant.
- [ ] Add the first failing schema tests, including missing fields, unknown keys, negative counters, unsupported names, secret-shaped capability keys, and valid safe native arrays:

```js
import assert from 'node:assert/strict';
import { validateCostPayload } from '../../../../../task-tracker/lib/cost/schema.mjs';
import { eventFixture } from '../../../../helpers/cost/fixtures.mjs';
const payload = eventFixture();
assert.deepEqual(validateCostPayload('agent-cost-event', payload), payload);
assert.throws(() => validateCostPayload('agent-cost-event', { ...payload, authMode: 'local' }));
assert.throws(() => validateCostPayload('lifecycle-transition', payload));
```

- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/cost/schema.test.mjs`; expect failure because the validators do not yet exist.
- [ ] Implement exact-key validation from the closed shapes, enum checks, canonical UTC instants, positive issue/epoch/visit values, bounded identifiers, native vocabulary membership, and canonical decimal/integer syntax. Test null and unavailable cases separately from available zero. Use this integer rule before conversion:

```js
const isQuantity = (value) => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);
```

- [ ] Run every payload family through `assertNoSecretRecordData` unchanged. Use safe keys such as `accessMode` and `runRef`; `dispatchRef` contains a forbidden key fragment and must not be published. Validate capability and rate-card projections as rigorously as event payloads. Reject an unsupported credential-shaped native category with a stable diagnostic rather than encoding it. Pin the safe plural vocabulary with tests: `input_tokens` as a supported category value passes the unchanged secret policy, while singular `input_token` fails; do not generalize arbitrary provider names into the vocabulary.
- [ ] Add bounded-diagnostic tests proving rejected data cannot appear in error messages. No source observation contains prompt or tool-body fields; unknown fields are refused.
- [ ] Re-run the schema test and `node --test scripts/tests/unit/task-tracker/lib/github-records/record-envelope.test.mjs`; expect both to pass.
- [ ] Commit the Task 1 files with `git commit -m '[#1719] Define cost payload and evidence contracts'` after explicitly staging only those files.

### Task 2: Isolated cost envelopes and validated raw comment transport

#### Story Intent

- **Beneficiary:** delivery operator
- **Capability:** read and append immutable cost records independently of governance records
- **Need:** corrupt economic evidence must not poison lifecycle gates or be mistaken for valid cost
- **Value or failure prevented:** issue workflow remains usable while cost coverage stays explicitly incomplete

#### Implementation Steps

**Files:** Create `scripts/task-tracker/lib/cost/record-codec.mjs`, `comment-store.mjs`, `scripts/task-tracker/lib/github-records/comment-transport.mjs`, `scripts/tests/unit/task-tracker/lib/cost/record-codec.test.mjs`, and `scripts/tests/integration/task-tracker/lib/cost/read-isolation.test.mjs`. Modify `scripts/task-tracker/lib/github-records/record-envelope.mjs` and `github-comment-store.mjs` only to share unchanged validation/transport primitives.

**Interfaces:** Produce `renderCostRecord({ envelope, visibleMarkdown, maxBodyBytes = 60000 })`, `parseCostRecord({ commentNodeId, body, expectedRepository, expectedIssue })`, `listCostRecords({ repository, issue, graphql })`, and `appendFrozenCostRecord({ frozen, authority, ports }) -> { body, recordId, commentNodeId }`. `listCostRecords` returns `{ records, diagnostics, enumerationStatus }`; status is `available` or `unavailable`. Extract `listCorrelatedCommentNodes({ repository, issue, graphql })` and `readCorrelatedCommentNode({ repository, issue, commentNodeId, graphql })` into `comment-transport.mjs`, preserving page limits, duplicate/cursor detection, correlation and provenance validation.

- [ ] Write codec tests for all four cost types, exact rendering, correlation, secret rejection, escaped-size expansion, mixed case/whitespace, duplicate markers, and rejected governance payloads. The one accepted marker grammar is `<!-- aitm-cost-record\n` followed by canonical escaped JSON and `\n-->\n` plus validated visible prose, starting at byte zero.
- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/cost/record-codec.test.mjs`; expect missing-module/export failure.
- [ ] Expose reusable envelope validation and comment escaping from `record-envelope.mjs` without changing generic render/parse acceptance. Implement the cost codec with `COST_RECORD_TYPES`, exact round-trip byte comparison, payload hash validation, and both size limits. Never implement isolation by string-replacing a generic marker after parsing.

```js
const json = canonicalRecordJson(envelope).replaceAll('--', '-\\u002d');
const body = `<!-- aitm-cost-record\n${json}\n-->\n${visibleMarkdown}`;
if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0) {
  throw new TypeError('cost:body-budget');
}
const effectiveBodyBytes = Math.min(maxBodyBytes, 60000, 1024 * 1024);
if (
  Buffer.byteLength(json, 'utf8') > 256 * 1024 ||
  Buffer.byteLength(body, 'utf8') > effectiveBodyBytes
) {
  throw new TypeError('cost:record-size');
}
if (/<!--\s*aitm-record/i.test(body)) throw new TypeError('cost:generic-marker');
```

- [ ] Test that omitted limits default to 60,000 UTF-8 bytes, smaller valid limits narrow the budget, and a caller-supplied 1 MiB limit cannot widen it. Reject zero, negative, fractional, nonnumeric and unsafe-integer limits; test escaped JSON and Unicode visible prose against the final body before freeze.
- [ ] Extract the raw-node reader; leave `claimsAitmRecord` and generic fail-closed parsing unchanged. A cost reader catches only individual cost codec/payload failures after trustworthy node enumeration. It returns bounded comment-ID diagnostics; enumeration/correlation/provenance failures make the inventory unavailable.
- [ ] Write the mixed-record integration test using valid governance and cost records plus one corrupt cost candidate. Exercise `resolveLifecycleGateEvidence`, workflow-preflight, and estimation forecast/outcome readers. Assert their governance results equal the results before cost comments were added. A malformed generic claimant must still throw.
- [ ] Add missing, altered, quoted, noncanonical, oversized, and secret-bearing marker cases. Cost-like malformed candidates make cost coverage incomplete; markerless lost records are detected by the policy/timing inventory in Task 12. Output validation forbids raw markers in projections and diagnostics.
- [ ] Implement append plus exact read-back through raw transport. Require complete body/envelope identity and matching repository/issue/provenance. A same-payload different-record-ID response is a conflict. Do not allow update/delete for immutable envelopes.
- [ ] Run both new tests and `node --test scripts/tests/unit/task-tracker/lib/github-records/github-comment-store.test.mjs scripts/tests/unit/task-tracker/lib/github-records/record-envelope.test.mjs`; expect pass. Commit as `[#1719] Isolate cost records from governance reads`.

### Task 3: One timing suffix grammar and compatible rewrites

#### Story Intent

- **Beneficiary:** delivery analyst
- **Capability:** retain timing and cost metadata across every supported timing-row rewrite
- **Need:** competing suffix parsers can drop evidence or misread timing cells
- **Value or failure prevented:** delivery analysts do not silently lose or corrupt stage timing and cost attribution during healing, migration, or rollup

#### Implementation Steps

**Files:** Modify `scripts/task-tracker/lib/timing-row-reader.mjs`, `timing-rows.mjs`, `heal-timing-sweep.mjs`, `heal-timing-log.mjs`, `timing-slug-rename.mjs`, `agent-review/validators/timing-log-sequence.mjs`, `scripts/task-tracker/timing-rollup.mjs`, `scripts/task-tracker/gh-timing-comment.mjs`, and `backfill-timing-logs.mjs`. Extend `scripts/tests/unit/task-tracker/lib/timing-row-reader.test.mjs`, `timing-rows.test.mjs`, `timing-slug-rename.test.mjs`, `heal-timing-sweep.test.mjs`, `heal-timing-log.test.mjs`, and `scripts/tests/unit/task-tracker/core/timing-rollup.test.mjs`.

**Interfaces:** `splitTimingRowMarker(line)` retains `{ core, marker }` and adds `{ costEventId, costPolicyId, costDiagnostics }`. `parseTimingRow` exposes those same additions. All data-cell indices and valid `row-sec` values remain unchanged. Existing `aitm-transition` metadata moves out of the trailing pseudo-cell into the returned suffix, without changing cell counts or rendered row bytes. Explicitly retain legacy migration output byte-for-byte. Produce `appendCostTimingMarker({ row, eventId, policyId })` in the lexical leaf; it rejects a second valid cost marker and preserves existing suffix bytes. The canonical order is optional `aitm-transition move="..."`, then `row-sec`, then `aitm-cost-event`; append cost after the existing seconds comment. Include `readEstimationStageTiming(lines)` in the reader changes. Add `replaceRowSecInMarker({ marker, activeSec, idleSec })`, which replaces only the seconds comment and preserves every other suffix byte.

- [ ] Add seven-column and eight-column row fixtures with no suffix, row seconds only, and composed row-seconds/cost suffixes. Use fixed valid ULIDs for both IDs. Include the existing transition-only/transition-plus-seconds suffixes and the three-marker combination on both column counts. Assert unchanged legacy `ensureTimingRowFullMarkerCell` output bytes and preserved transition identity.
- [ ] Add this preservation assertion and invalid/duplicate marker variants, then run the timing-reader test to observe a failure:

```js
const suffix =
  ' <!-- row-sec: a=60 i=0 --> <!-- aitm-cost-event id="01ARZ3NDEKTSV4RRFFQ69G5FAV" policy="01ARZ3NDEKTSV4RRFFQ69G5FAW" -->';
const row =
  '| 2026-09-21 00:00:00 +00:00 | develop:completed | 1 | 0 | 3 | 3 | work | 9 |' + suffix;
assert.equal(splitTimingRowMarker(row).marker, suffix);
assert.equal(parseTimingRow(row).fullWordMarker, '9');
assert.equal(readEstimationStageTiming([row]).stagesMs.develop, 60000);
assert.ok(replaceTimingRowCells(row, { 7: ' revised ' }).endsWith(suffix));
```

- [ ] Implement a suffix scanner that locates the final table delimiter outside HTML comments. Once a trailing comment region begins, preserve its entire remainder, including malformed or unterminated comments and embedded pipe characters, as suffix metadata rather than new cells. Separate recognized comments from cells before interpreting cost IDs. Preserve the entire suffix byte-for-byte, including malformed cost comments, when valid timing seconds are present. Return cost diagnostics for duplicate, malformed or incorrectly ordered cost metadata without turning it into cells or dropping valid `row-sec` values.
- [ ] Update `heal-timing-log.mjs:renderCompletedRow` to retain the full suffix and restamp only its seconds through the lexical helper. Add a recomputation test proving seconds change while transition and cost markers remain byte-identical. Inspect `heal-timing-interval.mjs`: synthetic inserted historical rows intentionally carry seconds only, never invented historical cost IDs.
- [ ] Route `gh-timing-comment.mjs:resumedBoundaryFrom` through the same lexical seconds-replacement helper. Test preserving composed suffix bytes while zeroing seconds. Make `timing-rollup.mjs:parseTimingRows` consume `parseTimingRow` instead of private cell/suffix splitting; test a malformed trailing cost comment containing a pipe without changing timing cells.
- [ ] Route each named rewrite, rollup, healing, backfill and review consumer through this leaf; remove competing suffix parsing only where necessary. Do not assign IDs during historical healing or full-word-marker migration.
- [ ] Extend rewrite tests to preserve the composed suffix and old missing-full-column migration. Test invalid cost markers with valid timing evidence and prove estimation seconds stay identical.
- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/timing-row-reader.test.mjs scripts/tests/unit/task-tracker/lib/timing-rows.test.mjs scripts/tests/unit/task-tracker/lib/timing-slug-rename.test.mjs scripts/tests/unit/task-tracker/lib/heal-timing-sweep.test.mjs scripts/tests/unit/task-tracker/lib/heal-timing-log.test.mjs scripts/tests/unit/task-tracker/core/timing-rollup.test.mjs`.
- [ ] Run the existing timing-reader structure and legacy-row tests. Commit as `[#1719] Preserve composed timing cost markers across readers`.

### Task 4: Prospective capture policy and adapter registry

#### Story Intent

- **Beneficiary:** repository operator
- **Capability:** enable prospective cost capture only under a validated policy and known adapter contracts
- **Need:** shared-issue consumers and local configuration may not support cost records yet
- **Value or failure prevented:** disabled behavior stays compatible and unsupported capture cannot silently start

#### Implementation Steps

**Files:** Create `scripts/task-tracker/lib/cost/policy.mjs`, `adapter-registry.mjs`, `adapters/fixture.mjs`, `scripts/tests/unit/task-tracker/lib/cost/policy.test.mjs`, and `adapter-registry.test.mjs`. Modify `scripts/task-tracker/config.mjs` and add `config/cost-rate-cards/README.md`.

**Interfaces:** Produce `resolveCostPolicy({ config, priorPolicy, effectiveEventId, effectiveAt, createId }) -> { enabled, policy, diagnostics }`, `resolveSources({ policy, sessionRefs, runRefs }) -> { sources, diagnostics }`, `observeSources({ sources, adapters, cursors, signal, now }) -> Observation[]`, and `createFixtureAdapter({ observations })`. Each adapter has `{ id, version, capability, observe }`; `observe({ source, cursor, cutoff, signal })` returns an Observation, never writes externally or selects issue ownership.

- [ ] Add disabled-config tests: absent `costAccounting` means no cost I/O, IDs, record publication, or changed output. Add invalid-enabled-config tests: capture declines safely with explicit local diagnostics; reports cannot treat invalid policy as complete.
- [ ] Add `costAccounting` to `config.mjs:DEFAULTS` as the disabled object below and to `TYPES` as `object`; otherwise `loadConfig` silently drops the option. Extend real `loadConfig` project/user/default precedence fixtures and `setConfigValue` tests, proving an explicitly enabled project object survives loading. Validate the closed nested shape and unchanged secret policy in a cost-specific validator: unknown or secret-shaped keys fail before publication; malformed cost configuration produces safe cost diagnostics and disabled capture without throwing from general lifecycle config loading. The absent-config and default-object paths must both remain byte-compatible. Add the tracked, secret-free configuration shape below to those tests. Do not enable it in the repository's active configuration.

```json
{
  "costAccounting": {
    "enabled": false,
    "readerRolloutFile": null,
    "captureMode": "local",
    "adapters": [],
    "rateCardCatalog": "config/cost-rate-cards",
    "currencies": ["USD"],
    "subscriptionIssue": null,
    "observationTimeoutMs": 1000,
    "captureTimeoutMs": 3000,
    "reconciliationDelayMs": 0,
    "projection": false
  }
}
```

```js
import assert from 'node:assert/strict';
import { resolveCostPolicy } from '../../../../../task-tracker/lib/cost/policy.mjs';
const result = resolveCostPolicy({
  config: {},
  priorPolicy: null,
  effectiveEventId: null,
  effectiveAt: null,
  createId: () => {
    throw new Error('disabled capture generated an ID');
  },
});
assert.equal(result.enabled, false);
assert.equal(result.policy, null);
```

- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/cost/policy.test.mjs scripts/tests/unit/task-tracker/lib/cost/adapter-registry.test.mjs`; expect failure before implementation.
- [ ] Implement the reader rollout manifest preflight from Delivery order. Require schema `aitm.cost-reader-rollout/v1`, exact keys, a nonempty complete consumer inventory, canonical confirmation time, a published version/commit, every consumer at or above that floor, and the local reader capability. Manifest identity is local configuration evidence, not a replacement for immutable policy authority. Missing or invalid evidence disables capture safely.
- [ ] Implement policy identity before publication, append-only replacement by effective event boundary, and safe capability projection `{ sourceKinds, counterMode, resolution, dimensions, accessMode, schemaVersion, maxCategories, maxReceipts, expectedDelayMs }`. No local credential configuration is copied into it.
- [ ] Implement source selection from policy plus explicit session/run ownership. An expected unsupported source remains in the roster with an unavailable observation. Not-applicable requires a declared capability or ownership reason.
- [ ] Bound adapter sampling with both per-source and overall abort deadlines. A timed-out or thrown adapter becomes an unavailable result with actual observation time and stable `<source>-<condition>` code. A fixture adapter returns scripted observations without network access; no timeout callback may later commit a second observation. `captureTimeoutMs` is the total additional cost-work budget, including local locking, sampling, freezing and economic publication; existing timing-operation timeouts remain independent. Spend only remaining time on cost writes, then defer the frozen item. A late uncertain remote success is resolved by exact read-back, never resampling. Abort-aware ports and a monotonic deadline prevent extra remote waits after budget exhaustion; synchronous local durability has a documented bounded-size I/O limitation and is measured in the pilot.
- [ ] Add policy-publication-failure and policy-change tests: future timing markers retain intended policy IDs even if remote publication failed. Frozen old events keep their original policy.
- [ ] Re-run both tests and the existing config tests. Commit as `[#1719] Add opt-in cost policy and source capabilities`.

### Task 5: Epochs, deltas, and measured spans

#### Story Intent

- **Beneficiary:** delivery analyst
- **Capability:** derive measured usage spans from ordered provider observations within valid epochs
- **Need:** resets, gaps, and cumulative counters can otherwise create false usage deltas
- **Value or failure prevented:** story consumption remains measured where possible and explicitly unavailable elsewhere

#### Implementation Steps

**Files:** Create `scripts/task-tracker/lib/cost/observations.mjs`, `spans.mjs`, and `scripts/tests/unit/task-tracker/lib/cost/observations.test.mjs`, `spans.test.mjs`.

**Interfaces:** Produce `deriveObservationDelta({ previous, current }) -> { observationKind, quantities, diagnostics }` and `classifySpan({ span, ownership, stageBoundaries, pauseWindows, deliveryBoundary, doneAt }) -> Span`. Null ownership is never additive. A complete issue-owned span can contribute to the story quantity while stage/delivery attribution stays unresolved.

- [ ] Add the cumulative baseline/zero/increase/reset tests. Baseline 100 has no delta; 100 to 100 is measured zero; unavailable observation does not change the predecessor; 130 to 120 opens a new epoch or returns unresolved evidence, never a negative quantity.

```js
const delta = deriveObservationDelta({
  previous: observationFixture({ nativeCounters: [{ category: 'input_tokens', value: '100' }] }),
  current: observationFixture({ nativeCounters: [{ category: 'input_tokens', value: '130' }] }),
});
assert.deepEqual(delta.quantities, [{ category: 'input_tokens', value: '30' }]);
```

- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/cost/observations.test.mjs scripts/tests/unit/task-tracker/lib/cost/spans.test.mjs`; expect failure.
- [ ] Implement subtraction with BigInt only after proving equal source identity, epoch, monotonic counter contract, comparable categories and predecessor. Model, tier, account or meter changes require a new epoch unless continuity is explicitly proven.
- [ ] Implement independent role, kind and window classification. Do not charge a span to the ending event's stage merely because it arrived there. A `develop:completed` cutoff owns its preceding Develop span.
- [ ] Add 100 / missing / 180 across Develop and Test: retain issue quantity 80 only with proven issue ownership, but unresolved stage split. Add pause/resume and delayed delivery-cutoff cases; no wall-clock proration or silent active-work allocation.
- [ ] Add opening-baseline lateness, compaction without counter reset, new session baseline, reset tail/prefix gaps, pre-story consumption, and after-Done exclusion. Preserve asynchronous run occurrences independently of parent timer pause.
- [ ] Re-run both tests. Commit as `[#1719] Derive source epochs and evidence-bounded cost spans`.

### Task 6: Exact valuation and economic overlap

#### Story Intent

- **Beneficiary:** finance analyst
- **Capability:** value accepted usage with exact rates while separating overlapping economic evidence
- **Need:** floating-point money and inclusive provider charges can inflate or distort totals
- **Value or failure prevented:** each currency total has reproducible pricing and no duplicate contribution

#### Implementation Steps

**Files:** Create `scripts/task-tracker/lib/cost/decimal.mjs`, `rate-cards.mjs`, `economic-identity.mjs`, and `scripts/tests/unit/task-tracker/lib/cost/valuation.test.mjs`, `economic-identity.test.mjs`. Create `scripts/tests/fixtures/cost/rate-cards.json` with synthetic prices clearly labeled as fixtures.

**Interfaces:** Produce `multiplyDecimal({ quantity, unitRate, unitsPerRate, scale, rounding }) -> string`, `selectRateCard({ cards, source, category, startAt, endAt }) -> { card, diagnostics }`, `valueSpan({ span, source, cards }) -> { lines, diagnostics }`, and `selectEconomicContributions({ observations, lines, view }) -> { accepted, corroborating, unresolved, diagnostics }`. View is `consumption`, `rate-card-estimated`, or `actual-billed`.

- [ ] Add tests for large integer quantities, decimal precision, deterministic half-up rounding, invalid monetary strings, and multiple currencies. For a fixture rate of USD 0.10 per 1,000 units, 1,500 units equals the exact string `0.15`.

```js
import assert from 'node:assert/strict';
import { multiplyDecimal } from '../../../../../task-tracker/lib/cost/decimal.mjs';
assert.equal(
  multiplyDecimal({
    quantity: '1500',
    unitRate: '0.10',
    unitsPerRate: '1000',
    scale: 2,
    rounding: 'half-up',
  }),
  '0.15'
);
assert.throws(() =>
  multiplyDecimal({
    quantity: '-1',
    unitRate: '0.10',
    unitsPerRate: '1000',
    scale: 2,
    rounding: 'half-up',
  })
);
```

- [ ] Run both new tests to prove failure before implementation.
- [ ] Implement decimal arithmetic by parsing a decimal into integer coefficient and scale. Multiply/divide integer coefficients; apply the selected card's rounding once at its stated billing unit, not once per arbitrary reporting chunk. Retain provider-native integer ticks before conversion.
- [ ] Implement immutable card validation: ID/hash, provider/product/model/tier/region, currency, `[effectiveFrom, effectiveTo)` interval, category/unit, denominator, decimal rate, precision, rounding and formula version. Missing or overlapping applicable rates produce incomplete valuation; a span crossing a price boundary stays unvalued unless its evidence can partition the quantities.
- [ ] Implement economic identity by meter/account, request or run, category and proven covered range. Exact equivalent request evidence wins over aggregate evidence; equally precise agreeing evidence uses source-ID ordering; conflicting equal-precision evidence contributes nothing to that unresolved part.
- [ ] Test transcript + receipt + exclusive aggregate views of one request. Count once per view, retain corroboration, and include an aggregate remainder only with proven disjoint coverage. Never add actual and estimated money together.
- [ ] Implement and test the `includes` DAG: reject cycles, missing components, unclear coverage and contradictory parents. An inclusive actual request charge suppresses its token/tool components only within the actual view. A component is counted at most once.
- [ ] Re-run tests; verify USD 1 plus EUR 1 yields two currency entries. Commit as `[#1719] Value measured usage without economic double counting`.

### Task 7: Durable freeze, source serialization, and exact replay

#### Story Intent

- **Beneficiary:** delivery operator
- **Capability:** recover and replay the exact frozen cost publication after an interrupted write
- **Need:** retries may otherwise change identities, duplicate records, or lose economic evidence
- **Value or failure prevented:** delivery operators do not double-count or lose a cost publication after an interrupted write

#### Implementation Steps

**Files:** Create `scripts/task-tracker/lib/cost/outbox.mjs`, `journal-files.mjs`, `source-locks.mjs`, `scripts/tests/unit/task-tracker/lib/cost/outbox.test.mjs`, and `scripts/tests/integration/task-tracker/lib/cost/outbox-recovery.test.mjs`.

**Interfaces:** Produce `openCostOutbox({ gitCommonDir, repository })`, returning `{ createIntent, freeze, listPending, loadFrozen, markDelivered, readSourceHead }`. `freeze({ intent, observations, envelope, body, timingRow, sourceHeads })` atomically commits one complete frozen item. Produce `withSourceLocks({ root, sourceKeys, timeoutMs }, work)`; source keys sort lexically before lock acquisition.

- [ ] Add a fixture filesystem sandbox through the existing scratch helpers, with fault injection at intent write, sample completion, frozen rename, cursor-index rebuild, timing write, ledger write, and read-back. Do not use the maintainer's outbox or GitHub.
- [ ] Add the required sequence: baseline 100, freeze E1=130, fail remote publication, freeze E2=160, advance live source to 190, retry E1/E2. Assert only 30 + 30, E2 names E1, no resampling, and two immutable event bodies.
- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/cost/outbox.test.mjs scripts/tests/integration/task-tracker/lib/cost/outbox-recovery.test.mjs`; expect failure.
- [ ] Implement private atomic writes: exclusive temporary file in the same directory, write, fsync file, rename, fsync directory, then acknowledge. Refuse symlink/non-file collisions, corrupt journals and unsupported versions; report unavailable capture instead of replacing damaged state with an empty file.
- [ ] Hold source locks from predecessor selection through observation freezing. One frozen file contains all observations and their predecessor references; only successfully available observations advance derived source heads. Persist each source head as the combination of observation identity and epoch; distinct events with the same source predecessor are a fork, not two additive successors. Release source locks before any remote write.
- [ ] Before committing frozen state, render through the Task 2 codec with its fixed 60,000-byte maximum. Size failure yields a bounded unavailable observation/diagnostic and a validated small envelope; if even that cannot fit, retain the intended timing key as missing evidence without freezing an unpublishable body. Frozen replay never re-renders or widens the budget.
- [ ] Freeze `recordId`, `createdAt`, authority grant/epoch/actor, predecessor/supersedes, payload/hash, marker version, visible prose, exact body and timing row. A retry does not invoke an envelope constructor or clock:

```js
const frozen = outbox.loadFrozen(operationId);
const result = await appendFrozenCostRecord({ frozen, authority, ports });
if (result.body === frozen.body && result.recordId === frozen.envelope.recordId) {
  outbox.markDelivered({ operationId, commentNodeId: result.commentNodeId });
}
```

- [ ] Test clock/authority-default changes, equal payload with a different envelope, uncertain remote success, duplicate timing read-back, competing source heads, and restart from GitHub predecessor evidence. Lost local state requires verified continuity; otherwise open an explicit gap.
- [ ] Test two processes in linked worktrees contending on the same source. Verify no forked predecessor, no interleaved atomic commit, and bounded lock failure. Never steal a live lock on elapsed time alone.
- [ ] Re-run both tests. Commit as `[#1719] Persist exact cost capture transactions and source cursors`.

### Task 8: Capture every prospective timing emission without gating lifecycle

#### Story Intent

- **Beneficiary:** delivery operator
- **Capability:** associate enabled cost evidence with every prospective timing event
- **Need:** partial emitter coverage leaves unexplained lifecycle usage while measurement failures must not stop work
- **Value or failure prevented:** cost coverage is visible without making task transitions depend on metering

#### Implementation Steps

**Files:** Create `scripts/task-tracker/lib/cost/capture.mjs`, `timing-port.mjs`, and `scripts/tests/integration/task-tracker/lib/cost/capture-transaction.test.mjs`, `disabled-compatibility.test.mjs`. Modify `scripts/task-tracker/runtime.mjs`, `gh-timing-comment.mjs`, `hook-handler.mjs`, `lib/timing-post-outcome.mjs`, `lib/review-approval-timing.mjs`, `lib/move-state/audit-timing.mjs`, `lib/move-state/guard-execution.mjs`, and `verbs/review.mjs`.

**Interfaces:** Produce `captureTimingEvent({ context, row, descriptor, authority, deps }) -> { row, eventId, operationId, timing, cost }`. Context is `{ repository, issue, config, sessionRef, policy }` and identifies the active session and effective policy; descriptor contains event role, stage/visit, canonical slug and recorded instant. Timing retains the existing post outcome. Cost is `disabled`, `delivered`, `pending`, or `unavailable`. Produce `replayCostOutbox({ context, authority, deps }) -> { delivered, pending, diagnostics }`. `deps.postTiming({ row })` is the injected low-level append operation; disabled capture invokes it without consulting cost authority or adapters. Keep `postTimingEvent` as the low-level timing append port; it must not recursively invoke capture.

- [ ] Add disabled golden-output tests using representative start, pause, resume, rework, review and Done operations. Assert byte-identical rows/output, zero adapter calls, zero cost IDs/files/comments, and unchanged lifecycle decisions.
- [ ] Add the enabled timing-success/ledger-failure test with fixture adapters. Assert one keyed row, a pending frozen body, successful lifecycle outcome, and a complete replay that does not append another row.

```js
import assert from 'node:assert/strict';
import { captureTimingEvent } from '../../../../../task-tracker/lib/cost/capture.mjs';
const row = '| 2026-09-21 00:00:00 +00:00 | develop:started | 0 | 0 | 0 | 0 | start | 0 |';
const posted = [];
const result = await captureTimingEvent({
  context: { repository: 'example/repo', issue: 1719, config: {}, sessionRef: null, policy: null },
  row,
  descriptor: null,
  authority: null,
  deps: {
    postTiming: async ({ row }) => {
      posted.push(row);
      return { ok: true };
    },
    observe: () => {
      throw new Error('disabled capture sampled usage');
    },
    createId: () => {
      throw new Error('disabled capture generated an ID');
    },
  },
});
assert.equal(result.cost, 'disabled');
assert.deepEqual(posted, [row]);
assert.equal(result.row, row);
```

- [ ] Run `node --test scripts/tests/integration/task-tracker/lib/cost/capture-transaction.test.mjs scripts/tests/integration/task-tracker/lib/cost/disabled-compatibility.test.mjs`; expect failure.
- [ ] Compose every enabled timing suffix only through Task 3's `appendCostTimingMarker`, after the existing seconds writer. `postTimingEvent` appends the prepared keyed row without reconstructing metadata. Audit cost-marker string literals in runtime code: the lexical leaf is the sole producer/parser; tests may contain fixtures. Implement the transaction in the spec's order: intent; bounded observations; atomic frozen state/cursors; keyed timing append and exact read-back; immutable cost append/read-back; optional projection refresh; delivery acknowledgment. Keep original lifecycle failures visible; contain only cost-subsystem failures.
- [ ] Add event-keyed timing idempotency under the existing timing lock. A row with the same ID and exact row body is success. An ID with different bytes is a cost conflict, not permission to overwrite timing authority. Resolve an uncertain append by read-back before repeating it.
- [ ] Wire `safePostTiming` and its queue path to retain the prepared row and operation ID. Cost recovery owns frozen replay; ordinary timing queue drain must call the low-level timing port and not sample again. Failed timing acceptance leaves cost ownership/lifecycle attribution unresolved even if the source observation was frozen.
- [ ] Route all direct live timing emitters in the listed files through the capture boundary. Include hook emissions, review-approval rows, move-state audit rows with all three suffix markers, zero-duration flushes and interruption reengagement rows. Re-run `rg -n 'postTimingEvent\(' scripts/task-tracker` and account for every remaining call: low-level port, replay, or a documented historical repair. Historical repairs preserve existing markers and never manufacture historical snapshots.
- [ ] Test lock order: reuse already-held issue authority; acquire sorted source locks locally and release them at freeze; acquire/release timing lock for append; append ledger under the caller's issue-mutation scope. Never acquire issue authority while holding a timing lock. Use instrumented lock ports to assert physical acquisition counts and order.
- [ ] Inject adapter timeout, size overflow, pricing error, outbox disk failure, policy-publication failure, ledger failure and projection failure. Each must leave the lifecycle result unchanged. Even if local persistence fails, create intended marker IDs before the append so the independent inventory exposes missing cost evidence.
- [ ] Re-run both tests and existing runtime/timing integration tests selected by changed imports; commit as `[#1719] Capture prospective timing costs with nonblocking recovery`.

### Task 9: Local provider observations and directly metered receipts

#### Story Intent

- **Beneficiary:** delivery analyst
- **Capability:** ingest attributable local provider observations and directly metered tool or runtime receipts
- **Need:** token use and separately billed operations arrive through different evidence sources
- **Value or failure prevented:** costs retain their source and are counted once under the correct component

#### Implementation Steps

**Files:** Create `scripts/task-tracker/lib/cost/adapters/codex.mjs`, `claude.mjs`, `grok.mjs`, `receipt.mjs`, `transcript-reader.mjs`, and `scripts/tests/unit/task-tracker/lib/cost/provider-adapters.test.mjs`. Add sanitized fixtures under `scripts/tests/fixtures/cost/providers/` named `codex-rollout-v1.jsonl`, `claude-message-v1.jsonl`, `grok-request-v1.json`, and `tool-runtime-v1.json`.

**Interfaces:** Each module exports `createAdapter({ readSource, clock })` implementing Task 4. `transcript-reader.mjs` exports `readUsageWindow({ locator, cursor, maxBytes, signal }) -> { records, nextCursor, complete, diagnostics }`. A receipt is `{ receiptId, occurredAt, periodEnd, nativeCounters, quantity, unit, billed, includes, economicKey, evidenceHash }`; non-applicable fields are null/empty, and billed money must be source-described actual charges. The durable receipt contains no raw response.

- [ ] Before supporting a provider schema, create a synthetic/sanitized fixture and document its provenance and version in the fixture README. Confirm its structure against available host records or primary provider documentation during implementation. If no usage contract can be established, ship the adapter as explicitly unavailable; do not invent a measured schema from the host word-count format.
- [ ] Write contract tests for each host covering missing file, unreadable file, malformed record, unrecognized schema, valid measured zero, duplicate receipt, compaction, changed meter identity, and delayed final usage. All fixtures must be offline and free of real account/session secrets.

```js
import assert from 'node:assert/strict';
import { createAdapter } from '../../../../../task-tracker/lib/cost/adapters/claude.mjs';
import { observationFixture } from '../../../../helpers/cost/fixtures.mjs';
const adapter = createAdapter({
  readSource: async () => {
    throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  },
  clock: () => '2026-09-21T00:01:00.000Z',
});
const source = {
  ...observationFixture().source,
  agentProvider: 'claude',
  billingProvider: 'anthropic',
};
const observed = await adapter.observe({
  source,
  cursor: null,
  cutoff: '2026-09-21T00:01:00.000Z',
  signal: new AbortController().signal,
});
assert.equal(observed.status, 'unavailable');
assert.equal(observed.observationKind, 'unavailable');
assert.deepEqual(observed.nativeCounters, []);
```

- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/cost/provider-adapters.test.mjs`; expect failure.
- [ ] Implement Codex cumulative observations with recognized usage records; preserve total input, cached input, optional cache-write, output and reasoning native counters. Derive disjoint views only where the supported schema proves inclusions: total input minus included cached input is uncached; total output minus included reasoning is visible. Reject inconsistent negative relationships; never add reasoning twice.
- [ ] Implement Claude per-response receipts and declared cache categories. Deduplicate by proven response identity before a running sum. A schema with separate uncached/cache-read/cache-write fields preserves all three; unsupported subdivisions are unknown, not zero.
- [ ] Implement Grok/xAI per-request observations and exact `cost_in_usd_ticks` when the fixture contract supports it. Preserve tick integers and declared token/server-tool inclusions. Agent host and billing provider remain independent; do not label every Grok-hosted session an xAI-billed session without evidence.
- [ ] Implement the generic tool/runtime receipt adapter for explicitly correlated MCP, CI, hosted execution and cloud meters. A successful local shell operation can contribute an operation count but has no invented monetary price. Model token counters already include tokenized shell/MCP output; do not estimate and add it again.
- [ ] Test bounded streaming/cursor behavior, incomplete tail records, file rotation, invalid cursors and late records. A bounded partial read returns incomplete plus a continuation cursor; it cannot certify a cutoff. Reuse transcript resolution, never `countWords().status` as a usage result.
- [ ] If an adapter supports estimated consumption, require explicit policy opt-in plus tokenizer/encoding/version provenance, mark `estimated-consumption`, and keep it separate from measured quantities. No tokenizer implementation or dependency is required for initial rollout; unsupported estimation stays unavailable.
- [ ] Re-run provider tests and existing host word-counter tests to verify no behavior change; commit as `[#1719] Read provider usage and metered receipts from local evidence`.

### Task 10: Durable cutoffs, session/run ownership, and lifecycle boundaries

#### Story Intent

- **Beneficiary:** delivery engineering leader
- **Capability:** assign usage to the owning issue and separate delivery from post-trunk activity
- **Need:** sessions and runs can span issues or continue after trunk integration
- **Value or failure prevented:** story totals reflect the correct owner and lifecycle boundary without duplicate spend

#### Implementation Steps

**Files:** Create `scripts/task-tracker/lib/cost/boundaries.mjs`, `ownership.mjs`, `run-registry.mjs`, and `scripts/tests/unit/task-tracker/lib/cost/boundaries.test.mjs`, `ownership.test.mjs`, `scripts/tests/integration/task-tracker/lib/cost/delivery-cutoff.test.mjs`. Modify `scripts/task-tracker/lib/evidence-v2/delivery.mjs`, `record-schema.mjs`, `runtime-adapter.mjs`, `scripts/task-tracker/verbs/deliver.mjs`, and `verbs/close.mjs` at the successful verification/terminal observation boundaries.

**Interfaces:** Produce `resolveStoryBoundaries({ timing, deliveryRecords, configuredTrunk, issue }) -> { opening, done, delivery, diagnostics }`, where delivery is `{ status, verifiedAt, recordId }`, `resolveUsageOwner({ source, sessionRefs, runs, occurrence })`, and `registerCostRun({ issue, run, authority, outbox }) -> { operationId, recordId }`. A run contains `{ runId, ownerIssue, kind, provider, sessionRef, requestRefs, launchedAt, completedAt, watermark, launcherRecordId }`; kind is `child-agent`, `peer-review`, `tool`, or `automation`. No time-overlap ownership inference is allowed. Registration freezes a reconciliation envelope containing `runFacts` into the outbox; Task 13 publishes it through the cost namespace. Report readers use accepted run facts plus independent session/launch authority, never a machine-local registration alone. Publication failure leaves expected runs incomplete under the policy inventory.

- [ ] Add tests for legacy `verifiedAt`, delayed receipt publication, delivery to an epic branch, no-commit deliverables, missing verification time, Done before epic trunk delivery, and a sample collected after a cutoff.

```js
import assert from 'node:assert/strict';
import { resolveStoryBoundaries } from '../../../../../task-tracker/lib/cost/boundaries.mjs';
const boundaries = resolveStoryBoundaries({
  timing: [],
  deliveryRecords: [],
  configuredTrunk: 'trunk',
  issue: 1719,
});
assert.equal(boundaries.delivery.status, 'unavailable');
assert.equal(boundaries.delivery.verifiedAt, null);
```

- [ ] Run the new unit/integration tests; expect failure.
- [ ] Add an exact optional-field variant to evidence-v2 delivery payload validation: legacy payload keys remain valid; new cost-enabled payloads additionally contain a canonical `verifiedAt`. Reject any other extra key. Freeze this instant immediately after successful content/target verification, before publication, through an injected clock. Existing legacy bytes/digests remain valid; never substitute `recordedAt` or later comment creation time.
- [ ] Keep disabled verification payloads unchanged. Enabled writers require upgraded readers supporting the new variant; test round-trip and journal digest validation for both. Historical evidence-v2 deliveries without `verifiedAt` support delivery authority but leave the cost split incomplete.
- [ ] Trigger a distinct source observation at verified trunk delivery, then link it to the accepted receipt identity once available. If acceptance/publication fails, retain observation evidence but no fabricated authoritative cutoff. Timed receipts may be partitioned at the verification instant; a cumulative span without partition evidence stays unknown.
- [ ] Implement session-chain and explicit run ownership. Child-bound usage belongs to the child; orchestration belongs to the parent. Unbound agents need a recorded launch/run link. Register peer-review provider/run/session/request identities explicitly. Shared session ambiguity remains unresolved even if timestamps overlap.
- [ ] Preserve stage visits through rework, pause/resume and source changes. Separately metered asynchronous work belongs to its proven launching issue/stage even during pause; model usage crossing an unmeasured pause remains unallocated as active model work.
- [ ] At Done, capture a terminal role plus each source's independent kind/window. Require a source watermark or closed-run proof covering Done, not a timeout. Late in-window evidence can arrive afterward; exclude actual occurrences after Done. No-commit boundaries are `not-applicable`.
- [ ] Test the post-trunk Done event containing both an interval and a new baseline; neither disappears from the terminal coverage inventory. Re-run evidence-v2 codec, delivery-flow and close-flow tests. Commit as `[#1719] Anchor cost ownership and delivery boundaries in authority`.

### Task 11: Atomic reconciliation revisions and conflict handling

#### Story Intent

- **Beneficiary:** billing analyst
- **Capability:** reconcile cost observations through append-only revisions with explicit conflicts
- **Need:** later billing evidence may correct an estimate or disagree with earlier attribution
- **Value or failure prevented:** actual billed views improve without silently rewriting the historical record

#### Implementation Steps

**Files:** Create `scripts/task-tracker/lib/cost/reconciliation.mjs`, `projection-revisions.mjs`, `scripts/tests/unit/task-tracker/lib/cost/reconciliation.test.mjs`, and `scripts/tests/integration/task-tracker/lib/cost/reconciliation-recovery.test.mjs`.

**Interfaces:** Produce `validateReplacement({ revision, records, activeSpans }) -> { removed, added, inputHashes }` and `applyCostRevisions({ records }) -> { observations, spans, lines, residuals, diagnostics }`. A revision has `{ revisionId, reason, inputs, removedSpanIds, addedSpans, correctedEvidence, runFacts, residuals, projectionHash }` inside the reconciliation payload; `inputs` entries are `{ recordId, payloadHash }`. The envelope's `supersedes` is one prior reconciliation revision ID or null.

- [ ] Add the 100 / missing / 180 fixture with unresolved span 80. Add the later 150 observation and one revision that replaces 80 with 50 and 30. Assert no projection contains 80 + 50 + 30.
- [ ] Add multiple removed/multiple added spans, missing input hashes, cyclic references, partial replacement, competing superseding heads, and out-of-order publication. Run both new tests; expect failure.
      For a conserving split, enforce this exact per-category rule after checking equal source/epoch, ownership and covered range; a correction uses the separate corrected-evidence path instead:

```js
function assertConserved(removedQuantities, addedQuantities) {
  const sum = (entries) => entries.reduce((total, entry) => total + BigInt(entry.value), 0n);
  const categories = new Set(
    [...removedQuantities, ...addedQuantities].map((entry) => entry.category)
  );
  for (const category of categories) {
    const before = sum(removedQuantities.filter((entry) => entry.category === category));
    const after = sum(addedQuantities.filter((entry) => entry.category === category));
    if (before !== after) throw new TypeError('cost:replacement-conservation');
  }
}
assertConserved(
  [{ category: 'input_tokens', value: '80' }],
  [
    { category: 'input_tokens', value: '50' },
    { category: 'input_tokens', value: '30' },
  ]
);
```

- [ ] Validate every input against accepted immutable hashes, enforce source/epoch/range conservation for a split, and reject a revision as a whole if any referenced input or output is invalid. Do not apply independent per-span updates.
- [ ] Implement source-correction revisions separately from conserving splits. Require corrected record identities and a bounded reason; a changed quantity cannot masquerade as conservation. Preserve all originals as evidence.
- [ ] Resolve a unique revision lineage only. Competing revisions make the affected contribution incomplete/non-additive; never choose by arrival time. Recovery appends a revision that explicitly resolves the competing set.
- [ ] Add late actual-billing and aggregate-residual revisions. A whole-story exclusive bill does not create unsupported stage/cutoff billing. Currency and included-component rules from Task 6 apply to corrected views.
- [ ] Test missing predecessors after local loss, delayed in-window receipts after Done and rejection of backdated after-Done consumption. Re-run both tests; commit as `[#1719] Reconcile cost evidence with atomic span revisions`.

### Task 12: Independent coverage inventory and read-only story reports

#### Story Intent

- **Beneficiary:** delivery engineering leader
- **Capability:** use read-only, offline-by-default reports with an independent inventory of stage and delivery-boundary coverage
- **Need:** missing records or ambiguous attribution must not appear as zero or complete totals
- **Value or failure prevented:** reports support decisions while exposing every material evidence gap

#### Implementation Steps

**Files:** Create `scripts/task-tracker/lib/cost/coverage.mjs`, `aggregation.mjs`, `report.mjs`, `snapshot-cache.mjs`, `scripts/task-tracker/verbs/cost.mjs`, `scripts/tests/unit/task-tracker/lib/cost/coverage.test.mjs`, `report.test.mjs`, and `scripts/tests/integration/task-tracker/lib/cost/report-command.test.mjs`. Modify `scripts/task-tracker/task-tracker.mjs` and `verbs/help-data.mjs`.

**Interfaces:** Produce `buildCoverage({ timing, policies, sessions, runs, delivery, costRecords, diagnostics, asOf })`, `aggregateStoryCost({ issue, coverage, spans, lines, childReports })`, `buildCostReport({ snapshot, issue })`, `renderCostReport(report)`, and `refreshCostSnapshot({ issue, repository, github, cache })`. The report schema is `aitm.story-cost-report/v1`, with `{ schema, issue, asOf, coverage, consumption, estimated, actual, residuals, stages, delivery, postTrunk, wholeStory, children, diagnostics }`. Coverage exposes `{ status, missing, diagnostics }`; `actual` and `estimated` are currency-keyed maps of `{ amount, status, missing }`. Each boundary (`delivery`, `postTrunk`, `wholeStory`) contains independent `actual` and `estimated` maps plus coverage. Empty maps with unavailable coverage represent no defensible amount, never a zero. Every amount is grouped by currency and accompanied by status and missing reasons.

The report has these closed nested shapes. All `missing` and `diagnostics` arrays contain the bounded Diagnostic shape from Task 1. Status is `complete`, `partial`, `unavailable` or `not-applicable` everywhere; unavailable quantities/amounts are null, while a known subtotal may be partial.

- `consumption` is `{ measured, estimated }`, each an array of `{ basis, category, unit, quantity, sourceIds, precision, status, missing }`. `basis` is `native` or `common`; category/unit pairs aggregate only when the adapter contracts prove compatibility after economic deduplication. Native counters remain distinct from normalized common views and are never summed with them. `quantity` is a canonical integer string or null. Measured precision is `exact`, `aggregate`, or `unavailable`; estimated entries use `estimated-consumption` or `unavailable`. Split differing precision into distinct entries rather than overstating it. A missing snapshot yields both arrays empty plus unavailable coverage; an expected known category without evidence has a null quantity and a missing reason.
- Each boundary is `{ consumption, actual, estimated, coverage }` using those same shapes. Top-level consumption/money is the owning issue's whole-story view, with delivery/post-trunk partitioning only when proven; unknown windows remain in the whole-story subtotal when ownership and occurrence are established.
- `stages` is an array of `{ stage, stageVisit, consumption, actual, estimated, coverage }`, including null stage/visit for unresolved attribution. `children` is an array of `{ issue, asOf, coverage, delivery, postTrunk, wholeStory }` for explicitly requested rollup scope. Child entries are projections of accepted identities, not additional additive lines.
- `residuals` uses the exact reconciliation residual shape `{ sourceId, periodStart, periodEnd, quantity, unit, money, reason }`; unresolved values are null and residuals never enter owned totals without proven attribution. Empty stages/children/residuals arrays in a missing snapshot do not certify their absence.

Subscription imports use accepted immutable `usageRefs` and validated observations/lines, not these report projections. Test the full JSON structure, measured/estimated separation, mixed precision, unknown units, repeated stage visits and unavailable forms.

- [ ] Add a second-checkout fixture: ten keyed timing events, eight accepted cost envelopes and no original outbox. Assert two missing event IDs, known subtotal retained, whole-story coverage incomplete. Add unkeyed pre-enablement history, missing policy, unknown source roster, missing dependency, open run and missing terminal-watermark variants.
- [ ] Add report tests for complete/partial/unavailable/not-applicable per quantity, currency, stage and boundary; an estimated-complete view must not upgrade actual billing. Run all three new tests; expect failure.

```js
import assert from 'node:assert/strict';
import { buildCostReport } from '../../../../../task-tracker/lib/cost/report.mjs';
const report = buildCostReport({ snapshot: null, issue: 1719 });
assert.equal(report.coverage.status, 'unavailable');
assert.equal(report.asOf, null);
assert.deepEqual(report.actual, {});
assert.deepEqual(report.estimated, {});
assert.equal(report.schema, 'aitm.story-cost-report/v1');
assert.deepEqual(report.consumption, { measured: [], estimated: [] });
assert.deepEqual(report.stages, []);
assert.deepEqual(report.children, []);
assert.deepEqual(report.residuals, []);
assert.equal(report.wholeStory.coverage.status, 'unavailable');
```

- [ ] Build the expected inventory from timing/policy/session/run/delivery authority before considering present cost records. Treat enumeration/provenance failure as unavailable. Invalid cost candidates prevent complete issue coverage even when their attribution cannot be recovered; do not silently discard them as irrelevant.
- [ ] Aggregate only uniquely accepted contributions after Task 11. Keep unknown stage/window quantities visible but non-additive to those dimensions. A source whose currency is unknown prevents certifying any currency view it could affect; known USD evidence alone does not prove a complete USD view. Preserve residuals, precision, source lateness, lost local raw-evidence diagnostics and every stage visit.
- [ ] Implement owning-issue-safe epic rollups by immutable economic/record identity. A parent summary of child costs is not a new cost line; an epic's trunk boundary can classify child occurrences without extending the child's Done window. Fetch child authority only for explicit rollup scope and disclose missing child evidence.
- [ ] Implement the offline default and explicit GitHub-only `--refresh` path. Cache normalized evidence, hashes, provenance, cursor coverage and snapshot time, not arbitrary comment bodies. Refresh failure must not silently serve an old snapshot as fresh; show stale/unavailable status. `--json` preserves exactly the same statuses as text.
- [ ] Register `cost <N> [--json] [--refresh] [--epic]`; read-only reports do not require an active timing session or mutate the issue. Exit 0 for a valid incomplete report, 2 for invalid arguments, 1 for a corrupt/unreadable local cache or failed explicit refresh. A missing cache renders an unavailable report with the refresh instruction.
- [ ] Test the headline selection: complete actual for the requested boundary/currency wins; otherwise labeled estimated equivalent with its own completeness status and explicit incomplete actual billing. Never render a bare partial total or sum unlike currencies.
- [ ] In command tests, inject provider and GitHub mutation ports that throw if called. Default reports must make no network call. `--refresh` may call only bounded GitHub read ports. Re-run help-router parity tests and commit as `[#1719] Report story cost with independent evidence coverage`.

### Task 13: Optional human projection and explicit local reconciliation

#### Story Intent

- **Beneficiary:** delivery operator
- **Capability:** view a readable cost projection and submit explicit local reconciliation evidence
- **Need:** immutable source records are difficult to inspect and corrections need a governed path
- **Value or failure prevented:** humans can investigate cost without changing or obscuring original evidence

#### Implementation Steps

**Files:** Create `scripts/task-tracker/lib/cost/projection.mjs`, `reconcile-command.mjs`, `scripts/task-tracker/verbs/cost-reconcile.mjs`, `scripts/tests/unit/task-tracker/lib/cost/projection.test.mjs`, and `scripts/tests/integration/task-tracker/lib/cost/reconcile-command.test.mjs`. Modify `scripts/task-tracker/task-tracker.mjs`, `verbs/help-data.mjs`, and `verbs/update.mjs`.

**Interfaces:** Produce `renderCostProjection({ report }) -> string`, `refreshCostProjection({ issue, report, authority, ports })`, and `reconcileCost({ issue, input, authority, deps }) -> { appended, pending, diagnostics }`. `input` is a versioned local `aitm.cost-reconciliation-input/v1` document containing issue/repository, accepted input hashes, new sanitized observations, explicit run correlations and a replacement proposal. Validation creates a Task 11 payload; it does not trust a supplied final record envelope.

- [ ] Add a test proving ledger success plus projection failure remains delivered, and projection rebuild uses only accepted records. Add malicious category/diagnostic text that attempts to quote either record marker.
- [ ] Run the new unit/integration tests; expect failure.

```js
import assert from 'node:assert/strict';
import { buildCostReport } from '../../../../../task-tracker/lib/cost/report.mjs';
import { renderCostProjection } from '../../../../../task-tracker/lib/cost/projection.mjs';
const body = renderCostProjection({ report: buildCostReport({ snapshot: null, issue: 1719 }) });
assert.match(body, /unavailable/i);
assert.doesNotMatch(body, /<!--\s*aitm-(?:cost-)?record/i);
```

- [ ] Render a compact Agent Cost Ledger view with snapshot time, coverage, per-currency known amounts, missing reasons, and links to accepted record IDs. Use bounded labels and HTML escaping; scan the final body for both marker predicates and secret signatures before publication. Never copy raw rejected bodies.
- [ ] Publish one replaceable owned projection using the existing governed owned-comment boundary and a stable `cost.ledger-v1` key. Its removal or staleness cannot invalidate immutable records. The projection is opt-in and best effort.
- [ ] Register `cost-reconcile <N> --input <project-local-file>`. Require matching issue/repository, active governed mutation session, issue worktree/ownership, and explicit invocation. Publish only validated append-only corrections and replay pending frozen items. No state promotion, marker repair, arbitrary backfill, billing credentials or provider network port is permitted.
- [ ] Route explicit `update` and later timing operations through bounded pending replay. Replays do not reconstruct lost samples. A crash-before-freeze recovery observation uses its actual current time and a reconciliation identity.
- [ ] Test invalid input/hash/ownership, uncertain publication, retry body identity, projection tampering and disabled mode. Help must state that reporting is read-only and reconciliation writes immutable evidence. Re-run help parity and commit as `[#1719] Rebuild cost projections and reconcile local evidence explicitly`.

### Task 14: Subscription capacity without story allocation

#### Story Intent

- **Beneficiary:** subscription manager
- **Capability:** compare purchased capacity with accepted usage in a separate ledger
- **Need:** fixed subscriptions are real spend but cannot be assigned to individual story costs
- **Value or failure prevented:** utilization and remaining capacity are visible without distorting delivery totals

#### Implementation Steps

**Files:** Create `scripts/task-tracker/lib/cost/subscriptions.mjs`, `subscription-report.mjs`, `scripts/task-tracker/verbs/cost-subscription.mjs`, `scripts/tests/unit/task-tracker/lib/cost/subscriptions.test.mjs`, and `scripts/tests/integration/task-tracker/lib/cost/subscription-command.test.mjs`. Modify the dispatcher/help data and cost reconciliation input validator.

**Interfaces:** Produce `buildSubscriptionPeriod({ plan, period, fixedSpend, capacity, rules, usageRefs, residuals })`, `calculateSubscriptionView({ periodRecord, acceptedUsage, cards })`, `calculateSubscriptionUtilization({ purchased, usage, coverage }) -> { status, percentage, remaining }` for one declared capacity unit, and `renderSubscriptionReport(view)`. The payload `capacity` is an array of `{ category, purchased, unit }` or null; the calculator accepts only one entry's `purchased` canonical nonnegative integer string or null, with measured `usage` in that same unit. Map entries explicitly by category/unit; reject passing the array or mixing units. Percentage is a two-decimal string rounded half-up with integer arithmetic; purchased 3 / usage 1 gives `33.33`. Remaining is the exact integer string `max(purchased - usage, 0)`, with overage reported separately. Null or zero purchased capacity, incomplete coverage, unknown units or unavailable usage yield null percentage/remaining and unavailable status; usage imports reference accepted story records by immutable identity. Preserve included and overage rules without treating included consumption as an additional invoice charge.

- [ ] Test a USD 20 fixed-spend period with contractual capacity 100 and accepted usage 40: utilization 40%, remaining 60. Test unknown soft capacity: observed usage/fixed spend visible, utilization and remaining unavailable. Test exhaustion and metered overage separately.
- [ ] Test that attaching subscription period evidence leaves story estimated/actual totals byte-identical. Run both new tests to observe failure.

```js
import assert from 'node:assert/strict';
import { calculateSubscriptionUtilization } from '../../../../../task-tracker/lib/cost/subscriptions.mjs';
assert.deepEqual(
  calculateSubscriptionUtilization({ purchased: null, usage: '40', coverage: 'complete' }),
  {
    status: 'unavailable',
    percentage: null,
    remaining: null,
  }
);
assert.deepEqual(
  calculateSubscriptionUtilization({ purchased: '100', usage: '40', coverage: 'complete' }),
  {
    status: 'complete',
    percentage: '40.00',
    remaining: '60',
  }
);
```

- [ ] Validate period boundaries, provider/account/plan identity, currency, native capacity units, source evidence, reconciliation instant and usage references. Keep unrelated/unattributed provider usage as residuals. Deduplicate imported usage across stories and epics.
- [ ] Compute utilization only for compatible contractual units with complete measured coverage. Compute hypothetical pay-as-you-go equivalent from identified immutable rate cards, preserving currency and completeness. USD subscription/EUR valuation comparison is unavailable, with original amounts displayed separately.
- [ ] Extend `cost-reconcile` with a subscription input variant targeting only the configured ledger issue. Require authority for that issue, not the originating story's lock. Do not silently create or choose a repository issue. Record writes use the isolated cost transport.
- [ ] Register `cost-subscription [--json] [--refresh]` as a read-only cache/GitHub-refresh surface, using the same no-provider-network contract as story reporting. Missing configured issue produces a clear unavailable/configuration result.
- [ ] Re-run tests, including story-total invariance and duplicate-import checks. Commit as `[#1719] Track separate subscription capacity and utilization`.

### Task 15: Offline administrative reconciliation contracts and live-access gate

#### Story Intent

- **Beneficiary:** billing administrator
- **Capability:** normalize offline provider billing evidence under a separately approved live-access boundary
- **Need:** provider aggregates may inform actual cost while live credentials and account access remain unapproved
- **Value or failure prevented:** billing reconciliation can be tested without premature external access

#### Implementation Steps

**Files:** Create `scripts/task-tracker/lib/cost/adapters/admin-openai.mjs`, `admin-anthropic.mjs`, `admin-access.mjs`, and `scripts/tests/unit/task-tracker/lib/cost/admin-adapters.test.mjs`. Add `scripts/tests/fixtures/cost/providers/openai-admin-buckets.json`, `anthropic-admin-buckets.json`, and fixture provenance notes.

**Interfaces:** Produce pure `normalizeAdminEvidence({ document, source, contract }) -> { observations, residuals, diagnostics }` from each adapter and `assertLiveCostAccess({ approval, operation, sourceId, requestedScope })`. The access validator can authorize only a separately approved, read-only provider integration scope; it is not called by default reporting or local capture. No production HTTP client is delivered by this task.

- [ ] Add fixtures with minute/hour/day usage, daily cost, grouping dimensions, coarse time bounds, inclusive provider charges, delayed adjustments and redacted account/project references. Distinguish `agentProvider` from `billingProvider`.
- [ ] Add tests for an exclusive project/key dimension, shared account bucket, overlap with exact receipts, unavailable stage/cutoff resolution, mismatched currency and incompatible rate cards. Run the new test; expect failure.
- [ ] Implement normalization retaining bucket boundaries and declared grouping. Only proven exclusive attribution can contribute actual billed story cost, and only at its supported dimensions. Nonexclusive totals remain comparison/residual evidence; never allocate by elapsed-time overlap or force a balanced ledger.
- [ ] Apply Task 6 economic deduplication against local transcript/receipt evidence and Task 11 append-only corrections. Unsupported schema/category values produce stable unavailable diagnostics without leaking provider strings.
- [ ] Implement deny-by-default access validation with explicit operation, source, scope and approval identity. Credentials stay in machine-local secret resolution, outside record/config/command-line inputs. Tests use opaque approval fixtures and no real keys.

```js
import assert from 'node:assert/strict';
import { assertLiveCostAccess } from '../../../../../task-tracker/lib/cost/adapters/admin-access.mjs';
assert.throws(
  () =>
    assertLiveCostAccess({
      approval: null,
      operation: 'read-usage',
      sourceId: 'admin-fixture',
      requestedScope: ['usage'],
    }),
  /cost:live-access-disabled/
);
```

- [ ] Document a hard implementation boundary: actual HTTP transport, credential provisioning and a live smoke test require separate approved scope after plan review. Until that approval, attempts to fetch live admin evidence are refused. Offline evidence imported through Task 13 remains available and testable.
- [ ] Re-run the adapter tests; commit as `[#1719] Normalize offline admin evidence and gate live access`.

### Task 16: Acceptance matrix, prospective rollout and package verification

#### Story Intent

- **Beneficiary:** release owner
- **Capability:** verify the complete accounting scenario and every consumer before enabling capture
- **Need:** compatible readers and failure behavior must be proven across the packaged workflow
- **Value or failure prevented:** prospective rollout avoids breaking shared issue consumers or overstating cost

#### Implementation Steps

**Files:** Create `scripts/tests/helpers/cost/story-harness.mjs`, `scripts/tests/integration/task-tracker/lib/cost/story-lifecycle.test.mjs`, `acceptance-failures.test.mjs`, `scripts/tests/fixtures/cost/story-lifecycle.json`, `docs/guides/story-cost-accounting.md`; update `docs/guides/workflow.md` with the new command links and `config/cost-rate-cards/README.md` with validation/selection instructions. Extend `scripts/tests/integration/meta/package-test-corpus.test.mjs` only if needed to assert runtime cost modules are packed and fixtures remain excluded.

**Interfaces:** `runStoryScenario({ fixture, checkpoint }) -> { parentReport, epicReport, calls }` in the new test helper consumes the exported ports from Tasks 1–15 with an injected clock, deterministic IDs, fixture source meters, in-memory GitHub comments and isolated filesystem. It exercises the real orchestration functions and CLI entrypoints, not a duplicate reference implementation.

- [ ] Create a two-session story with repeated Develop visits, pause/resume, one child agent, direct MCP receipt, independent review, verified trunk, post-trunk work and Done. Fail one observation, then reconcile it. Use a separate child issue and subscription-ledger issue in the sandbox.
- [ ] Add the exact accounting fixture below. All monetary amounts are synthetic USD examples, never a real provider price claim. Model input includes tool results once; the inclusive-provider line covers its own token and hosted-tool components.

| Owning line                       | Boundary                     | Estimated equivalent | Actual billed |
| --------------------------------- | ---------------------------- | -------------------: | ------------: |
| Parent model usage                | Delivery                     |                 6.00 |          5.00 |
| Parent inclusive provider request | Delivery                     |                 1.25 |          1.00 |
| Parent direct MCP operation       | Delivery                     |                 0.50 |          0.50 |
| Parent external review            | Delivery                     |                 1.00 |          1.00 |
| Parent housekeeping               | Post-trunk                   |                 0.25 |          0.25 |
| Child-owned agent usage           | Delivery under epic boundary |                 2.00 |          2.00 |
| Separate subscription fixed spend | Separate period              |   Not a story amount |         20.00 |

Expected complete parent totals after valid reconciliation: delivery estimated `8.75`, actual `7.50`; housekeeping `0.25` in each view; whole story estimated `9.00`, actual `7.75`. The epic rollup including the child is estimated `11.00`, actual `9.75`. Subscription fixed spend never enters either total. Before reconciliation, display a known subtotal plus the specific missing contribution; do not label the future complete values as already known.

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runStoryScenario } from '../../../../helpers/cost/story-harness.mjs';
const fixture = JSON.parse(
  readFileSync(new URL('../../../../fixtures/cost/story-lifecycle.json', import.meta.url), 'utf8')
);
const { parentReport, epicReport } = await runStoryScenario({
  fixture,
  checkpoint: 'after-reconciliation',
});
assert.equal(parentReport.delivery.actual.USD.amount, '7.50');
assert.equal(parentReport.postTrunk.actual.USD.amount, '0.25');
assert.equal(parentReport.wholeStory.actual.USD.amount, '7.75');
assert.equal(parentReport.wholeStory.actual.USD.status, 'complete');
assert.equal(parentReport.wholeStory.estimated.USD.amount, '9.00');
assert.equal(epicReport.wholeStory.actual.USD.amount, '9.75');
assert.equal(epicReport.wholeStory.estimated.USD.amount, '11.00');
```

- [ ] Run `node --test scripts/tests/integration/task-tracker/lib/cost/story-lifecycle.test.mjs scripts/tests/integration/task-tracker/lib/cost/acceptance-failures.test.mjs`; expect initial assertion failures until the integrated behavior satisfies all rows below.
- [ ] Add one named acceptance case for each ratified failure case:

| Spec case | Required assertion                                                                                      | Primary tasks |
| --------- | ------------------------------------------------------------------------------------------------------- | ------------- |
| 1         | 100/missing/180 stays 80 with unresolved split; replacement 50+30 is atomic                             | 5, 11         |
| 2         | E1/E2 frozen at 130/160 retry as 30+30 after meter advances                                             | 7, 8          |
| 3         | Crash before freeze, missing opening and reset gaps retain actual observation times                     | 5, 7, 11      |
| 4         | Transcript/receipt/exclusive bill count once; coarse bills cannot create fine splits                    | 6, 9, 15      |
| 5         | USD 1/EUR 1 remain separate; incompatible subscription comparison unavailable                           | 6, 12, 14     |
| 6         | Second checkout sees ten markers/eight envelopes and cannot certify completeness                        | 12            |
| 7         | Competing revisions/dependencies do not mix original/replacement spans; Done requires proof             | 10–12         |
| 8         | Seven/eight columns, full markers, rewrites, rollups, healing and seconds survive composed suffixes     | 3, 8          |
| 9         | All three hosts independently reject missing/unreadable/unknown usage; zero requires proof              | 9             |
| 10        | Post-trunk terminal role coexists with each source kind/window                                          | 10, 12        |
| 11        | Many-to-many replacement stays in one payload; scalar envelope lineage remains unchanged                | 1, 11         |
| 12        | Cost corruption preserves governance reads; generic corruption still fails; output cannot claim markers | 2, 12, 13     |
| 13        | Clock/authority changes cannot alter a frozen retry; escaped full-envelope limits apply                 | 2, 7          |

- [ ] Add network tripwires to every fixture suite: default reports cannot call GitHub or provider ports; explicit refresh can only read GitHub; offline provider adapters cannot fetch; mutation adapters are called only from authorized capture/reconciliation/projection operations. Run the feature-disabled scenario against existing golden outputs.
- [ ] Document prospective enablement: publish the reader-only release, record its exact minimum version/commit and test an old-reader/new-writer failure fixture; verify every shared-issue consumer and the Task 4 manifest before enabling either writer; validate local adapters and catalog; publish intended policy identity; enable capture for new events only; inspect a fixture/dry-run report before a separately authorized pilot. Start with projections disabled. Disabling stops new capture and preserves immutable evidence/outbox; explicit reconciliation can finish already-authorized pending items. Never delete history or silently backfill.
- [ ] Measure the synthetic Task 16 scenario's timing-event and immutable-comment counts and report them in rollout evidence: one event comment per timing emission, plus policy/reconciliation records, with no implicit batching. Measure added action latency against the capture budget and verify deferred publication preserves exact bytes.
- [ ] Document troubleshooting for unknown usage, unsupported schemas, stale snapshots, missing records, pending frozen writes, source forks, size bounds and missing cutoff proof. Recovery commands must use exact issue scope; local deletion is not a reconciliation technique.
- [ ] Run the full validation commands below. Record actual results and exact implementation head in implementation evidence; do not claim these future checks were run merely because this plan was written.
- [ ] Commit the Task 16 changes as `[#1719] Verify story cost accounting acceptance and rollout`.

## Validation commands for implementation execution

Run from the implementation worktree, never from another checkout's installed package:

```bash
./scripts/dev-env/setup-local-worktree.sh
node scripts/dev-env/verify-local-worktree.mjs
node --test scripts/tests/unit/task-tracker/lib/cost/*.test.mjs
node --test scripts/tests/integration/task-tracker/lib/cost/*.test.mjs
npm run format:check
npm run lint
npm run test:unit
npm run test:integration
node scripts/inspect/ai-memory-parity.mjs --mode index
```

Run the existing package compatibility commands from `.github/workflows/ci.yml` on the final implementation PR. Fixtures/tests remain excluded from the published package, runtime modules remain included, and Node 24/26 pack checks must pass. Run slow tests only when their affected behavior or required delivery checks warrant them; do not relabel integration tests to avoid a gate.

Cost record corruption fixtures must also explicitly exercise the existing governance readers, workflow preflight, estimation outcome/forecast, and evidence-v2 delivery/close behavior. Check report JSON structurally, exact decimals as strings, and text snapshots for labeled unknown/partial values. For every test harness, prove a negative port call is impossible or caught; merely counting a successful result is insufficient.

## Spec coverage and review handoff

| Spec requirement group                                                      | Implementing tasks     |
| --------------------------------------------------------------------------- | ---------------------- |
| Stable timing event IDs, source roster, policy and prospective enablement   | 1, 3, 4, 8             |
| Native consumption, exact zero versus unknown, epochs and cursors           | 1, 5, 7, 9             |
| Rate cards, actual bills, economic overlap, included charges and currencies | 6, 9, 11, 15           |
| Immutable records, read isolation, secret policy and rendered size limits   | 1, 2, 7, 13            |
| Timing/stage/pause/session/delivery/Done and multi-agent attribution        | 3, 5, 8, 10            |
| Independent coverage, delayed evidence and child/epic reports               | 10–12                  |
| Human projection and explicit append-only reconciliation                    | 11, 13                 |
| Separate subscription period, utilization and hypothetical equivalent       | 14                     |
| Privacy, no implicit live billing, disabled compatibility and rollout       | 1, 2, 4, 9, 12, 15, 16 |
| Thirteen failure cases and end-to-end acceptance                            | 16                     |

The three nonblocking suggestions from the accepted spec XPR are explicit here: frozen retry identity includes the entire envelope/body (Task 7); timing and transport compatibility precede writers (Tasks 2–3 before Task 8); cost record types have a closed, disjoint allowlist (Tasks 1–2).

Original submission checks (completed before this Story Intent amendment):

- [x] Check each coverage row and all thirteen failure cases against the ratified spec.
- [x] Check exact file paths, exported signatures, payload field names, status vocabularies and dependency order.
- [x] Check snippets for undefined contracts, incomplete examples and accidental unsafe payload keys.
- [x] Validate Markdown, formatting, spelling, example syntax and source hash. Commit the plan with its required spelling vocabulary; no runtime implementation is included.
- [x] Hand off the plan for the separately requested XPR. Review acceptance does not imply implementation approval or live-access approval.

Story Intent amendment check:

- [x] Verify the root `## Story Intent` at heading level 2 and all sixteen task `#### Story Intent` blocks at heading level 4; `extractPlanTasks` returns sixteen tasks with empty `storyIntentViolations`, and all seventeen rendered stories pass `evaluateStoryProse` in approval mode.

Run from the repository root:

```bash
node --input-type=module -e '
import { readFileSync } from "node:fs";
import { extractPlanTasks } from "./scripts/task-tracker/lib/decomposition-policy.mjs";
import { parseStoryIntent, renderStoryFromIntent, evaluateStoryProse } from "./scripts/task-tracker/lib/user-story-quality.mjs";
import { CANONICAL_USER_STORY_TEMPLATE } from "./scripts/task-tracker/lib/user-story-author.mjs";
const source = readFileSync("docs/superpowers/plans/2026-09-21-1719-story-token-cost.md", "utf8");
const lines = source.split("\n");
const start = lines.findIndex((line) => /^## Story Intent\s*$/.test(line));
let end = start + 1;
while (end < lines.length && !/^#{1,2}\s+/.test(lines[end])) end++;
const root = parseStoryIntent(source, { headingLevel: 2, startLine: start + 1, endLine: end });
const tasks = extractPlanTasks(source);
const intents = [root.intent, ...tasks.map((task) => task.storyIntent)];
const valid = start >= 0 && root.ok && tasks.length === 16 &&
  tasks.every((task) => task.storyIntent && task.storyIntentViolations.length === 0) &&
  intents.every((intent) => evaluateStoryProse(renderStoryFromIntent(intent), {
    mode: "approval", canonicalTemplate: CANONICAL_USER_STORY_TEMPLATE
  }).ok);
if (!valid) process.exitCode = 1;
console.log(`root=${root.ok} tasks=${tasks.length} stories=${intents.length} approval=${valid}`);
'
```

Result (2026-09-24): `root=true tasks=16 stories=17 approval=true`.
