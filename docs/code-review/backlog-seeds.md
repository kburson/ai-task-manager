# Backlog Seeds

Date: 2026-06-26

These are draft user stories derived from the code review. They are intentionally ready to refine into GitHub issues, but issue creation must follow the workspace `AGENTS.md` rule: do not call `gh issue create` directly.

## 1. Add CI For Quality Gates

Priority: High

As a maintainer, I want pull requests and pushes to run format, lint, and test checks so regressions are caught before merge.

Acceptance criteria:

- A GitHub Actions workflow runs on pull requests.
- The workflow runs `npm run format:check`, `npm run lint`, and `npm test`.
- Slow tests are either included in the PR workflow or scheduled separately with a documented reason.
- CI failure blocks merging through normal repository branch protection once configured.

Evidence:

- `.github/workflows` only contained issue-label workflows during review.

## 2. Define And Enforce The npm Package Boundary

Priority: High

As a package consumer, I want the published artifact to contain only runtime-required files so installs are smaller and the contract is clearer.

Acceptance criteria:

- `package.json` `files` is narrowed or otherwise constrained.
- Test files, archived docs, and non-runtime maintenance artifacts are excluded unless explicitly justified.
- A package-content check runs in CI.
- The check verifies allowed paths and a reasonable maximum entry count or size.

Evidence:

- `npm pack --dry-run --json` reported 797 entries and included tests, archives, docs assets, and maintenance material.

## 3. Split `move-state.mjs` Into Focused Modules

Priority: High

As a maintainer, I want state movement responsibilities separated into focused modules so workflow changes can be made safely.

Acceptance criteria:

- Input parsing, direct-invocation policy, transition planning, guard execution, GitHub mutation, audit/timing, and cache/dependent updates are separated.
- The public behavior of `/task promote`, `/task demote`, and internal state movement remains unchanged.
- Existing fast tests pass.
- New focused tests cover at least the extracted policy and transition-planning modules.

Evidence:

- `scripts/gh/move-state.mjs` is roughly 959 lines and owns many unrelated responsibilities.

## 4. Replace Regex Verb Discovery With A Command Manifest

Priority: Medium

As a contributor, I want command metadata to live in an explicit manifest so command routing, help, and aliases do not depend on parser-sensitive source formatting.

Acceptance criteria:

- A manifest declares verbs, aliases, descriptions, policy metadata, and dispatch targets.
- `bin/aitm-registry.mjs` no longer parses switch cases with regex.
- Help output and dispatch use the same manifest.
- Tests cover the manifest-backed registry.

Evidence:

- `bin/aitm-registry.mjs` derives verbs from `case 'verb'` labels in `task-tracker.mjs`.

## 5. Reduce Shared Rule Duplication In Skill Adapters

Priority: Medium

As an AI skill maintainer, I want shared workflow rules to have one source of truth so platform adapters do not drift from core policy.

Acceptance criteria:

- Adapter `SKILL.md` files focus on platform-specific bootstrap and command conventions.
- Shared rules live in `skill/shared/router.md` or Tier-2 rule files.
- Duplicated rules are removed or replaced with explicit references.
- A reviewer can identify the authoritative rule file for issue creation, state movement, checkpoint pause behavior, and review behavior.

Evidence:

- `skill/adapters/codex/SKILL.md` repeats several shared workflow rules that also appear in shared routing/rule files.

## 6. Update Guard Architecture Documentation And Remove Stale Comments

Priority: Medium

As a contributor, I want the guard architecture comments and docs to reflect the current implementation so I can understand active extension points.

Acceptance criteria:

- `guard-registry.mjs` no longer describes itself as skeleton-only if it has active callers.
- Current guard registration flow is documented in one authoritative place.
- Deprecated guard/bootstrap shims are marked with owner, purpose, and retirement criteria.
- Tests or docs confirm the intended current guard registration path.

Evidence:

- `scripts/task-tracker/lib/guard-registry.mjs` had stale "Skeleton-only" / "No callers yet" wording during review.

## 7. Introduce Narrow Runtime Capability Objects

Priority: Medium

As a verb implementer, I want to receive only the capabilities my verb needs so command behavior is easier to test and reason about.

Acceptance criteria:

- `buildContext()` is gradually decomposed into smaller capability objects.
- At least one large verb is migrated to a narrow dependency interface.
- Tests prove the migrated verb can run with a small fixture instead of the full runtime context.
- Existing public CLI behavior remains unchanged.

Evidence:

- `scripts/task-tracker/runtime.mjs` builds a broad mutable context consumed by many verbs.

## 8. Create A Fail-Open / Fail-Closed Policy Matrix

Priority: Medium

As a maintainer, I want critical workflow gates to have explicit failure policy so convenience failures do not block work and safety failures do not pass silently.

Acceptance criteria:

- A policy document classifies gates, telemetry, cache refresh, timing, marker mutation, GitHub operations, and recovery helpers.
- Critical state and issue lifecycle gates are documented as fail-closed unless explicitly justified.
- Non-critical helpers are documented as best-effort where appropriate.
- Tests cover at least three critical fail-closed cases.

Evidence:

- The codebase contains many best-effort paths and critical gates without one central policy map.

## 9. Add A Compatibility-Retirement Ledger

Priority: Medium

As a maintainer, I want legacy compatibility paths tracked with exit criteria so migration support does not become permanent architecture.

Acceptance criteria:

- A ledger lists deprecated markers, shims, old aliases, and migration compatibility paths.
- Each entry has rationale, owner, removal condition, and target review date.
- At least one existing compatibility path is either removed or added to the ledger.

Evidence:

- Review found stale comments, compatibility shims, and migration-oriented paths that obscure current authority.

## 10. Add Package And AI-Rule Architecture Overview

Priority: Low

As a new AI or human contributor, I want a concise architecture map so I can understand the skill router, command wrapper, state machine, guard registry, and mutation boundaries quickly.

Acceptance criteria:

- A short architecture doc explains Tier-0/Tier-1/Tier-2 skill loading.
- The doc explains how `npx aitm` routes commands and prevents non-adherent state/issue operations.
- The doc links to the state machine, guard registry, issue-body mutator, and command dispatcher.
- The doc identifies which files are runtime contract versus development/test/support material.

Evidence:

- The current architecture is strong but distributed across skill prose, templates, scripts, and tests.
