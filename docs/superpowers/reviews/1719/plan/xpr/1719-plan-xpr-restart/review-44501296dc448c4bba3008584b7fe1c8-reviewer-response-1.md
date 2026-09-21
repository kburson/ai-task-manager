<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-44501296dc448c4bba3008584b7fe1c8"
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
  session_fingerprint: "sha256:4aa0d45bb7040d29c7a97689c83641cd376d258409fa8f4b1bff45cecff582af"
  identity_source: "declared"
started_at: "2026-09-21T09:53:16.097Z"
submitted_at: null
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Scope of this review: the plan artifact at `docs/superpowers/plans/2026-09-21-1719-story-token-cost.md` (artifact commit `c091cc69`), read in full (716 lines), with its factual claims about the existing repository verified by reading the named source files in this worktree. This is turn 1 of the restarted plan XPR; there is no prior author response to answer.

The plan is unusually strong on the dimensions that normally sink an accounting design. Verified positives:

- **Every named integration anchor exists.** All 31 files listed under "Current repository anchors" and in the per-task **Files** headers resolve. Every named existing function resolves: `buildRow`/`buildFlushRow`/`postTimingEvent` (`scripts/task-tracker/gh-timing-comment.mjs:127,287,732`), `splitTimingRowMarker`/`parseTimingRow`/`replaceTimingRowCells`/`ensureTimingRowFullMarkerCell` (`scripts/task-tracker/lib/timing-row-reader.mjs:60,70,92,113`), `withIssueLock`/`isIssueLockHeld` (`scripts/task-tracker/issue-mutator-lock.mjs:248,114`), `assertNoSecretRecordData` (`scripts/task-tracker/lib/github-records/record-secret-policy.mjs:90`), `canonicalRecordJson` (`canonical-json.mjs:97`), `resolveLifecycleGateEvidence` (`lifecycle-gate-source.mjs:215`), `countWords` (`word-counter.mjs:235`). `flushActiveToGH` and `safePostTiming` exist as runtime context members rather than named exports, which matches how the plan uses them.
- **Record isolation actually holds, across all three live claimants.** (This response avoids reproducing bare comment-opener sequences; read the regexes at the cited lines directly.) `claimsAitmRecord` (`github-comment-store.mjs:157-158`), `MARKER_RE` (`record-envelope.mjs:36`, which adds a trailing-whitespace lookahead), and the independent copy at `scripts/reports/generate-value-report.mjs:307` all require the literal `aitm-record` immediately after the comment opener and optional whitespace. None can match a body whose marker name is `aitm-cost-record`, because the match fails at the fifth character of the name and backtracking the whitespace to zero width fails sooner. Task 2's isolation premise is therefore correct and does not depend on new guard code in the generic reader. The evidence-v2 namespace `aitm-evidence-record` (`evidence-v2/journal.mjs:27`) is likewise disjoint, and the reverse direction is equally safe.
- **The Task 2 escaping snippet is byte-identical to production.** `canonicalRecordJson(envelope).replaceAll('--', '-\\u002d')` reproduces `canonicalCommentRecordJson` exactly (`record-envelope.mjs:261-267`), and the `256 * 1024` / `1024 * 1024` constants match `MAX_RECORD_JSON_BYTES` / `MAX_COMMENT_BODY_BYTES` (`record-envelope.mjs:37-38`).
- **The secret-policy claims are correct, including the trap.** `isSecretKey` collapses to lowercase alphanumerics and rejects on `includes('pat')` (`record-secret-policy.mjs:41-68`), so `dispatchRef` → `dispatchref` is genuinely rejected and `accessMode` / `runRef` are genuinely safe — exactly as Task 1 states. The Counter `{category, value}` shape also correctly keeps `input_tokens` etc. out of key position; as values they escape `TOKEN_ENV_NAME_RE` because that pattern requires a word boundary immediately after `TOKEN`, and every fixture category ends in `s`.
- **Task 3's assertion block is arithmetically correct against the current reader.** For the proposed row, `core.split('|')` yields 10 cells, so `parseTimingRow(row).fullWordMarker === '9'` via the `cells.length >= 10 ? cells[8]` branch (`timing-row-reader.mjs:88`), index `7` is the Description cell, and `readEstimationStageTiming` reads `a=60` → `60000` from the unanchored `/row-sec:\s*a=(-?\d+)/` match (`timing-row-reader.mjs:130`).
- **Task 16's acceptance arithmetic is internally consistent.** Delivery estimated `6.00+1.25+0.50+1.00 = 8.75`, actual `5.00+1.00+0.50+1.00 = 7.50`; whole story `9.00`/`7.75`; epic rollup `11.00`/`9.75`; subscription `20.00` excluded from both. Task 6's `1500 × 0.10 / 1000 = '0.15'` and Task 14's `40/100 → '40.00'`, remaining `'60'` also check out.
- **Validation commands and gates exist.** `test:unit`, `test:integration`, `lint`, `format:check` are real scripts (`package.json:22,23,38,51`); `lint:line-cap` is real (`package.json:48`, soft 400 / hard 800 in `scripts/tests/tools/audit-line-cap.mjs:12-13`), so "the repository line cap" is a concrete gate; `scripts/dev-env/setup-local-worktree.sh` and `verify-local-worktree.mjs` both exist.
- **Test import depths are right.** Five `../` from `scripts/tests/unit/task-tracker/lib/cost/` lands on `scripts/`, and four `../` from `scripts/tests/{unit,integration}/task-tracker/lib/cost/` lands on `scripts/tests/`. Every snippet in Tasks 1, 4, 5, 6, 9, 10, 12, 13, 14, 15, 16 uses the correct depth.
- **The git-common-dir choice has precedent.** `scripts/task-tracker/lib/evidence-v2/execution-context.mjs:128-131` already resolves `rev-parse --path-format=absolute --git-common-dir` and enforces containment, so Task 7's durability root is consistent with existing practice rather than a new invention, and is distinct from the `.scratch/` prohibition in `CLAUDE.md`.

Two defects survive verification, both in Task 3, and both would destroy cost evidence in normal operation rather than in an edge case. A third is a smaller hardening gap in Task 2. Everything else I checked held up.

## Findings

### R1-F001 — Task 3 omits `lib/heal-timing-log.mjs`, whose `renderCompletedRow` discards the row suffix and would silently delete published cost markers

Severity: required. Confirmed by source reading.

Task 3's **Files** list names `heal-timing-sweep.mjs`. That is the sweep orchestration module. The pure healing transform is a *different* file — `scripts/task-tracker/lib/heal-timing-log.mjs` — and it appears in no task's file list anywhere in the plan (verified: the string `heal-timing` occurs in the artifact only at lines 171 and 192, both naming `heal-timing-sweep`).

That omitted file contains the single most dangerous call site for this feature:

```js
// scripts/task-tracker/lib/heal-timing-log.mjs:311-321
function renderCompletedRow(line, { activeSec, idleSec, deltaWords }) {
  const { core } = splitTimingRowMarker(line);
  ...
  return rewritten + ' ' + formatRowSecMarker({ activeSec: aSec, idleSec: iSec });
}
```

It destructures `core` only, discards `marker` entirely, and re-synthesizes a row-sec-only tail from computed values. Under the plan's composed grammar, healing any `:completed` row — the exact rows `cachedRowSecDrifts` (`heal-timing-log.mjs:340-345`) targets after a retroactive departure-row insertion, which is routine in this repository — silently deletes the `aitm-cost-event` marker while leaving the cost envelope published on the issue.

The consequence is not a cosmetic byte change. It severs the timing↔cost key that Task 12's independent coverage inventory is built on ("Build the expected inventory from timing/policy/session/run/delivery authority before considering present cost records"). The healed row disappears from the expected-marker set, the published envelope becomes an unattributable orphan, and acceptance case 6 ("second checkout sees ten markers/eight envelopes and cannot certify completeness") silently inverts into eight markers and ten envelopes — a state the plan never contemplates. The Global Constraint "Read timing suffixes and isolate cost records before enabling any writer. Missing or corrupt economic evidence must never weaken or poison governance validation" is not satisfied by a file the plan does not touch.

`scripts/task-tracker/lib/heal-timing-interval.mjs:189` has a smaller instance of the same class: it builds an inserted row with a hard-coded row-sec-only `a=0 i=0` comment tail. That one is defensible (an inserted synthetic row has no cost event), but it should be an explicit decision in the plan, not an accident of omission.

For contrast, two nearby call sites I checked are genuinely safe and should *not* be changed: `parseRowSecMarker` matches `ROW_SEC_RE` (`timing-rows.mjs:34`), which is unanchored and so still matches inside a composed suffix; and `heal-timing-departure.mjs:165` tests `row.marker` with an unanchored `/row-sec:\s*a=0\s+i=0\b/`, which also survives.

### R1-F002 — The "one composed-suffix grammar" does not account for the existing `aitm-transition` suffix marker, and the cell-index no-change guarantee is false for transition rows

Severity: required. Confirmed by source reading.

The plan asserts "One composed-suffix grammar" (anchors table, Task 3) and models the suffix as `row-sec` followed by `aitm-cost-event`. But a third suffix comment already exists in production and is named nowhere in the artifact (verified: `aitm-transition` and `transitionId` do not occur in the plan):

At `scripts/task-tracker/lib/move-state/audit-timing.mjs:86-90`, `withTransition` splits the row with `splitTimingRowMarker`, then returns `core`, a space, an `aitm-transition move="<transitionId>"` HTML comment, and then `marker` — reproduced here in prose rather than verbatim so this response emits no bare comment-opener sequence; read the template literal at `audit-timing.mjs:89` directly.

Two distinct problems follow.

*2a — undefined three-marker ordering on a mainline path.* The emitted order today is `core`, then `aitm-transition`, then `row-sec`. Task 8 explicitly routes `lib/move-state/audit-timing.mjs` through `captureTimingEvent`, so move-state audit rows are precisely the rows that will carry all three markers. Task 3's `appendCostTimingMarker({ row, eventId, policyId })` is specified only as "rejects a second valid cost marker and preserves existing suffix bytes," with no statement of where the cost marker sits relative to `aitm-transition`, and the Task 3 fixture omits the case entirely. Two implementers will produce two different byte orders, and the Task 8 disabled-compatibility golden-output test cannot adjudicate between them because the disabled path never appends a cost marker.

*2b — the cell-index invariant is false for transition rows.* Task 3 states "All existing cell indices and `row-sec` behavior remain unchanged." Today, because `TRAILING_ROW_SEC_RE` (`timing-row-reader.mjs:15`) is anchored at `$`, a transition marker is *not* split off — it falls inside `core` and lands in the final cell after `core.split('|')`. Replacing that regex with the planned "suffix scanner after the final table pipe" moves the transition comment from a cell into `marker`, which changes both `cells.length` and the trailing cell's content for every historical transition row. That is observable, not theoretical: `ensureTimingRowFullMarkerCell` branches on `cells.length < 10` and splices at index 8 (`timing-row-reader.mjs:117`). For a legacy seven-column transition row, today's output ends `…| desc | — |` followed by the transition comment *inside the cell region*, then the row-sec comment; after the scanner change the row ends `…| desc | — |` with both comments moved out into the marker region. Both parse, but the bytes differ, so the #1142 full-word-marker migration output changes for exactly the rows Task 3's last bullet promises to leave alone ("Extend rewrite tests to preserve the composed suffix and old missing-full-column migration").

### R1-F003 — Task 2's `maxBodyBytes` is caller-supplied with no floor, so the conservative 60,000-byte GitHub body budget is advisory rather than enforced

Severity: required. Confirmed by source reading.

The Global Constraints require "an additional conservative 60,000 UTF-8-byte GitHub body budget" and "Apply the smallest limit to the final rendered body." Task 2 then exposes `renderCostRecord({ envelope, visibleMarkdown, maxBodyBytes })` and enforces only:

```js
if (Buffer.byteLength(json) > 256 * 1024 || Buffer.byteLength(body) > maxBodyBytes) {
  throw new TypeError('cost:record-size');
}
```

Nothing clamps `maxBodyBytes`. Any caller passing `1024 * 1024` — the value a reader of `record-envelope.mjs:38` would naturally reach for — silently defeats the conservative budget, and the failure surfaces as a GitHub API rejection at append time, after the outbox has already frozen an unpublishable body. Because Task 7 freezes the exact body and Task 8 replays it verbatim, an oversized frozen item is permanently undeliverable and can only be cleared through Task 13 reconciliation; the plan's own rule "A batch that cannot fit is incomplete, not repeatedly attempted forever" depends on the limit being right at freeze time.

## Required changes

1. **R1-F001** — Add `scripts/task-tracker/lib/heal-timing-log.mjs` to Task 3's **Files** list and `scripts/tests/unit/task-tracker/lib/heal-timing-log.test.mjs` to its test list. Rewrite `renderCompletedRow` to preserve the full `marker` and restamp only the `row-sec` element within it (the natural leaf helper is a `replaceRowSecInMarker`-style function beside `appendCostTimingMarker`, so no consumer regains its own suffix grammar). Add an explicit Task 3 step asserting that healing a `:completed` row which carries a composed `row-sec` + `aitm-cost-event` suffix restamps the seconds and returns the cost marker byte-identical. Also state the deliberate decision for `heal-timing-interval.mjs:189` — that a synthetically inserted row carries no cost marker — so its row-sec-only tail is a recorded choice rather than an unreviewed one.

2. **R1-F002** — Name `aitm-transition` in the Task 3 grammar and fix both halves of the gap:
   - Define the canonical suffix element order for the three-marker case and state where `appendCostTimingMarker` inserts relative to an existing `aitm-transition` comment. Add a Task 3 fixture carrying `aitm-transition` + `row-sec` + `aitm-cost-event` together, and a Task 8 step covering a move-state audit row that acquires all three.
   - Replace the blanket "All existing cell indices and `row-sec` behavior remain unchanged" with the accurate statement: cell indices are unchanged for rows whose suffix is row-sec-only, while transition-bearing rows move the transition comment out of the final cell and into `marker`. Add an explicit `ensureTimingRowFullMarkerCell` regression step covering a legacy seven-column transition row so the byte change in the #1142 migration output is a reviewed, asserted outcome rather than a surprise in Task 8's golden-output comparison.

3. **R1-F003** — Enforce the 60,000-byte budget inside the codec rather than trusting the caller: clamp to `Math.min(maxBodyBytes ?? COST_BODY_BUDGET, COST_BODY_BUDGET, MAX_COMMENT_BODY_BYTES)` (or drop the parameter and export the constant), and add a Task 2 codec test proving an oversized `maxBodyBytes` argument cannot widen the effective budget.

## Optional suggestions

1. Task 3's snippet asserts `readEstimationStageTiming([row]).stagesMs.develop` but the surrounding **Interfaces** paragraph never lists `readEstimationStageTiming` among the functions Task 3 touches. It is a real export (`timing-row-reader.mjs:121`) and the assertion is correct; adding it to the interface list would keep the "exact exported signatures" self-review bullet honest.

2. The anchors table entry for `runtime.mjs` cites `flushActiveToGH` and `safePostTiming` as though they were module exports. They are context/dependency members (`verbs/resume.mjs:150`, `verbs/review.mjs:635`). A parenthetical noting they are injected through the runtime context would prevent an implementer from hunting for a nonexistent named export.

3. Task 7 requires refusing ambiguous git-common-dir resolution. `evidence-v2/execution-context.mjs:128-132` already pairs `realpathSync` with a `containedBy` check and a `shared-git-common-directory` refusal. Citing that as the pattern to mirror would save the implementer from designing a second, subtly different refusal.

## Decision

revisions-requested
