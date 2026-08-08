# Codex Support Matrix

This document records which ai-task-manager features Codex agents receive at prompt level versus hook-enforced level.

## Hook Capability

Codex exposes project hooks through `.codex/hooks.json` and `.codex/config.toml`. AITM installs `.codex/hooks.json` when the Codex provider is selected, so `scripts/providers/codex.mjs` sets `hookCapability: true`.

Project-local Codex hooks require the project to be trusted and may need review with `/hooks` before they run. The installed commands are fail-open where appropriate so a hook failure does not break the chat session.

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

## Enforcement Parity

AITM maps Claude's hook coverage to Codex hook events where Codex exposes an equivalent event:

| Feature                                                     | Claude hook                                                                 | Codex hook                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Timing rows for session/compact lifecycle                   | `SessionStart`, `PreCompact`, `PostCompact`                                 | Same events via `.codex/hooks.json`                                               |
| Bash guard (`gh issue edit --body` refusal and path safety) | `PreToolUse` matcher `Bash`                                                 | `PreToolUse` matcher `Bash`                                                       |
| Activity guard                                              | `PreToolUse` matcher `Bash`, edit tools                                     | `PreToolUse` matcher `Bash`, `apply_patch&#124;Edit&#124;Write&#124;NotebookEdit` |
| Source-edit gate before deep-dive/develop                   | `PreToolUse` matcher `Edit&#124;Write&#124;NotebookEdit`                    | `PreToolUse` matcher `apply_patch&#124;Edit&#124;Write&#124;NotebookEdit`         |
| Commit trail after `git commit`                             | `PostToolUse` matcher `Bash`                                                | `PostToolUse` matcher `Bash`                                                      |
| Natural idle pause/resume                                   | `Stop` + `UserPromptSubmit`                                                 | `Stop` + `UserPromptSubmit`, using Codex `session_id` payloads                    |
| Stop audit warning for unbalanced pause/resume rows         | `Stop`                                                                      | `Stop`                                                                            |
| Prompt timestamp context                                    | Not installed                                                               | `UserPromptSubmit` adds timestamp context                                         |
| Operational-lessons memory index                            | `SessionStart`, `PostCompact` load `.ai-task-manager/memory/MEMORY.md` only | Same events via `.codex/hooks.json`; shared index and per-fact corpus             |

The memory-index hook emits only `.ai-task-manager/memory/MEMORY.md` as additional context. Both providers share the same accepted per-fact files under `.ai-task-manager/memory/`; neither provider injects the full corpus automatically.

The Codex-only prompt timestamp hook cannot rewrite the submitted prompt. It returns Codex's documented `hookSpecificOutput.additionalContext` for `UserPromptSubmit`, which adds a line such as `User prompt submitted at 2026-06-19T14:00:00.000Z (turn turn-456). Use this timestamp when reasoning about conversation drift or relative-time references.`

## Remaining Differences

| Capability                   | Claude                                        | Codex                                                              |
| ---------------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| Native transcript locator    | `.claude/projects` homedir JSONL fallback     | `null`; AITM relies on local session state                         |
| `AskUserQuestion` bracketing | Hooked around Claude's `AskUserQuestion` tool | No installed equivalent unless Codex exposes a matching tool event |
| User prompt rewriting        | Not used                                      | Not supported; timestamp is extra context                          |

Codex users should still use `/task start` when binding a new issue and `/task pause` for explicit long-running pauses. The hook layer covers normal lifecycle events, but manual commands remain the visible workflow API and are required for state transitions.

## Version stamping

`SKILL_DETAIL_FILES` in `bin/lib/stamp-skill-version.mjs` includes `{ id: 'codex-adapter', pkgRelPath: 'skill/adapters/codex/SKILL.md' }`. On `npm install ai-task-manager`, the installer writes `<!-- aitm-skill-version: X.Y.Z -->` into the Codex adapter file. The load-once check in the adapter (`aitm-skill-loaded:codex-adapter:<version>`) triggers a reload when the version changes after an upgrade — the same mechanism Claude uses.
