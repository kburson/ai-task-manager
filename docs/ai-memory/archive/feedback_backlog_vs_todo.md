---
name: Backlog vs Todo board semantics
description: Backlog column is only for unvetted/unsized ideas; once an issue is fully formed (ACs + Size + Estimate) move it to Todo (the `ready` state)
type: feedback
originSessionId: 7450cf38-8e9d-4f12-bc09-46a449c835e2
---

Once a story has acceptance criteria, Size, and Estimate set, move it from Backlog to Todo. Backlog is reserved for raw, unvetted ideas that have not been sized.

**Why:** The user wants Backlog to function as an idea inbox, not a sized-work queue. Sized + vetted work belongs in Todo so the planning surface stays clean and "ready to pick up" is unambiguous.

**How to apply:** When filing a new issue with full ACs and tethering with `--size` / `--estimate`, do NOT leave it in `backlog` — follow up with `node scripts/gh/move-state.mjs <N> ready`. The `ready` state IS the Todo column. Only use `backlog` when intentionally parking an unsized idea.
