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

`node_modules/ai-task-manager/skill/shared/router.md`

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

Make issues only through `scripts/gh/create-issue.mjs --shape stub|epic|sub-issue|solo|defect` — never `gh issue create`. Non-stub shapes require the `./.tmp/plan/user-story.md` fragment alongside Scope, Acceptance Criteria, and Story Origin. Bind each Acceptance Criterion to an `aitm-verified vc-list="vc:N"` marker that cites the root `## Verification Commands`; the complete contract lives in `rules/create-issue.md` and loads JIT on `/task new`.
