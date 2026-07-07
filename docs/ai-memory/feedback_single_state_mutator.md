---
name: Single state-mutator — only move-state.mjs writes Status
description: Architectural rule — only scripts/gh/move-state.mjs may mutate the project Status field; all verbs verify-then-delegate.
type: feedback
originSessionId: cb76eafb-1b98-42ba-93c7-cc315e949261
---
Only `scripts/gh/move-state.mjs` may write the Status field on the GitHub Projects board.
All other verbs (`promote`, `test`, `approve`, `plan-approve`, `refine`, `demote`, `reconcile`, `reject`, `auto`, etc.) must:
1. Verify required preconditions (gates, markers, rationale, evidence).
2. Determine the target state.
3. Delegate the actual mutation to `move-state.mjs`.
4. After delegation, perform post-success side effects (entry-marker stamping, audit comments, Start Time field, etc.) — but never write Status themselves.

**Why:** Splitting state writes across multiple verbs creates audit-trail holes. The #166 incident exposed it: `promote.mjs` and `test.mjs` stamp `aitm-entered-*` markers but other state-changing paths (move-state.mjs direct calls, alias verbs that bypass promote) don't. Centralizing the Status write in one script means audit-trail invariants (entry markers, Start Time, etc.) can be enforced in exactly one place.

**How to apply:** When auditing or adding any verb that changes issue state, confirm it goes through `move-state.mjs` and does not write Status directly. Entry-marker stamping should live in `move-state.mjs` so every Status transition stamps automatically, regardless of caller.
