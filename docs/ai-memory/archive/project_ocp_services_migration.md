---
name: ocp-services-migration
description: Plan parameters for migrating ocp-services from @burson.kendrick/claude-gh-task-manager@1.1.11 to ai-task-manager; decisions locked 2026-05-13
metadata:
  node_type: memory
  type: project
  originSessionId: 6c9ba6a5-1a14-47d2-a581-9c61cdfe50c4
archived: 2026-05-16
archive-reason: Blocker #106 CLOSED; migration window passed.
originSessionId: ade0ead4-85fa-4b5c-93af-c5139b36c82c
---

Migrating `/Users/kpburson/projects/Vibe-Coding/options-co-pilot/ocp-services` off deprecated predecessor `@burson.kendrick/claude-gh-task-manager@1.1.11` onto current `ai-task-manager`. ocp-services is paused — no time pressure, safe window.

**Why:** predecessor and ai-task-manager have diverged significantly (5-state→7-state kanban, split→consolidated time fields, `.claude/`→`.ai-task-manager/` runtime paths, bash→node hooks, new verb surface). User wants to heal ocp-services then strip ALL legacy from ai-task-manager because overlapping verbs are confusing.

**How to apply:** when resuming this work, follow the locked sequencing and decisions below; do not re-litigate.

## Sequencing (locked)

1. Finish #106 (cross-platform hooks) — being done by codex in a separate chat, blocked until 2026-05-14
2. Strip legacy from ai-task-manager (deprecated verbs `groom/analyze/approve/review/close` aliases, `.claude/*` runtime fallbacks in `paths.mjs`, `hooks/*.sh` wrappers, stale doc refs at CLAUDE.md:67 and skill/shared/SKILL.md:326)
3. Package new ai-task-manager (tarball or publish)
4. In ocp-services: pre-flight backup → heal backlog → init fresh board → swap deps → verify

## Decisions (locked)

- **State remap 5→7:** default mapping — `Backlog→Backlog, Ready→Refine, InProgress→Develop, InReview→Review, Done→Done`. Nothing auto-routes to `Plan` or `Test`.
- **Timing-log:** boundary row only. Insert one marker row `migrated-from:@burson.kendrick/claude-gh-task-manager@1.1.11 → ai-task-manager@<ver>` per issue; predecessor rows stay byte-for-byte. Zero data loss; schema heterogeneity within one comment is acceptable.
- **Backup location:** `ocp-services/tmp/migration-snapshot/` (NOT in ai-task-manager). Local JSON dump via `gh api graphql` of bodies, comments, project field values BEFORE any mutation.
- **Board strategy:** fresh board via `npx ai-task-manager init`. User will rename the existing board manually to preserve it as archive. Re-attach issues to new board with translated field values. No in-place mutation of old board.
- **`setup-nvm.sh` SessionStart hook** in ocp-services: leave alone. Orthogonal to ai-task-manager; provides node-on-PATH insurance for GUI launches. ai-task-manager's modern hooks invoke `node` directly and need it on PATH.

## Predecessor surface (reference)

- ocp-services config: `.claude/task-tracker.json` — repo `kburson/options-co-pilot`, projectId `PVT_kwHOABCEY84BVBBe`
- 5 kanban options: Backlog/Ready/InProgress/InReview/Done
- Split time fields: `fieldActualHours` + `fieldActualMinutes` (must consolidate)
- No `fieldContextWords` equivalent — predecessor didn't track context words
- Last active issue: #205, no live timer
- Predecessor uses `move-state.sh` (bash); deep-dive marker is visible checkbox not hidden HTML comment
- Predecessor settings.json has `Bash(*claude-gh-task-manager*)` allowlist entries — strip these post-migration

## Data safety constraint (verbatim from user)

"We have to be extra careful not to lose any data in the issues, but since the issues db has versioning we should be able to recover with a revert of the broken issue."

Note: GitHub edit history covers issue bodies + comments but NOT project field changes — local archive is the only recovery path for field mutations.
