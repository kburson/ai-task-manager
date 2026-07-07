---
name: ./tmp/ is the canonical scratch directory
description: all transient/staging files (issue bodies, deep-dives, drafts) go in ./tmp/, never .git/restart/ or elsewhere
type: feedback
originSessionId: 435187f1-5a33-4750-a0e4-d4a4398ac3f0
---
All scratch / staging files (issue body drafts, deep-dive working copies, decomposition drafts, throw-away artifacts) go in `./tmp/` at the project root. `tmp/` is gitignored.

**Why:** `.git/restart/` was an old ad-hoc pattern that put scratch inside `.git/`, where most tooling treats it as opaque, git plumbing can interfere, and it's invisible to file pickers. `./tmp/` is the cleaner, conventional location: visible, gitignored, easy to clean. Established 2026-05-10 after asking about the difference between the two.

**How to apply:**
- When generating temporary files for issue bodies, deep-dives, plan stages, etc., write to `./tmp/<descriptive-name>.md`.
- Do NOT write scratch into `.git/`, `.git/restart/`, or anywhere outside `./tmp/`.
- Existing files under `.git/restart/` are legacy; leave them unless the user asks to clean them up.
- Codified in CLAUDE.md → "Tool Usage Rules" section.
