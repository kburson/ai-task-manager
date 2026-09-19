---
name: task
description: Bind Grok work sessions to GitHub issues and track time, context words, state, and completion workflow.
user-invocable: true
---

# Task For Grok

## Load-once sentinel

Installed packages stamp this adapter with `<!-- aitm-skill-version: X.Y.Z -->`.
On load, emit `aitm-skill-loaded:grok-adapter:<version>` once and skip a repeat
read when that exact sentinel is already present in live context.

Load and follow the canonical shared task workflow:

`node_modules/@kburson/ai-task-manager/skill/shared/router.md`

AITM source checkouts may fall back to `skill/shared/router.md` when the scoped
package is absent. Resolve `rules/...` beside that router.

Full-Auto defaults and the exact manual review phrases are governed by
`rules/full-auto.md`; load it when the user names Full-Auto, manual plan review,
manual code review, or manual task review.

Grok-specific host facts:

- The project skill installs at `.grok/skills/task`.
- Project hooks install under `.grok/hooks` and require project trust.
- Use Grok's native `/task` command surface.
- Do not assume `.codex/hooks.json` is loaded.
- `github.merge-pull-request` is `missing-capability` for this adapter. Leave the delivery intent pending unless this adapter later declares an equivalent sanctioned integration; never use a shell fallback.

## Creating issues

Make issues only through `scripts/gh/create-issue.mjs --shape stub|epic|sub-issue|solo|defect` — never `gh issue create`. User Story input is optional before Plan approval. Optional early prose may use `user-story.md`. Scope, Acceptance Criteria, and Story Origin remain required for non-stub shapes. Bind ACs to root Verification Commands with `aitm-verified vc-list="vc:N"`. The creation contract lives in `rules/create-issue.md`; load `rules/user-story-quality.md` for creation, story authoring, Plan, approval, splitting, and the installed or canonical Plan scaffold. The shared rule owns the seven-question rubric; do not copy it here.
