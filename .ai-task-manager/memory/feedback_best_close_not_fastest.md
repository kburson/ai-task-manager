---
name: feedback_best_close_not_fastest
description: Prefer the best long-term close over the fastest; invest present effort to make the codebase stronger for the future.
metadata:
  node_type: memory
  type: feedback
  originSessionId: fbec1e5d-b30e-4691-931c-52312b6cd381
---

Do not optimize for the fastest path to Done. Optimize for the close that makes the codebase better and stronger for the long run.

**Why:** User's explicit design philosophy (2026-07-16, during the review-guard redesign): "my intent is not always to find the fastest way to close, but the best way to close that makes the code base better, stronger for the long run. Take a little extra time in the present to make the future better is always the best choice."

**How to apply:** When scoping remediation or enhancement work, favor fixing at the source, hardening latent fragilities, and clean designs even when they add present work. Split large scope into focused stories rather than cramming. Enforce real evidence (proven boxes carrying `aitm-verified` gate-run markers) over bare `[x]` ticks. Surface discovered scope additions as decisions rather than silently folding or dropping them. Links: [[feedback_never_fabricate_evidence]], [[feedback_route_issue_bodies_through_scripts]].
