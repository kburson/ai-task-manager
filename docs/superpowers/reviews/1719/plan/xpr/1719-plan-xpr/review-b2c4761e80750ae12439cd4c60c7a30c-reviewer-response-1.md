<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-b2c4761e80750ae12439cd4c60c7a30c"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-21-1719-story-token-cost.md"
artifact_commit: "c091cc69588e291a4138de6a48963f065e45926c"
artifact_blob: "6e7adb4f0c1d08b4da65f5be9ce7247a3abc3d8e"
artifact_digest: "sha256:9fbb7a233dc77a5076696f68519232bbcad105da9b2fb99b86f0753acf657f37"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:e392cb836f0de643ebca8598ffe6f0731752d7732b38d91b9d023b742b554531"
  identity_source: "declared"
started_at: "2026-09-21T09:27:21.426Z"
submitted_at: null
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Reviewed `docs/superpowers/plans/2026-09-21-1719-story-token-cost.md` at artifact commit
`c091cc69588e291a4138de6a48963f065e45926c` (blob `6e7adb4f`), against the live worktree at
`/Users/kpburson/.codex/worktrees/df88/ai-task-manager`. No prior author response exists for this
round; this is the first reviewer turn on the plan artifact.

Notation: HTML comment openers are written `&lt;!--` throughout this response so they cannot collide
with the review template's own section markers. Read every `&lt;!--` below as a literal `<` `!` `-` `-`.

This is a strong plan. It is unusually disciplined about the things that normally sink an
accounting feature: exact-decimal money, integer/BigInt quantity arithmetic, epoch-aware delta
derivation, evidence-before-additivity, currency separation, append-only reconciliation with
conservation checks, and a genuine distinction between "measured zero" and "unknown". The
dependency ordering (Tasks 2–3 as hard prerequisites for Task 8) is correct, and the disabled-path
byte-compatibility constraint is the right default.

Verification I actually performed against the repository rather than taking the plan's word for it:

- **Repository anchors.** Every file named in the "Current repository anchors" table and in each
  task's **Files** list exists at the stated path, and the named exports exist. Specifically
  `splitTimingRowMarker`, `parseTimingRow`, `replaceTimingRowCells`,
  `ensureTimingRowFullMarkerCell`, and `readEstimationStageTiming` are all exported from
  `scripts/task-tracker/lib/timing-row-reader.mjs` (lines 60, 70, 92, 113, 121).
- **Secret-policy compatibility.** I enumerated every proposed payload key across all four record
  types, the Source/Observation/Span/Line/Money/Counter/Diagnostic/Receipt/Run shapes, and the
  Task 4 capability projection, and ran each against
  `scripts/task-tracker/lib/github-records/record-secret-policy.mjs`. No proposed key trips
  `isSecretKey` (`COLLAPSED_SENSITIVE_FRAGMENTS` plus the `auth`/`pat` abbreviation rule). The
  plan's two specific claims hold: `accessMode` collapses to `accessmode` and is safe; `dispatchRef`
  collapses to `dispatchref`, contains `pat`, and is correctly called out as unpublishable. The
  decision to model native counters as `{ category, value }` rather than provider-shaped keys is
  what makes this work — `isSecretKey` inspects keys only, so `input_tokens` as a *value* is fine,
  and `assertNoCredentialValues`' `TOKEN_ENV_NAME_RE` does not fire on the plural `_tokens` form
  (no `\b` after `token`). Worth noting the singular form would fire; see Optional suggestion 3.
- **Read isolation.** `claimsAitmRecord` is `/&lt;!--\s*aitm-record/i`
  (`github-comment-store.mjs:157-158`) and `MARKER_RE` is `/&lt;!--\s*aitm-record(?=\s)/g`
  (`record-envelope.mjs:36`). Neither matches `&lt;!-- aitm-cost-record`, because
  `aitm-cost-record` does not contain the substring `aitm-record`. The Task 2 isolation premise is
  sound, and the Task 2 guard `/&lt;!--\s*aitm-record/i` is strictly stricter than the production
  matcher, which is the right direction.
- **Size limits.** `MAX_RECORD_JSON_BYTES = 256 * 1024` and `MAX_COMMENT_BODY_BYTES = 1024 * 1024`
  (`record-envelope.mjs:37-38`) — the plan quotes both correctly, and correctly notes the limits
  apply to the *escaped* JSON, matching `canonicalCommentRecordJson`'s `replaceAll('--', '-\\u002d')`
  expansion.
- **Snippet correctness.** All relative import depths in every code fence resolve correctly from
  their declared test-file locations (`../../../../../task-tracker/...` → `scripts/task-tracker/...`
  from a `scripts/tests/{unit,integration}/task-tracker/lib/cost/` file;
  `../../../../helpers|fixtures/...` → `scripts/tests/...`). Both example ULIDs satisfy
  `ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/`. The Task 3 assertions are arithmetically right against
  the current reader: the 8-data-cell row splits to 10 elements, so `cells[8] === '9'` and
  `fullWordMarker` is `'9'` per `parseTimingRow:88`. The Task 16 acceptance table is internally
  consistent (delivery 8.75/7.50, post-trunk 0.25/0.25, whole story 9.00/7.75, epic rollup
  11.00/9.75). The `multiplyDecimal` example (1500 @ USD 0.10/1000 = `'0.15'`) is exact.
- **Tooling.** `npm run test:unit`, `test:integration`, `format:check`, and `lint` all exist in
  `package.json`; `lint` includes `lint:story-tags`, `lint:line-cap`, `lint:test-layout`, and
  `lint:spell`, so the plan's `@story`-tag, line-cap, and test-layout constraints have real gates
  behind them.

Three issues survived verification. F1 is the one I would not merge without: it is a concrete,
demonstrable break in an already-shipped consumer, triggered by data this plan writes into a durable
GitHub artifact that other installed versions of the published package read. F2 and F3 are
specification defects in the plan's own contracts that an implementer would resolve by guessing.

## Findings

**F1 — Composed timing suffix hard-throws in already-shipped readers; the plan's ordering constraint
is in-repo only. (Task 3, Task 8, Task 16; severity: high.)**

The plan's Task 3 composed suffix places the cost comment *after* `row-sec`:

```
 &lt;!-- row-sec: a=60 i=0 --> &lt;!-- aitm-cost-event id="01ARZ..." policy="01ARZ..." -->
```

The current lexical reader is anchored at end-of-line:

```js
// scripts/task-tracker/lib/timing-row-reader.mjs:15
const TRAILING_ROW_SEC_RE = /(\s*&lt;!--\s*row-sec:\s*a=-?\d+\s+i=-?\d+\s*-->)(\s*)$/;
```

With a trailing cost comment, `(\s*)$` cannot match, so `splitTimingRowMarker` falls to its
no-match branch and returns `{ core: <entire row>, marker: '' }` (lines 62-67). `parseTimingRow`
then propagates `marker: ''`. `readEstimationStageTiming` reads `row.marker` for `row-sec`, finds
nothing, and **throws**, not degrades:

```js
// scripts/task-tracker/lib/timing-row-reader.mjs:130-131
const active = row.marker.match(/row-sec:\s*a=(-?\d+)/)?.[1];
if (active === undefined) throw new TypeError('timing-row-reader:estimation-row-sec');
```

That throw is not contained to a diagnostic path. `readEstimationStageTiming` is consumed by
`scripts/task-tracker/lib/estimation/runtime-adapter.mjs:1130`
(`timing: readEstimationStageTiming(timingBody.split('\n'))`), i.e. the estimation-outcome path.
Secondary consequences on an un-upgraded reader: `replaceTimingRowCells` and
`ensureTimingRowFullMarkerCell` also call `splitTimingRowMarker`, so with `marker: ''` they treat the
composed suffix as trailing *cell* content — `ensureTimingRowFullMarkerCell` then sees
`cells.length >= 10` where it should see a 7-column row, and silently declines to insert the
full-marker cell.

The plan is aware of the in-repo half of this. Delivery order states "Tasks 2 and 3 are hard
prerequisites for Task 8", the Global Constraints say "Read timing suffixes and isolate cost records
before enabling any writer", and acceptance case 8 covers composed-suffix survival. **All of that is
scoped to this repository's own code at a single head.** It does not address the axis that actually
matters here: `@kburson/ai-task-manager` is a published package (`package.json` `name`,
`publishConfig.access: "public"`, `bin: { aitm, ai-task-manager }`) installed into other projects,
and a Timing Log is a *shared durable GitHub artifact*. The moment one project running the new
writer stamps a cost marker onto issue #N's Timing Log, any other checkout or project with an older
installed version that reads that same issue throws. The writer and the reader are not the same
deployment and cannot be ordered by a task sequence inside one plan.

Failure scenario, concretely: project A upgrades and enables `costAccounting`, works issue #1719, and
emits `| 2026-09-21 00:00:00 +00:00 | develop:completed | 1 | 0 | 3 | 3 | work | 9 | &lt;!-- row-sec: a=60 i=0 --> &lt;!-- aitm-cost-event id="01ARZ3NDEKTSV4RRFFQ69G5FAV" policy="01ARZ3NDEKTSV4RRFFQ69G5FAW" -->`.
Project B (or a stale worktree, or CI pinned to the previous release) runs `aitm close 1719` on the
same issue. `runtime-adapter.mjs:1130` calls `readEstimationStageTiming`, which throws
`timing-row-reader:estimation-row-sec` on that row. Estimation outcome recording fails on a row
whose `row-sec` evidence is present and valid and which the new reader parses fine.

Note that this is a *choice*, not a constraint. Emitting the cost comment **before** `row-sec`
(`... | 9 | &lt;!-- aitm-cost-event ... --> &lt;!-- row-sec: a=60 i=0 -->`) leaves `TRAILING_ROW_SEC_RE`
matching at end-of-line, so old readers keep `marker` populated, `readEstimationStageTiming` keeps
working, and the cost comment degrades to an inert trailing pseudo-cell rather than an exception.
That ordering has its own cost — `parseTimingRow`'s `cells` array picks up a trailing element and
`ensureTimingRowFullMarkerCell`'s `cells.length < 10` test needs care on 7-column rows — so I am not
asserting it is the right answer. I am asserting the plan picked the ordering that maximizes
old-reader breakage without recording that it considered the tradeoff.

**F2 — `capacity` names two incompatible shapes inside Task 14, and the snippet contradicts the prose.
(Task 14, Task 1; severity: medium.)**

Task 1's subscription payload declares a `capacity` field, and Task 14's prose says "Capacity is an
array of `{ category, purchased, unit }` or null". Task 14's own worked example passes a bare decimal
string into a parameter of the same name:

```js
calculateSubscriptionUtilization({ capacity: '100', usage: '40', coverage: 'complete' })
```

The qualifier "for one declared capacity unit" on the signature is the only hint that this parameter
is a per-unit scalar rather than the record-level array. The names also diverge from the array's own
field: the array element's magnitude is `purchased`, not `capacity`.

Failure scenario: an implementer wires `periodRecord.capacity` — the validated Task 1 payload field,
an array — straight into `calculateSubscriptionUtilization({ capacity })`, which is the reading the
shared name invites. With an array argument, either the function throws on a shape it documented as
its own field type, or a permissive `BigInt`/decimal coercion of `['{...}']` silently yields a wrong
utilization percentage on a report the plan elsewhere insists must never present an
undefensible number.

Secondarily, `percentage: '40.00'` fixes a 2-decimal scale and `remaining: '60'` an integer scale,
but neither scale nor rounding mode is stated for utilization. Task 6's rounding contract is
explicitly scoped to money "at its stated billing unit", so it does not reach this. 40/100 is
exact and hides the gap; 1/3 of a capacity does not.

**F3 — `consumption`, the feature's primary measured output, has no declared shape in the report
schema. (Task 12; severity: medium.)**

`aitm.story-cost-report/v1` is declared as
`{ issue, asOf, coverage, consumption, estimated, actual, residuals, stages, delivery, postTrunk, wholeStory, children, diagnostics }`.
The plan then defines only three of those: `coverage` is `{ status, missing, diagnostics }`,
`actual`/`estimated` are currency-keyed maps of `{ amount, status, missing }`, and each boundary
carries independent `actual`/`estimated` plus coverage. `consumption`, `residuals`, `stages`, and
`children` are named and never given a shape.

`consumption` is the one that matters. It is the native quantity view — the measured token and
operation counters that the entire capture pipeline (Tasks 5, 7, 9) exists to produce, and the only
view that is defensible when no rate card applies. It is also the view most exposed to the plan's own
hardest invariants: per-category status, `exact` vs `aggregate` vs `estimated-consumption` precision,
and the rule that estimated consumption must stay separate from measured. Every one of those needs a
declared field to live in, and none is specified. The Task 12 snippet asserts `report.actual` and
`report.estimated` are `{}` for a null snapshot but says nothing about `consumption`, so even the
"unavailable" shape is undefined — is it `{}`, `null`, `[]`, or a category-keyed map mirroring the
currency-keyed money maps?

Failure scenario: two tasks implement against this independently — Task 12 builds `consumption` as a
category-keyed map of quantity strings, Task 14's `usageRefs`/`acceptedUsage` import path and the
Task 16 harness expect an array of Counter entries — and the mismatch surfaces only in the Task 16
end-to-end assertions, after Tasks 12 and 14 have each shipped with their own tests green. This is
precisely the class of defect the plan's own self-review item ("Check exact file paths, exported
signatures, payload field names, status vocabularies") is supposed to catch, and it did not.

## Required changes

1. **(F1) Add an explicit cross-version compatibility constraint for the composed timing suffix, and
   justify the suffix ordering.** Specifically: (a) record in Task 3 that the timing row is a shared
   durable artifact read by other installed versions of the published package, not only by this
   repository's head; (b) state and justify the chosen order of `row-sec` and the cost comment,
   including whether emitting the cost comment before `row-sec` was considered and why it was
   rejected — the current order is the one that turns an old reader into a throw; (c) if the current
   order stands, add a stated minimum package version required to *read* an issue that has cost
   markers, and add an acceptance row asserting the failure mode of a pre-Task-3 reader is
   characterized rather than incidental; (d) add an explicit note to the Task 16 rollout section that
   enabling capture on an issue commits every consumer of that issue to the upgraded reader.
2. **(F2) Disambiguate `capacity` in Task 14.** Give the `calculateSubscriptionUtilization` parameter
   a distinct name from the Task 1 payload field (e.g. `purchased`, matching the array element), or
   state explicitly that it accepts a single array element and show that in the snippet. Add the
   scale and rounding mode for `percentage`, and add a non-terminating example (capacity 3, usage 1)
   so the rounding rule is pinned by a test rather than by the implementer.
3. **(F3) Declare the full `aitm.story-cost-report/v1` shape in Task 12.** At minimum give
   `consumption` an exact shape — including how per-category precision (`exact` / `aggregate` /
   `estimated-consumption`) and per-category status/missing are carried, and how measured quantities
   stay separated from estimated ones — and extend the Task 12 null-snapshot snippet to assert its
   unavailable form. Do the same for `residuals`, `stages`, and `children`.

## Optional suggestions

1. **State the per-story cost-record volume.** The plan appends one immutable GitHub comment per
   timing event. A two-session story with repeated Develop visits, pause/resume, rework, review, and
   Done — exactly the Task 16 scenario — plausibly produces dozens of events, each becoming a visible
   issue comment with validated prose. Enumeration is not the constraint (`MAX_ISSUE_COMMENT_PAGES
   = 1000` at `ISSUE_COMMENT_PAGE_SIZE = 100` gives ample headroom), but human readability of the
   issue thread and per-lifecycle-action write volume are. Worth stating an expected record count for
   a representative story and confirming the ratified spec intends no batching, so the number is a
   decision rather than an emergent surprise at pilot.
2. **State the added wall-clock budget per lifecycle action when enabled.** Task 4 defaults
   `observationTimeoutMs: 1000` and `captureTimeoutMs: 3000`, and Task 8's transaction runs
   observation, atomic freeze, keyed timing append with read-back, and cost append with read-back
   inline. Capture correctly cannot *fail* a lifecycle action, but it can slow every `start`, `pause`,
   `resume`, and state move by seconds. A stated latency budget — and an explicit decision on whether
   capture may defer to the existing queue path rather than run inline — would make the pilot
   measurable.
3. **Pin the plural native-counter vocabulary as a contract, not a convention.** The Task 1 fixture
   vocabulary (`input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`,
   `output_tokens`, `reasoning_output_tokens`) is safe under `assertNoCredentialValues` only because
   `TOKEN_ENV_NAME_RE` requires a word boundary after `TOKEN`, which the trailing `s` denies. A future
   adapter contributing a singular `input_token` category would be rejected as a credential
   signature, with an error that points at the secret policy rather than at the vocabulary. A short
   note in the Task 1 vocabulary step, plus a test asserting the singular form is rejected, would
   make that boundary deliberate.
4. **Name the `.git/aitm-cost/` durability tradeoff.** Storing the outbox under the clone's common
   Git directory is a reasonable way to share state across worktrees, and the plan already handles the
   second-checkout case (acceptance case 6). It is worth stating explicitly that a re-clone discards
   pending frozen-but-undelivered items, and that this is accepted because the coverage inventory
   surfaces them as missing rather than because they are recoverable.

## Decision

revisions-requested
