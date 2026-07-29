# Codex Local Worktree Environment Design

**Date:** 2026-07-29

**Status:** Approved in chat

## Goal

Give every Codex-managed `ai-task-manager` worktree a repeatable local
development environment that installs the locked dependencies, validates the
AITM toolchain, and preserves the repository's dogfood
`node_modules/ai-task-manager -> ..` self-link.

## Scope

The repository will provide:

1. A Node-based verifier for the local runtime, required command-line tools,
   tracked AITM configuration, and dogfood self-link.
2. A thin shell setup entrypoint that runs `npm ci`, repairs the self-link, and
   invokes the verifier.
3. A checked-in operator guide containing the exact Codex desktop navigation,
   setup command, recommended actions, per-task startup sequence, and recovery
   checks.

The Codex desktop app remains responsible for generating and saving its local
environment record under `.codex/`. The repository will not invent or
hand-author an undocumented app configuration schema.

## Environment Contract

- Node.js 22 or newer is required; Node.js 25 is preferred for active
  development.
- `git`, `node`, `npm`, `gh`, and `jq` must resolve on `PATH`.
- `npm ci` is the only dependency-install command used during automatic setup.
- `npm ci` must trigger the existing `prepare` hook, and `npm run link:self`
  must remain an idempotent repair step.
- `node_modules/ai-task-manager` must be a symbolic link whose real path is the
  current worktree root.
- `.agents/skills/task/SKILL.md`, `.codex/hooks.json`, and
  `.ai-task-manager/task-tracker.json` must be present.
- Missing GitHub authentication is a warning because offline tests can still
  run, but GitHub-backed AITM operations remain unavailable until `gh` is
  authenticated.

## Worktree Isolation

The setup must not copy `node_modules`, `.tmp/aitm`, active task state, or the
self-link from another checkout. Each worktree installs its own dependencies
and creates a relative self-link to itself. Tracked AITM configuration arrives
through Git.

`.worktreeinclude` is reserved for intentionally ignored local inputs such as
an `.env` file. It must not list AITM runtime state, dependencies, or source
symlinks.

## Task Lifecycle

Automatic environment setup must not bind an issue or run tests. The issue
number is session-specific, and AITM requires the correct task/timer context
before issue work or verification begins.

After setup, an operator binds work and then runs baseline verification:

```bash
npx aitm start <issue-number>
npx aitm status
npm test
```

Repository maintenance that is intentionally not associated with a GitHub
issue uses audited chore mode instead.

## Error Handling

The verifier exits nonzero and lists every detected contract violation. The
setup script stops on missing tools, unsupported Node versions, failed
dependency installation, or an invalid dogfood link. A failed `gh auth status`
prints a warning without invalidating the otherwise usable local environment.

## Verification

Automated tests will exercise the verifier against synthetic worktree roots,
including:

- a valid Node 25 worktree with the required tracked files and correct link;
- a Node version below 22;
- missing required tools or tracked AITM files;
- a missing, non-symbolic, or foreign self-link.

The shell entrypoint will receive a syntax check, and the completed repository
change will run formatting, focused tests, and the fast test lane.
