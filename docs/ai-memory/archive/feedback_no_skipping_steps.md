---
name: Run the full /task verb chain — no skipping steps
description: Every issue must traverse Backlog → Groom → Analyze → Development → Validate → Review via /task verbs in order, with deep dive added during analyze
type: feedback
originSessionId: a2956386-6efd-462f-8527-e3f5a578f958
---

Every issue must traverse the full 7-state pipeline using `/task` verbs in order: `/task #N` (bind) → `/task groom #N` → `/task analyze #N` → (write deep dive into body, tick `Deep dive complete`) → `/task approve #N` → implement → `/task review #N` (CODE_COMPLETE handoff to Validate) → orchestrator confirms REVIEW_COMPLETE → leaves at Review.

**Why:** The user reset Epic #41 once already because steps were being skipped or batched. Skipping `groom` or `analyze`, or moving to Validate without writing the deep dive, breaks the body-gate validation in `scripts/task-tracker/lib/body-gates.mjs` and produces a non-conforming issue at Review.

**How to apply:**

- One verb at a time. Verify the issue is at the expected state after each verb before issuing the next.
- The deep dive belongs AFTER the Pickup Directive block, BEFORE the `<!-- ai-task-manager:fields:start -->` marker (per `feedback_deep_dive_placement.md`).
- All ACs, Verification Commands, and DoD checkboxes must be ticked before `/task close` (or before leaving at Review for human acceptance, if "main thread only" mode means human accepts at Review).
- Do NOT use `sed` or shell scripts to batch-tick checkboxes without first running the verifications they correspond to. Tick each one only after you've actually run that verification.
