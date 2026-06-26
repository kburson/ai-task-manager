# Code Review Findings

Date: 2026-06-26

## Executive Summary

AI Task Manager is a serious, battle-tested skill project. Its strongest qualities are the just-in-time skill routing model, explicit state machine, guard pipeline, defensive issue-body mutation helpers, and deep regression suite. The architecture shows clear intent to make AI agents follow workflow rules instead of relying only on prompt text.

The weak spots are mostly around accumulated orchestration mass: large command files, broad mutable runtime context, duplicated rule prose, migration residue, and a broad npm package surface. The system is not careless; it is carrying too much operational history in too many places. That creates rigidity, viscosity, and higher review cost.

## High-Priority Findings

### 1. No normal CI workflow was observed for tests and lint

Evidence:

- `.github/workflows` contained only `label-beta-report.yml` and `label-discuss.yml`.
- The project has strong local test and quality scripts in `package.json`, but they are not visibly enforced by a standard pull-request or push workflow.

Impact:

- Regressions can be caught locally but missed in repository collaboration.
- The custom test fleet is valuable, but without CI it depends on developer discipline.

Recommendation:

- Add a CI workflow that runs format check, lint, fast tests, and preferably slow tests on an appropriate cadence.

### 2. The npm package surface is too broad

Evidence:

- `npm pack --dry-run --json` reported `entryCount: 797`, `size: 2150179`, and `unpackedSize: 5644397`.
- The packed artifact included tests, archived docs, documentation assets, and maintenance-oriented material.

Impact:

- The runtime contract is harder to understand.
- AI agents and humans see more irrelevant files when trying to infer what matters.
- Install size and package churn increase.

Recommendation:

- Define a stricter package allowlist.
- Add a package-content check that fails when unexpected paths or entry counts appear.

### 3. Core orchestration scripts violate single responsibility

Evidence:

- `scripts/gh/move-state.mjs` is roughly 959 lines and handles direct-invocation policy, transition validation, guard execution, GitHub mutation, timing, marker stamping, cache refresh, and dependent unpark behavior.
- `scripts/task-tracker/verbs/close.mjs`, `scripts/task-tracker/verbs/promote.mjs`, `bin/cli.mjs`, and `scripts/task-tracker/runtime.mjs` are also large orchestration hotspots.

Impact:

- Changes are hard to isolate.
- Tests need to cover many interleaved paths.
- The code is correct-looking but expensive to modify safely.

Recommendation:

- Split orchestration into smaller modules with explicit contracts: parse/input, policy, transition plan, guard execution, mutation, audit/reporting.

## Medium-Priority Findings

### 4. Verb discovery is brittle

Evidence:

- `bin/aitm-registry.mjs` derives task-tracker verbs by parsing `case 'verb'` labels from `scripts/task-tracker/task-tracker.mjs`.

Impact:

- The registry can drift or break if dispatcher syntax changes.
- The command surface is implicit instead of being a durable manifest.

Recommendation:

- Replace regex-based discovery with an explicit command manifest that drives help, aliases, policy, and dispatch.

### 5. Guard architecture is strong but has stale migration residue

Evidence:

- `scripts/task-tracker/lib/guard-registry.mjs` is active, but its header says it is "Skeleton-only" and has "No callers yet."
- State and guard registration have both modern bootstrap files and compatibility shims.

Impact:

- The implementation is better than the documentation inside the file suggests.
- Future contributors and AI agents may misread active architecture as unfinished.

Recommendation:

- Update stale comments.
- Document the current state/guard architecture in one authoritative location.
- Track compatibility shims with retirement criteria.

### 6. AI rules are well structured but duplicated

Evidence:

- `skill/shared/router.md` provides a compact Tier-1 router and directs agents to Tier-2 rule files.
- `skill/adapters/codex/SKILL.md` also repeats multiple shared rules, including issue creation, state movement, checkpoint, role, and review instructions.

Impact:

- Duplication helps adapter autonomy, but increases drift risk.
- AI agents may see competing wording for the same rule.

Recommendation:

- Keep adapters focused on platform conventions and bootstrap mechanics.
- Move shared policy into Tier-2 rule files wherever possible.

### 7. Runtime context is too broad

Evidence:

- `scripts/task-tracker/runtime.mjs` builds a large mutable `ctx` with many helpers that many verbs receive whether they need them or not.

Impact:

- Interface segregation is weak.
- Verbs can become coupled to broad ambient capability instead of narrow dependencies.
- Testing isolated behavior becomes harder.

Recommendation:

- Introduce smaller capability objects, such as `githubClient`, `stateRunner`, `timingRecorder`, `issueBodyMutator`, and `projectConfig`.

### 8. Fail-open and best-effort paths need a central policy

Evidence:

- The codebase contains many operationally reasonable best-effort paths for logging, cache refresh, timing, and recovery behavior.
- Some paths are critical workflow gates; others are telemetry or convenience behavior.

Impact:

- Without a policy matrix, contributors can accidentally make critical rules fail open or make non-critical helpers block workflow.

Recommendation:

- Add a fail-open/fail-closed policy document and tests for critical workflow gates.

## Good

### Just-in-time AI rule loading

The `skill/shared/router.md` design is compact and useful. It keeps the initial AI context small while pointing to verb-specific rule files. This is exactly the kind of structure that helps agents load relevant instructions without drowning in the whole project.

### Layered non-adherence prevention

The project does not rely on prose alone. It combines:

- Skill instructions and adapter rules.
- A primary `npx aitm` command path.
- Shell guards and wrapper scripts.
- Internal gates in `move-state.mjs`.
- State transition validation and guard checks.

That layered design substantially reduces the risk that an AI agent skips required workflow steps.

### Explicit state and guard model

The state machine and state object model are clear architectural assets. `scripts/task-tracker/state-machine.mjs` is small and declarative. The state bootstrap and guard registry show a move toward open, composable guard behavior.

### Defensive mutation helper

`scripts/task-tracker/lib/issue-body-mutate.mjs` is a high-quality safety boundary. It treats issue body edits as an invariant-preserving operation and checks for marker loss, malformed command markers, fabricated proof, incomplete proof, and related risks.

### Deep local test fleet

The project has hundreds of tests and a custom runner with fleet behavior. The fast lane passed during this review. This gives the codebase a real safety net for refactoring if CI is added.

## Bad

### SOLID adherence is uneven

Single Responsibility Principle:

- Strong in pure modules such as the state machine and mutation helper.
- Weak in orchestration files such as `move-state.mjs`, `close.mjs`, `promote.mjs`, `runtime.mjs`, and `bin/cli.mjs`.

Open/Closed Principle:

- Stronger in the state/guard architecture.
- Weaker in command dispatch, where central switch statements and regex registry discovery make new verbs a multi-location change.

Liskov Substitution Principle:

- Not heavily applicable in classic OO terms because this is JavaScript/ESM procedural architecture.
- The closest equivalent is whether state/guard contracts are consistent. The direction is good, but compatibility shims and broad contexts make substitution harder to reason about.

Interface Segregation Principle:

- Weak around `buildContext()` and broad injected `ctx` objects.
- Better in isolated helpers that take explicit inputs.

Dependency Inversion Principle:

- Partial. Some verbs accept injected dependencies, which is good for tests.
- The architecture still has many direct script-level and process-level dependencies.

### Viscosity is high

Adding or changing a workflow rule can require touching skill prose, templates, route tables, state guards, verb behavior, docs, tests, and hooks. This makes the right change feel expensive, which raises the chance of local patches and rule drift.

### Package boundary is not crisp

The package includes much more than the likely runtime surface. That makes the system feel less intentional to downstream users and AI agents.

## Ugly

### `move-state.mjs` is both a crucial safety boundary and a maintenance hazard

The script is valuable because it centralizes dangerous state movement. It is risky because it centralizes too many unrelated responsibilities. This is the main architectural knot in the codebase.

### Migration residue has become architectural noise

The project has compatibility shims, deprecated wording, stale comments, and legacy paths that may have been necessary at one point. Without a retirement ledger, this residue becomes permanent and makes current authority harder to identify.

### AI adherence is strong but text-heavy

The system is unusually good at constraining AI behavior through layered rules. The remaining risk is that some shared policies live in multiple textual places. Text duplication is a form of drift debt, especially in AI-facing systems.

## Maintainability Risk Labels

Fragility:

- Moderate. Critical mutation paths are well defended, but broad orchestrators make unrelated behavior easier to disturb.

Rigidity:

- Moderate to high. Command and workflow changes cross many files.

Immobility:

- Moderate. Useful components exist, but broad runtime context and package sprawl make extraction difficult.

Viscosity:

- High. The codebase has many correct paths, but the easiest change may not always be the architecturally clean one.

Needless complexity:

- Moderate. Much complexity is justified by GitHub workflow edge cases and AI adherence needs. Some complexity now appears accidental due to legacy residue and oversized orchestration files.

## Bottom Line

The project has the bones of a robust workflow engine and an unusually thoughtful AI instruction system. The next maturity step is consolidation: narrow package boundaries, enforce CI, split the largest orchestration modules, make command metadata explicit, and reduce duplicated rule prose.
