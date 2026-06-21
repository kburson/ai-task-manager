---
name: Three-stage estimation model — Groom / Analyze / Review
description: where Size+Estimate get set, mutated, and measured; review is read-only retrospective
type: feedback
originSessionId: 435187f1-5a33-4750-a0e4-d4a4398ac3f0
---

Estimation has **three distinct stages**, each with a different semantic. Do not conflate them.

| Stage                    | Action                                                                                   | Mutates fields?                                           | Audit                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Grooming**             | High-level superficial estimate from story description; minimal repo inspection.         | YES — initial set.                                        | n/a (initial values)                                                                   |
| **Analysis (Deep Dive)** | JIT analysis against current repo state uncovers real work + challenges grooming missed. | YES — update Size/Estimate to reflect deep-dive findings. | Comment recording `from → to` + reason. Audit trail feeds future grooming calibration. |
| **Review / Validation**  | Retrospective AFTER `CODE_COMPLETE`. 20/20 hindsight on actual effort.                   | **NO — never mutate.**                                    | Comment on delta (estimated vs. actual) for future-calibration data only.              |

**Why:** the three stages serve different purposes and conflating them destroys the calibration signal. If review mutates the estimate, you've erased the "we were wrong" data point that future grooming would learn from. Review is post-mortem; post-mortems describe what happened, they don't rewrite history.

Stated by user on 2026-05-10 after I described the existing `reevaluate-estimate.mjs` (which currently runs at review→validate and mutates fields) as if that were correct.

**Current implementation gap:**

- `scripts/task-tracker/lib/reevaluate-estimate.mjs` runs at `review→validate` and mutates Size/Estimate.
- Per this model, that mutation belongs at the analyze→development boundary, not at review→validate.
- Review should run a different routine that posts a delta comment without touching field values.

**How to apply:**

- When designing estimate-evaluation logic: place mutations at Analysis exit; place read-only delta logging at Review.
- When reviewing existing code that does re-estimation, check WHICH stage it runs in and challenge if it mutates during review.
- Always require an audit comment at Analysis-time mutation: from-value, to-value, reason. Same for Review-time delta logging.
