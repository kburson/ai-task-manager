---
name: Deep-Dive Analysis section placement in issue body
description: The Deep-Dive Analysis section must be appended AFTER the Pickup Directive block, not before the Acceptance Criteria
type: feedback
originSessionId: 7450cf38-8e9d-4f12-bc09-46a449c835e2
---

When writing the Deep-Dive Analysis into an issue body during pickup, place the `## Deep-Dive Analysis (YYYY-MM-DD)` section **after** the `## Pickup Directive — MANDATORY, DO NOT SKIP` block (and after its trailing `- [x] Deep dive complete` checkbox), not between Scope/Reproduce and Acceptance Criteria.

**Why:** The user wants the original issue body (Scope, ACs, Verification, DoD, Pickup Directive) to remain the canonical "what we're doing" surface readable top-to-bottom on GitHub. The Deep-Dive is investigation output — it belongs at the bottom as an appendix so the original issue contract is undisturbed and reviewers can scroll past investigation to see results-only.

**How to apply:** When patching the body to add a Deep Dive, find the `## Pickup Directive — MANDATORY, DO NOT SKIP` block, append the Deep-Dive section AFTER it (and after its `- [x] Deep dive complete` line), and keep the `<!-- ai-task-manager:fields:start -->` / `:end -->` markers as the absolute last block. Order: Scope → Reproduce → Acceptance Criteria → Verification Commands → Definition of Done → Pickup Directive → Deep-Dive Analysis → fields marker.
