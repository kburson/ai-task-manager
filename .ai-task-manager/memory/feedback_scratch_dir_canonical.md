---
name: .scratch/ is the canonical scratch directory
description: disposable transient and staging files go in .scratch while runtime and generated output stay in .tmp
type: feedback
originSessionId: 435187f1-5a33-4750-a0e4-d4a4398ac3f0
---

All disposable scratch and staging files (issue-body drafts, deep-dive working copies, decomposition drafts, and throw-away artifacts) go in `./.scratch/` at the project root. `.scratch/*` is gitignored except for its tracked contract README.

**Why:** `.git/restart/` was an old ad-hoc pattern that put scratch inside `.git/`, where most tooling treats it as opaque. The repository now uses a two-bucket contract: `./.scratch/` is disposable operator work, while `./.tmp/` is machine-local runtime state and generated output. Location makes ownership and recoverability explicit.

**How to apply:**

- When generating disposable files for issue bodies, deep-dives, plan stages, or ad hoc inspection, write to `./.scratch/<purpose>/<descriptive-name>`.
- Nothing in the project may depend on `.scratch/` content. Graduate reusable helpers to tracked `scripts/maintenance/` code.
- Keep runtime state and generated output such as `.tmp/aitm/`, `.tmp/reports/`, and `.tmp/coverage/` under `./.tmp/`.
- Do NOT write scratch into `.git/` or `.git/restart/`.
- Existing files under `.git/restart/` are legacy; leave them unless the user asks to clean them up.
- Codified in CLAUDE.md → "Tool Usage Rules" section.
