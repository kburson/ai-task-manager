---
name: feedback_promote_not_action_verb
description: 'For forward state moves always use `/task promote`, never the action verb (test/review/close) directly — promote pre-flights cheap exit-gates before the expensive sandbox.'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 7eb34043-996a-4344-b692-4f66fef0559a
  modified: 2026-07-22T12:55:26.511Z
---

Always drive FORWARD state transitions with `/task promote` (the movement verb), never by calling the action verb (`aitm test` / `aitm review` / `aitm close`) directly.

**Why:** `runPromote` (verbs/promote.mjs) runs `runGuards(from,to,ctx)` — the cheap exit-gates including `develop-exit-commit-trail-head` (→ `commit-trail-stale`) — BEFORE it delegates to the alias verb (`ALIAS_VERB = {develop:'test', test:'review', review:'close'}`). A stale commit-trail (e.g. after a `git commit --amend`) refuses in milliseconds pre-sandbox. The bare `aitm test` action verb has NO pre-flight: it runs the full `test:all` sandbox suite FIRST, then discovers the stale trail at the move-state call — burning a full 3-min suite run to surface a sub-second precondition.

**How to apply:** After any amend/rebase that changes HEAD, run `commit-trace` before promoting. Use `TT_FULL_AUTO=1 npx aitm promote <N>` for every forward move. Do NOT diagnose the post-sandbox stale-trail refusal as a "gate-ordering defect" — the framework already pre-flights via promote; using the action verb directly is the bug. Related: [[feedback_no_concurrent_test_verb]] (let promote drive one run), [[feedback_drive_to_review]], [[feedback_single_state_mutator]].
