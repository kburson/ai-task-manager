---
name: Grooming is high-level; Analysis is JIT refinement
description: Everything set during Groom (ACs, Size, Estimate, Priority, scope) is provisional and must be re-evaluated and editable during Analysis.
type: feedback
originSessionId: a2956386-6efd-462f-8527-e3f5a578f958
---

Everything defined during Grooming is high-level and provisional. ACs, Size, Estimate, Priority, and scope set in Groom are all editable/adjustable during Analysis (the just-in-time refinement step that reads current project state and the story's actual requirements).

**Why:** Grooming happens early, often without full context. Project state drifts between groom and pickup. Locking values at groom forces stale decisions onto fresh work.

**How to apply:**

- In Groom: accept rough ACs, ballpark Size/Estimate, tentative Priority. Don't over-engineer the issue body.
- In Analyze (deep dive): re-read the story against current code, re-evaluate Size/Estimate/Priority, rewrite ACs as needed, adjust scope. Update fields on the board to match the refined view.
- Don't treat Groom values as commitments — treat them as a starting point for Analysis.
- If Analysis materially changes scope or sizing, surface it explicitly in the deep dive section.
