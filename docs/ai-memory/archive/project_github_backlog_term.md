---
name: "github backlog" — term disambiguation
description: clarifies the two distinct meanings of "github backlog" in user requests
type: project
originSessionId: 435187f1-5a33-4750-a0e4-d4a4398ac3f0
---

"GitHub backlog" has two meanings in this project; do not conflate them:

1. **The collection** — all issues tied to the GitHub repo (the issue tracker as a whole).
2. **The status column** — `Backlog` in the project board, reserved for unvetted/ungroomed items only (matches the existing rule: sized + AC'd work goes to `Groom`, not `Backlog`).

**Why:** user said "post sub-issues in github backlog" meaning the collection (sense 1), but the create-issue tool warned (correctly) that sized+AC'd issues belong in `Groom` status. Distinction caught on 2026-05-10 during epic #61 decomposition.

**How to apply:** when the user says "in the backlog," check whether they mean the issue collection (general-purpose) or the status column (specifically ungroomed). If the issue is sized + AC'd, it belongs in `Groom` regardless of which sense they meant.
