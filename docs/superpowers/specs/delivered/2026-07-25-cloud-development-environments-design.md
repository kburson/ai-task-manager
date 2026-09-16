# Cloud Development Environments Design

## Context

AI Task Manager is increasingly tested on itself by multiple agent surfaces. Local
worktrees are useful for hand editing and immediate inspection, but longer
agentic work should be able to run in isolated cloud environments where each
task owns its branch, issue binding, timing ledger, and eventual push path.

This repository currently has no checked-in cloud environment setup contract.
Codex cloud can run repository-specific setup and maintenance scripts from its
environment settings, and Claude cloud/GitHub-agent workflows can call the same
repo-owned scripts. The first pass should make those scripts and the operator
workflow explicit without committing to Codespaces or devcontainer support yet.

## Goals

- Provide checked-in setup and maintenance entrypoints for cloud agent
  environments.
- Prefer Node 25 for development environments while preserving Node 22 as the
  minimum supported runtime.
- Document how Codex and Claude cloud workers should dogfood AI Task Manager
  without hijacking the local trunk session.
- Keep the implementation portable enough that Codespaces/devcontainer support
  can reuse the same scripts later.

## Non-Goals

- Do not add devcontainer, Docker, or Codespaces definitions in this pass.
- Do not automate Claude GitHub Action workflows yet.
- Do not push directly to `origin/trunk` from a cloud worker.
- Do not change CI's Node 22 lane unless a later issue explicitly asks for it.

## Architecture

Add a small `scripts/dev-env/` contract:

- `setup-cloud.sh` bootstraps a fresh cloud checkout.
- `maintenance-cloud.sh` refreshes cached cloud containers.
- A guide documents how cloud workers invoke those scripts and how AITM should
  be used inside each isolated task environment.

The scripts should be plain POSIX-compatible shell where practical and should
avoid relying on local-only tools such as Homebrew or NVM being preinstalled.
They should use checked-in files (`package.json`, `package-lock.json`, CI
workflow expectations) as the source of truth.

## Runtime Policy

`package.json` and CI establish Node 22 as the minimum supported runtime. The
cloud development environment should install or select Node 25 by default so
day-to-day agent work matches the maintainer's preferred development runtime.

The setup contract is:

- Fail clearly if the active Node runtime is below 22.
- Prefer Node 25 when installing/selecting a runtime in cloud setup.
- Run `npm ci` from the lockfile after the runtime is selected.
- Leave project documentation stating Node 22+ as the support floor.
- Leave CI on Node 22 unless a separate compatibility-expansion issue changes it.

## Tool Dependencies

The setup script should verify these tools:

- `node` version 22 or newer, preferring 25.
- `npm`.
- `git`.
- `gh`.
- `jq`.

The script should also account for Puppeteer-backed report generation. Where the
cloud platform allows package installation, it should install browser/system
dependencies or run the appropriate Puppeteer browser installation command. If a
platform blocks that action, the script should print a clear warning that HTML
reports remain available but PDF/browser-backed flows may need additional image
configuration.

## Git And Test Baseline

The repository's CI uses full git history and materializes a local `trunk` ref
for PR-style checkouts. Cloud workers should start from a branch with enough
history for history-sensitive tests. The maintenance script should:

- Fetch remote refs.
- Avoid shallow-history assumptions where possible.
- Materialize or refresh a local `trunk` ref from `origin/trunk` when safe.
- Re-run `npm ci` when `package-lock.json` or package metadata changed since the
  cached setup.

## Agentic Workflow

Each cloud task should follow this workflow:

1. Start a fresh cloud environment or isolated worktree for the task.
2. Create or bind the GitHub issue from inside that environment.
3. Keep the AITM timer and lifecycle commands scoped to that environment.
4. Run design, planning, implementation, verification, and review from that
   environment.
5. Commit with the issue token convention.
6. Push the task branch to origin when complete.
7. Open a PR or hand off for merge according to the normal AITM lifecycle.

Cloud workers must not bind or switch the active issue in the local trunk
checkout. The local trunk session may be occupied by another agent or by the
maintainer's hand-editing workflow.

## Network And Secrets

Codex cloud setup scripts run with internet access, while the Codex agent phase
is offline by default unless environment settings enable network access.
Documentation should recommend keeping agent internet access off by default and
using setup-time installation for dependencies.

The guide should identify the credentials each cloud environment needs:

- GitHub authentication for `gh`, project field updates, issue body mutation,
  and pushing task branches.
- Any provider-specific Claude/Codex credentials configured through that
  platform's secret mechanism.

Secrets should be provided through platform environment or secret settings, not
checked into the repository.

## Error Handling

Scripts should fail fast for missing mandatory tools that cannot be installed
portably. Warnings are acceptable for optional capabilities such as browser/PDF
support when HTML or non-browser workflows still work.

Setup output should be concise and actionable: print the detected runtime,
dependency install status, GitHub CLI status hint, and any skipped optional
capability.

## Testing

The implementation should verify:

- The setup script syntax is valid.
- The maintenance script syntax is valid.
- Documentation names Node 22+ as the minimum and Node 25 as the preferred cloud
  development runtime.
- Existing fast-lane tests still pass after the environment files are added.

For this spike-style issue, passing lint/format and targeted script checks are
the primary completion evidence. Full regression remains governed by the normal
Test-stage process.
