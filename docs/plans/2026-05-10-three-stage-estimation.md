# Three-Stage Estimation: Relocate Mutation to Analysis, Add Read-Only Review Delta

## Context

The repo currently runs `applyReevaluate(...)` inside `verbReview` ([scripts/task-tracker/task-tracker.mjs:740-744](scripts/task-tracker/task-tracker.mjs#L740-L744)) — i.e., as part of the boundary that moves an issue toward Validate/Review. That call **mutates** the project board's `Size` and `Estimate` fields and patches the issue body's field-DB.

This conflates two separate stages of the estimation lifecycle. Per the three-stage model:

| Stage | When | Mutates fields? | Audit |
|---|---|---|---|
| **Grooming** | Issue created with high-level estimate from story description, minimal repo inspection. | YES — initial set. | n/a (initial values) |
| **Analysis (Deep Dive)** | JIT analysis against current repo state uncovers real work + challenges grooming missed. | YES — update Size/Estimate to reflect deep-dive findings. | Comment recording `from → to` + reason. Audit trail feeds future grooming calibration. |
| **Review / Validation** | Retrospective AFTER code-complete + tests pass. 20/20 hindsight on actual effort. | **NO — never mutate.** | Comment on delta (estimated vs. actual) for future-calibration data only. |

Conflating Analysis and Review destroys the calibration signal: if Review mutates the estimate, the "we were wrong" data point that future grooming would learn from is erased. Review is a post-mortem; post-mortems describe what happened, they don't rewrite history.

**Intended outcome:** the existing `reevaluateEstimate` logic moves to the analyze→development boundary (where mutation is correct) and a new read-only delta-comment routine runs at review→done (where retrospective belongs). No field writes happen during Review under any circumstance.

---

## Design Summary

### Stage → boundary mapping

| Stage | Verb / boundary | Action |
|---|---|---|
| Grooming | issue create / `/task new` / human-set fields in Backlog→Groom | Initial Size + Estimate written. No automation change. |
| Analysis exit | `verbApprove` (analyze→development gate, [scripts/task-tracker/verbs/approve.mjs](scripts/task-tracker/verbs/approve.mjs)) | Run `reevaluateEstimate` against the Deep-Dive section. If `changed`, mutate Size + Estimate on the project board AND issue body field-DB, AND post an **audit comment** with the from→to delta and rationale. ≥2-tier jump still requires human attention (existing `requiresHuman` path). |
| Review | `verbClose` / review→done ([scripts/task-tracker/task-tracker.mjs:291](scripts/task-tracker/task-tracker.mjs#L291)) | Run a NEW read-only routine that compares the (now-final) Estimate against `Actual Session Time` from the project board and posts a **delta comment**. **Never** writes to project fields or issue body. |

The boundary chosen for Review is review→done (`verbClose`), not validate→review, because:
- `Actual Session Time` is set at close (per `docs/guides/ai-value-framework.md`) — earlier boundaries don't have actual-effort data yet.
- Closing is the natural retrospective moment: tests passed, review approved, work shipped.
- It's a single chokepoint (today's `/task close`); future `/task move done` (epic #61) will inherit it.

### Audit comment format (analyze→development)

```
### 🔁 Analysis re-estimate

| Field | Before | After |
|---|---|---|
| Size | M | L |
| Estimate (h) | 8 | 16 |

Deep dive surfaced 6 file(s) to edit, 9-step plan, 3 risk(s), 2 dependency(ies) (score 14.5); bucket M→L.
```

≥2-tier jump path uses the existing `⚠ HUMAN ATTENTION` header and skips the auto-mutation, identical to today's `requiresHuman` path. Header text is `### 🔁 Analysis re-estimate` (renamed from the prior post-deep-dive label).

### Delta comment format (review→done)

```
### 📊 Review delta

| Field | Estimated | Actual | Δ |
|---|---|---|---|
| Hours | 16 | 22.5 | +40.6% |

Drivers: <bulleted list of factors mentioned in the review body, if extractable; otherwise "see review notes">
This comment is read-only — Size and Estimate fields are not modified.
```

Delta routine reads:
- `Estimate` from project board (or issue body field-DB).
- `Actual Session Time` from project board, set at close per `docs/guides/ai-value-framework.md`.
- Issue body for any "Drivers" section (optional).

If `Actual` is missing (close without timing data), comment falls back to `Hours: 16 / — / —` and notes the missing field.

### Decommission existing call site

`scripts/task-tracker/task-tracker.mjs:740-744` (the `applyReevaluate` call inside `verbReview`) is **removed**. Comment block at `:738-739` updated to reflect the new model.

`TASK_TRACKER_SKIP_REEVAL` env-var still works but its semantics shift: it now bypasses the analyze-stage mutation. Add an analogous `TASK_TRACKER_SKIP_DELTA` for the close-stage delta comment.

### Why not bundle into epic #61

Epic #61 (parallel-agent guardrails) introduces `/task move <state>` as the chokepoint that supersedes `verbApprove` / `verbReview` / `verbClose` as standalone verbs. After #61 lands, the analyze→development hook lives inside `verbs/move.mjs` keyed on target=`development`, and the review→done hook lives there keyed on target=`done`. **This epic is forward-compatible with #61**: hooking into `verbApprove` and `verbClose` today means the alias path keeps working when #61 converts those into thin aliases. No code in this epic blocks #61, and no code in #61 blocks this epic. They can land in either order.

---

## Critical Files

### New
- `scripts/task-tracker/lib/review-delta.mjs` — pure compute + comment builder for the review-time delta. Imports `ESTIMATE_HOURS` and `SIZE_TIERS` from `reevaluate-estimate.mjs`.
- `tests/review-delta.test.mjs` — coverage: estimate present + actual present, actual missing, percent calculation, no-mutation guarantee (assert no `gh issue edit` or `writeProjectFieldValue` call in the path).
- `tests/analyze-mutation.test.mjs` — coverage: verbApprove runs reevaluate, mutates fields, posts audit comment with new header; ≥2-tier still gates to human.

### Modified
- `scripts/task-tracker/lib/reevaluate-estimate.mjs` — rename `buildRationale` output to use the audit-comment header context; add `buildAuditCommentBody(result)` helper that returns the full markdown block. Pure function, no I/O. Existing exports unchanged.
- `scripts/task-tracker/task-tracker.mjs` — remove `applyReevaluate` call from `verbReview` (lines 740-744 + surrounding comment); remove the now-unused import if no other caller; add `applyReviewDelta` invocation inside `verbClose` (after the cascade-close check, before the final close so the comment lands on the still-open issue). Update `REEVAL_HEADER` constant to `### 🔁 Analysis re-estimate`.
- `scripts/task-tracker/verbs/approve.mjs` — after the human-approval gate passes and before the actual `move-state.mjs` invocation, run `applyReevaluate({ issueNum, body })`. Mutation + audit-comment behavior identical to today's review-time path; the only change is the boundary.
- `docs/guides/workflow.md` — replace lines 119-129 (the "Automated Size/Estimate re-evaluation" paragraph) with the three-stage model table + per-stage boundary description.
- `skill/SKILL.md` (or `skill/shared/SKILL.md`) — document the audit comment + delta comment surfaces so agents know what to expect at each boundary.

### Reused (do not modify)
- `reevaluateEstimate`, `buildRationale`, `parseDeepDiveSignals`, `scoreSignals`, `bucketSize` — all stay pure and exported as today.
- `applyReevaluate` function body in `task-tracker.mjs` — relocate as-is; it's already stage-agnostic. (Or move it into `verbs/approve.mjs` and import the lib; cleaner long-term.)

---

## Verification

1. **Unit: lib pure functions still pass.** `node --test scripts/task-tracker/tests/reevaluate-estimate.test.mjs` — all green; new `buildAuditCommentBody` covered.
2. **Unit: review delta.** `node --test tests/review-delta.test.mjs` — estimate+actual produces correct percent; missing actual produces fallback; comment body never contains "edit" or "mutate".
3. **Integration: analyze→development mutation.**
   - Issue with current Size=M, Estimate=8, Deep-Dive section that scores into L bucket.
   - Run `/task approve <id>` (or `/task move <id> development` once #61 lands).
   - Confirm: project board now shows Size=L, Estimate=16; issue body field-DB updated; audit comment posted with `### 🔁 Analysis re-estimate` header and from→to table.
4. **Integration: ≥2-tier jump still gates.**
   - Issue with Size=XS, Deep Dive scoring into L.
   - Run `/task approve <id>`. Expect: ⚠ HUMAN ATTENTION comment, NO field mutation, exit code informs human.
5. **Integration: review→done delta.**
   - Issue closed via `/task close <id>` with Estimate=16, Actual=22.5 set on board.
   - Confirm: `### 📊 Review delta` comment posted with `+40.6%`. Confirm: project board Size + Estimate UNCHANGED.
6. **Integration: review→done with missing actual.**
   - Close issue without `Actual Session Time` set.
   - Confirm: delta comment uses fallback wording, no crash.
7. **No leakage: review path does not mutate.**
   - Grep test asserts `verbClose` and `applyReviewDelta` never call `writeProjectFieldValue` or `gh issue edit --body`.
8. **Decommission proof.**
   - Run `/task review <id>` (validate gate). Confirm: NO `### 🔁` comment posted at this boundary, NO field mutation. Boundary now does only the body-gate validation.
9. **Workflow docs accurate.**
   - `docs/guides/workflow.md` shows the 3-stage table; no stale references to review-time re-eval.
10. **Existing test suite still green.** `npm test` — same pass set as before; no regressions.

---

## Decomposition (sub-issues)

Five sub-issues across two waves:

- **W1.1 — Library refactor: split compute from apply, add audit + delta comment builders.**
  - Adds `buildAuditCommentBody(result)` to `reevaluate-estimate.mjs`.
  - New `lib/review-delta.mjs` with `computeReviewDelta({ estimate, actual })` + `buildDeltaCommentBody(result)`.
  - Tests for both.
  - **Size: S, Estimate: 4h.** No dependencies.
- **W2.1 — Hook mutation to analyze→development; remove old review-time call site.**
  - Wires `applyReevaluate` into `verbs/approve.mjs` after the human-approval gate.
  - Removes `applyReevaluate` invocation from `verbReview` (task-tracker.mjs:740-744).
  - Updates `REEVAL_HEADER` to `### 🔁 Analysis re-estimate`.
  - **Size: M, Estimate: 6h.** Depends on W1.1.
- **W2.2 — Wire read-only delta to review→done (`verbClose`).**
  - `applyReviewDelta` invocation inside `verbClose`, before final close.
  - Reads Estimate + Actual from project board; posts delta comment; never writes.
  - Adds `TASK_TRACKER_SKIP_DELTA` bypass.
  - **Size: M, Estimate: 5h.** Depends on W1.1.
- **W3.1 — Docs update.**
  - Rewrites `docs/guides/workflow.md` lines 119-129 to the three-stage model.
  - Updates `skill/SKILL.md` (or shared) to mention audit + delta comment surfaces.
  - **Size: S, Estimate: 2h.** Depends on W2.1 + W2.2.
- **W3.2 — Integration tests + dogfood.**
  - Integration tests for analyze mutation, ≥2-tier gate, review delta, missing-actual fallback.
  - Dogfood: run on a real test issue in this repo end-to-end.
  - **Size: M, Estimate: 5h.** Depends on W2.1 + W2.2.

Epic total: **Size XL, Estimate ~22h**, label `reliability`, P1.

---

## Companion: JIT refinement gate (sub-issue under #61)

Separate from this epic but related — sized as a sub-issue of #61 because it depends on `/task move`:

- **Title:** "JIT refinement gate at analyze→development: re-estimate + sequence review"
- **Scope:** When `/task move <id> development` fires, the gate must (a) require a current Deep-Dive section, (b) run `applyReevaluate` (using whatever this epic ships), (c) prompt the agent to confirm sequence is still appropriate or post a sequence-revision comment with rationale, (d) refuse the transition if Deep Dive is missing or stale.
- **Wave:** W3.5 in #61 (after W3.1 `verbs/move.mjs` lands; before W4 docs).
- **Size:** M, Estimate ~5h.
