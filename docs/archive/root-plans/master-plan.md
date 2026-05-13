# AI Task Manager Migration Master Plan

## Goal

Fork `claude-gh-task-manager` into `ai-task-manager`: a Node/npm package that lets both Claude Code and Codex use the same GitHub issue/project task-management workflow, shared scripts, shared templates, and shared tracking state.

The new package should preserve the current Claude Code behavior while adding Codex compatibility through `.agents` skills and, optionally, Codex plugin packaging.

## Product Decisions

- Rename package from `@burson.kendrick/claude-gh-task-manager` to an `ai-task-manager` package name.
- Keep GitHub issue and GitHub Projects management as the core domain even though `gh` is dropped from the package name.
- Keep the npm package as the canonical distribution mechanism for Node projects.
- Avoid copying full skill instructions into each agent-specific folder during install.
- Prefer stable stubs or symlinks in agent-specific locations that point back to files inside `node_modules/ai-task-manager`.
- Move persistent runtime state out of `.claude/` into a shared agent-neutral folder.

## Target Repository Layout

```text
ai-task-manager/
  package.json
  bin/
    cli.mjs
  skill/
    shared/
      SKILL.md
      DESIGN.md
      references/
    adapters/
      claude/
        SKILL.md
      codex/
        SKILL.md
  scripts/
    task-tracker/
    gh/
    reports/
  hooks/
    task-tracker.sh
  templates/
    pickup-directive.md
    definition-of-done.md
  codex/
    plugin/
      .codex-plugin/
        plugin.json
      skills/
        task/
          SKILL.md
```

Installed into a consumer project:

```text
consumer-project/
  node_modules/
    ai-task-manager/
      skill/
      scripts/
      templates/
      hooks/

  .ai-task-manager/
    task-tracker.json
    task-tracker-state.json
    task-tracker-queue.json
    pickup-directive.md
    definition-of-done.md

  .claude/
    skills/
      task/
        SKILL.md
    commands/
      task.md
    hooks/
      task-tracker.sh
    settings.json

  .agents/
    skills/
      task/
        SKILL.md
```

## Skill Loading Strategy

### Preferred Option: Symlink Agent Skill Folders

If both Claude Code and Codex reliably follow symlinked skill folders, install should create:

```text
.claude/skills/task -> node_modules/ai-task-manager/skill/adapters/claude
.agents/skills/task -> node_modules/ai-task-manager/skill/adapters/codex
```

This gives the cleanest update path: users can run `npm update ai-task-manager` and get updated skill instructions without rerunning `install`.

### Fallback Option: Stable Stub Files

If either agent does not reliably support symlinked skill folders, install should create tiny stable `SKILL.md` stubs.

Claude stub:

```markdown
---
name: task
description: Bind AI work sessions to GitHub issues and track time, context words, state, and completion workflow. Use when the user types /task with no args or followed by #N, new, plan, resume, pause, update, close, log, check, fleet, or config.
---

# Task

Load and follow the canonical Claude adapter instructions from:

`node_modules/ai-task-manager/skill/adapters/claude/SKILL.md`

Use executable scripts from:

`node_modules/ai-task-manager/scripts/`
```

Codex stub:

```markdown
---
name: task
description: Bind AI work sessions to GitHub issues and track time, context words, state, and completion workflow. Use when the user asks to manage a task, start or close issue work, run /task commands, create backlog issues, track active work, log time, update task status, or inspect the active task fleet.
---

# Task

Load and follow the canonical Codex adapter instructions from:

`node_modules/ai-task-manager/skill/adapters/codex/SKILL.md`

Use executable scripts from:

`node_modules/ai-task-manager/scripts/`
```

The stubs must keep valid frontmatter because the agent uses `name` and `description` to decide when to load the skill.

## Shared State Strategy

Move runtime state from `.claude/` to `.ai-task-manager/`.

Canonical new files:

```text
.ai-task-manager/task-tracker.json
.ai-task-manager/task-tracker-state.json
.ai-task-manager/task-tracker-queue.json
.ai-task-manager/pickup-directive.md
.ai-task-manager/definition-of-done.md
```

Backward compatibility:

- Read existing `.claude/task-tracker.json`, `.claude/task-tracker-state.json`, and `.claude/task-tracker-queue.json` if the new files do not exist.
- On next write, write to `.ai-task-manager/`.
- Consider one-time migration during `install`.
- Do not delete old `.claude/` files automatically.
- Add both old and new runtime-state paths to `.gitignore` during the transition.

## CLI Changes

Add agent-aware install commands:

```bash
npx ai-task-manager install --agent claude
npx ai-task-manager install --agent codex
npx ai-task-manager install --agent both
```

Default should probably be `--agent both` for new installs, unless that creates confusing folders for users who only use one agent.

Add optional strategy flag:

```bash
npx ai-task-manager install --agent both --link-mode symlink
npx ai-task-manager install --agent both --link-mode stub
```

Recommended behavior:

- Try symlink mode by default only after validating both agents support it.
- Otherwise default to stub mode.
- Print exactly which files were created and which canonical package paths they point to.

## Claude Install Responsibilities

Keep current behavior, adapted for the renamed package:

- Install `.claude/skills/task/SKILL.md` as a symlink or stub.
- Install `.claude/commands/task.md`.
- Install `.claude/hooks/task-tracker.sh` as a stub that delegates to `node_modules/ai-task-manager/hooks/task-tracker.sh`.
- Patch `.claude/settings.json` hooks for `SessionStart`, `PreCompact`, and `PostCompact`.
- Patch Claude permission allow rules for the renamed package paths.
- Keep `/task` slash command behavior working.

## Codex Install Responsibilities

Install Codex repo-local skill:

```text
.agents/skills/task/SKILL.md
```

Either symlink the whole folder or create a stub `SKILL.md`.

Codex-specific notes:

- Use `.agents`, plural.
- Codex skills require `SKILL.md` frontmatter with `name` and `description`.
- Codex local repo skills are discovered from `.agents/skills`.
- Codex user-level skills are discovered from `$HOME/.agents/skills`.
- Codex plugins are the packaging layer for reusable installable bundles, but npm install plus repo-local skill stubs is enough for Node projects.

## Optional Codex Plugin

Add a Codex plugin artifact for users who prefer plugin installation:

```text
codex/plugin/
  .codex-plugin/
    plugin.json
  skills/
    task/
      SKILL.md
```

Initial `plugin.json` shape:

```json
{
  "name": "ai-task-manager",
  "version": "0.1.0",
  "description": "Bind AI coding sessions to GitHub issues and track time, context, state, and completion workflow.",
  "skills": "./skills/",
  "interface": {
    "displayName": "AI Task Manager",
    "shortDescription": "Track AI coding sessions against GitHub issues",
    "developerName": "Kendrick Burson",
    "category": "Productivity",
    "capabilities": ["Read", "Write"]
  }
}
```

Keep the plugin skill thin and point it back to the npm package where possible. If plugin installation cannot assume `node_modules/ai-task-manager` exists, document that npm installation is still required for executable scripts.

## Shared Skill Design

Split the current large `skill/SKILL.md` into:

- `skill/shared/SKILL.md`: agent-neutral workflow, process contract, command semantics, state model, GitHub Projects behavior.
- `skill/adapters/claude/SKILL.md`: Claude-specific slash command, hooks, permission, and path conventions.
- `skill/adapters/codex/SKILL.md`: Codex-specific execution guidance, sandbox/approval expectations, `.agents` path conventions, and no assumption that `/task` is a native slash command unless a stub invokes the skill.

Avoid duplicating the full process contract across adapters. The adapters should tell the model to load the shared skill and then layer on agent-specific behavior.

## Script Changes

Update hardcoded package and path references:

- Replace `@burson.kendrick/claude-gh-task-manager` with the new package name.
- Replace `.claude/task-tracker-state.json` defaults with `.ai-task-manager/task-tracker-state.json`.
- Replace `.claude/task-tracker-queue.json` defaults with `.ai-task-manager/task-tracker-queue.json`.
- Replace `.claude/task-tracker.json` defaults with `.ai-task-manager/task-tracker.json`.
- Replace `.claude/task-tracker/pickup-directive.md` with `.ai-task-manager/pickup-directive.md`.
- Replace `.claude/task-tracker/definition-of-done.md` with `.ai-task-manager/definition-of-done.md`.
- Keep fallback reads from old `.claude/` paths.
- Make scripts resolve package root from their own file path, not from copied install locations.

## Package Metadata Changes

Update `package.json`:

- `name`: new npm package name.
- `description`: agent-neutral.
- `bin`: rename `claude-gh-task-manager` to `ai-task-manager`; consider keeping the old bin as an alias for one compatibility release.
- `files`: include `skill/`, `codex/`, `hooks/`, `scripts/`, `statusline/`, `docs/`, and `templates/`.
- `keywords`: include `codex`, `claude`, `ai-agent`, `github`, `task-tracker`, `time-tracking`, `github-projects`.
- `repository` and bugs URLs: update to the fork.

## Documentation Changes

Update README to describe:

- What `ai-task-manager` does.
- Claude Code install.
- Codex install.
- Dual install.
- Shared state folder.
- Update behavior via `npm update`.
- Migration from `claude-gh-task-manager`.
- GitHub CLI and GitHub Projects prerequisites.

Example quickstart:

```bash
npm install --save-dev ai-task-manager
npx ai-task-manager install --agent both
npx ai-task-manager init
```

Then in Claude:

```text
/task #42
```

In Codex:

```text
Use the task skill to start issue #42.
```

or, if slash-style instructions are supported:

```text
/task #42
```

## Testing Plan

Unit tests:

- Fix existing baseline failure before adding migration tests: `scripts/task-tracker/task-tracker.mjs config wpm 175` currently normalizes `175` to `#175`, so `scripts/task-tracker/tests/cli.test.mjs` fails. Numeric issue normalization should apply only to task verbs that accept issue numbers, not to arbitrary config values.
- Path resolution prefers `.ai-task-manager/`.
- Path resolution falls back to `.claude/`.
- First write after fallback writes to `.ai-task-manager/`.
- Install creates expected Claude stubs.
- Install creates expected Codex stubs.
- Install is idempotent.
- Gitignore patch includes new and legacy runtime paths.
- Package root resolution works from `node_modules`.

Manual tests:

- Install into a fresh sample project with `--agent claude`.
- Install into a fresh sample project with `--agent codex`.
- Install into a fresh sample project with `--agent both`.
- Run `/task plan`, `/task #N`, `/task update`, `/task close` in Claude.
- Ask Codex to use the task skill for an issue and verify it loads the installed skill.
- Run `npm update ai-task-manager` and verify stubs still point to updated package content.

## Migration Plan

1. Rename package and update metadata.
2. Introduce `.ai-task-manager/` path helpers with fallback support.
3. Move templates and state writes to `.ai-task-manager/`.
4. Split skill instructions into shared plus Claude/Codex adapters.
5. Add install `--agent` option.
6. Add Claude stub/symlink install path.
7. Add Codex stub/symlink install path.
8. Add optional Codex plugin artifact.
9. Update README and docs.
10. Add tests for install and path migration.
11. Publish an initial prerelease.

## Current Exported Repo Notes

This repository is a separate GitHub repo exported from `claude-gh-task-manager`, not a partially migrated fork. As of initial inspection, most source files still assume Claude-only behavior:

- `package.json`, `package-lock.json`, `bin/cli.mjs`, README, docs, templates, hooks, and scripts still reference `claude-gh-task-manager` or `@burson.kendrick/claude-gh-task-manager`.
- Runtime defaults still point to `.claude/task-tracker.json`, `.claude/task-tracker-state.json`, `.claude/task-tracker-queue.json`, and `.claude/task-tracker/`.
- `bin/cli.mjs install` copies the full source skill into `.claude/skills/task/` and copies `docs/DESIGN.md`; it does not yet install stable stubs or symlinks.
- A tracked `.claude/` install exists inside this repo. Treat it as an exported/legacy installed copy, not the new canonical source of truth.
- Source canonical skill currently lives at `skill/SKILL.md`; the migration should replace this with `skill/shared/SKILL.md` plus adapter files.
- Current tests are mostly passing except the numeric config normalization issue noted in the testing plan.

Recommended first implementation steps in the next session:

1. Fix numeric argument normalization for `config` commands.
2. Add path helpers and tests for `.ai-task-manager/` preferred paths plus `.claude/` fallback reads.
3. Rename package metadata and CLI strings.
4. Update installer behavior to agent-aware stubs before changing large skill content.

## Tooling And Access Notes

- In the previous Codex session, no GitHub plugin was loaded. GitHub access was available only through the local `gh` CLI.
- `gh auth status` succeeded only when run outside the sandbox because the token is stored in the macOS keyring. Sandboxed `gh` commands could read `~/.config/gh/hosts.yml` but could not read the keyring token.
- If the next session has a GitHub plugin installed, prefer it for GitHub issue/project/PR operations when appropriate.
- If using the shell `gh` CLI from Codex, authenticated commands may require escalation so the process can access the keyring.
- The validated GitHub account was `kburson`, using SSH for git operations, with token scopes including `repo`, `read:org`, `gist`, and `admin:public_key`.

## Open Questions

- What exact npm scope/name should the fork publish under?
- Should the old `claude-gh-task-manager` bin remain as an alias for one or more releases?
- Should default install target be `--agent both` or should the installer prompt?
- Does Claude Code reliably follow symlinked skill folders? If yes, prefer symlink mode. If no, use stub mode.
- Should Codex plugin installation be first-class in v1, or should v1 only support npm plus `.agents/skills` stubs?

## Acceptance Criteria

- A consumer project can install the package once and expose the task skill to both Claude Code and Codex.
- The full process contract lives in one canonical shared skill source.
- Agent-specific installed files are stable stubs or symlinks.
- Updating the npm package updates the skill behavior without copying full markdown files again.
- Both agents read and write the same `.ai-task-manager/` runtime state.
- Existing Claude users can migrate without losing active task state.
- Current GitHub issue/project workflow remains intact.
