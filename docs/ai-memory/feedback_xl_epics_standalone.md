---
name: XL epics are standalone — no parent, "EPIC:" title prefix
description: Issues sized XL are epics; they must not have a parent issue and must be titled with an "EPIC: " prefix
type: feedback
originSessionId: ab7187c6-1bbe-4a2e-83e6-8b79c7be0087
---

XL-sized issues are epics. They must:

- Be standalone (no parent — never linked as a sub-issue of another)
- Have titles prefixed with `EPIC: `

**Why:** Epics are top-of-hierarchy. GitHub Projects allows only one level of sub-issue nesting (per CLAUDE.md), so an XL with a parent would either flatten the tree incorrectly or block its own children from being linked. The `EPIC:` prefix makes the role visible at the board/list level.

**How to apply:** When picking up or grooming an XL issue, check (a) `parent` is null in GraphQL — if not, `removeSubIssue`; (b) title starts with `EPIC: ` — if not, `gh issue edit --title`. Do this before sub-issue creation or any state transition.
