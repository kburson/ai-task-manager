# Defect #1901 Event-derived Timing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. This preparation session stops before implementation. Executors must read both this plan and its accepted specification.

**Goal:** Show recoverable story Active/Idle from recorded event history, with exact optional-days clock formatting, coherent accounting and safe historical preview/apply tooling.

**Architecture:** A pure normalized-source derivation engine produces per-lane half-open allocations and availability, independently of transcript estimates. Tolerant codecs and one verified publication seam preserve immutable source identity, sealed bytes and recoverable queue/journal semantics. Producers, model-dispatched consumers, guarded repair and explicit rollout use that contract.

**Tech Stack:** Existing Node ES modules, node:test, GitHub comment authority, existing AITM runtime journal/queue and issue locks. No new product dependency or alternative storage authority.

**Spec:** `docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md`, accepted artifact commit `bb24dd7ec75c43e3cb0acfbe4803d51a58ef3cd8`, SHA-256 `6e6e0aae4f1764850701f4f0be0b4593dfde8f1b84e968652b6cdf7b7bcd958f`. Specification XPR finalized at `aa5bfc190213a568afc5a18e4e5a98e949f3d8b3`. The later XPR clarification sections are normative and their more specific contracts govern earlier summary wording. This plan resolves the two accepted nonblocking suggestions without editing the accepted spec.

**Repository baseline:** `54dcf2397f6101d67b58e67d3b5e1d81c044fd44`; package `@kburson/ai-task-manager` 0.1.0. Revalidate current interfaces and native dependencies at deep dive and each child pickup; material changes require plan amendment and renewed review.

## Scope

Implement all #1901 AC1–AC6: pure allocation, display and metadata, producers, consumers, replay, live convergence, historical tooling and operational rollout gates. Build apply capability but do not apply to historical GitHub logs, activate production logs, deploy or publish a package during this work. Keep #1847's scope, board codec, #1858 pause policy and #1857/#1862 runtime authority intact. The separately identified old-format zero-literal defect is not silently bundled.

## Context

`runtime.mjs` currently maps unavailable transcript activity evidence to null visible durations. The accepted source requires event ownership and matching closing observations, rather than an opener alone, while preserving original estimates. `gh-timing-comment.mjs` owns append/publication; `lib/timing-row-reader.mjs` is the lexical leaf; outcome-record validation protects exact prefix and suffix bytes. GitHub comment writes have no compare-and-swap. We can detect, converge and refuse within bounded attempts, but cannot promise global atomic exclusion.

## Plan Metadata

- Priority: P1
- Size: XL
- Estimate: 60 hours aggregate engineering effort, provisional until current child refinement
- Labels: bug
- Governing-spec: docs/superpowers/specs/2026-10-08-1901-event-derived-timing-design.md
- Stop-boundary: parent Develop prepared; children Ready for Planning; no implementation

## Story Intent

- **Beneficiary:** workspace operator reviewing story timing
- **Capability:** assess recorded engagement and waiting directly from event-derived Active and Idle durations
- **Need:** recoverable event intervals currently appear Unknown or reflect transcript heuristics instead of recorded engagement
- **Value or failure prevented:** reliable story timing without fabricated observations, double credit or unsafe historical rewrites

## Global Constraints

- Normalize timestamp milliseconds with `floor(ms / 1000)`; subtract whole-second ticks. Preserve original text, offset, precision and millisecond evidence.
- Known display is `[N days ]HH:MM:SS`: positive unpadded day prefix only at 24 hours or above, hours 00–23, two-digit clock fields; blank-zero remains distinct from explicit `00:00:00`.
- Reject unsafe, negative, fractional/nonfinite numeric seconds, numeric strings to formatting, invalid dates/offsets and malformed/conflicting recognized suffixes; never clamp to zero.
- Pure derivation has no network, writes, transcript access or implicit clock. Active/Idle need attributable bounded observation; unrelated/shared events cannot close a lone actor opener or interruption.
- Preserve immutable timestamps, event/actor identity, engagement endpoints and original estimate, description, words, transition identity and unrelated suffixes. Delta Words retains its existing separate publisher normalization.
- Event projection metadata is `aitm-duration:v1`, model `event-delta/v1`; activation control is one immutable `aitm-duration-model:v1` in the canonical Timing Log.
- Every fully known dimension agrees across display, allocation and numeric metadata; partial rows omit a misleading complete row-sec pair and expose known subtotals/reasons.
- A live source admission plus affected reallocation is one body mutation, with full-projection read-back and a maximum of three mutation attempts. No own-row-only acknowledgment, CAS claim or automatic restore over newer data.
- Preserve exact sealed source prefix/suffix bytes and old outcome semantics; protected true late insertion/repair refuses. A valid ordinary append after a protected cutoff survives with an explicit unavailable protected remainder.
- Local config authorizes requesting rollout; the shared marker governs actual model. Marker-present legacy/disabled participants follow it or refuse. Unsupported installations are excluded operationally, not magically made safe.
- Historical apply consumes a reviewed preview digest, exact backup and coordinated exclusive maintenance window. Preview/export stays available without writer exclusion; no real historical apply is authorized here.
- Board codec and independent SessionTime wall-span stay unchanged. Plan/Review Active are subsets of Engaged. Round minute totals only after summing seconds.
- Root ACs and governed child Test/Review gates remain required. Each child owns executable focused verifiers; aggregate gates never substitute for a failed child contract.

## Review Focus

1. An actor opens and never returns while another advances stages for days: no invented Active or Idle tail (Task 1).
2. An original journal payload replays after another writer reallocates it: one source/word admission and only full-projection acknowledgment (Task 3).
3. An ordinary actor update spans a sealed cutoff: append succeeds, protected bytes stay exact and its unfillable earlier portion remains unavailable (Tasks 3 and 5).
4. Two upgraded hosts have divergent local settings around activation: the shared marker wins and old/unknown participants block rollout (Task 8).
5. A repair loses its response while another source changes: correlate exact target or refuse; never blindly repeat or restore (Task 6).

## Contracts shared across tasks

The following names are new planned interfaces, not claims that they already exist. Task ownership below creates them. Types use JavaScript objects; named shapes below fix their fields across workers.

- `SourceFact = { sourceId, evidenceDigest, sourceOrder, tick, timestampText, event, lane: {kind,key}, stage, endpoints, originalEstimate, words, description, transitionId, opaqueSuffixes }`. `lane.kind` is actor, legacy-single-stream or shared; an actor key is existing identity, never synthesized. `sourceOrder` is a stable integer tuple, not a current array index. `endpoints` holds original ms and attributable closing observations, or null. Pauses are separate scoped immutable facts.
- `Allocation = { lane, fromTick, untilTick, seconds, dimension, stage, sourceRefs, method }`; dimension is active/idle; method is event-bracket, engagement-endpoints or legacy-idle-bridge. Each half-open allocation belongs to one closing source row.
- `Availability = { state, knownSec, reasons, sourceRefs, extents }`; state is known, fillable-pending or terminal-unavailable. Unknown stage/lane diagnostics have inspectable scopes; known Idle alone cannot invalidate Active.
- `deriveEventDurations({ sources, pauses, activation, protectedRegions })` returns `{ model, sourceDigest, rows, scalars, diagnostics }`. A row contains `{sourceId, activeSec, idleSec, allocations, activeAvailability, idleAvailability, precision}`. Each scalar is { value: nullable integer seconds or minutes, knownSec: integer subtotal seconds, state, reasons, sourceRefs }; scalars expose independent availability and subtotal; no projected implicit tail.
- `decodeTimingSource(body)` returns `{sources,pauses,activation,diagnostics}` from lexical rows and canonical event grammar. It is pure and consumes the unchanged original source evidence, not displayed duration as event truth.
- `formatTimingDuration(seconds)` and `parseTimingDuration(text)` own new Timing Log grammar plus legacy read compatibility; the board formatter is untouched.
- `parseDurationSuffixes(line)` and `replaceDurationProjection(line, projection)` preserve opaque/source bytes and use the accepted composed-suffix order. Activation marker insertion is separate control evidence, never a mutable projection rewrite.
- `discoverProtectedTimingRegions({repo,issueNumber,commentNodeId,readRecords})` returns `{complete,regions,records}`. Each region identifies exact source bytes/digest and cutoff. Missing, inaccessible or ambiguous authority means complete=false and publication/apply refuses mutation.
- `publishTimingAdmission({context,admission,deps})` consumes one immutable single-source or lifecycle-pair admission unit, a real source tick/order and optional explicit authorized activation request. It returns existing normalized publication/queue outcomes plus sourceDigest, attempts and reason. It uses injected reads/writes/locks and calls Task 1's pure engine and Task 2's codecs.
- `projectEventScalars(derivation)` yields complete seconds/null, known subtotals, reasons and rounded minutes for Engaged/Idle/Plan/Review/per-stage values. SessionTime remains a separate old wall-span function.
- `prepareEventDurationRepair({source,context})` returns an immutable preview with source/target digests, operation/operator identity, categories, allocations, protection, model coverage and board deltas. `applyEventDurationRepair({preview,coordination,deps})` requires that exact preview and validates every byte/write outcome.

Treat signatures as interface commitments. An implementer cannot silently rename fields used by siblings. Additions must be backward compatible within this plan or reviewed before another wave depends on them.

## Parallel waves and estimates

These are logical execution ranks, not already created issue IDs. Hydration binds them to real child issues, adds native blocking dependencies and uses the same rank for same-wave siblings. No worker is launched in this preparation session.

| Task                                            | Rank/wave | Depends on tasks | Files independently owned                                           | Initial hours |
| ----------------------------------------------- | --------- | ---------------- | ------------------------------------------------------------------- | ------------: |
| 1 Engine and bounded evidence                   | 1         | none             | new derivation/source modules and engine tests                      |             8 |
| 2 Tolerant lexical/display codecs               | 1         | none             | lexical leaf, marker codec, new display codec and codec tests       |             6 |
| 3 Verified publication and source protection    | 2         | 1,2              | publisher, source-protection helper and convergence tests           |            10 |
| 4 Producers and atomic lifecycle admission      | 3         | 3                | runtime, bind, journal, queue, approval/close adapters              |             8 |
| 5 Accounting and outcome compatibility          | 3         | 3                | scalar projection, old/new adapters, rollup and outcome validators  |             8 |
| 6 Guarded historical recalculation              | 4         | 4,5              | repair implementation and preview/apply tests                       |             8 |
| 7 Maintenance consumer compatibility            | 4         | 4,5              | heal/rename/sequence consumers and their tests                      |             4 |
| 8 Reader-first rollout and aggregate validation | 5         | 6,7              | config, command registration, rollout command/docs and system tests |             6 |

Task 1 does not import the Task 2 lexical implementation: it accepts normalized SourceFacts. Task 2 does not import derivation: it provides lexical/codec primitives and pure source decoding. Wave 1 validates their agreed shape independently before Task 3 integrates it. Tasks 4/5 and 6/7 may fan out only on integrated predecessor commits. Existing files are single-owner: Task 5 owns `lib/timing-rows.mjs` and `lib/timing-engagement.mjs`; Task 2 owns new formatting/metadata modules instead of editing those same files. Task 8 alone owns command catalog/routing and configuration. Task 6 supplies repair exported parser/help contracts for Task 8 registration. If a consumer sweep discovers an unlisted shared file, pause that change and route it to its declared owner; do not create overlapping edits in sibling worktrees.

Effort sum is 58 hours; reserve 2 hours root integration/orchestration, yielding 60 hours. Wave critical-path sums are 8 + 10 + 8 + 8 + 6 = 40 hours before staffing/coordination overhead; do not replace board effort with this parallel elapsed estimate. These are engineering estimates, not measured model time. Refined children replace these initial values before parent Develop entry.

## Acceptance Criteria

- [ ] AC1: reproduce 133/5/51/453660 seconds and the subsequent 901-second update, including unavailable transcript and live unfinished-turn conditions; bounded evidence and conservation pass (Tasks 1,3,4,8).
- [ ] AC2: exact optional-days grammar, blank/explicit zero, malformed/unsafe input and unchanged board codec pass (Tasks 2,5,8).
- [ ] AC3: every producer uses event derivation under the canonical model with source/word preservation and honest unavailable reasons (Tasks 3,4,7,8).
- [ ] AC4: readers, metadata, scalar projections, replay, partial totals and original sealed outcome semantics agree (Tasks 2,3,5,7,8).
- [ ] AC5: preview-default, source-bound apply, non-overwriting exact backup, exclusion/drift/read-back failure and idempotency pass without real historical writes (Tasks 3,6,8).
- [ ] AC6: actor isolation/overlap, sequential actors, shared pairs, delayed events, queue/journal restart and protected boundaries conserve allocations without duplicate credit (Tasks 1,3,4,5,8).

## Implementation Tasks

### Task 1: Derive bounded event durations with actor isolation and conservation

#### Story Intent

- **Beneficiary:** workspace operator inspecting engagement history
- **Capability:** recover attributable Active and Idle intervals from recorded events and inspect unresolved portions
- **Need:** transcript estimates suppress recoverable durations while unrelated events can otherwise inflate an actor's open tail
- **Value or failure prevented:** correct elapsed timing without cross-actor credit, invented observations or duplicate slices

#### Files

Create `scripts/task-tracker/lib/timing-duration-derivation.mjs` and `scripts/tests/unit/task-tracker/lib/timing-duration-derivation.test.mjs`. Create synthetic source-fact builders in `scripts/tests/helpers/1901-duration-facts.mjs`; later tasks use them read-only. Consume `lib/timing-events/index.mjs` classification without changing vocabulary. Interface: implement deriveEventDurations and Allocation/Availability exactly as above; normalized input rejects bad timestamps and source identity conflicts.

**Rank:** 1. **Estimate:** 8 hours, L. **Dependencies:** none.

- [ ] Add table-driven failing tests for tick flooring, 51 Active, 453660 legacy bridge Idle, 133 update Active, boundary 5 and subsequent 901; same-second pair zero; minute-resolution input; offset changes; invalid calendar date/missing zone; unsafe tick; duplicate start; repeated departure; source conflict. Synthetic fixtures must be labeled synthetic.
- [ ] Add these executable kernel tests, with `makeFact` from the helper constructing complete SourceFact fields. Times below are already normalized ticks; real timestamp tests separately exercise the decoder.

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveEventDurations } from '../../../../task-tracker/lib/timing-duration-derivation.mjs';
import { makeFact } from '../../../helpers/1901-duration-facts.mjs';
test('own observation splits at recorded shared boundary without recount', () => {
  const sources = [
    makeFact('start', 0, 'a'),
    makeFact('plan:started', 5, 'shared'),
    makeFact('update', 906, 'a'),
  ];
  const r = deriveEventDurations({ sources, pauses: [], activation: null, protectedRegions: [] });
  assert.equal(r.rows[1].activeSec, 5);
  assert.equal(r.rows[2].activeSec, 901);
  assert.equal(r.scalars.engagedSec.value, 906);
});
test('unrelated boundary cannot end a lone opener', () => {
  const r = deriveEventDurations({
    sources: [makeFact('start', 0, 'a'), makeFact('plan:started', 86400, 'shared')],
    pauses: [],
    activation: null,
    protectedRegions: [],
  });
  assert.equal(r.scalars.engagedSec.value, null);
  assert.equal(r.scalars.engagedSec.knownSec, 0);
});
```

- [ ] Implement lane state machine, unique source-order validation, observed endpoint reconciliation, narrow legacy bridge retirement, scoped pause union, shared boundary split and unavailable extent propagation. Add symmetric never-resumed Idle, matching late endpoint spanning boundaries, orphan recovery without original end, observed long transcript gap with zero event Idle, overlapping independent lanes and stage-uncertainty cases.
- [ ] Add deterministic late-insertion tests start=0/update=20/boundary=10 => 10+10; ensure sourceOrder persistence and completion-before-entry. Property tests iterate deterministic seeded interleavings, prove slice uniqueness and Active+Idle conservation for fully observed windows, and retain extents/subtotals rather than guessing incomplete values.
- [ ] Run the verifier, inspect each invariant and commit an issue-prefixed change after red/green tests. New module failures must be caused by missing implementation or wrong behavior, not broken test import paths.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/timing-duration-derivation.test.mjs
```

### Task 2: Add tolerant lexical metadata and Timing Log duration codecs

#### Story Intent

- **Beneficiary:** operator reading mixed-version story logs
- **Capability:** decode old and event-model rows and see unambiguous days-and-clock durations
- **Need:** old suffix parsing and duration grammar reject enabled rows or conflate malformed, unavailable and zero values
- **Value or failure prevented:** readable history and compatible consumers without corrupting opaque metadata or board formats

#### Files

Modify `scripts/task-tracker/lib/timing-row-reader.mjs`. Create `lib/timing-duration-codec.mjs`, `lib/timing-duration-metadata.mjs`, `lib/timing-duration-source.mjs` and focused tests `scripts/tests/unit/task-tracker/lib/timing-duration-codec.test.mjs`, `timing-duration-metadata.test.mjs`, `timing-duration-source.test.mjs`. Paths beginning lib here resolve under scripts/task-tracker. Do not edit Task 5's timing-rows/timing-engagement modules. Source decoder converts lexical events/endpoints into the agreed SourceFact shape and calls canonical event grammar. It neither estimates durations nor mutates source identity.

**Rank:** 1. **Estimate:** 6 hours, M. **Dependencies:** none; integrates with Task 1 only in wave 2.

- [ ] Add failing round-trip and rejection tables for 0,47,133,3599,3600,86399,86400,453660,multi-digit days and MAX_SAFE_INTEGER. Check positive unpadded days, literal days, clock bounds, missing timezone/calendar invalidity in source decoding, and legacy Xh MMm SSs/minute cells. Blank, Unknown and malformed are distinct typed decoding results.

```javascript
for (const [n, s] of [
  [0, '00:00:00'],
  [133, '00:02:13'],
  [86400, '1 days 00:00:00'],
  [453660, '5 days 06:01:00'],
]) {
  assert.equal(formatTimingDuration(n), s);
  assert.equal(parseTimingDuration(s).seconds, n);
}
for (const n of [-1, 1.5, NaN, Infinity, '133']) assert.throws(() => formatTimingDuration(n));
```

- [ ] Implement deterministic codec, source decoder and composed suffix parser. New suffix order is transition/actor/engagement/complete row-sec/activation/duration/cost/opaque; partial rows omit row-sec. Historical arbitrary composed order remains readable. Duplicate/conflicting recognized markers fail with inspectable diagnostics.
- [ ] Encode source identity/evidence separately from mutable projection. Stable source order uses recorded equal-tick order, including pair order; use a canonical length-delimited serialization and SHA-256 so concatenation ambiguities cannot alias. Replacing only duration projection must retain original engagement estimate/endpoints/word cursors and opaque bytes.
- [ ] Pin exact legacy-reader incompatibility in a small source-pinned compatibility fixture, including actor TIMING_ACTOR_INVALID, non-actor seconds extraction and new-clock rejection. Baseline fixture is historical reference, never substituted for production readers. Disabled emission bytes stay baseline-consumable.
- [ ] Run existing lexical structure tests plus new codecs; commit only owned files. Expected new tests fail before implementation and pass without changing board codec lib/duration.mjs.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/timing-duration-codec.test.mjs scripts/tests/unit/task-tracker/lib/timing-duration-metadata.test.mjs scripts/tests/unit/task-tracker/lib/timing-duration-source.test.mjs scripts/tests/unit/task-tracker/core/timing-row-reader-structure.test.mjs scripts/tests/unit/task-tracker/lib/timing-row-reader.test.mjs scripts/tests/unit/task-tracker/lib/duration.test.mjs
```

### Task 3: Publish immutable admissions with complete projection verification

#### Story Intent

- **Beneficiary:** operator sharing a timing log across agents
- **Capability:** retain every admitted event and detect or reconcile stale duration projections
- **Need:** concurrent comment overwrites, delayed events and replay can lose evidence or acknowledge only a present row
- **Value or failure prevented:** no silent loss, duplicate credit or successful publication claim over a stale or protected projection

#### Files

Modify `scripts/task-tracker/gh-timing-comment.mjs` and its test-only internals surface. Create `lib/timing-duration-publication.mjs`, `lib/timing-source-protection.mjs` and `scripts/tests/unit/task-tracker/core/timing-duration-publication.test.mjs`. Extend `core/gh-timing-comment-actors.test.mjs`. Read existing outcome records via current GitHub record-store authority; Task 5 owns outcome-validator changes. Implement publishTimingAdmission and discoverProtectedTimingRegions contracts. The publisher accepts normalized immutable single-row or lifecycle pair units; row builders remain Task 4 owned.

**Rank:** 2. **Estimate:** 10 hours, L. **Dependencies:** Tasks 1,2 integrated.

- [ ] Add failure-injected tests for stale two-writer snapshots, delayed insertion, duplicate equal-tick admission, conflicting immutable evidence, lost response, full-projection mismatch despite own-row presence and retry exhaustion at exactly three writes. Expose reads/writes/locks through deps; no live GitHub mutation in tests.

```javascript
const result = await publishTimingAdmission({
  context,
  admission,
  deps: twoWriterHarness({ overwriteFirst: true }),
});
assert.ok(result.attempts <= 3);
assert.equal(result.remotePublished, true);
assert.deepEqual(await harness.sourceIds(), ['start-a', 'update-a', 'boundary-b']);
assert.equal(await harness.projectionMatchesFreshDerivation(), true);
```

- [ ] Implement source/evidence digest correlation, atomic in-memory body construction, stable source order, protected-reference enumeration and exact protected-byte checks before each attempt. Query all relevant sealed authority references exhaustively; pagination/identity/read failures are incomplete discovery and refuse mutation. No global atomicity claim.
- [ ] Verify all observed projection fields and known immutable pre-write inventory, not only candidate presence. On drift merge retained known source facts with fresh authority, rederive and retry; source conflicts and protected intersections refuse. Keep full recoverable journal/queue evidence on pending result.
- [ ] Cover protected ordinary append after an opener-before-cutoff: preserve source endpoints and protected bytes; terminalize only previously uncredited protected extent; credit only observed post-cutoff windows and retain existing credited prefix interpretation. True late insertion inside protected bytes refuses. Verify current successor validation before acknowledgment.
- [ ] Make canonical activation control part of source inventory and immutable admission. Duplicate/conflicting models/tuples refuse; local disabled settings cannot revert a marker-present model. A stale writer rereads activation and rederives or refuses. Ordinary marker-free appends retain legacy output.
- [ ] Run focused concurrency and existing actor-publication tests; commit. Queue acceptance versus remote acknowledgment keeps its existing distinct outcomes; Task 4 wires these into checkpoint decisions.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/core/timing-duration-publication.test.mjs scripts/tests/unit/task-tracker/core/gh-timing-comment-actors.test.mjs
```

### Task 4: Wire all producers and preserve journal, queue and lifecycle semantics

#### Story Intent

- **Beneficiary:** operator recording current agent activity
- **Capability:** receive event-derived timing from flush, resume, lifecycle, approval, close and recovery publication
- **Need:** current adapters expose transcript-dependent Unknown and separate lifecycle writes can admit half a pair
- **Value or failure prevented:** recoverable live intervals and safe retries without changed word banking or false transition evidence

#### Files

Modify `scripts/task-tracker/runtime.mjs`, `queue.mjs`, `lib/actor-flush-journal.mjs`, `lib/bind-event.mjs`, `lib/move-state/audit-timing.mjs`, `lib/review-approval-timing.mjs`, `lib/terminal-review-handoff.mjs`, and existing close timing callers discovered by import sweep. Create `scripts/tests/integration/task-tracker/core/1901-duration-producers.test.mjs`. Extend actor-flush-journal, actor-flush-isolation, bind-event and coverage-audit-timing tests. Publication logic remains owned by Task 3; producers call that exported seam. Inventory every caller of postTimingEvent/buildFlushRow/buildReviewToDoneClosePair, including orphan/session recovery and Ask hooks; handle via the existing source boundary rather than introducing new event vocabulary.

**Rank:** 3. **Estimate:** 8 hours, L. **Dependencies:** Task 3.

- [ ] Add failing adapter tests using unavailable readActivityEvidence and a live uncompleted turn; event display recovers valid durations while original active estimate remains unknown. Also include an observed transcript gap whose bounded event window becomes all Active/zero Idle, without replacing the estimate.
- [ ] Pass immutable actor identity, original endpoint and continued own-boundary observation through admission. Never attest other actors. Retain journal payload/digest and queue identity. Confirm remote read-back or exact durable enqueue advances checkpoint; neither success keeps checkpoint unchanged.

```javascript
await harness.flush({ transcriptStatus: 'window-unconfirmed', fromMs: 1000, toMs: 134000 });
assert.equal(harness.visibleActive(), 133);
assert.equal(harness.originalEstimate(), 'unknown');
await harness.flush({ remote: 'failed', queue: 'accepted' });
assert.equal(harness.checkpointAdvanced(), true);
assert.equal(harness.remotePublished(), false);
```

- [ ] Prepare completion+entry as one immutable ordered pair with common tick and transition identity, delivered or queued together. Keep the independent pre-flush and its words: it owns through its tick, first boundary only the remaining observed slice, second zero. Failure after flush preserves it; retry admits only the missing pair with original timestamp, including restart/lost-response cases.
- [ ] Exercise queue acceptance then process restart, queue write failure, source replay after reallocation, duplicate/conflicting pair replay, same-second pairs, independently observed overlapping actors, word/reset cursors and orphan recovery. Canonical mutation failure must not counterfeit a board transition or remote freeze.
- [ ] Inventory actual approval/close/recovery producers and prove they use the seam in integration tests. Run listed tests and commit; no durable runtime migration, new pause semantics or fabricated task_complete events.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/core/1901-duration-producers.test.mjs scripts/tests/unit/task-tracker/lib/actor-flush-journal.test.mjs scripts/tests/integration/task-tracker/lib/actor-flush-isolation.test.mjs scripts/tests/unit/task-tracker/lib/bind-event.test.mjs scripts/tests/unit/task-tracker/lib/move-state/coverage-audit-timing.test.mjs
```

### Task 5: Project coherent totals while preserving sealed outcome semantics

#### Story Intent

- **Beneficiary:** operator comparing story effort and stage timing
- **Capability:** use complete event-derived totals and inspect scoped unknown remainders without invalidating old outcomes
- **Need:** actor, legacy, per-stage and minute calculations currently diverge and old source validation pins earlier semantics
- **Value or failure prevented:** trustworthy metrics without double-added Review time, subtotal-as-total claims or retroactive outcome corruption

#### Files

Create `scripts/task-tracker/lib/timing-duration-projection.mjs` and `scripts/tests/unit/task-tracker/lib/timing-duration-projection.test.mjs`. Modify `lib/timing-rows.mjs`, `lib/timing-engagement.mjs`, `timing-rollup.mjs`, `lib/estimation/outcome-record.mjs`, `lib/estimation/outcome-builder.mjs`, `scripts/gh/log-issue-time.mjs` and relevant existing rollup/outcome tests. Keep lexical implementation stable; Task 5 imports Task 2's codec. Add model dispatch adjacent to old functions rather than replacing old-schema semantics.

**Rank:** 3. **Estimate:** 8 hours, L. **Dependencies:** Task 3.

- [ ] Add failing scalar tests for 120 Active/180 Idle Plan => 2 Plan minutes; two 20-second Plan visits => 1 minute; repeated/demoted/open visits; stage-scoped unknown; known Idle with complete Active; unknown-stage scope; independent SessionTime; overlapping Idle and Active exceeding wall time. Whole-log mixed legacy/event coverage returns legacy-segment-unconverted instead of blending estimates.

```javascript
const s = projectEventScalars(deriveFixture({ planActive: [20, 20], planIdle: [180] }));
assert.equal(s.planSec.value, 40);
assert.equal(s.planMin.value, 1);
assert.equal(s.engagedSec.value, 40);
assert.equal(s.totalIdleSec.value, 180);
```

- [ ] Event model uses disjoint allocations and full-projection verification; incomplete affected board dimensions persist null/Unknown with subtotal/reason/model/source digest. A projection-stale reader never publishes complete authoritative numeric totals from stored cells alone. Apply Math.round only after summing complete seconds.
- [ ] Preserve old sealed snapshot digest and exact prefix/suffix validation, original estimates and old numeric interpretation. Supply a compatibility view for new-format successors that decodes known zero correctly without globally changing old-format explicit-zero behavior. Test actual outcome-record/outcome-builder/writer reuse, not merely unchanged record bytes.
- [ ] Test protected ordinary append with previously uncredited remainder, original sealed record reuse, valid zero/multi-day successors and invalid ordering/source evidence. Incomplete close measurements keep current incomplete-outcome handling and remain excluded from quantitative calibration; do not invent totals to pass a gate.
- [ ] Run focused projection and real rollup/outcome tests, review adapter sweep and commit. Preserve board codec byte output and remove new-model display-string heuristics from numeric decisions.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/timing-duration-projection.test.mjs scripts/tests/unit/task-tracker/core/timing-rollup.test.mjs scripts/tests/unit/task-tracker/lib/timing-ladder.test.mjs scripts/tests/unit/task-tracker/lib/estimation/outcome-telemetry.test.mjs scripts/tests/unit/task-tracker/lib/estimation/outcome-builder.test.mjs scripts/tests/unit/task-tracker/lib/estimation/outcome-writer.test.mjs scripts/tests/integration/task-tracker/lib/child-close-outcome-evidence.test.mjs
```

### Task 6: Build guarded historical preview and idempotent apply capability

#### Story Intent

- **Beneficiary:** workspace operator repairing historical story timing
- **Capability:** preview recoverable timing changes and apply exactly reviewed unprotected changes under explicit writer exclusion
- **Need:** current backfill skips actor Unknown and stale seconds and lacks exact fresh-base conflict protection
- **Value or failure prevented:** recoverable historical metrics without overwriting newer data, sealed evidence or unrelated source fields

#### Files

Modify `scripts/task-tracker/backfill-timing-logs.mjs`. Create `lib/timing-duration-repair.mjs`, `scripts/tests/unit/task-tracker/core/timing-duration-repair.test.mjs`, and extend backfill/coverage-backfill tests. Task 8 owns command registration and help snapshots; Task 6 exports the repair CLI parser/help and functions for registration. Consume Task 3 protection/admission checks and Task 5 scalar projection without changing sibling files.

**Rank:** 4. **Estimate:** 8 hours, L. **Dependencies:** Tasks 4,5.

- [ ] Add failing read-only preview tests for exact captured #1854 rows plus synthetic Unknown/zero/observed discrepancies. Categories are unknown-recovered, observed-estimate-reclassified, stale-seconds-reconciled and display-only. Include original/new board deltas, protected export-only segments, model coverage, remaining legacy/unavailable portions, source/comment identity and input precision.
- [ ] Implement prepareEventDurationRepair with exact source/target digests and deterministic derivation/provenance. Issue selection is explicit; live #1847 child discovery only supplies operator-selected preview candidates, not implicit writes or scope changes.
- [ ] Implement applyEventDurationRepair requiring preview expected digest, canonical identity reread, complete protected-reference inventory, writer exclusion and drained/excluded queue. Save exact non-overwriting backup/manifest under .scratch/heal before mutation. Missing coordination, backup error, drift or protected overlap => zero writes. Reread immediately before write and exact read-back after.

```javascript
const preview = prepareEventDurationRepair({ source, context });
await assert.rejects(
  () => applyEventDurationRepair({ preview, coordination: { exclusive: false }, deps }),
  /coordination/
);
assert.equal(deps.writeCount(), 0);
await applyEventDurationRepair({ preview, coordination: exclusiveFixture, deps });
assert.equal(deps.backupBytes(), source.body);
assert.equal(deps.readBody(), preview.targetBody);
```

- [ ] Inject lost response and observe exact target/provenance before retry; matching target succeeds without a second mutation. Source drift, newer unrelated mutation and read-back mismatch stop remaining issues, retain evidence and never blindly restore a backup. Repeated preview/apply with confirmed target is byte-identical without duplicate provenance.
- [ ] Initial historical activation writes the same immutable canonical marker in the same body mutation at the earliest eligible unprotected tuple, retaining actual current recording time. Existing tuple cannot move; excluded earlier history/protected regions remain preview/export-only. Original descriptions/events/word fields/opaque suffixes are invariant.
- [ ] Run tests and commit. Default invocation retains legacy-only behavior; explicit event-duration mode is preview by default. No real GitHub historical write occurs in implementation tests or preparation.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/core/timing-duration-repair.test.mjs scripts/tests/unit/task-tracker/core/backfill-timing-logs.test.mjs scripts/tests/unit/task-tracker/core/coverage-backfill-timing-logs.test.mjs
```

### Task 7: Make maintenance and sequence consumers model-aware

#### Story Intent

- **Beneficiary:** operator validating or maintaining timing histories
- **Capability:** diagnose malformed or incomplete event-model rows while preserving their source and projection contracts
- **Need:** independent heal, rename and sequence readers can reject enabled suffixes or reinterpret projected seconds as transcript observations
- **Value or failure prevented:** no maintenance-induced corruption or false green validation after reader rollout

#### Files

Modify `scripts/task-tracker/lib/heal-timing-log.mjs`, `lib/heal-timing-interval.mjs`, `lib/timing-slug-rename.mjs`, `heal-backlog.mjs`, `lib/agent-review/validators/timing-log-sequence.mjs` and their tests. Add `scripts/tests/unit/task-tracker/maintenance/1901-timing-consumers.test.mjs`. All module paths resolve under scripts/task-tracker. Do not change Task 6's backfill or Task 5's old engagement/outcome implementation. Consume stable lexical/model APIs; any additional consumer discovered is assigned to a single owner before edits.

**Rank:** 4. **Estimate:** 4 hours, M. **Dependencies:** Tasks 4,5.

- [ ] Add failing table tests for every maintenance/validation adapter on legacy, enabled, mixed-segment and partial rows. Include composed opaque suffixes, missing Full Word Marker, minute timestamps, zero and multi-day clocks, duplicate recognized metadata, invalid timestamp/ordering and projection-stale diagnostics.
- [ ] Replace display heuristics for event model with decoded availability/seconds and preserve old-schema validation semantics. Heal or slug-rename never authorizes changing immutable event identity/source or protected bytes merely because a duration is Unknown. Reuse admission/repair guards when a supported maintenance action would affect projection/source.

```javascript
const before = capturedEnabledBody;
const result = await validateSequenceFixture(before);
assert.equal(result.model, 'event-delta/v1');
assert.equal(result.unknownRemainderReason, 'sealed-source-protected');
assert.equal(await maintenanceNoop(before), before);
```

- [ ] Audit the dependency graph with rg for parseDurationSeconds, deriveActorEngagement, parseTimingRow and formatDurationSeconds. Enumerate remaining legacy-only call sites explicitly in a committed compatibility report; unsupported event-model consumers refuse honestly instead of silently degrading.
- [ ] Run focused maintenance and existing sequence tests; commit. Original old-format zero literal behavior remains pinned for legacy snapshot semantics.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/maintenance/1901-timing-consumers.test.mjs scripts/tests/unit/task-tracker/lib/heal-timing-log.test.mjs scripts/tests/unit/task-tracker/lib/heal-timing-interval.test.mjs scripts/tests/unit/task-tracker/lib/timing-slug-rename.test.mjs
```

### Task 8: Gate reader-first activation and prove complete repository integration

#### Story Intent

- **Beneficiary:** operator rolling out event-derived timing across hosts
- **Capability:** activate a shared log only after compatible participants are established and verify the complete timing workflow
- **Need:** old readers cannot consume enabled output and divergent local settings can otherwise mix duration models
- **Value or failure prevented:** no incompatible mixed writers, accidental downgrade, unreviewed historical apply or unsupported release claims

#### Files

Create `scripts/task-tracker/timing-duration-model.mjs`, `scripts/tests/integration/task-tracker/core/1901-duration-rollout.test.mjs`, `scripts/tests/integration/task-tracker/core/1901-duration-system.test.mjs`, and `docs/guides/event-derived-timing-rollout.md`. Modify `scripts/task-tracker/config.mjs`, `lib/command-surface/catalog.mjs`, `lib/command-surface/routing.mjs` and relevant help/config tests. Register new timing-duration-model operation and backfill-timing-logs with existing bin/aitm routing, using Task 6 parser/help exports. Package version/release changes are release-manager decisions and require actual release evidence, not an invented published version.

**Rank:** 5. **Estimate:** 6 hours, M. **Dependencies:** Tasks 6,7 integrated; all earlier work retained.

- [ ] Add failing rollout tests where no inventory/concrete release/config revision => no activation; stale allowed host/session/worktree => no activation; conflicting tuple => refusal; identical operation retry => one activation; marker-present local disabled => event output or duration-model-unsupported, never downgrade. Test post-activation legacy rows as refused evidence with raw preservation.
- [ ] Introduce disabled-by-default timingDurationModel. The readiness record lists all allowed writers and consumers, their concrete compatible release and capability/config revision, excluded/suspended old sessions, exact canonical source digest and operator operation ID. Release N is the first actually produced compatible release; activation refuses a symbolic N, unassigned version or unverified participant. Documentation names how to obtain/verify that concrete release rather than pretending a version has shipped.
- [ ] Future-only activation uses the next real ordinary candidate event admitted by an already authorized producer. The rollout command authorizes an activation request for that operation; it does not invent a new timing event or retrospective observation. If there is no eligible real candidate, activation remains pending and reports that status. The existing sanctioned task update can supply a real operator checkpoint; only its genuine admission can carry the marker. The marker and that source row are admitted together. Historical conversion instead uses Task 6's selected existing row; both paths share immutable model tuple/readiness/protection checks.
- [ ] Test full #1854 captured table recovering 51/453660/133/5/901, missing task_complete and non-Codex estimates, baseline disabled emission, release-N reading, sealed outcome reuse, full projection convergence, repaired replay, protected cutoff successors and complete/null board values. Record capture URL/body digest/time separately from synthetic tests; do not alter historical live logs.

```javascript
const result = await rolloutHarness.activate({
  inventory: verifiedParticipants,
  candidate: realUpdate,
});
assert.equal(result.status, 'activated');
assert.equal(result.markerCount, 1);
assert.equal(await rolloutHarness.disabledPeerAppend(), 'event-delta/v1');
assert.equal(await rolloutHarness.legacyPeerAttempt(), 'duration-model-unsupported');
```

- [ ] Publish the reader-compatible release with legacy emission default before any operator activation. This task prepares release artifacts/docs and test evidence; actual package publication and production rollout require their separate authorization. Do not silently auto-enable on installation or dry-run.
- [ ] Run complete root verification groups and current repository npm test, test:slow, lint and format:check at an exact clean commit under governed Test. Document known pre-existing failures with evidence and refuse success if required gates fail. Commit collateral, preservation checks and operational guide; do not tick root ACs merely because children exist.

**Verification Commands:**

```sh
node --test scripts/tests/integration/task-tracker/core/1901-duration-rollout.test.mjs scripts/tests/integration/task-tracker/core/1901-duration-system.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
```

## Hydration, refinement and preparation handoff

After genuine plan SPR and XPR acceptance/finalization, commit all generated startup, invitation, response, disposition and manifest files. Add immutable accepted plan path/commit and acceptance record to #1901 Plan Metadata. Perform the governed current-source deep dive with this accepted plan; if it contradicts a contract or requires another task/file dependency, amend and re-review before hydration.

Enumerate #1901's native existing children first. Use sanctioned split-plan dry-run then confirm only once after all eight task Story Intent blocks and executable verifier lists validate. Store exact task-to-child mapping, accepted plan digest/commit and native dependency edges in committed hydration collateral. Generated children point to the exact Task N source section; never substitute generic prose or imaginary issue IDs.

Rank children by the wave table and add native blocked-by dependencies for every listed predecessor. Higher waves cannot begin until predecessor work is integrated under existing lineage/delivery policy; Ready for Planning may hold tasks with future execution dependencies, but that state never implies those dependencies are already delivered. Refine each child Backlog→Refine→Ready for Planning with individual supported size, estimate, priority, rank, labels, ownership and current evidence. Stop at R4P; no child Plan/Develop/implementation in this session.

Parent estimated effort becomes current child estimate sum plus explicit orchestration overhead; record actual current child IDs/values in the estimate evidence. Prepare parent plan-estimate, current story semantic/source binding, plan approval and decomposition gate from real accepted artifacts. Use ordinary one-edge Plan→Develop. Preserve all honest blockers; no fabricated approval, completed AC, outcomes, test evidence or lifecycle jump. The user's marching orders authorize this preparation and its ordinary approval boundaries; they do not authorize implementation or historical application.

Final handoff lists parent state, child IDs/ranks/dependencies/R4P status, accepted spec/plan hashes, SPR/XPR records, deep dive, forecast/estimation evidence, exact branch/commit, timing checkpoints and remaining implementation gates. Pause the timer and stop for the user's fresh implementation agent.
