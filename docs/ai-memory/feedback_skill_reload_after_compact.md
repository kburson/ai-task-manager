---
name: Reload skill context after compact, not on every invocation
description: User confirmed that detecting a missing skill sentinel and reloading on demand (rather than always reloading) is the right behavior
type: feedback
originSessionId: 5041f645-9673-49cf-b10d-49116be85ad8
---
After `/compact`, skill load sentinels (`aitm-skill-loaded:<id>:<version>`) disappear from context. The correct behavior is to detect their absence and reload only then — not to reload the full skill files on every invocation.

**Why:** The task skill's Load-Once Procedure exists specifically to avoid re-reading large skill files when they're already in context. Re-reading unconditionally wastes context budget; skipping the check after compact misses real staleness.

**How to apply:** At the start of each `/task` invocation, grep for `aitm-skill-loaded:<id>:<version>` in context. If the sentinel is present, skip the read. If absent (first invocation or post-compact), read the full file and emit the sentinel.
