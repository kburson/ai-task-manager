---
name: feedback_validator_epic_single_doc_surface
description: "Validator-family epics document once at epic close, not per-child story"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: fbec1e5d-b30e-4691-931c-52312b6cd381
---

For an epic whose children are a family of validators (e.g. EPIC #808's V1–V6 in [[project_drive_bug_queue_2026_07_10]]-style drives), treat the validators as **one documentation surface** and write the docs **once at epic close**, not during each child story's cleanup phase. User confirmed 2026-07-14: "I've been treating the validators as one doc surface to write once at #808 close... keep doing that."

**Why:** The children share one conceptual surface (the Agent Review Gate + its validator registry); per-child doc passes would fragment and churn the same pages repeatedly.

**How to apply:** Skip the "update all documentation" step in per-child cleanup for grouped-validator children; do the consolidated doc write in the epic's close/cleanup. Does NOT waive per-child code/test/commit DoD — only the shared prose docs are deferred. Not a blanket rule for all epics; applies when children genuinely share one doc surface.
