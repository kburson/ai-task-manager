<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-bd4fbcca64d8f812251c3846d92bb100"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-20-1719-story-token-cost-design.md"
artifact_commit: "340e63d54b849978869a9e4c0543f984a83bcf72"
artifact_blob: "f96da64a3a150b2b20c5c53059fab821896e2164"
artifact_digest: "sha256:a295ddeec226a0ddab22c029659ca3d3d26d69ba35cbef8564b50bdacac1d58e"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:7e04f00d6bcf56c2ebb8fd2043e9bdeca30a4bcb7a9756cbb904f522fa2c0be1"
  identity_source: "declared"
started_at: "2026-09-21T04:37:48.390Z"
submitted_at: "2026-09-21T04:44:36.806Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The accounting model in this specification is sound. Its core distinctions —
measured consumption versus rate-card valuation versus actual billed cost,
known zero versus unknown, cumulative snapshot versus derived span, observation
acceptance versus remote publication, and economic identity versus observation
identity — are correctly separated and consistently applied. The refusal to
prorate by wall clock, the refusal to allocate aggregate invoices by time
window, the per-currency aggregation without FX, the append-only reconciliation
model, and the expected-coverage inventory are all defensible and are the right
choices for this problem. The alternatives-considered section rejects the two
tempting shortcuts for the right reasons. I have no objection to the selected
architecture.

My review is therefore not an accounting-semantics review; the prior rounds
covered that ground and I did not find a way to break the stated invariants at
the model level. I instead verified the specification's claims about this
repository against the current source in the reviewed worktree, because this
design asserts that it "extends existing repository boundaries" and reuses named
existing contracts. That is where I found actionable defects.

Most of the foundation claims check out. `scripts/task-tracker/runtime.mjs`,
`scripts/task-tracker/gh-timing-comment.mjs`,
`scripts/task-tracker/word-counter.mjs`, `scripts/providers/`, and
`scripts/task-tracker/lib/github-records/` all exist as described.
`lib/github-records/record-envelope.mjs` does provide canonical JSON, payload
hashing, secret rejection, and `predecessor`/`supersedes` links.
`lib/delivery-records.mjs` does require a canonical-instant `verifiedAt` on
delivery receipts, so the delivery-boundary rule rests on a real field. There is
no existing `cost` verb in `scripts/task-tracker/verbs/`, so the proposed
`npx aitm cost #N` surface does not collide.

But four of the reused contracts will reject or corrupt what this design asks
them to carry, and the specification does not acknowledge it. Two of these are
hard write-time or read-time failures on live paths, not stylistic gaps:

- the existing record secret policy rejects the payload key names the cost
  schema requires, including every native token counter name;
- the existing timing-row grammar recognises exactly one trailing marker shape
  and is `$`-anchored, so a second trailing marker either throws on a live
  close-time path or silently corrupts cell indexing;
- the existing `word-counter` unavailable-instead-of-zero discipline is
  Codex-only, so the design's universal "never produces zero" rule is not in
  fact inherited from the cited foundation;
- the envelope's `supersedes` link is a scalar, so it cannot express the
  multi-span replacement set the reconciliation rules require.

I also found one schema-modelling defect internal to the specification: the
`boundary` field collapses two orthogonal dimensions into one enum.

These are specification-level, not planning-level. Each one changes what the
implementation plan must contain — a required schema decision, a required
compatibility contract, or a required acceptance case that does not currently
exist. An implementation plan written from the current text would produce code
that fails on first write in at least two places, and the plan's own
verification strategy would not catch it, because the listed tests do not
exercise these interactions.

One scoping note that is not a finding: the traceability table maps issue #1719
acceptance criterion 3 (test-driven implementation plan) to "Required next
artifact after written-spec approval." That is correct and honest for a
design-authority document, and I do not treat the deferral as a gap.

### Verification method and limits

I read the full specification, then inspected current local source in the
reviewed worktree at the pinned artifact commit
`340e63d54b849978869a9e4c0543f984a83bcf72`
(artifact digest
`sha256:a295ddeec226a0ddab22c029659ca3d3d26d69ba35cbef8564b50bdacac1d58e`, as
recorded in this response's frontmatter; I ran no Git command and do not
independently attest the commit).

All findings below were derived by reading source, not by executing it. My
session was permission-scoped to the `peer-review` join and submit commands
only, so I could not run `node` to execute the policy functions against a
candidate payload. Every claim is therefore stated with the exact file, line,
and predicate that produces it so the author can reproduce it directly. Where I
traced regular-expression behaviour by hand I have written out the reasoning so
it can be checked without rerunning my analysis. I made no external network
call and did not recheck the provider documentation links.

## Findings

### R1-F001 — The record secret policy rejects the cost payload's own required key names

Severity: required. Confirmed by source reading.

The design states that each Agent Cost Ledger event "uses the existing
canonical-record and comment-store contracts, including payload hashing, secret
rejection, repository/issue correlation, and exact write read-back," and
separately requires that "Native counters are always retained so a later reader
can reproduce or correct the normalization."

These two requirements are in direct conflict under the current policy.

In `scripts/task-tracker/lib/github-records/record-envelope.mjs:131-149`, the
delivery contract is the *only* record shape that gets a safe-key allowance:

- line 134: `if (isDeliveryContract)` → line 135-137 calls
  `assertNoSecretRecordData(envelope.payload, { safeKeyNames: DELIVERY_CONTRACT_SAFE_KEYS })`;
- line 147-149: every other record type falls to the `else` branch and calls
  `assertNoSecretRecordData(envelope.payload)` with **no** `safeKeyNames`, so the
  allowance defaults to the empty list at
  `record-secret-policy.mjs:90`.

There is no extension point for a new record type to register safe keys. A new
`aitm.agent-cost-event/v1` payload is validated against the bare heuristic.

That heuristic, in `scripts/task-tracker/lib/github-records/record-secret-policy.mjs:64-68`,
rejects a key when its collapsed lowercase alphanumeric form (line 41-43)
contains any of the fragments at line 18-29 — `token`, `secret`, `credential`,
`password`, `passwd`, `authorization`, `cookie`, `apikey`, `privatekey`,
`bearer` — or contains the abbreviations `auth` or `pat` (line 49-51). The only
escape is `isSafeSemanticKey` (line 53-62), which requires the collapsed key to
**start with** one of the twelve hard-coded prefixes at line 4-17.

Hand-traced consequences for the keys this design needs:

| Candidate key | Collapsed form | Result | Reason |
| --- | --- | --- | --- |
| `inputTokens` | `inputtokens` | rejected | does not start with `inputtokencount`; contains `token` |
| `outputTokens` | `outputtokens` | rejected | does not start with `outputtokencount`; contains `token` |
| `cacheReadInputTokens` | `cachereadinputtokens` | rejected | contains `token` |
| `tokenUsage` | `tokenusage` | rejected | does not start with `tokencount`; contains `token` |
| `nativeTokenCounters` | `nativetokencounters` | rejected | contains `token` |
| `sourcePath` | `sourcepath` | rejected | contains `pat` |
| `transcriptPath` | `transcriptpath` | rejected | contains `pat` |
| `tokenCountInput` | `tokencountinput` | accepted | starts with safe prefix `tokencount`, benign suffix |
| `serviceTier`, `billingProvider`, `agentProvider`, `accountRef`, `sessionRef`, `epoch` | — | accepted | no sensitive fragment, no `auth`/`pat` |

So the only token-counter spelling that survives is one that starts with
`tokenCount`, `inputTokenCount`, or `outputTokenCount`. That is precisely the
spelling a design requiring verbatim native counter retention cannot use,
because provider-native names are `input_tokens`, `output_tokens`,
`cache_creation_input_tokens`, `cache_read_input_tokens`, `prompt_tokens`,
`completion_tokens`, and `reasoning_tokens`. Every one of those, used as an
object key, is rejected at write time.

The value path has a narrower but real hazard. `assertNoCredentialValues`
(`record-secret-policy.mjs:80-87`) applies `TOKEN_ENV_NAME_RE`
(`record-secret-policy.mjs:33-34`) to every string, case-insensitively. Tracing
it by hand: the pattern requires `_TOKEN` followed by a word boundary. For the
value `"input_tokens"` the character after `token` is `s`, a word character, so
there is no boundary and the value is accepted. For a *singular* value such as
`"input_token"` the string ends after `token`, the boundary holds, `input`
matches `[A-Z][A-Z0-9]*` under `/i`, and the value is **rejected**. A provider
or adapter that emits a singular counter name therefore fails at write time even
under a key-free representation.

Note also that `assertNoSecretRecordData` is applied only to `envelope.payload`
(line 148), not to the envelope root, which is why the root `authority` key —
whose collapsed form contains `auth` — does not trip the same check. Any nested
`authority`-like key *inside* a cost payload would trip it.

Failure scenario: the first real capture writes an event whose payload retains
Codex rollout counters under their native names. `createAitmRecordEnvelope` →
`validateEnvelope` → `assertNoSecretRecordData` throws
`TypeError: record-envelope:secret`. Per the design's own rule that "the timing
or lifecycle action does not fail solely because … ledger append … failed," the
lifecycle survives, but *every* cost envelope fails identically and permanently.
The coverage inventory then reports zero envelope coverage for every story, and
the failure looks like a delivery problem rather than a schema-rejection
problem.

This is a specification-level decision, not an implementation detail, because
the resolution changes the schema. The design must choose and state one of:

1. a key-free representation for native counters, carrying the provider name as
   a *value* — for example
   `nativeCounters: [{ category: "input_tokens", value: 1234 }]` — which passes
   the key heuristic entirely, plus an explicit rule forbidding singular counter
   names as values or requiring them to be escaped, per the `TOKEN_ENV_NAME_RE`
   trace above; or
2. an explicit extension to `record-envelope.mjs` that lets a registered record
   type declare its `safeKeyNames`, with the cost record's allowance enumerated
   in the specification and a stated rationale for why each allowed key is
   non-secret.

Option 1 is the smaller change and keeps the secret policy's default-deny
posture intact for new record types. I have no objection to option 2 if the
author prefers it, but it widens a security boundary and should say so
explicitly.

### R1-F002 — The proposed timing-row cost marker breaks the single-shape trailing-marker grammar

Severity: required. Confirmed by source reading.

The design specifies that every newly emitted Timing Log row receives a stable
identifier "in a trailing marker" spelled
`<!-- aitm-cost-event id="01..." policy="01..." -->`. It does not specify where
that marker sits relative to the existing `<!-- row-sec: a=N i=N -->` marker, and
it does not name the parsers that must change.

The repository already encodes a strict single-marker contract.
`scripts/task-tracker/lib/timing-rows.mjs:148` states it directly: the
`<!-- row-sec -->` marker "lives after the last pipe and never perturbs it."
Three separate regular expressions implement that contract, and they do not
agree on strictness:

- `scripts/task-tracker/timing-rollup.mjs:14` — unanchored, tolerant;
- `scripts/task-tracker/lib/timing-rows.mjs:34` — unanchored, tolerant;
- `scripts/task-tracker/lib/timing-row-reader.mjs:15` —
  `TRAILING_ROW_SEC_RE = /(\s*<!--\s*row-sec:\s*a=-?\d+\s+i=-?\d+\s*-->)(\s*)$/`,
  **anchored to end of line**.

Both placements are broken, in different ways.

**Placement A — cost marker appended after `row-sec`.** The `$` anchor no longer
matches. `splitTimingRowMarker` (`timing-row-reader.mjs:60-68`) falls to its
no-match branch and returns `{ core: <entire line, both markers>, marker: '' }`.
Then `readEstimationStageTiming` (`timing-row-reader.mjs:121-145`) evaluates
`row.marker.match(/row-sec:\s*a=(-?\d+)/)?.[1]` at line 130 against the empty
string, gets `undefined`, and **throws** `TypeError:
timing-row-reader:estimation-row-sec` at line 131.

This is not a dormant helper. `readEstimationStageTiming` is called from
`scripts/task-tracker/lib/estimation/runtime-adapter.mjs:1130`, on the
estimation-outcome evidence path. The throw lands on a live close-time path for
any story whose Plan, Develop, Test, or Review rows carry the new marker — that
is, every story once the feature is enabled.

**Placement B — cost marker before `row-sec`.** The `$` anchor still matches
`row-sec`, so `marker` is correct, but `core` now ends with the cost-marker text
after the final pipe. `parseTimingRow` (`timing-row-reader.mjs:75`) splits `core`
on `|`, so the cost-marker text becomes the final element of `cells`. That
shifts the column-count tests that follow:

- `parseTimingRow:88` gates `fullWordMarker` on `cells.length >= 10`;
- `ensureTimingRowFullMarkerCell:113-118` gates its
  `cells.splice(8, 0, ...)` migration on `cells.length < 10`.

A historical seven-column row carrying a cost marker reaches the ten-element
threshold for the wrong reason, so the full-word-cursor cell is neither inserted
nor read from the right index. Worse, `replaceTimingRowCells`
(`timing-row-reader.mjs:92-102`) rejoins `cells` with `|` and re-appends only
`marker` — so any row rewrite performed by healing or slug-rename carries the
cost-marker text back as ordinary cell content, silently corrupting the row.

The tolerant parsers are not a safety net, only a reason the breakage is
non-uniform. `timing-rollup.mjs:41` does `line.split('|').slice(1, -1)`, which
discards everything after the final pipe and therefore tolerates either
placement, so rollups keep working while the reader path fails. That divergence
makes the failure harder to diagnose, not easier.

At least six modules carry their own timing-row grammar and are in scope for
this change: `timing-rollup.mjs`, `lib/timing-rows.mjs`,
`lib/timing-row-reader.mjs`, `backfill-timing-logs.mjs`,
`lib/heal-timing-sweep.mjs`, `lib/timing-slug-rename.mjs`, plus the review-time
validator `lib/agent-review/validators/timing-log-sequence.mjs`, which parses
rows through `parseTimingRow`.

The specification's migration section promises that "Feature-disabled behavior
remains byte-compatible." That promise is sound but insufficient: it says
nothing about the enabled path, which is where the breakage is. The design must
state the exact trailing-marker composition order, require that the marker
grammar become multi-marker-aware in the one lexical leaf that owns it rather
than in each consumer, name the parsers that must change, and add a byte-level
round-trip acceptance case asserting that a cost-keyed row still yields correct
`marker`, `cells`, `fullWordMarker`, and `replaceTimingRowCells` output.

### R1-F003 — The cited `word-counter` unavailable-instead-of-zero discipline is Codex-only

Severity: required. Confirmed by source reading.

The foundations section describes `scripts/task-tracker/word-counter.mjs` as
resolving the provider session, transcript, and cursor "without treating an
unavailable Codex transcript as a successful zero." That sentence is literally
accurate. The problem is what the design then builds on it.

The accounting definitions state a *universal* rule: "An absent source,
unreadable transcript, unsupported counter, unresolved session, lost request
receipt, or ambiguous bill produces an explicit `unknown` or `incomplete` field
with a reason code. It never produces zero." Migration step 3 then says "Add
local transcript/response-receipt adapters for supported agent hosts," and
`scripts/providers/` holds `claude.mjs`, `codex.mjs`, and `grok.mjs`.

In the current source, every unavailable branch in `countWords` is guarded by
`provider === 'codex'`:

- `word-counter.mjs:237-243` — unresolved session, Codex only;
- `word-counter.mjs:244-253` — missing or unresolvable transcript path: if
  `provider === 'codex'` it returns `unavailableCodexResult(...)`, **otherwise
  line 252 returns bare `countResult()`**;
- `word-counter.mjs:284-290` — unrecognised schema, Codex only.

`countResult()` with no arguments (`word-counter.mjs:213-221`) yields
`{ count: 0, totalLines: 0, fullExpansion: 0, status: 'ok', diagnosticCode: null }`.
For Claude and Grok, a missing transcript is therefore reported today as a
**successful zero** — exactly the outcome the design forbids.

Failure scenario: the Claude transcript adapter is implemented on the shape of
the cited foundation. A Claude session's transcript is unavailable — rotated,
running from a worktree whose path does not resolve, or not yet written. The
adapter returns `status: 'ok'` with zero. The ledger records a well-formed
delta of zero rather than an `unknown` with a reason code. The coverage
inventory sees a complete envelope with a complete observation and reports the
view as `complete`. The story's whole-story total is then understated by the
entire unmeasured interval and is *labelled complete* — the single worst outcome
for a system whose stated purpose is to "Remain truthful when evidence is
missing."

The design cannot rely on the coverage inventory to catch this, because the
inventory reconciles *expected against present* records, and here the record is
present and internally consistent. Nothing downstream can distinguish a real
zero from a fabricated one.

Required: state explicitly that the per-host unavailable detection does not
currently exist outside Codex, that each usage-source adapter owns its own
unavailable detection with its own diagnostic codes, and that a
successful-looking zero from any shared counting helper must not be accepted as
a measured zero. Add the missing-transcript acceptance case per agent host
rather than only in the Codex fixture row, and add a corresponding entry to the
accounting-failure acceptance cases.

### R1-F004 — The `boundary` field conflates two orthogonal dimensions

Severity: required. Confirmed from the artifact alone.

The event-identity table defines a single `boundary` field with the values
`baseline`, `interval`, `delivery`, `post-trunk`, and `terminal`.

These are two independent axes:

- *observation kind* — is this the first snapshot for a source epoch
  (`baseline`), a derived span (`interval`), or the closing event
  (`terminal`)?
- *delivery-window classification* — does this event fall before the verified
  trunk receipt (`delivery`) or after it (`post-trunk`)?

Every event has a value on both axes, and one scalar cannot carry both. The
conflict is not hypothetical: the design's own story-cost-boundaries section
defines post-trunk housekeeping as "costs after that receipt through Done,
including closure, final reporting, cleanup, and related automation." Those are
ordinary interval events that are also post-trunk. The Done event is
simultaneously `terminal` and `post-trunk`. A new source epoch opened after the
trunk receipt — which the counter-reset rules explicitly permit — produces an
event that is simultaneously `baseline` and `post-trunk`.

Failure scenario: an implementer following the table assigns
`boundary: "post-trunk"` to the Done event to make the housekeeping subtotal
come out right. The terminal semantics are lost, so the terminal-coverage check
described in the coverage inventory — which requires "a source cursor/watermark
or closed-run evidence that covers the cutoff" — has no event to anchor to.
Alternatively the implementer assigns `boundary: "terminal"` and the Done
event's cost drops out of the post-trunk subtotal. Either way one of the three
reported boundaries is silently wrong, and because both choices produce a
well-formed record, the coverage inventory reports `complete`.

Required: split into two fields — for example `observationKind`
(`baseline` | `interval` | `terminal`) and `deliveryWindow`
(`delivery` | `post-trunk` | `unknown` | `not-applicable`). The `unknown` and
`not-applicable` values are already required by the rules the design states
elsewhere: no-commit deliverables have a `not-applicable` trunk split, and
authorized local-trunk work without a durable verification instant has an
incomplete split. The current single enum cannot express either.

### R1-F005 — `supersedes` is a scalar link and cannot carry a multi-span replacement set

Severity: required. Confirmed by source reading.

The observation-and-delta section requires that "Reconciliation that inserts an
observation replaces every affected derived span together in one validated
projection revision," and that "The reconciliation payload names the complete
replacement set and its input hashes, using existing envelope
`predecessor`/`supersedes` links for revision lineage."

The existing envelope cannot express that. In
`scripts/task-tracker/lib/github-records/record-envelope.mjs`:

- line 22-34 fixes the root key set, with `predecessor` and `supersedes` as
  single keys;
- line 119-120 validates each through `assertLink`;
- line 89-91 defines `assertLink` as accepting `null` or a value satisfying
  `isRecordId`, which line 77-79 constrains to a single ULID matching
  `ULID_RE`.

So `supersedes` holds exactly one record ID or nothing. The existing precedent
confirms the 1:1 intent: line 156-158 requires the forecast record's
`payload.supersedesForecastRecordId` to equal the scalar `envelope.supersedes`,
tying payload lineage to a single envelope link.

Failure scenario: the design's own worked example requires replacing one span of
80 with two spans of 50 and 30 — and the general rule says "every affected
derived span," which may be more than two. A single reconciliation envelope
cannot point at the full set it replaces. An implementer following the text
literally has two bad options: emit one reconciliation record per replaced span,
which destroys the atomicity the design requires and reintroduces exactly the
"80 plus 50" double-count the example forbids; or set `supersedes` to one
arbitrary member of the set, which makes the lineage silently incomplete and
defeats the cycle and conservation checks that depend on it.

Required: state that the complete replacement set and its input hashes live in
the reconciliation *payload*, and that the envelope's scalar `supersedes` link
carries only the prior reconciliation revision in the same lineage chain (or is
`null` for the first). This matches how the design already describes the payload
as naming the set, and it keeps the envelope contract unchanged. If the author
instead intends to widen the envelope to accept a link array, that is a change
to a shared record contract used by delivery, forecast, outcome, and rubric
records, and the specification should say so explicitly and justify it.

## Required changes

1. **R1-F001** — Resolve the collision between the cost payload's key names and
   `record-secret-policy.mjs`. State the chosen representation in the schema
   section: either a key-free native-counter form carrying the provider counter
   name as a value (with an explicit rule covering the singular-name value
   hazard from `TOKEN_ENV_NAME_RE`), or a declared `safeKeyNames` extension to
   `record-envelope.mjs` with each allowed key enumerated and justified. Add a
   security test to the verification strategy asserting that a realistic
   multi-provider cost payload passes `assertNoSecretRecordData` unmodified.

2. **R1-F002** — Specify the timing-row marker composition contract. State the exact
   order of `<!-- aitm-cost-event -->` relative to `<!-- row-sec -->`; require
   that multi-marker awareness be added in `lib/timing-row-reader.mjs` as the
   single lexical owner rather than in each consumer; name the parsers in scope
   (`timing-rollup.mjs`, `lib/timing-rows.mjs`, `lib/timing-row-reader.mjs`,
   `backfill-timing-logs.mjs`, `lib/heal-timing-sweep.mjs`,
   `lib/timing-slug-rename.mjs`, and
   `lib/agent-review/validators/timing-log-sequence.mjs`); and add a byte-level
   round-trip acceptance case covering `splitTimingRowMarker`,
   `parseTimingRow().fullWordMarker`, `ensureTimingRowFullMarkerCell`,
   `replaceTimingRowCells`, and `readEstimationStageTiming` on a cost-keyed row.

3. **R1-F003** — Correct the reliance on the cited `word-counter` behaviour. State
   that unavailable-instead-of-zero is currently implemented for Codex only,
   that each usage-source adapter must implement its own unavailable detection
   and diagnostic codes, and that a zero returned with `status: 'ok'` from a
   shared helper must not be accepted as a measured zero. Extend the provider
   fixture tests and the accounting-failure acceptance cases to cover a missing
   transcript for every supported agent host.

4. **R1-F004** — Split the `boundary` field into an observation-kind field and a
   delivery-window field, with the delivery-window field admitting `unknown` and
   `not-applicable` so the no-commit and unverified-local-trunk cases the design
   already describes can be represented.

5. **R1-F005** — State that the reconciliation replacement set lives in the payload
   and that the envelope's scalar `supersedes` carries only the prior
   reconciliation revision, or else explicitly propose and justify widening the
   shared envelope link contract.

## Optional suggestions

1. **Per-issue comment volume has no stated budget.** The design appends one
   immutable envelope comment per keyed timing event. A governed story routinely
   produces tens of timing rows across bind, pause, resume, stage moves, and
   rework visits, so the ledger adds a comparable number of comments to every
   issue. `lib/github-records/github-comment-store.mjs:22` pages issue comments
   at `ISSUE_COMMENT_PAGE_SIZE = 100` with `MAX_ISSUE_COMMENT_PAGES = 1000`
   (line 53), so nothing breaks, but every full record scan — including each
   `npx aitm cost #N` read and every unrelated record read on the same issue —
   pays additional GraphQL round trips that scale with story length. Consider
   stating an expected per-story envelope count, and whether a per-stage or
   batched envelope is an acceptable alternative to per-event granularity. This
   does not affect correctness and I do not treat it as blocking.

2. **Make the record-size ceiling explicit.** `record-envelope.mjs:37` caps
   record JSON at `MAX_RECORD_JSON_BYTES = 256 * 1024`. A cost event retaining
   native counters, normalized views, multiple cost lines, an `includes` graph,
   and source provenance for several sources is well under that today, but the
   design's open-ended "other provider-defined token categories" has no stated
   bound. A sentence naming the ceiling and requiring adapters to stay within it
   would make the constraint visible to adapter authors.

3. **Name the diagnostic-code namespace.** The design requires "deterministic
   diagnostic codes for unavailable or ambiguous evidence" from every adapter.
   The repository already has a convention visible in `word-counter.mjs:237-290`
   (`codex-session-unresolved`, `codex-transcript-unresolved`,
   `codex-schema-unrecognized`). Stating that cost adapters follow the same
   `<source>-<condition>` shape would keep the coverage inventory's reason codes
   greppable alongside the existing ones.

## Decision

revisions-requested
