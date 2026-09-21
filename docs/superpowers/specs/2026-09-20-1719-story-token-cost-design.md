<!-- @story #1719 -->

# Story-Level Agent and Automation Cost Accounting Design

## Status and authority

This specification defines a provider-aware accounting system for the agent and
automation cost of delivering one governed story through AI Task Manager
(AITM). It is the written design deliverable for issue #1719 and remains subject
to written-spec review.

The selected architecture is an event-keyed Agent Cost Ledger plus a separate
Subscription Capacity Ledger. The existing Timing Log remains the lifecycle
authority. Cost records add economic evidence without changing the meaning of
timing, word-count, approval, verification, or delivery records.

This document is design authority only. It does not authorize production
implementation, historical backfill, provider billing credentials, or live
billing-account access. Those actions require an approved implementation plan
and separately authorized execution.

## Problem statement

AITM can associate an issue with multiple agent sessions, record lifecycle and
interruption events, preserve transcript locations, and measure durable word
markers. It cannot currently answer how many provider tokens, metered tool
operations, or automation resources were consumed between those events, or
what that consumption cost.

Session totals are insufficient. A story can span sessions, providers,
worktrees, compactions, pauses, repeated lifecycle stages, independent review
sessions, and child-agent work. Provider billing systems also expose different
levels of detail: a local transcript may expose an exact per-response usage
counter, an administrative API may expose only a time bucket, and a provider
may expose an exact per-request billed amount. Treating these sources as
interchangeable would manufacture precision that does not exist.

The accounting system therefore needs to:

1. bind usage and cost evidence to stable AITM lifecycle events;
2. preserve cumulative source observations and derive reproducible interval
   deltas;
3. distinguish measured consumption, rate-card valuation, exact billed cost,
   and incomplete evidence;
4. include direct external tool and metered automation charges without double
   counting tokenized tool output;
5. aggregate one story across every legitimate contributing session; and
6. keep fixed subscription economics separate from story cost.

## Goals

- Record a stable cost event for every new Timing Log event after the feature
  is enabled.
- Measure cached input, uncached input, output, and provider-specific token
  extensions without forcing every provider into a lossy four-counter schema.
- Record directly metered MCP, provider-tool, CI, hosted-runtime, and similar
  automation charges as independently sourced lines.
- Preserve model, service tier, endpoint/region modifiers, currency, rate-card
  version, pricing effective date, and source provenance.
- Derive stage, delivery-to-trunk, post-trunk, and whole-story totals without
  allocating human labor or fixed subscription spend to a story.
- Remain truthful when evidence is missing, delayed, ambiguous, duplicated,
  reset, or received out of order.
- Support provider-specific exact billing where it exists and coarse billing
  reconciliation where it does not.
- Produce durable, GitHub-native evidence that remains understandable after
  local transcripts or provider dashboards disappear.

## Non-goals

- Human labor, reading time, approval time, and equivalent salary cost are not
  part of the Agent Cost Ledger.
- Fixed subscription spend is not allocated to issues, stages, agents, or
  tokens.
- Version one does not predict the cost of a story that has not started. It
  records a defensible delivered-story outcome that a future forecasting model
  may use.
- Version one does not rewrite existing Timing Log rows or automatically
  backfill historical issues.
- Version one does not infer a story share from a provider's aggregate invoice
  solely because the story overlaps the invoice time window.
- Version one does not estimate local laptop electricity, depreciation, or
  other compute that is not directly metered.
- The design does not replace the existing Estimate, timing, word-count, or
  value-report models.

## Existing AITM foundations

The design extends existing repository boundaries rather than inventing a
parallel task system:

- `scripts/task-tracker/runtime.mjs` owns the timing-event flush path and
  already captures one transcript observation at each flush.
- `scripts/task-tracker/gh-timing-comment.mjs` serializes Timing Log appends and
  maintains durable cumulative word markers.
- `scripts/task-tracker/word-counter.mjs` resolves the active provider session,
  transcript, and cursor without treating an unavailable Codex transcript as a
  successful zero.
- `scripts/providers/` describes agent-host transcript and hook capabilities for
  Claude, Codex, and Grok.
- `aitm-session-ref` markers form an append-only issue-to-provider-session
  chain.
- `scripts/task-tracker/lib/github-records/` provides canonical JSON,
  payload hashes, immutable record envelopes, secret rejection, comment
  correlation, and write/read-back verification.
- the local queue and issue-lock boundaries provide patterns for retryable
  delivery and serialized issue mutation.

The existing provider registry describes how AITM is hosted and where its
transcript lives. It is not a billing-provider registry. Claude Code can, for
example, be billed by Anthropic, Amazon Bedrock, Google Vertex AI, or a gateway.
The accounting design therefore introduces a separate usage-source adapter
boundary.

The existing unavailable-result discipline in `word-counter.mjs` is
Codex-specific: its Claude and Grok missing-transcript paths can return an
`ok` zero word count. This is not usage evidence. Each new usage-source adapter
owns source availability, schema recognition, cursor validity, and diagnostic
codes for its host; it must independently prove a measured zero. Reusing a
session/path resolver does not authorize trusting a counting helper's status
or using words as provider tokens. Existing word-count behavior stays unchanged.

## Accounting definitions

### Consumption

Consumption is the measured provider or automation quantity attributable to an
issue. Model consumption is stored in provider-native categories and normalized
into the following common views when the source supports them:

- `input.cached`
- `input.uncached`
- `input.cache_write`
- `output.visible`
- `output.reasoning`
- other provider-defined token categories
- request count
- directly metered tool units
- metered runtime units

The common view is additive only where the provider's contract says the
categories are disjoint. Native counters are always retained so a later reader
can reproduce or correct the normalization.

### Rate-card equivalent cost

Rate-card equivalent cost is a deterministic valuation of measured consumption
using an immutable rate-card snapshot. It answers what the recorded usage would
cost under the selected price schedule. It is an estimate even when every token
counter is exact.

The valuation records the rate-card identifier and hash, provider, product,
model, service tier, region/endpoint modifier, currency, effective interval,
unit rates, rounding rule, and formula version. Historical event values never
change when a public price page later changes.

### Actual billed cost

Actual billed cost is accepted only from evidence the billing source describes
as the charged amount and only when it can be correlated to the story without
time-window allocation. Exact per-request charges can qualify. Daily or monthly
aggregates do not qualify unless a dedicated project, key, or other exclusive
dimension makes the attribution unambiguous.

An aggregate invoice amount can still reconcile a set of cost records. The
unattributed residual remains visible; it is never distributed merely to make
the ledger balance.

### Known zero, unknown, and incomplete

`0` means a source was read successfully and proved that the applicable
quantity did not change. An absent source, unreadable transcript, unsupported
counter, unresolved session, lost request receipt, or ambiguous bill produces
an explicit `unknown` or `incomplete` field with a reason code. It never
produces zero.

### Story cost boundaries

The whole-story accounting window begins with the first successfully bound
event for the issue and ends with the issue's Done event.

Reports expose three boundaries:

1. **Delivery-to-trunk:** from the first bound event through the authoritative
   receipt that proves the story's delivered commit is on trunk.
2. **Post-trunk housekeeping:** costs after that receipt through Done,
   including closure, final reporting, cleanup, and related automation.
3. **Whole story:** delivery-to-trunk plus post-trunk housekeeping.

If no authoritative delivery receipt exists, the delivery split is incomplete;
the report may still show event and stage totals without inventing the trunk
boundary.

The boundary uses the verification instant carried by the accepted delivery
authority, not the receipt's later publication time. For legacy PR receipts this
is `verifiedAt`; evidence-v2 delivery records must expose an equivalent verified
instant and prove delivery to the configured trunk target. A delivery to an epic
branch is not delivery to trunk. No-commit issue deliverables have a
`not-applicable` trunk split; authorized local-trunk work without a durable
verification instant has an incomplete split. A child closed before its epic
reaches trunk retains its own Done cutoff; an epic report can classify the
child's earlier usage against the epic's verified trunk boundary without
extending the child's accounting window or copying its cost lines.

Delivery verification requests a source observation associated with that
boundary. Observation time remains distinct from the receipt instant. Only
source evidence that measures the cutoff, or individually timed usage that can
be partitioned at it, supports an exact split. A delayed observation spanning
the cutoff stays unsplit and the affected boundary views stay incomplete.
The same rule applies to opening, stage, pause/resume, and Done cutoffs.

## Authority model

### Timing Log

The Timing Log remains the authority for event order, stage visits, active/idle
durations, and lifecycle boundaries. Every newly emitted row receives a stable
opaque event identifier in a trailing marker:

```text
| ... existing cells ... | <!-- row-sec: a=60 i=0 --> <!-- aitm-cost-event id="01..." policy="01..." -->
```

The identifier is generated once in the durable capture intent and is reused by
the timing row, cost record, retry queue, and reconciliation records. It is not
derived from mutable display text or row position.

The enabled writer emits the existing `row-sec` marker first and the cost
marker second, both outside the final table pipe. The lexical leaf
`scripts/task-tracker/lib/timing-row-reader.mjs` must learn this composed suffix
before any writer emits it. `splitTimingRowMarker` separates the entire suffix
from the cells; its `marker` retains both comments and their bytes, and parsed
cost IDs are exposed separately. Existing `row-sec` extraction continues to
work on that suffix. Cell replacement and full-word-marker migration preserve
both comments verbatim. A malformed or duplicate cost marker cannot become a
table cell or erase valid timing seconds: timing parsing remains valid where
the original row is valid, but cost coverage reports a marker diagnostic.

The implementation plan must route marker parsing/preservation through that
lexical leaf in `timing-rollup.mjs`, `lib/timing-rows.mjs`,
`backfill-timing-logs.mjs`, `lib/heal-timing-sweep.mjs`,
`lib/timing-slug-rename.mjs`, and
`lib/agent-review/validators/timing-log-sequence.mjs`, all relative to
`scripts/task-tracker/`. Do not add competing marker grammars. Historical rows
with no cost marker keep their existing parsing and rewrite behavior; this
compatibility work does not authorize adding cost IDs to historical rows.

Existing rows without identifiers remain valid timing evidence and are outside
the prospective ledger unless an explicitly approved backfill later adds
separate reconstructed records.

### Agent Cost Ledger

The Agent Cost Ledger is a logical ledger of immutable AITM GitHub record
envelopes attached to the owning issue. Each event envelope retains the existing
canonical-record validation, payload hashing, secret rejection,
repository/issue correlation, and exact write read-back. Its comment transport
uses the isolated cost namespace below; the current generic comment-store
reader must not be reused unchanged for cost evidence.

A replaceable `Agent Cost Ledger` projection comment may render a compact table
for people. It is a read model, not authority. It can be regenerated from the
immutable event and reconciliation envelopes. A missing or stale projection
does not invalidate accepted records.

### Cost-record read isolation

The existing generic comment reader parses every comment claiming `aitm-record`
before consumers filter record types; one malformed claimant aborts the entire
read. Cost capture must not enlarge that lifecycle-gating failure domain.
Before enabling any cost writer, introduce a separate `aitm-cost-record`
comment transport for all cost event, reconciliation, capture-policy, and
subscription envelopes. This is an explicit transport extension, not a claim
that the current generic reader already provides isolation. The envelope
schema, canonicalization, hash, secret checks, correlation, provenance, and
write/read-back validation stay unchanged. A dedicated codec renders and
extracts the cost marker; only an allowlisted cost record type may use it.
Governance records must never be accepted through this tolerant namespace.

The cost marker starts the comment body and follows one canonical case and
whitespace grammar shared by its writer and parser. Its name cannot match the
existing generic `claimsAitmRecord` predicate. Shared lifecycle, workflow,
contract, and estimation readers retain their current fail-closed policy for
generic records and ignore cost-namespace comments before envelope parsing.
Do not globally catch record errors or trust a malformed payload's claimed
record type to exempt it from governance validation.

The cost reader enumerates correlated GitHub comment nodes without first
passing them through the generic record parser. It validates each cost
candidate independently. A malformed, noncanonical, oversized, secret-bearing,
or uncorrelated cost envelope contributes no quantity; a bounded diagnostic
records its opaque comment identity and reason without copying its body.
Other valid cost evidence remains readable. Missing or altered markers remain
detectable through keyed timing/policy coverage. An unparseable candidate with
unproven attribution prevents certifying the affected issue's cost coverage;
it cannot be silently discarded as irrelevant. A transport-wide enumeration
or provenance failure makes coverage unavailable, never complete.

No cost-system projection, diagnostic, visible envelope prose, or reconciliation
report posted to GitHub may contain text matching the generic record-claim
predicate or a raw cost marker outside a valid cost envelope. Use bounded IDs
and reason codes instead of quoting envelopes. Test the rendered comment,
including escaped JSON, against that constraint before publication. Do not
change the existing governance marker grammar or weaken fail-closed lifecycle
behavior as part of this work. Arbitrary external edits that turn a comment
into a generic governance-record claimant retain that existing failure policy;
the isolation promise covers cost-namespace corruption and cost-generated
output, not deliberate relabeling into governance authority.

### Local capture outbox

Before any remote append, AITM writes a machine-local capture intent containing
the event identifier, issue, timing descriptor, expected sources, source cursor
references, and operation status. It then atomically freezes the observations,
their actual observation times, predecessor identifiers, normalized payload,
payload hash, and intended remote record identity before publishing them.
The frozen identity includes the complete envelope (`recordId`, `createdAt`,
`authority.grantId`, `authority.epoch`, `authority.actor`, links, and payload),
the visible prose, transport marker version, and exact rendered body. Retries
replay those bytes, not a new envelope generated from an identical payload.
The envelope authority epoch is separate from the source's measurement epoch.
The outbox is atomic and idempotent. It stores no credentials or
prompt/tool-result content.

The outbox bridges partial completion among timing-row append, event-record
append, and projection refresh. A successfully read-back event record is the
only condition that marks its item delivered.

Durable observation acceptance and remote delivery are separate commit points.
Freezing an available observation and advancing its local source cursor is one
atomic operation, serialized per source epoch. A later capture uses that frozen
predecessor even while it is queued for publication. The remote read-back marks
delivery only; it never advances or rewinds the measurement cursor. An
unavailable observation does not advance that cursor.

On another machine or after local state loss, a source chain may resume only
from a verified predecessor with proven continuity. Competing or missing
predecessors make the affected view incomplete until reconciled; neither
arrival order nor a fresh local baseline may silently erase the gap.

### Subscription Capacity Ledger

The Subscription Capacity Ledger is repository-level authority stored in a
separately configured GitHub issue using immutable AITM records. It contains
plan and billing-period facts, not story allocations. Story reports may link to
the relevant comparison period but never copy fixed subscription spend into
their totals.

## Agent cost event schema

Each immutable event record has an `aitm.agent-cost-event/v1` payload. Exact
field names may be refined during implementation planning, but the following
semantics are required.

### Secret-policy-compatible representation

The existing record secret policy rejects provider-native token counter names
when used as object keys. Preserve supported native names as values in a
bounded array, for example:

```json
{
  "nativeCounters": [
    { "category": "input_tokens", "value": 1234 },
    { "category": "cache_read_input_tokens", "value": 800 }
  ],
  "sourceLocator": "receipt:example"
}
```

Use safe semantic keys such as `nativeCounters`, `category`, `value`, and
`sourceLocator`, not native dictionary keys or `sourcePath`/`transcriptPath`.
The policy also rejects key fragments such as `auth` and `pat`; adapter
capability declarations need safe keys too. Keep credential setup requirements
in local adapter configuration. Publish only a bounded non-secret capability
projection with safe keys (for example, `accessMode`), never a verbatim adapter
configuration object.
All event, reconciliation, capture-policy, and subscription payloads must pass
the existing `assertNoSecretRecordData` and credential-value checks unmodified.
This design adds no safe-key exception and does not weaken secret detection.
Adapters map only explicitly supported schema categories, never arbitrary
provider-response keys or strings, into durable evidence. A rejected native
name (including a singular credential-shaped name such as `input_token`) is an
unsupported source schema: publish a bounded incomplete observation with an
adapter diagnostic and no offending value. Do not escape, encode, or rename a
rejected value to evade scanning, silently drop its measured quantity, or label
the observation complete. Native counters are retained losslessly only for
accepted supported observations; unsupported evidence stays unavailable until
an explicitly reviewed adapter/schema change can represent it safely.

Payloads must fit the existing 256 KiB record-JSON ceiling and the smaller of
the record layer's 1 MiB comment ceiling and the transport's accepted size.
Adapters declare bounded category/line counts. Before publication, enforce the
record-JSON bound on the complete canonical, HTML-comment-escaped envelope and
the comment/transport bound on the final rendered body, including marker and
visible prose. Raw payload size is not sufficient: escaping can expand bytes.
Oversized evidence yields a small incomplete
observation with a size diagnostic, not silently truncated counters or an
endlessly retried oversized envelope. Diagnostic codes use the stable
`<source>-<condition>` convention, for example `claude-transcript-unresolved`.

### Event identity

| Field              | Meaning                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| `eventId`          | Stable identifier shared with the Timing Log row                          |
| `issue`            | Owning GitHub issue number                                                |
| `timingEvent`      | Canonical timing event slug                                               |
| `timingRecordedAt` | Instant recorded by the Timing Log                                        |
| `stage`            | Lifecycle stage that owned the interval                                   |
| `stageVisit`       | Monotonic visit number for repeated stages                                |
| `eventRole`        | Lifecycle cutoff: `opening`, `ordinary`, `delivery-cutoff`, or `terminal` |
| `operationId`      | Idempotency/correlation identifier for the whole capture attempt          |

An interval wholly within one stage visit is charged to that stage. A
`develop:completed` event therefore closes a Develop interval; it does not
charge that interval to Test. The first source observation is a baseline with
no delta. If it occurs after the accounting window opens, the unobserved opening
span is a coverage gap, not evidence of zero or excluded pre-story consumption.

Cutoff role, observation kind, and delivery classification are independent.
Each source contribution carries `observationKind`: `baseline`, `interval`,
or `unavailable`. Each contributing span carries `deliveryWindow`:
`delivery`, `post-trunk`, `unknown`, or `not-applicable`. Here `delivery` means
the delivery-to-trunk window, not a lifecycle event. Classify by measured span
and accepted boundary evidence, never by the event's role alone. A terminal
event can contain a post-trunk interval and a newly opened source baseline;
both preserve their own observation kind, while the terminal role still anchors
the Done coverage check. Unsupported splits are `unknown`, and no-commit
deliverables have `not-applicable` delivery classification.

### Source identity

| Field             | Meaning                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `sourceId`        | Stable AITM identifier for a provider or automation meter                                      |
| `sourceKind`      | Transcript, response receipt, admin usage API, billing API, tool receipt, CI, or runtime meter |
| `agentProvider`   | AITM host such as `codex`, `claude`, or `grok`                                                 |
| `billingProvider` | Economic authority such as OpenAI, Anthropic, xAI, AWS, Google, or a gateway                   |
| `accountRef`      | Non-secret, redacted or hashed account/project/key reference                                   |
| `sessionRef`      | Reference to the existing issue session chain or an external review/automation run             |
| `model`           | Provider model identifier when applicable                                                      |
| `serviceTier`     | Batch, standard, priority, regional, or provider-native tier                                   |
| `epoch`           | Counter epoch; increments when a cumulative source resets or changes identity                  |

Agent and billing provider are deliberately separate. A change in model,
service tier, billing account, or cumulative-counter identity starts a new
source epoch unless the adapter proves continuity.

### Observation and delta

Every cumulative source contribution retains:

- the cumulative native snapshot;
- the prior durably frozen snapshot identifier, including a queued predecessor;
- a derived native delta;
- normalized common quantities;
- observation time and applicable provider time bucket;
- source locator or response identifier;
- evidence classification and diagnostic reason;
- a hash of the normalized source evidence when retained locally; and
- whether the source record is exact, aggregate, estimated, or unavailable.

Per-response adapters retain unique receipt identities and occurrence bounds
instead of manufacturing native cumulative counters. Their normalized running
sum uses deduplicated receipts, a durable cursor, and the same frozen-observation
and coverage rules. Aggregate adapters preserve the original bucket and grouping
dimensions; they cannot manufacture request or boundary resolution.

The delta formula is:

```text
delta(source, epoch, category) =
  current cumulative value - prior durably frozen cumulative value
```

The subtraction is valid only within one source epoch and for counters the
adapter declares cumulative and monotonic. A negative result never becomes a
negative cost. It opens a new epoch or produces an incomplete record requiring
reconciliation.

Each derived delta is a span identified by its starting and ending observation
IDs, source epoch, measured time bounds, and known ownership and lifecycle
boundaries. A span crossing an unmeasured stage, pause, issue, or delivery
boundary is not assigned wholesale to its ending event. It may contribute to
an issue total only when ownership of the entire span is proven; unsupported
stage or delivery splits remain unresolved. A pause-crossing span cannot be
charged as active model work without evidence separating paused consumption.
Wall-clock proration is never a substitute for that evidence.

Reconciliation that inserts an observation replaces every affected derived
span together in one validated projection revision. For observations 100,
missing, and 180, the unsplit quantity is 80; a later valid intermediate 150
replaces it with 50 and 30, never 80 plus 50. The reconciliation payload names
the complete replacement set and its input hashes, using existing envelope
`predecessor`/`supersedes` links for revision lineage. Missing inputs, competing
revisions, cycles, or invalid conservation of measured quantities prevent that
revision from contributing; affected totals remain incomplete. Corrections to
erroneous source quantities must explicitly identify the corrected evidence
and explain any change in quantity instead of claiming a conserving split.

The complete many-to-many replacement set is an array in the reconciliation
payload, not the envelope's link fields. The existing scalar `supersedes`
identifies only the prior reconciliation revision in that lineage, or is null
for its first revision. `predecessor` retains the enclosing record chain.
Projection validation traverses the payload's span references and input hashes
as well as the scalar revision links. One envelope carries the whole atomic
replacement; do not emit one independent revision per replaced span or widen
the shared envelope link schema.

### Cost lines

Each event can contain multiple cost lines. A line records:

- category and provider-native subcategory;
- quantity, unit, and native precision;
- normalized monetary amount as an exact decimal string or integer minor unit;
- currency;
- valuation kind: `rate-card-estimated` or `actual-billed`;
- rate-card identifier/hash and pricing effective instant when estimated;
- source record identifier when billed;
- `includes` relationships describing costs already included in another line;
- owning issue and optional child/review/automation run identifier; and
- evidence status plus any incompleteness reason.

Binary floating-point values are not monetary authority. Provider-native exact
integers, such as cost ticks, are retained before conversion.

The `includes` relationship prevents double counting. If a provider's exact
request charge already includes token and hosted-tool charges, that actual-cost
line can include those component lines. The components remain visible, but the
report does not add them again to the actual billed subtotal.

### Economic identity and overlapping evidence

Observation identity is distinct from economic identity. Each contributing
quantity identifies the provider/account meter, request or run where available,
native category, and covered interval or cumulative range. Adapters declare
when transcript, response-receipt, and administrative observations cover the
same usage. Different observation IDs do not prove different consumption.

Within each consumption or valuation view, proven identical usage contributes
once. Exact per-request evidence takes precedence over an equivalent aggregate
measurement; equally precise agreeing evidence uses a stable source-ID tie
break and retains the other evidence as corroboration. Conflicting evidence at
equal precision is unresolved. An aggregate remainder contributes only when
its disjoint coverage can be established; uncertain overlap is excluded from
the additive subtotal and disclosed as incomplete. Actual billed and estimated
equivalent views are never added to one another.

The `includes` graph must be acyclic, refer to present evidence, and establish
the covered components. Each component contributes at most once within a view;
ambiguous or conflicting inclusion relationships make that view incomplete.
Exclusive aggregate billing can establish actual cost only for the ownership,
period, currency, and boundary dimensions its evidence supports. A whole-story
bill does not establish stage or delivery/post-trunk actual amounts without
finer correlation.

### Currency

Version one aggregates monetary values separately by currency. It performs no
foreign-exchange conversion and never produces a scalar that adds unlike
currencies. Every stage, story, epic, headline, and subscription comparison
preserves the currency dimension. A comparison requiring incompatible
currencies is unavailable; display the original amounts separately.

## Capture transaction

The timing path performs the following prospective sequence for every event:

1. Resolve the active issue and the stage/visit owning the interval.
2. Generate one `eventId` and `operationId`.
3. Persist the local capture intent before remote writes.
4. Ask every applicable usage-source adapter for a bounded-time observation or
   explicit unavailable result. Retain cumulative snapshots or stable
   per-response identities according to the adapter's declared semantics.
5. Normalize observations, derive spans against the last durably frozen cursor,
   and atomically freeze the observation, predecessor, and intended payload
   with the cursor update. Source serialization covers predecessor selection
   through this commit point, not just the final write.
6. Append and read back the Timing Log row carrying `eventId` through the
   existing timing lock.
7. Append and read back the immutable Agent Cost Ledger event record through
   the caller's issue-mutation authority. Components must not recursively
   reacquire a lock already held by the lifecycle operation.
8. Best-effort refresh the human-readable projection.
9. Mark the outbox item delivered only after authoritative record read-back.

The timing or lifecycle action does not fail solely because usage measurement,
valuation, billing lookup, ledger append, or projection refresh failed. The
event must instead retain an incomplete capture intent or record that can be
retried. Existing lifecycle gates remain authoritative and cannot be bypassed
in the name of cost capture.

Retries replay the frozen identifiers and payload without resampling. An
uncertain remote write is resolved by exact read-back before repeating it.
An exact duplicate is an idempotent success. A conflicting payload for an existing event/source identity fails
closed, preserves both observable hashes in diagnostics, and requires an
append-only reconciliation record.

If a crash occurs after intent creation but before observation freezing, a
later sample retains its actual time and is new reconciliation evidence; it
cannot masquerade as the missed historical snapshot. If remote lifecycle or
timing acceptance failed, the frozen observation remains evidence of source
consumption but cannot invent an accepted lifecycle transition. Recovery binds
it to verified timing authority or leaves the attribution unresolved. If the
outbox itself cannot be persisted, the lifecycle action still follows its
existing rules; a missing cost envelope is exposed by the independent coverage
inventory described below.

## Usage-source adapter boundary

Usage-source adapters are separate from `scripts/providers/`. They describe
economic evidence, not UI hosting. An adapter declares:

- supported source kinds and authentication requirements;
- native counters and whether they are cumulative, per-response, or aggregate;
- cursor and epoch semantics;
- supported time resolution and grouping dimensions;
- model, tier, region, and tool metadata;
- exact billed-cost semantics and included components;
- rate-card normalization support;
- source latency and expected reconciliation delay; and
- deterministic diagnostic codes for unavailable or ambiguous evidence.

Adapters return normalized observations. They do not write GitHub, update task
state, select ownership, or silently price unsupported fields.

### Local transcript or response-receipt sources

When local provider records expose exact response usage, the adapter captures
that usage without calling an administrative billing API. For Codex rollout
logs, cumulative token observations include input, cached input, cache-write
input when present, output, and reasoning output. Tool calls and results in the
transcript remain provenance; provider token counters, not a text tokenizer,
determine billed model input.

If exact usage is unavailable, a tokenizer-derived quantity may be stored only
as `estimated-consumption` with tokenizer, encoding, and version provenance. It
must not be labeled measured provider usage.

### Administrative usage sources

Administrative usage APIs can provide useful independent totals, but their
grouping and bucket width determine attribution quality. OpenAI completion
usage, for example, can be grouped by project, user, API key, model, batch, and
service tier at minute/hour/day widths, while its costs endpoint is daily and
uses coarser economic dimensions. Anthropic similarly exposes usage and cost
reports with provider-defined buckets and grouping fields.

These records can reconcile story events when an exclusive correlation
dimension exists, but only at the dimensions their evidence supports. They
follow the economic-overlap rules and never become a second additive copy of
locally measured usage. Otherwise they remain aggregate comparison evidence
with an unattributed residual.

### Exact per-request billing sources

An exact provider-reported request charge can be stored as actual billed cost
when its request identity is durably correlated to the contributing session or
automation run. For example, xAI documents a per-request
`cost_in_usd_ticks` value that already includes token and server-side tool
charges. The adapter preserves its integer ticks and declares those included
components so reporting cannot count them twice.

### External tools and automation

Direct tool cost is recorded only from a provider receipt, authoritative meter,
or configured unit rate backed by measured units. Examples include paid MCP
operations, hosted search, code execution, CI minutes, and cloud runtime.

Shell output or MCP output sent back into a stateless model is not separately
token-estimated when provider token usage is available. It contributes to the
provider's cached or uncached input measurement. A direct charge for invoking
the same tool is a distinct economic event and is retained as its own line.

Local shell execution without a meter may record a successful operation count for
explanation, but its monetary amount remains unknown or not applicable.

## Cross-session and multi-agent attribution

### Session changes and compaction

Each `aitm-session-ref` entry identifies a source epoch candidate. A new session
begins with a baseline snapshot; its pre-baseline cumulative usage is not
charged to the issue without independently correlated in-window evidence. An
unobserved in-window prefix remains an explicit coverage gap. A per-request
adapter may reconstruct it from unique request receipts and a proven opening
cursor; it must not assume the first observed counter started at zero.
Context compaction inside a session does not reset
cumulative accounting unless the provider counter actually resets. A reset
creates a new epoch and preserves both sides of the discontinuity.

### Pause and resume

Pause closes the current interval at its departure event. Resume begins a new
interval. Model usage observed after pause but before resume is not silently
assigned to agent work. A separately correlated asynchronous automation run can
still be charged to the stage and issue that launched it, using its own run
identity and occurrence time.

### Lifecycle rework

Repeated Develop, Test, and Review visits retain distinct `stageVisit` values.
Stage totals sum every visit; reports can also show each visit independently so
rework cost remains visible.

### Sub-agents, child issues, and orchestrators

Every cost line has exactly one owning issue.

- A child agent bound to a child issue owns its cost on that child.
- Parent orchestration work owns its cost on the parent.
- An explicitly recorded dispatch may assign an otherwise unbound sub-agent
  run to the dispatching issue.
- A shared or uncorrelated session is not divided by wall-clock overlap.

Epic reporting rolls up child records by immutable record identity and excludes
parent lines that merely summarize child amounts.

### External peer review

External review protocols supply issue, run, provider, and session/request
correlation explicitly. A review cost is not inferred only because its
timestamp falls inside the story window. Review lines remain distinguishable
from implementation lines while contributing to the delivery-to-trunk or
post-trunk boundary where they occurred.

## Aggregation and reporting

The initial read surface is:

```text
npx aitm cost #N
npx aitm cost #N --json
```

It is read-only by default and computes from accepted ledger records without
calling provider APIs. It also reads authoritative GitHub timing, policy,
session/run, and delivery evidence to establish coverage. A separately
authorized reconciliation command may fetch new billing evidence and append
reconciliation records.

### Coverage inventory

Completeness is measured against expected evidence, not just the records that
happen to exist. The report reconciles every keyed Timing Log event with its
cost envelope, observation dependencies, and unresolved correction state. It
also includes delivery cutoffs and explicitly correlated asynchronous or review
runs even when they do not create their own Timing Log rows.

A durable, immutable capture-policy record identifies the enablement boundary,
expected source-selection rules, configured adapters, and their versioned
capabilities without credentials. Each keyed timing event references its policy
identity; its cost envelope records the resolved sources and applicable
session/dispatch/run references. Policy changes are append-only with an
effective boundary. Missing policy, envelope, source roster, dependency, or run
completion evidence means coverage is unverified for the affected view, even if
all present observations are complete. A source can be not applicable only with
an explicit policy/capability or ownership reason, not simply because it failed
to produce an observation. Sources required by the selected cost view but
unsupported by an adapter remain unavailable, not excluded from completeness.

Failure to publish the policy or cost envelope must not block lifecycle work:
timing markers still reference the intended identities, exposing the missing
records. If timing evidence itself is unavailable, the report cannot certify
coverage. Enablement partway through a story, a missing initial baseline,
unobserved reset, or an unproven Done cutoff leaves the whole-story view
incomplete; a complete covered subwindow may be labeled separately. Existing
unkeyed rows remain outside prospective capture but remain visible as uncovered
story history.

Completeness is specific to each quantity, currency, stage, boundary, and
valuation view. Resolved issue ownership can support a whole-story quantity
without proving stage attribution. A complete rate-card view does not imply
complete actual billing. Source lateness is recorded: Done ends the occurrence
window, not the opportunity to append evidence for consumption inside it.
Terminal coverage requires a source cursor/watermark or closed-run evidence
that covers the cutoff; simply reaching Done or waiting a timeout is not proof.
Later in-window usage or billing evidence is reconciled without reopening or
extending the lifecycle window. Consumption after Done is outside that story's
window and must not be silently backdated.

### Report views

The report includes:

- coverage and incompleteness summary;
- consumption by provider, model, service tier, source, and native category;
- cached input, uncached input, output, and tool/runtime common views;
- rate-card equivalent cost;
- actual billed cost where exactly attributable;
- unattributed reconciliation residuals;
- totals by stage and stage visit;
- delivery-to-trunk subtotal;
- post-trunk housekeeping subtotal;
- whole-story total; and
- owning-issue-safe epic rollups.

Every monetary view carries a status:

- `complete`: all required contributors for that view have accepted evidence;
- `partial`: a known subtotal exists but one or more contributors are unknown;
- `unavailable`: no defensible monetary amount exists; or
- `not-applicable`: the source does not incur that category.

The display never turns `partial` into a bare total. It renders the known amount
and missing categories together. Actual billed and rate-card equivalent amounts
remain side by side. The headline prefers actual billed cost only when the
actual view is complete for the requested boundary; otherwise it presents the
rate-card equivalent as an estimate and labels actual billing incomplete.
If the estimated view is itself partial or unavailable, the headline preserves
that status; it cannot upgrade a known subtotal to a complete estimate. All
amounts and statuses are displayed per currency.

## Subscription Capacity Ledger

The separate subscription ledger records one immutable plan-period envelope
per provider/account/plan. It contains:

- provider, account reference, plan name, and billing period;
- fixed spend and currency;
- purchased seats, credits, tokens, requests, or other provider-native
  capacity where contractually defined;
- included and overage rules;
- attributable consumption imported from Agent Cost Ledger records;
- unattributed provider usage and reconciliation residuals;
- utilization, remaining capacity, exhaustion/overage, and coverage status;
- hypothetical pay-as-you-go equivalent using an identified rate card; and
- evidence source and reconciliation instant.

Capacity is never fabricated for plans that expose only a soft or unpublished
limit. Such plans can report observed consumption, fixed spend, trend, and
coverage, but their utilization percentage remains unavailable.

Subscription reporting answers whether purchased capacity is being used,
wasted, or exhausted. It does not change any story total and does not call
included usage a new invoice charge.

## Configuration

Cost accounting is opt-in and fail-closed. Configuration separates tracked
policy that contains no secrets from machine-local credentials:

- feature enablement and capture mode;
- enabled usage-source adapters;
- tracked rate-card catalog and accepted currencies;
- configured Subscription Capacity Ledger issue;
- provider project/account references using non-secret identifiers;
- capture timeouts and reconciliation delay; and
- projection/reporting preferences.

API keys, admin keys, bearer tokens, invoice credentials, and raw provider
responses containing secrets never enter tracked configuration, issue bodies,
or GitHub records. Live billing access remains disabled until separately
authorized.

## Failure and reconciliation semantics

### Source unavailable

Append an incomplete event record when possible, with a stable diagnostic code,
the attempted source, and the last durably frozen cursor. Do not advance the source
cursor and do not emit zero.

### Ledger write unavailable

Retain the capture intent in the outbox and retry on later timing verbs, an
explicit update, or reconciliation, replaying frozen bytes and checking timing
and ledger read-back independently. The Timing Log event remains valid and is
not appended again when already present. Pending predecessor dependencies keep
the affected remote view incomplete until the chain is available.

### Duplicate event

An existing event/source record with the intended record identity and exact
frozen body is an idempotent success. An equal payload hash alone cannot prove
write completion. Different envelope identity or body requires reconciliation
even when payloads agree; a payload hash conflict is likewise a hard
reconciliation condition. Neither record is overwritten.

### Ledger read unavailable or corrupt

Apply the cost-record read isolation contract above. Reject invalid cost
envelopes individually, retain valid evidence as a known subtotal, and mark
coverage incomplete. Never count malformed data as zero or as accepted
authority. A failed enumeration yields unavailable coverage. Cost corruption
must not abort lifecycle, workflow-preflight, or estimation reads; malformed
generic governance records retain their existing fail-closed behavior.

### Out-of-order observation

Store the observation but do not derive a delta across an unknown predecessor.
A later reconciliation record can link the correct predecessor and atomically
replace the affected derived spans under the conservation and conflict rules
above. Publication order never determines measurement order.

### Counter reset or source switch

Open a new epoch with a baseline. Never subtract across epochs or discard the
prior epoch. Any unobserved tail of the old epoch or prefix of the new one is a
coverage gap unless independently correlated receipts recover it.

### Pricing change

Use the rate card effective at the consumption event or at the provider's
declared billing interval. If no unambiguous rate applies, preserve measured
consumption with incomplete valuation.

### Late invoice evidence

Append an `aitm.agent-cost-reconciliation/v1` record referencing the event or
record set it evaluates. It can confirm exact billed cost, record an aggregate
residual, or supersede an erroneous valuation. It cannot mutate original
evidence.

### Local evidence loss

GitHub retains normalized counters, amounts, hashes, and source provenance.
Loss of a transcript or cached provider response prevents re-extraction but does
not erase an already accepted record. Reports disclose that raw evidence is no
longer locally available when checked.

## Privacy and security

- Store no prompts, assistant prose, shell output, MCP payloads, repository
  contents, or reasoning text in cost records.
- Store no credentials or secret-bearing provider responses.
- Reuse the GitHub-record secret policy and canonical payload hashing.
- Store provider request/session identifiers only when required for durable
  correlation; redact or hash account and API-key identifiers.
- Do not put billing keys in project configuration, command arguments, logs, or
  issue comments.
- Administrative adapters are read-only and disabled by default.
- The reporting path performs no network mutation.
- Tool cost receipts identify the tool and billable unit without preserving
  sensitive request or result bodies.

## Migration and rollout

Implementation proceeds prospectively behind an opt-in flag:

1. Add schemas, pure delta/valuation functions, event identifiers, and a
   no-network fixture adapter.
2. Add the durable outbox and immutable ledger records while leaving the
   readable projection optional.
3. Add local transcript/response-receipt adapters for supported agent hosts.
4. Add read-only story reporting and boundary aggregation.
5. Add the separate Subscription Capacity Ledger and utilization reporting.
6. Add administrative usage/billing reconciliation adapters only after a
   separate approval for live credentialed integration.

Feature-disabled behavior remains byte-compatible: Timing Log rows, issue
records, CLI output, and lifecycle gates do not change. Enabling the feature
affects new events only. Existing rows remain unkeyed and are reported as
outside coverage rather than silently reconstructed.

Historical backfill is a separately designed operation. It must distinguish
reconstructed evidence from live-captured evidence, preserve original timing
records, and require an explicit issue scope and approval.

## Verification strategy

### Pure unit tests

- exact event/source/schema validation;
- cumulative delta math and first-snapshot baselines;
- cached/uncached/cache-write/output normalization;
- integer and decimal monetary precision;
- rate-card effective-date and tier selection;
- included-cost/double-count prevention;
- source reset and epoch handling;
- duplicate and out-of-order observations;
- complete/partial/unavailable aggregation; and
- subscription utilization without story allocation.

### Provider fixture tests

- Codex cumulative token-count records, including cached input and reasoning;
- Claude usage/cache categories and aggregate report buckets;
- Grok/xAI per-request token and exact-cost records;
- missing, malformed, delayed, or schema-changed telemetry;
- provider-native tools whose charges are inclusive or additional; and
- billing provider distinct from agent host.

Provider fixture tests use sanitized checked-in records and make no live API
calls.

### Integration tests

- Timing Log event ID and ledger record correlation;
- timing success plus ledger failure and retry;
- ledger success plus projection failure and rebuild;
- exact duplicate retry and conflicting-payload refusal;
- issue-lock/timing-lock ordering without deadlock;
- session and worktree changes;
- compaction without false reset;
- pause/resume with asynchronous automation;
- repeated Develop/Test/Review visits;
- independent peer-review and sub-agent sessions;
- delivery-to-trunk and post-trunk split; and
- child/epic rollups without duplicated records.

### Security and compatibility tests

- realistic supported multi-provider event, reconciliation, capture-policy,
  and subscription payloads pass the unchanged record secret policy;
- rejected native names and injected credential keys/values fail safely,
  without encoding-based bypass or a false complete observation;
- serialized record/transport size bounds produce an incomplete diagnostic;
- isolated cost-marker codec round-trips preserve all existing envelope
  validation and cannot admit a governance record type;
- malformed cost envelopes degrade cost coverage without poisoning shared
  lifecycle/workflow/estimation readers;
- rendered cost comments never claim the generic record namespace;
- credential and prompt-content rejection;
- redaction of account/key references;
- feature-disabled byte compatibility;
- no lifecycle failure caused solely by telemetry failure;
- no historical row rewrite on enablement; and
- no network call from the default report path.

### End-to-end acceptance scenario

A simulated story crosses two sessions and two stage visits, pauses once,
dispatches one child agent, uses one directly billed external tool, receives an
external review, reaches verified trunk, performs post-trunk cleanup, and then
closes. One provider observation is temporarily unavailable and later
reconciled. The final report must:

- retain every event and source epoch;
- show the missing interval as incomplete before reconciliation;
- become complete only after valid evidence arrives;
- distinguish estimated equivalent and actual billed cost;
- count tool-result model input and direct tool billing as separate components;
- avoid double counting an inclusive provider request charge;
- separate delivery and housekeeping subtotals;
- preserve one owning issue per child or parent line; and
- leave subscription spend outside the whole-story total.

### Accounting failure acceptance cases

The implementation plan must preserve these concrete invariants:

1. For cumulative observations 100 / missing / 180 across Develop and Test,
   report an unresolved split of 80. A later valid intermediate 150 replaces
   that span with 50 and 30. Missing pause/resume or delivery-cutoff snapshots
   cannot silently allocate the entire span to the final stage or boundary.
2. From baseline 100, freeze E1=130, fail its publication, then freeze E2=160.
   Retry after the live meter advances. Only the frozen 30 + 30 contributes;
   E2 remains dependent on E1, and restart or read-back ambiguity never
   resamples E1 or creates a duplicate timing row.
3. Recover after a crash before observation freezing, a missing opening
   baseline, or a source reset. Later observations retain their actual time;
   lost in-window coverage remains explicit until independent evidence fills it.
4. Observe one request through transcript, receipt, and an exclusive aggregate
   bill. Consumption and each valuation view count it once. A whole-story bill
   alone cannot create stage or delivery-split actual amounts. Conflicting or
   partially overlapping evidence remains non-additive and incomplete.
5. Combine USD 1 and EUR 1. Render distinct currency totals, never 2 in an
   unstated currency; incompatible subscription comparisons are unavailable.
6. From a second checkout, report ten keyed timing events with only eight
   cost envelopes. Identify missing event coverage and prohibit a complete
   whole-story total, including when the originating outbox has been lost.
7. Reconcile competing correction revisions and missing dependencies without
   mixing original and replacement spans. Include delayed in-window evidence
   after Done, but exclude later consumption and require terminal coverage proof.
8. Round-trip both historical seven-column and current eight-column timing rows
   through `splitTimingRowMarker`, `parseTimingRow`,
   `ensureTimingRowFullMarkerCell`, and `replaceTimingRowCells`. Enabled rows
   retain the composed suffix byte-for-byte, correct cell counts and
   `fullWordMarker`, and unchanged `readEstimationStageTiming` seconds. Exercise
   healing, slug rename, rollup, and review validation; malformed/duplicate cost
   markers flag coverage without damaging valid timing evidence. Disabled rows
   and historical rows without cost markers retain existing behavior.
9. For every supported host (Codex, Claude, and Grok), a missing, unreadable,
   or unrecognized transcript produces unavailable usage with a stable reason,
   even when a reused word helper returns an `ok` zero. A genuine measured zero
   requires a successful recognized usage read and valid comparable cursors.
10. At a post-trunk Done event, retain terminal cutoff role and each source's
    independent baseline/interval/unavailable kind and delivery classification.
    Neither terminal coverage nor the housekeeping subtotal may lose evidence.
11. Validate a many-to-many span replacement in one reconciliation payload while
    the envelope's `supersedes` remains one prior revision ID or null. Exercise
    payload-reference cycle checks and reject partial application.
12. Put valid governance records, valid cost envelopes, and one malformed
    cost-namespace envelope on an issue. `resolveLifecycleGateEvidence`,
    workflow-preflight's record read, and estimation forecast/outcome reads
    produce the same governance results as without the cost comments.
    `npx aitm cost #N` returns the valid known subtotal and an incomplete
    coverage diagnostic for the corrupt comment. Repeat for noncanonical,
    oversized, missing-marker, and quoted-marker cost evidence. Separately
    verify that malformed generic governance claimants still fail closed and
    that cost-generated diagnostics/projections cannot emit either raw marker.
13. Retry a frozen record after advancing the clock and local authority defaults.
    Reuse the exact envelope identity and rendered body; an equal payload in
    a newly generated envelope is not an exact read-back success. Exercise
    rendered escaped-envelope limits, not only raw payload length.

## Acceptance-criteria traceability

| Issue #1719 acceptance criterion                                                                                                               | Design coverage                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Event snapshots, deltas, stages, sessions, pricing, reconciliation, failures, and story total                                                  | Accounting definitions through Aggregation and reporting                                     |
| Pause/resume, session changes, compaction, rework, parallel work, peer review, missing/duplicate/out-of-order evidence, price changes, history | Capture transaction; Cross-session and multi-agent attribution; Failure semantics; Migration |
| Test-driven implementation plan with files, migration, commands, and safeguards                                                                | Required next artifact after written-spec approval                                           |
| Separate measured, estimated, billed, human, and subscription economics                                                                        | Accounting definitions; Subscription Capacity Ledger; Non-goals                              |

## Alternatives considered

### Embed cost columns in the Timing Log

Rejected. Multiple source epochs, models, tool charges, currencies, billed-cost
reconciliation, and incomplete evidence cannot remain readable or append-only
inside one Markdown row.

### Allocate provider invoices after the fact

Rejected as story authority. Time-bucket allocation cannot defensibly separate
paused stories, shared sessions, parallel agents, or unrelated work on the same
provider account. Aggregate invoices remain reconciliation evidence.

### Event-keyed Agent Cost Ledger plus Subscription Capacity Ledger

Selected. It preserves the existing lifecycle authority, supports exact and
coarse provider evidence, keeps corrections append-only, and separates story
economics from subscription-utilization economics.

## Authoritative external references

- [OpenAI organization completion usage](https://developers.openai.com/api/reference/python/resources/admin/subresources/organization/subresources/usage/methods/completions)
- [OpenAI organization costs](https://developers.openai.com/api/reference/python/resources/admin/subresources/organization/subresources/usage/methods/costs)
- [Anthropic Messages usage report](https://platform.claude.com/docs/en/api/beta/organization/usage_report/retrieve_messages)
- [Anthropic cost report](https://platform.claude.com/docs/en/api/beta/organization/cost_report/retrieve)
- [xAI per-request cost tracking](https://docs.x.ai/developers/cost-tracking)
