---
name: task
description: Bind AI work sessions to GitHub issues and track time, context words, state, and completion workflow. Use when the user types /task with no args or followed by #N, new, plan, resume, pause, update, close, log, check, fleet, or config.
---

# Task

## Step 0 — Verify worktree seeding (run before anything else)

If this session runs in a git worktree, its `node_modules` may be absent, which
breaks the skill reads below and silently redirects module resolution to the
parent checkout. The SessionStart hook heals this automatically; if you have any
doubt it ran, verify and self-heal before loading the skill:

```bash
node -e "const{existsSync}=require('fs');const{resolve}=require('path');const{pathToFileURL}=require('url');const c=['node_modules/ai-task-manager/scripts/task-tracker/ensure-worktree-seeded.mjs','scripts/task-tracker/ensure-worktree-seeded.mjs'];const p=c.map(x=>resolve(process.cwd(),x)).find(existsSync);if(p){process.argv=[process.argv[0],p];import(pathToFileURL(p).href);}"
```

Proceed to the Load-Once Procedure only once the self-link resolves to THIS worktree.

## Load-Once Procedure

Frequently-loaded skill files carry an `<!-- aitm-skill-version: X.Y.Z -->` marker.
To avoid re-reading them every invocation:

1. Read just the first ~10 lines of each file below to extract its marker version.
2. Grep your current context for `aitm-skill-loaded:<id>:<version>`. If found, skip step 3 for that file.
3. Read the full file. Then emit a single line in your reply: `aitm-skill-loaded:<id>:<version>` so future invocations in this conversation can detect the load.

Files (id — path):

- `adapter` — `node_modules/ai-task-manager/skill/adapters/claude/SKILL.md`
- `shared` — `node_modules/ai-task-manager/skill/shared/SKILL.md`
- `pickup` — `.ai-task-manager/templates/pickup-directive.md` (loaded on sub-issue pickup)

After `/clear` or `/compact`, sentinels disappear from context and these files reload automatically.
After `npm update ai-task-manager`, the marker version changes and reload is forced.

## Canonical Source

Load and follow the canonical Claude adapter instructions from:

`node_modules/ai-task-manager/skill/adapters/claude/SKILL.md`

Use executable scripts from:

`node_modules/ai-task-manager/scripts/`
