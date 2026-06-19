# Codex Support Matrix

This document records which ai-task-manager features Codex agents receive at prompt level versus enforcement level, and explains why `hookCapability: false` is the correct permanent value for the Codex provider.

## Why `hookCapability: false` is permanent

Claude Code exposes a hook surface (`.claude/settings.json` → `hooks`) that allows the package to intercept tool calls pre/post and enforce guards — the bash-guard, source-edit-gate, and similar hard gates depend on this surface. Codex has no equivalent: there is no global settings file, no lifecycle-event dispatch, and no pre-tool-use interception point the package can reach.

`hookCapability: false` in `scripts/providers/codex.mjs` is therefore a permanent fact about the runtime, not a missing feature to be implemented. Raising it to `true` would require Codex to gain a hooks API first.

## Prompt parity (Codex receives these)

Features delivered entirely through skill text — present in `skill/adapters/codex/SKILL.md` and `AGENTS.md` bootstrap block:

| Feature                                                                | Delivery mechanism                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| Issue creation via `create-issue.mjs` only (no bare `gh issue create`) | AGENTS.md FORBIDDEN rule                                    |
| One-step state advance via `promote` (no bare `move-state.mjs`)        | AGENTS.md FORBIDDEN rule                                    |
| State Transition Verb Map (8-state model)                              | AGENTS.md bootstrap block                                   |
| Workflow rules: kanban states, issue lifecycle, timing log             | `skill/shared/router.md`                                    |
| Field units (hours vs minutes)                                         | Codex adapter `## Field units`                              |
| Full-Auto footnote semantics                                           | Codex adapter `## Full-Auto footnote`                       |
| Review Notes → Drivers                                                 | Codex adapter `## Review Notes → Drivers`                   |
| Sequence rules (child-cannot-lead-epic, WIP gate)                      | Codex adapter `## Sequence rules`                           |
| Verb disambiguation (`/task plan` vs `/task discover`)                 | Codex adapter `## Verb disambiguation`                      |
| Checkpoint Pause before state transitions                              | Codex adapter `## Checkpoint Pause`                         |
| No untracked background work                                           | Codex adapter `### Never promote untracked background work` |
| Stub shape, ACs, plan-meta fragments                                   | Codex adapter `## Creating issues`                          |
| Project preferences                                                    | Codex adapter `## Project preferences`                      |
| Version-stamp load-once path                                           | `bin/lib/stamp-skill-version.mjs` `SKILL_DETAIL_FILES`      |

Current generated bootstrap state chain:

`Backlog → On Deck → Refine → Plan → Develop → Test → Review → Done`

The generated map names both generic and dedicated verbs: `/task promote #N`
for one-step advancement, `/task refine #N ...` for Refine field entry,
`/task plan #N` for Refine → Plan, `/task plan-approve #N` for the Plan gate,
`/task test #N` for Develop → Test, `/task approve #N` for human Review
approval, and `/task close #N` for Review → Done.

## Enforcement parity (Claude-only, require hooks)

Features that require the `.claude/settings.json` hook surface — absent for Codex by design:

| Feature                                                        | Claude enforcement                        | Codex status                                        |
| -------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| Bash-guard (`gh issue edit --body` refusal)                    | `PreToolUse` Bash hook → `bash-guard.mjs` | Prompt-only (cannot block at tool level)            |
| Source-edit gate (blocks Edit/Write before deep-dive-complete) | `PreToolUse` Edit/Write hook              | Prompt-only (cannot block at tool level)            |
| `gh-edit-guard` (marker-loss protection)                       | Bash hook                                 | Prompt-only (cannot block at tool level)            |
| Timing log hooks (session start/stop)                          | `PostToolUse` + Stop hook                 | Not available; manual `/task start` / `/task pause` |

For Codex users, these rules are documented in the skill but cannot be mechanically enforced. The workflow relies on behavioral compliance.

## Manual Codex steps

Codex users must keep manual `/task start` / `/task pause` / `/task resume` discipline when switching issues, asking blocking questions, or returning after idle time. Codex must also voluntarily use the task scripts for issue body mutation and state movement because no Codex hook can intercept a direct shell command before it runs.

## Version stamping

`SKILL_DETAIL_FILES` in `bin/lib/stamp-skill-version.mjs` includes `{ id: 'codex-adapter', pkgRelPath: 'skill/adapters/codex/SKILL.md' }`. On `npm install ai-task-manager`, the installer writes `<!-- aitm-skill-version: X.Y.Z -->` into the Codex adapter file. The load-once check in the adapter (`aitm-skill-loaded:codex-adapter:<version>`) triggers a reload when the version changes after an upgrade — the same mechanism Claude uses.
