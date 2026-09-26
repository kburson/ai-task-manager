---
model: gpt-6-astra
effort: high
filepath: docs/superpowers/specs/2026-09-25-1806-shared-hook-launcher-design.md
commit_sha: 94580896dcbb95bd87f8ce6f090570095c1e3cf4
uncommitted_changes: false
turn_ordinal: SAR r1
turn_description: Single Agent Review revision 1
---

# Shared hook launcher specification: SAR round 1

**Issue:** #1806. **Date:** 2026-09-25.

**Reviewed baseline:** `94580896dcbb95bd87f8ce6f090570095c1e3cf4`.
The reviewer was a distinct Codex GPT-6-Astra session working read-only. This
record captures its findings and the author's subsequent dispositions. It is
not an independent peer-review acceptance or implementation approval.

## Findings and dispositions

### SR1-01 — P1: Installed launcher can modify its own guard entry point

The proposed project-local launcher was outside the existing installed-guard
self-modification interlock. An agent could replace a consumer launcher with a
successful no-op and disable every migrated guard even while the file existed.
The current interlock covers installed `node_modules/.../scripts/` paths
([predicate](../../../../../scripts/task-tracker/lib/installed-guard-path.mjs)) and
runs before chore-mode bypass
([activity guard](../../../../../scripts/task-tracker/activity-guard.mjs)).

**Disposition:** Addressed in the revised specification. The launcher becomes a
protected installed guard asset; the interlock must deny tool-driven edits
before any guard migrates, including patch and chore mode. Source checkout
maintenance and verified installer upgrades remain possible. Acceptance
requires an adversarial replacement-with-no-op test.

### SR1-02 — P2: Handler working directory is unspecified

Resolving a handler from the right worktree does not make its `process.cwd()`
correct. The existing
[memory-index handler](../../../../../scripts/task-tracker/hooks/memory-index.mjs)
reads `.ai-task-manager/memory/MEMORY.md` from `process.cwd()` and ignores the
hook payload's `cwd`. From a nested session directory it could import
successfully yet emit no context.

**Disposition:** Addressed in the revised specification. Once invoked, the
launcher validates the active root against its physical location, retains the
original invocation directory, and changes the handler's working directory to
the active worktree root before import. Tests must assert emitted memory
context and state locations from nested directories.

### SR1-03 — P1: PowerShell matcher is not PowerShell policy

The original specification required Windows PowerShell matcher coverage, but
[activity-guard](../../../../../scripts/task-tracker/activity-guard.mjs) currently
passes unknown tool names, including `PowerShell`. Bash command analysis does
not establish PowerShell protection. A successfully invoked hook could thus
leave prohibited PowerShell operations unblocked.

**Disposition:** Addressed in the revised specification. Windows PowerShell
guard parity requires tested PowerShell-aware denial. Otherwise that guard path
stays on its existing configuration and installer/doctor report it unsupported;
matcher invocation or missing-launcher denial alone cannot count as proof.

## Verification boundary

These are specification corrections. They do not establish that the proposed
launcher, migration, or runtime guard behavior has been implemented. A second
Astra SAR pass is required on the revised committed specification before the
specification is called ratified.
