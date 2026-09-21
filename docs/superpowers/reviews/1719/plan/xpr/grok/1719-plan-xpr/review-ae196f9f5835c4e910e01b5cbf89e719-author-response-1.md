<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-ae196f9f5835c4e910e01b5cbf89e719"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-21-1719-story-token-cost.md"
artifact_commit: "c091cc69588e291a4138de6a48963f065e45926c"
artifact_blob: "6e7adb4f0c1d08b4da65f5be9ce7247a3abc3d8e"
artifact_digest: "sha256:9fbb7a233dc77a5076696f68519232bbcad105da9b2fb99b86f0753acf657f37"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:d78c2a09ded87e11849e5782e5dc9f11f9362b3d13572c3a6ee75c071435c779"
  identity_source: "runtime"
started_at: "2026-09-21T10:19:44.198Z"
submitted_at: "2026-09-21T10:45:47.879Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002","R1-F003"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revised the implementation plan in response to the submitted Grok 4.6 round-one review. All three required findings are accepted and addressed. The revision also incorporates independently verified findings from two preserved, unsubmitted Claude drafts, with the incorrect portion of one draft explicitly declined below. The ratified specification is unchanged. This is plan review only; implementation and live provider access remain unapproved.

## Finding dispositions

### R1-F001 — Accepted and addressed

Task 4 now explicitly adds the disabled `costAccounting` object to `config.mjs:DEFAULTS` and `TYPES`, and tests actual `loadConfig` project/user/default precedence and `setConfigValue`. It requires nested exact-key and secret-policy validation before policy publication, while malformed economic configuration disables capture with bounded diagnostics rather than failing lifecycle config loading. Both omitted config and the new disabled default must retain existing timing/output behavior. Verified against the DEFAULTS-only merge in `config.mjs:310–324` and the unknown-key rejection in `setConfigValue`.

### R1-F002 — Accepted and addressed

Task 8 now names `appendCostTimingMarker` as the sole enabled producer, after the existing seconds writer; low-level timing append preserves the prepared bytes. Task 3 includes `gh-timing-comment.mjs:resumedBoundaryFrom`, the lexical seconds replacement helper, and explicit rollup delegation to `parseTimingRow`. Tests cover malformed suffix pipes, legacy transition metadata, three-marker ordering, and preservation during seconds recomputation. Runtime marker-literal audit forbids competing grammars outside the lexical leaf. Verified the independent seconds replacement in `gh-timing-comment.mjs:521–532` and private rollup parser.

### R1-F003 — Accepted and addressed

Task 2 defaults to 60,000 UTF-8 bytes, validates the caller limit and clamps it to the smallest transport maximum. A caller can narrow but never widen that limit. Tests cover omitted limits, an attempted 1 MiB override, invalid limits, escaping and Unicode prose. Task 7 requires successful codec rendering before frozen state commits; oversized evidence becomes a bounded unavailable result, or an explicit missing event if even the diagnostic envelope cannot fit. Replay preserves the already validated bytes and never enlarges the budget.

## Changes made

The four Grok optional suggestions are addressed: the single-unit utilization argument is `purchased`; the offline/default versus explicit-refresh interpretation of the spec is documented; implementation commits and executable story tags must use the subsequently approved implementation issue; rollup parsing delegates to the common lexical leaf.

Additional verified corrections from preserved Claude drafts:

- Draft `review-b2c4761e80750ae12439cd4c60c7a30c`, findings F1–F3: define the reader-only release and shared-issue fleet rollout boundary before enabling writers; distinguish payload capacity arrays from scalar purchased quantities and pin percentage rounding; define the complete report shape, including measured versus estimated consumption, residuals, stage visits, child projections and missing-snapshot output.
- The compatibility deployment prerequisite includes Task 10's new optional delivery-payload reader, not just timing/cost-comment readers. A versioned, project-local rollout manifest records the actual published reader version/commit and identified consumers; absent or invalid attestation keeps capture disabled. This is an operator inventory, not a claim that all installations can be discovered automatically. The exact published release number is recorded at release time rather than fabricated in this plan.
- Draft `review-44501296dc448c4bba3008584b7fe1c8`, first finding: add the omitted `heal-timing-log.mjs:renderCompletedRow`, which currently discards the suffix when recomputing seconds. Require exact preservation of transition and cost metadata. Synthetic historical interval rows intentionally receive no fabricated cost IDs.
- That draft's second finding is accepted for the missing transition grammar: canonical order is optional existing transition marker, seconds, then cost. Existing data-column indices, cell counts and legacy migration output bytes remain stable; the trailing pseudo-cell's metadata moves into the suffix return value.
- Both drafts' size-limit concern is covered by the submitted Grok finding. Optional improvements pin the safe plural category vocabulary, clarify context-injected runtime functions, document common-Git-directory loss, and add record-volume and action-latency measurements to pilot evidence.
- The capture deadline covers added economic work and defers frozen publication when time remains insufficient. The plan explicitly discloses synchronous filesystem durability's bounded-size I/O limitation rather than claiming a hard wall-clock guarantee over a blocked filesystem.

Both Claude drafts remain unsubmitted evidence; neither supplies protocol acceptance. Their complete originals are preserved under their original review directories. Their additional corrections are presented here for Grok's next independent review.

## Declined changes and rationale

No submitted Grok required change is declined.

The second Claude draft claimed moving transition metadata into the suffix changes `cells.length` and necessarily changes seven-column full-marker migration output bytes. That part is incorrect: splitting the same table prefix at the final delimiter retains the trailing empty cell, and reinserting the untouched suffix produces exactly the current `ensureTimingRowFullMarkerCell` output. A direct assertion against the existing export passed. The plan therefore retains byte compatibility and tests it explicitly; it does not authorize the suggested historical byte change.

The first Claude draft suggested considering cost-before-seconds ordering. The ratified spec explicitly mandates seconds first. We retain that wire contract and require the reader-only rollout before enabled writers, including every known consumer of the shared GitHub issue. Unknown consumers keep capture disabled. A downstream deployment choosing to run an unverified old reader remains an explicitly unsupported configuration.

## Verification

- Worktree verification passed: Node 26.8.1 and the local `node_modules/ai-task-manager -> ..` self-link.
- Targeted Markdown lint using the repository rule configuration returned an empty issue array for this plan. The CLI wrapper's zero-file summary was not used as the verification evidence.
- CSpell checked the plan with zero issues; Prettier check passed.
- All 17 JavaScript snippets passed `node --check`. These are illustrative future implementation tests, not executed runtime tests.
- Direct existing-code assertions reproduced the pre-upgrade estimation reader failure on a composed cost suffix and proved byte-identical seven-column transition migration.
- Ratified spec SHA-256 remains `1a47930a8c54c29d64b6b06abca9f1291d3d6f9362e6d7289b58ef18e9b990a9`.
- No production accounting code, provider credentials, billing access, issue-state transition, or historical backfill is included.
