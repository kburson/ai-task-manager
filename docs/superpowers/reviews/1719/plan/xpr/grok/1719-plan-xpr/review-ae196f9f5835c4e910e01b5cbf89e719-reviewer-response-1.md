<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-ae196f9f5835c4e910e01b5cbf89e719"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-21-1719-story-token-cost.md"
artifact_commit: "c091cc69588e291a4138de6a48963f065e45926c"
artifact_blob: "6e7adb4f0c1d08b4da65f5be9ce7247a3abc3d8e"
artifact_digest: "sha256:9fbb7a233dc77a5076696f68519232bbcad105da9b2fb99b86f0753acf657f37"
agent:
  host: "grok"
  provider: "xai"
  model_id: "grok-4.6"
  model_display: "Grok 4.6"
  session_fingerprint: "sha256:3ab0a439a9151f60b926abcd59504dc030a6e60d8764f607d70bcaaafce77d3c"
  identity_source: "runtime"
started_at: "2026-09-21T10:29:53.109Z"
submitted_at: "2026-09-21T10:43:22.002Z"
finding_ids: ["R1-F001","R1-F002","R1-F003"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Independent plan review of `docs/superpowers/plans/2026-09-21-1719-story-token-cost.md` against the ratified spec (`docs/superpowers/specs/2026-09-20-1719-story-token-cost-design.md`, SHA-256 `1a47930a8c54c29d64b6b06abca9f1291d3d6f9362e6d7289b58ef18e9b990a9`, matching the accepted spec XPR digest) and the current task-tracker code at the sealed artifact commit.

The plan is a strong implementation contract: closed payload shapes, isolated `aitm-cost-record` transport, composed timing-suffix leaf, freeze-before-publish identity, nonblocking capture, independent coverage, and a 1:1 map of the spec’s thirteen accounting failure cases. Delivery order correctly hard-gates Tasks 2 and 3 before any enabled writer (Task 8). Cited existing ports exist: `splitTimingRowMarker` / `parseTimingRow` / `replaceTimingRowCells` / `readEstimationStageTiming` in `scripts/task-tracker/lib/timing-row-reader.mjs`; `withIssueLock` / `isIssueLockHeld`; `claimsAitmRecord` / `resolveLifecycleGateEvidence`; `postTimingSafely`; context `safePostTiming` and `flushActiveToGH`; current `postTimingEvent(` call sites are exactly the files Task 8 lists plus the low-level definition.

It is not implementable as written in three places that would violate the spec or silently disable the feature. Revisions are required.

Verification (file reads and content search only; no Git commands): spec digest in the plan matches the accepted spec XPR digest `sha256:1a47930a8c54c29d64b6b06abca9f1291d3d6f9362e6d7289b58ef18e9b990a9`; Task 16 maps spec failure cases 1–13 with no missing case; live `postTimingEvent(` call sites are `hook-handler.mjs`, `runtime.mjs` queue drains, `review-approval-timing.mjs`, `move-state/guard-execution.mjs`, `move-state/audit-timing.mjs`, `verbs/review.mjs`, and `timing-post-outcome.mjs`, matching Task 8 plus the low-level export; `flushActiveToGH` posts via `ctx.safePostTiming` → `postTimingSafely`; `claimsAitmRecord` (`/&lt;!--\s*aitm-record/i`) does not match `&lt;!-- aitm-cost-record`; `dispatchRef` is correctly rejected (`pat` inside collapsed `dispatchref`); current `splitTimingRowMarker` requires a terminal `row-sec` (`TRAILING_ROW_SEC_RE` `$` anchor), so the Task 3 composed suffix is not preserved today.

## Findings

### R1-F001 — Task 4 config shape is dropped by `loadConfig` unless it is a `DEFAULTS` key

`scripts/task-tracker/config.mjs` merges only keys already present on `DEFAULTS` (lines 310–324). Unknown project/user keys are ignored. `setConfigValue` refuses unknown keys (lines 388–390). `TYPES` has no `costAccounting` entry.

Task 4 tells the implementer to add the JSON object to “config validation and precedence tests” and “Do not enable it in the repository's active configuration.” The disabled-policy unit test passes `config: {}` into `resolveCostPolicy`, which never exercises `loadConfig`. An implementer can satisfy the written tests by validating a hand-built object and never adding `costAccounting` to `DEFAULTS`/`TYPES`. A real project config with `"costAccounting": { "enabled": true, ... }` would then be silently stripped, capture would stay disabled, and there would be no invalid-enabled diagnostic.

This also leaves adapter/credential-shaped nested keys unvalidated at the config boundary. The plan forbids credentials in tracked config, but `TYPES` `object` coercion accepts any JSON object.

**Required:** Add a disabled `costAccounting` object to `DEFAULTS` and a matching `TYPES` entry (object). Keep repository-active config disabled by that default, not by omitting the key. Add a `loadConfig` precedence test that writes the Task 4 JSON to a project config fixture and asserts the object is present, still `enabled: false` unless explicitly set, and that secret-shaped / unknown nested keys fail closed before policy publication. Invalid enabled config must be declined by `resolveCostPolicy` after a successful load, not lost before it.

### R1-F002 — Task 8 never binds the Task 3 suffix writer, so capture can invent a second marker grammar

The spec forbids competing cost-marker grammars. Task 3 correctly places `appendCostTimingMarker({ row, eventId, policyId })` in `timing-row-reader.mjs` and requires every rewrite/heal/rollup/backfill/review consumer to go through that leaf.

Task 8 is the only enabled writer of new keyed rows. Its interface takes an already-built `row`, returns `{ row, eventId, ... }`, and never names `appendCostTimingMarker`. The disabled snippet asserts `result.row === row`. The enabled path must attach `&lt;!-- aitm-cost-event id="..." policy="..." -->` after `row-sec`. Nothing stops `capture.mjs` from string-concatenating that comment, duplicating the grammar that Task 3 already owns.

Current `splitTimingRowMarker` only matches a *terminal* `row-sec` comment (`TRAILING_ROW_SEC_RE` ends with `$`). A cost comment after `row-sec` today makes the suffix parser return `marker: ''` and can pull comments into cells. Task 3 fixes the reader; Task 8 must use that same writer or the fix is incomplete.

`gh-timing-comment.mjs` still has an independent suffix rewrite in `resumedBoundaryFrom` (`replace(/&lt;!--\s*row-sec:...-->/, ...)`). That file is in Task 8’s modify list but not Task 3’s consumer list. A composed suffix must keep the cost comment byte-for-byte when row-sec seconds are zeroed.

**Required:** State that `captureTimingEvent` (and any enabled timing emitter it wraps) composes the cost suffix *only* via `appendCostTimingMarker`, after the existing `row-sec` writer, and that `postTimingEvent` remains a byte-preserving append of that already-keyed row. Route `resumedBoundaryFrom` and any other `gh-timing-comment.mjs` suffix rewrite through the same leaf. Re-assert that `rg` for cost-marker string literals outside the leaf is empty except tests and the leaf itself.

### R1-F003 — The 60,000-byte GitHub body budget is not wired into render/append

Module contracts require applying the *smallest* of: 256 KiB escaped canonical envelope JSON, 1 MiB comment body, and a conservative 60,000 UTF-8-byte GitHub body budget. Oversized evidence must become a small incomplete observation, not an endlessly retried envelope.

Task 2’s snippet only checks `256 * 1024` against escaped JSON and `maxBodyBytes` against the body. No default for `maxBodyBytes` is given. `renderAitmRecord` today uses `MAX_COMMENT_BODY_BYTES = 1024 * 1024` only. Task 8’s `appendFrozenCostRecord` does not name the 60k budget. Spec failure case 13 requires exercising rendered escaped-envelope limits, not raw payload length; Task 16 maps that case to Tasks 2 and 7, still without pinning 60k.

If capture passes 1 MiB, GitHub will 422 on a body the local freeze already committed, producing a retry loop the plan claims to forbid.

**Required:** Name a single captured constant (60,000 UTF-8 bytes unless a tighter transport bound is proven) and pass `maxBodyBytes = min(1 MiB, 60_000)` into `renderCostRecord` / freeze. A body that cannot fit is incomplete with a size diagnostic; freeze must not commit an unpublishable body; retries must not re-render a larger one.

## Required changes

1. Fix R1-F001: `costAccounting` must be a real `DEFAULTS`/`TYPES` key, disabled by default, load-tested through `loadConfig`, with nested secret/unknown-key rejection.
2. Fix R1-F002: Task 8 must use Task 3’s `appendCostTimingMarker` as the only enabled suffix writer; route `gh-timing-comment.mjs` suffix rewrites through the leaf.
3. Fix R1-F003: pin and apply the 60,000-byte GitHub body budget at render/freeze time as the effective body max.

## Optional suggestions

1. Task 14’s `calculateSubscriptionUtilization({ capacity: '100', ... })` uses a string, while the period record’s `capacity` is an array of `{ category, purchased, unit }` or null. Rename the one-unit argument (`purchased` / `unitCapacity`) so implementers do not feed the period array into the scalar helper.
2. Spec aggregation says the default `npx aitm cost #N` path also reads GitHub timing/policy/session/delivery evidence; spec security tests say “no network call from the default report path.” The plan’s offline default plus `--refresh` is a coherent resolution. Cite that conflict in the plan so later SAR/implementers do not “fix” it back to an implicit GitHub read.
3. After implementation issues are hydrated, replace example commit subjects `[#1719]` and `@story #1719` on new executable files with the implementation issue id. Fixture issue numbers inside tests may stay 1719. The plan already says #1719 is the design-and-plan deliverable; the commit templates will otherwise mis-attribute work under message-based `[#N]` tracing.
4. `timing-rollup.mjs` still uses a private `ROW_SEC_RE` and `line.split('|').slice(1, -1)` rather than `parseTimingRow`. Task 3 lists the file; add an explicit assertion that `parseTimingRows` delegates suffix extraction to the leaf so a future `|` inside a malformed cost comment cannot become cells.

## Decision

revisions-requested
