<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-5adf972a9df9d2101e757a5abdd469b1"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-20-1719-story-token-cost-design.md"
artifact_commit: "62fa711d97a8364cadb81a0cb5849e8fe31b9f51"
artifact_blob: "4b85864b21fe951f82d3e4b5b495b995c2c9416d"
artifact_digest: "sha256:7f4b8a7566abcaad3f598d3d5c38e8449f7c51f5649bbe906683b94d519f2c55"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:ec62c7cc672ee56180cc262823c862e792b2aaf047d5580768ebf905d74b4a6e"
  identity_source: "declared"
started_at: "2026-09-21T05:09:59.239Z"
submitted_at: "2026-09-21T05:18:16.305Z"
finding_ids: ["R1-F001"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

This is turn 1 of review `review-5adf972a9df9d2101e757a5abdd469b1`, reviewing
artifact commit `62fa711d97a8364cadb81a0cb5849e8fe31b9f51`. It continues the
thread from the prior review `review-bd4fbcca64d8f812251c3846d92bb100`, whose
author response dispositioned five findings. To avoid ambiguity, findings raised
in that earlier review are referred to below as *prior-round* `R1-F00N`; the one
new finding raised here is `R1-F001` of this review.

I re-verified all five prior-round findings against the revised artifact and
against current source in this worktree. **All five are resolved**, and two of
the resolutions are better than what the prior round asked for. I also
independently confirmed the author's correction to the non-reproducing part of
prior-round R1-F002; the author is right and the prior round's hand trace was
wrong. Details are in "Prior-round verification" below.

The accounting architecture is unchanged and I continue to have no objection to
it. The separations it rests on — measured consumption vs. rate-card valuation
vs. actual billed cost, known zero vs. unknown, cumulative snapshot vs. derived
span, durable observation acceptance vs. remote publication, and observation
identity vs. economic identity — are correct and consistently applied. The
refusal to prorate by wall clock, the refusal to allocate aggregate invoices by
time window, per-currency aggregation without FX, append-only reconciliation,
and the expected-coverage inventory are all the right calls.

I found one new required defect, and it is in the same family as the prior
round's: a reused repository contract does not provide a property this design
explicitly asserts. The prior round covered the record **write** path. The
**read** path is the remaining gap. `lib/github-records/github-comment-store.mjs`
parses every comment on an issue that *claims* to be an AITM record, and a
single unparseable claimant aborts the entire read — taking lifecycle gate
evidence, workflow preflight, workflow exceptions, the incident ledger, and the
estimation forecast/outcome projections down with it. This design multiplies the
population of record comments on every governed issue by roughly the Timing Log
row count, while its own verification strategy asserts "no lifecycle failure
caused solely by telemetry failure." Under the current shared read path that
assertion holds for writes and fails for reads.

Three optional suggestions follow. None is blocking.

### Verification method and limits

I read the full specification, the prior-round reviewer response and author
response, and current local source in this worktree. My session was
permission-scoped to the `peer-review` join and submit commands only, so — as in
the prior round — I could not execute `node` to run the policy or parser
functions against candidate inputs. Every claim below is therefore derived by
source reading and hand trace, and is stated with the exact file, line, and
predicate that produces it so the author can reproduce it directly. I ran no Git
command and do not independently attest the commit. I made no network call and
did not recheck the provider documentation links.

Where I disagree with a prior-round hand trace I have written out the reasoning
rather than asserting a conclusion.

The five paragraphs below record the prior-round verification, one per
dispositioned finding, followed by the prior round's optional suggestions.

**Prior-round R1-F001 (secret-policy key collision) — resolved.** The artifact's
new "Secret-policy-compatible representation" section takes option 1, the
key-free representation, and does not widen the security boundary. I confirmed
`record-envelope.mjs:131-149` still gives `DELIVERY_CONTRACT_SAFE_KEYS` as the
only safe-key allowance and that every other record type still falls to the bare
`assertNoSecretRecordData(envelope.payload)` at line 148 — consistent with the
artifact's "This design adds no safe-key exception and does not weaken secret
detection." Hand-tracing the endorsed keys through
`record-secret-policy.mjs:41-68`: `nativeCounters` → `nativecounters`,
`category`, `value`, `sourceLocator` → `sourcelocator` all carry no fragment
from `COLLAPSED_SENSITIVE_FRAGMENTS` (line 18-29) and no `auth`/`pat`
substring (line 49-51), so all four are accepted. The value-path rule is also
correct: `TOKEN_ENV_NAME_RE` (line 33-34) requires `_TOKEN` at a word boundary,
so plural `input_tokens` passes (trailing `s` is a word character) while
singular `input_token` is rejected — and the artifact now requires a bounded
incomplete observation with an adapter diagnostic and no offending value, and
explicitly forbids escaping, renaming, silently dropping the quantity, or
labelling the observation complete. The required security test is present in the
verification strategy. This closes the finding.

**Prior-round R1-F002 (timing-row marker grammar) — resolved, and the author's
correction is right.** The artifact now fixes composition order (`row-sec`
first, cost marker second, both outside the final pipe), requires
`lib/timing-row-reader.mjs` to learn the composed suffix *before any writer
emits it*, names all seven consumers in scope, and adds acceptance case 8.

I confirmed the placement-A failure the ordering requirement exists to prevent:
`TRAILING_ROW_SEC_RE` at `timing-row-reader.mjs:15` is `$`-anchored, so with a
cost marker appended after `row-sec` the match fails, `splitTimingRowMarker`
falls to its no-match branch at line 63 returning `marker: ''`, and
`readEstimationStageTiming:130-131` throws
`timing-row-reader:estimation-row-sec`. That makes the "before any writer emits
it" sequencing requirement load-bearing, not stylistic, and the artifact states
it.

I also independently re-traced the prior round's placement-B claim that a cost
marker before `row-sec` shifts the cell count, and **the author is correct that
it does not reproduce.** `parseTimingRow:75` splits `core` on `|`. A canonical
seven-column row `|a|b|c|d|e|f|g|` splits into nine elements — an empty leading
cell, seven data cells, and an empty trailing cell. Placing the cost marker
after the final pipe puts its text *inside that already-existing trailing
element*; it does not create a new one. The count stays nine, so the
`cells.length >= 10` gate at line 88 and the `cells.length < 10` gate at line
117 both behave exactly as before. The same holds for an eight-column row, which
stays at ten. The prior round's trace treated the marker as adding an element,
and that was wrong. The real placement-B defect is the narrower one the author
describes — comment text leaking into the final cell, which
`replaceTimingRowCells:92-102` would then carry back as ordinary cell content.
The artifact does not depend on the withdrawn claim, since it adopts placement A
with a mandatory grammar change. I record the correction rather than leave a
wrong trace standing in the thread.

The artifact's stated marker invariants are also internally consistent with the
reader: `readEstimationStageTiming:130` matches `row-sec` **unanchored** inside
`row.marker`, so a composed suffix retaining both comments still yields correct
seconds, and `core` no longer contains either comment so `fullWordMarker` and
the migration splice keep their current indices.

**Prior-round R1-F003 (Codex-only unavailable discipline) — resolved.** The
claim was accurate and remains accurate at this commit:
`word-counter.mjs:244-253` returns `unavailableCodexResult` only when
`provider === 'codex'`, and line 252 returns a bare `countResult()` otherwise,
which `countResult:213-221` renders as `{ count: 0, status: 'ok',
diagnosticCode: null }` — a successful zero for Claude and Grok on a missing
transcript. The artifact now says this explicitly, requires each usage-source
adapter to own its own availability, schema, cursor, and diagnostic handling,
states that reusing a session/path resolver does not authorize trusting a
counting helper's status, and adds per-host acceptance case 9. That is the
correct scope, and it correctly leaves existing word-count behavior unchanged.

**Prior-round R1-F004 (conflated `boundary` enum) — resolved, and improved.**
The single enum is replaced by three independent axes: `eventRole` on the event
(`opening` / `ordinary` / `delivery-cutoff` / `terminal`), `observationKind` per
source contribution (`baseline` / `interval` / `unavailable`), and
`deliveryWindow` per span (`delivery` / `post-trunk` / `unknown` /
`not-applicable`). Moving `terminal` onto the event and adding `unavailable` to
the observation axis is a better decomposition than the two-field split the
prior round proposed, because an unavailable contribution is neither a baseline
nor an interval and previously had nowhere to live. The artifact also states the
disambiguation that `delivery` names the window and not a lifecycle event, and
worked the Done-event case (terminal role, post-trunk interval, newly opened
baseline) through all three axes.

**Prior-round R1-F005 (scalar `supersedes`) — resolved.** The artifact takes the
no-widening option. I re-confirmed the constraint in source:
`record-envelope.mjs:22-34` fixes the root key set with `predecessor` and
`supersedes` as single keys, lines 119-120 validate each through `assertLink`,
and `assertLink:89-91` admits only `null` or a single ULID per `isRecordId:77-79`
and `ULID_RE:40`. The forecast precedent at lines 156-158 confirms the 1:1
intent. The artifact now puts the complete many-to-many replacement set and its
input hashes in the reconciliation payload as an array, scopes the scalar
`supersedes` to the prior reconciliation revision in that lineage (or `null`),
keeps `predecessor` for the enclosing record chain, requires projection
validation to traverse both payload references and scalar links, and forbids
emitting one revision per replaced span. Acceptance case 11 covers it. This
matches the existing contract exactly.

**Optional suggestions 2 and 3 from the prior round** were incorporated
(record/transport byte bounds with a bounded incomplete-with-size-diagnostic
path; the `<source>-<condition>` diagnostic convention). I verified the cited
ceilings: `MAX_RECORD_JSON_BYTES = 256 * 1024` at `record-envelope.mjs:37` and
`MAX_COMMENT_BODY_BYTES = 1024 * 1024` at line 38. The artifact's numbers are
right. **Prior-round optional suggestion 1** (per-issue comment volume) was
deferred to implementation planning as a performance matter. I accept that
deferral as stated — but see finding R1-F001 below, which is a *correctness*
consequence of the same per-event comment volume and is not the same concern.

## Findings

### R1-F001 — Per-event ledger comments enter a fail-closed whole-issue read path that has no telemetry isolation

Severity: required. Confirmed by source reading.

The design asserts two non-interference properties. In the capture transaction:
"The timing or lifecycle action does not fail solely because usage measurement,
valuation, billing lookup, ledger append, or projection refresh failed." And in
the verification strategy's security and compatibility tests: "no lifecycle
failure caused solely by telemetry failure."

Both are correctly specified **for the write path**. The failure and
reconciliation semantics section likewise covers only write failures — source
unavailable, ledger write unavailable, duplicate event, out-of-order
observation. There is no read-path counterpart anywhere in the artifact, and the
read path is where the shared contract does not provide the asserted property.

The read contract is globally fail-closed per issue:

- `lib/github-records/github-comment-store.mjs:157-159` — `claimsAitmRecord`
  selects any comment whose body matches an HTML-comment opener, optional
  whitespace, and the literal `aitm-record`, case-insensitively. (This response
  avoids reproducing bare comment-opener sequences; read the regex at
  `github-comment-store.mjs:158` directly.)
- `:350-357` (`listIssueCommentsSince`) and `:204-210`
  (`parsePreloadedIssueComments`) call `parseComment` on every claiming comment
  with **no per-comment guard**. `parseComment:161-177` wraps `parseAitmRecord`
  in a `try`/`catch` that rethrows as `storeError('envelope')`, which propagates
  out of the whole list operation.
- This is deliberate and tested:
  `scripts/tests/unit/task-tracker/lib/github-records/github-comment-store.test.mjs:115`
  — "parsePreloadedIssueComments fails closed on malformed cached AITM records."

Critically, every consumer reads **all** records first and filters by
`recordType` **after** the parse, so no consumer's record-type filter can shield
it from an unrelated record's parse failure:

- `lib/github-records/lifecycle-gate-source.mjs:239-246` calls
  `listIssueCommentsSince` and, on throw, calls `fail('unavailable', error)`;
  the `isCapsuleRecordType` filter is at line 248, after the read.
- `verbs/workflow-preflight.mjs:163-172` (`listRecords`).
- `verbs/workflow-exception.mjs:176`, with the record-type filter downstream at
  `lib/workflow-policy/exception-store.mjs:53`.
- `verbs/incident-ledger.mjs:85`.
- `lib/workflow-policy/enforcement.mjs:161`.
- `lib/github-records/contract-write.mjs:290`, filtered at line 296.
- `lib/github-records/singleton-initializer.mjs:81`, filtered at line 253.
- `lib/estimation/runtime-adapter.mjs:356` and `:401`, filtered at line 406;
  also `:542` and `:601`.
- `lib/plan-approval-evidence-repair.mjs:38`.
- `scripts/reports/generate-value-report.mjs:1222`.

Today the exposed population is modest: record comments come from the delivery
contract, capsule chain, lifecycle transition, work assignment, workflow
exception, incident, close transaction, and estimation forecast/outcome/rubric
paths — on the order of a handful to a few dozen per issue. This design changes
that arithmetic structurally. The capture transaction appends one immutable
event envelope per keyed Timing Log event (step 7), plus reconciliation and
capture-policy envelopes. A governed story's Timing Log routinely carries tens
of rows across bind, pause, resume, every stage move, and every rework visit, so
the record-comment count on **every** issue rises to roughly the Timing Log row
count, permanently, written by a new adapter-driven path under retry.

The trigger does not require a write bug. `claimsAitmRecord` and the parser's
own `MARKER_RE` disagree on three axes, so a body can claim to be a record and
then fail extraction:

- `claimsAitmRecord` is case-insensitive; `MARKER_RE` (`record-envelope.mjs:36`)
  matches the same opener but is **case-sensitive**. A body whose marker is
  spelled `AITM-RECORD` in upper case claims but yields zero matches →
  `extractRecordJson:177` throws `recordError('missing')`.
- `claimsAitmRecord` has no lookahead; `MARKER_RE` carries a `(?=\s)` lookahead
  requiring whitespace immediately after `aitm-record`. A body whose marker is
  spelled `aitm-records` claims but does not match → same `missing` throw.
- `extractRecordJson:181` requires `marker.index === 0`. A comment that merely
  *quotes* a record marker after any leading prose claims, matches, and throws
  `recordError('malformed')`.

The third case is the sharpest one for this design specifically. The coverage
inventory is specified to report marker diagnostics and record identities, and
capture step 8 refreshes a human-readable `Agent Cost Ledger` projection comment
rendering a compact table for people. Any cost-system output that ever renders a
record marker or an envelope excerpt into an issue comment — a coverage
diagnostic quoting a malformed envelope, a projection row echoing a record body,
a human pasting a record while debugging a conflict — self-poisons every record
read on that issue. A fourth route needs no marker confusion at all: the record
JSON lives inside an HTML comment that is invisible in GitHub's rendered view,
so a human editing what looks like only the visible text of a cost comment
re-serializes the body and trips the `noncanonical` check at
`record-envelope.mjs:302`.

Failure scenario: a story has 40 keyed timing events and therefore 40 cost
envelopes. One of them is edited in the GitHub UI, or one unrelated comment on
the issue quotes a record marker. From that moment,
`resolveLifecycleGateEvidence` returns `fail('unavailable')` for that issue, so
lifecycle gate evidence cannot be resolved; `workflow-preflight`'s `listRecords`
throws; the estimation forecast projection at `runtime-adapter.mjs:401` throws,
so forecast and outcome records become unreadable; `contract-write` cannot read
the capsule chain; and `npx aitm cost #N` cannot run at all. The issue is now
wedged for reasons that have nothing to do with the work on it, and the design's
own coverage inventory cannot diagnose it — the inventory detects *missing*
envelopes, but an unparseable envelope prevents the report from executing rather
than producing a missing-envelope diagnostic.

This is specification-level, not planning-level, for the same reason the
prior-round findings were. The artifact already commits to the analogous
property on the timing side and states it precisely: "A malformed or duplicate
cost marker cannot become a table cell or erase valid timing seconds: timing
parsing remains valid where the original row is valid, but cost coverage reports
a marker diagnostic." The record side needs the same commitment, and it changes
what the implementation plan must contain — an isolation requirement and an
acceptance case that does not currently exist. Acceptance case 6 comes closest,
but it exercises *missing* envelopes (ten keyed events, eight envelopes), not an
unparseable one, so the listed verification strategy would not catch this.

I want to be precise about attribution: the fail-closed read is a pre-existing
property of the comment store, not something this design introduces. What this
design introduces is a large, permanent increase in the population of record
comments inside that blast radius, combined with an explicit assertion that
telemetry failure cannot cause lifecycle failure. Either the assertion needs
scoping to writes, or the read path needs stated isolation. Leaving both as they
are is the only outcome I object to.

## Required changes

1. **R1-F001** — State the read-side isolation contract for ledger records.
   Choose and state one of:

   a. Cost envelopes are read through a path that **skips and reports** an
      unparseable claiming comment instead of aborting the issue read, with the
      skip surfaced as a coverage diagnostic (so an unparseable envelope
      degrades the affected view to incomplete, exactly as a missing envelope
      does) — and state whether that tolerant read is scoped to the cost report
      or replaces the shared whole-issue read; or

   b. The design deliberately accepts the shared fail-closed whole-issue read,
      in which case say so explicitly, scope the "no lifecycle failure caused
      solely by telemetry failure" claim to the write path, and justify why the
      increased record-comment population is an acceptable risk to lifecycle
      gating.

   Under either choice, add an accounting-failure acceptance case covering an
   issue that carries one unparseable cost envelope alongside valid ones, and
   assert the required outcome for `resolveLifecycleGateEvidence`,
   `workflow-preflight`'s record read, the estimation forecast/outcome
   projection, and `npx aitm cost #N`. Also state that no cost-system output —
   projection comment, coverage diagnostic, or reconciliation report — may emit
   a string matching `claimsAitmRecord` into an issue comment that is not itself
   a valid record, or else require that `claimsAitmRecord`
   (`github-comment-store.mjs:157-159`) and `MARKER_RE`
   (`record-envelope.mjs:36`) be brought into agreement on case and on the
   trailing-whitespace lookahead.

## Optional suggestions

1. **The `auth`/`pat` key trap still applies to the adapter-declaration
   surface.** The artifact's secret-policy section names `sourcePath` and
   `transcriptPath` as rejected spellings, and states the correct blanket rule
   that event, reconciliation, capture-policy, and subscription payloads must
   all pass the unchanged policy. But the usage-source adapter boundary requires
   an adapter to declare "supported source kinds and **authentication
   requirements**," and the capture-policy record is required to durably record
   "configured adapters, and their versioned capabilities." Every natural
   spelling of that field is rejected by `containsAuthPatAbbreviation`
   (`record-secret-policy.mjs:49-51`): `authenticationRequirements`,
   `requiresAuthentication`, and `authRequired` all collapse to a form
   containing `auth`; `credentialRequired` contains `credential`; and by the
   same rule `tokenCategories` contains `token` without matching the
   `tokencount` safe prefix, and `ratePath` contains `pat`. None of these
   contradicts anything the artifact says — the blanket rule and the required
   security test would surface them — but naming the abbreviation trap once,
   alongside the existing `sourcePath` example, would save an implementer a
   round of renames in the one payload family the artifact does not give a
   worked example for.

2. **Measure the size ceiling against the rendered envelope, not the raw
   payload.** The artifact requires adapters to "enforce serialized byte limits
   before publication" against the 256 KiB record-JSON ceiling. That ceiling is
   applied in `renderAitmRecord:279` to `canonicalCommentRecordJson(envelope)`,
   which is the **escaped** form: `canonicalCommentRecordJson:261-267` expands
   every `--` to `--`, two bytes to seven. An adapter that bounds
   `canonicalRecordJson(payload)` is measuring a different, smaller string than
   the one the ceiling is checked against, and it is measuring the payload
   rather than the whole envelope. Saying that the bound is on the rendered
   escaped envelope would remove the ambiguity. The practical margin is large
   for cost payloads, so this is a clarity point, not a correctness one.

3. **Name the complete frozen envelope-identity set.** The capture transaction
   says retries "replay the frozen identifiers and payload without resampling,"
   and step 5 freezes "the intended remote record identity." Three envelope
   fields sit outside `payloadHash` and default to fresh values on every call to
   `createAitmRecordEnvelope` (`record-envelope.mjs:231-243`): `createdAt`,
   `authority.grantId`, and `authority.epoch`. Because `verifyWriteReadBack`
   (`github-comment-store.mjs:223`) compares **byte-exact bodies**, a retry that
   regenerates any of them produces a body that will not match on read-back even
   though the payload hash is identical — while the artifact's duplicate rule is
   framed purely on payload ("An existing identical event/source payload is an
   idempotent success"), which cannot distinguish that case from a genuine
   second envelope for the same event. Enumerating `recordId`, `createdAt`, and
   the `authority` block as part of the frozen identity would close the gap.
   Also worth a sentence: the source-identity table's `epoch` (counter epoch) and
   the envelope's `authority.epoch` are unrelated quantities with the same name,
   and the existing delivery contract already disambiguates its own with
   `authorityEpoch`.

## Decision

revisions-requested
