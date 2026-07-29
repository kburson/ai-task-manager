---
name: Route issue bodies through scripts, never hand-roll
description: All issue body authoring/editing must go through preflight-issue.mjs (or a script wrapper); never hand-craft Markdown for gh issue create/edit.
type: feedback
originSessionId: cb76eafb-1b98-42ba-93c7-cc315e949261
---

Never hand-author or hand-edit issue bodies as raw Markdown passed to `gh issue create` / `gh issue edit --body-file`. Always route through the template-driven authoring path (`scripts/task-tracker/preflight-issue.mjs` and its `tailBlock` emitter, which appends `### Definition of Done` + `## Pickup Directive — MANDATORY, DO NOT SKIP`). If a body needs a section the template doesn't cover, extend the script — don't bypass it.

**Why:** AI memory is unreliable and skips steps. #169 and #170 shipped without the `### Definition of Done` section because the bodies were hand-rolled. The downstream gates (deep-dive-placement, dod-verified, review/close auto-tick) operate on the assumption the template machinery produced the body. Hand-edits silently drift past contracts the scripts enforce. The general principle: **every gate and requirement must have script-level support, and changes that touch those gates must go through the scripts.** Behavioral discipline is not enough — the codebase must make the wrong path impossible (or at least loud).

**How to apply:**

- When creating a new issue: use `preflight-issue.mjs --shape <type> ...` to emit the body, then pipe to `gh issue create --body-file`.
- When editing an issue body: fetch with `gh issue view --json body`, modify the variable section (Problem/Proposal/ACs/Deep-Dive), and re-emit through whatever template helper covers it. Never invent the DoD/Pickup-Directive tail by hand.
- If you catch yourself writing `### Definition of Done` or `## Pickup Directive` as a literal string into a file, stop — that string belongs in `preflight-issue.mjs::tailBlock`, not in a generated body.
- For broader gates: if a gate exists (e.g., dod-verified, deep-dive-placement, code-complete), every path that should satisfy it must be reachable from a script. If a path requires hand-editing to satisfy a gate, that's a bug — file an issue to push the invariant into the script layer.
