---
name: Invoke task-tracker.mjs via scripts/, not node_modules/
description: This repo is its own npm package; node_modules/ai-task-manager is a symlink to .., which makes _isMain mismatch and the CLI silently exits with no state change
type: project
originSessionId: a2956386-6efd-462f-8527-e3f5a578f958
---
In this repo, `node_modules/ai-task-manager` is a symlink to `..` (the project itself). The task-tracker CLI uses an `_isMain` check (`process.argv[1] === fileURLToPath(import.meta.url)`) that fails when invoked through the symlink: argv[1] keeps the unresolved path, but `import.meta.url` resolves through the symlink. Result: the dispatch IIFE never runs, exit 0, no output, no state change.

**Why:** Bash hook permission rules show `node */ai-task-manager/scripts/task-tracker/task-tracker.mjs*` is allow-listed via the node_modules path, which made it the obvious invocation, but it silently no-ops here.

**FIXED in #478 (2026-06-20):** `_isMain` now realpaths `process.argv[1]` before comparing to `fileURLToPath(import.meta.url)`, so the symlinked `node_modules/ai-task-manager/...` path runs identically to `scripts/...`. The silent-no-op foot-gun is gone on trunk going forward.

**How to apply:**
- Prefer `node scripts/task-tracker/task-tracker.mjs ...` (real path) anyway; it's unambiguous and works on every checkout, including ones predating the #478 fix.
- If a tracker invocation produces no output and exit 0 with no state change on an OLD checkout (pre-#478), suspect this symlink issue first.
