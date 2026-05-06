# AITM Backlog Test Master Plan

## Purpose

Use this plan to populate `aitm-backlog-test` with a realistic benchmark backlog for building AI Task Manager from scratch. The backlog is intentionally structured to test orchestration rules:

- Multiple epics with clear dependency boundaries.
- Several parallel fan-out waves inside each epic.
- Cross-epic sequencing where later work depends on completed foundations.
- Issue bodies that force agents to inspect the repository design before implementation.
- Enough shared files and integration points to expose stale-branch, missing-context, and unchecked-DoD failures.

## Sequencing Rules

**Sequencing key:** Same Sequence = parallel. Higher Sequence = blocked until all lower sequences in the same epic close.

**Epic execution order:** Epic 1 -> Epic 2 -> Epic 3 -> Epic 4 -> Epic 5 -> Epic 6.

**Fan-out rule:** Once an epic starts, parallel work happens only within that epic's sub-issues. Do not start the next epic until the active epic closes.

**Dependency validation rule:** Before fanning out sub-issues in an epic, validate that the proposed Sequence values still match actual code dependencies. If a dependency is discovered, update Sequence before dispatch.

## Target Product

Build `ai-task-manager`, an npm-distributed Node package that lets Claude Code and Codex share the same GitHub issue/project task-management workflow, shared scripts, shared templates, and shared runtime state.

The finished product should:

- Install into consumer projects with `npx ai-task-manager install --agent claude|codex|both`.
- Support stable skill stubs and optional symlink mode.
- Store runtime state in `.ai-task-manager/` while reading legacy `.claude/` state as fallback.
- Preserve existing Claude Code `/task` behavior.
- Add Codex compatibility through `.agents/skills/task/SKILL.md`.
- Include an optional Codex plugin artifact.
- Drive GitHub issue/project state through scripts and GitHub CLI.
- Provide focused tests for state migration, installer behavior, and CLI command semantics.

## Epic 1 - Package Scaffold And Runtime Path Foundation

**Priority:** P0 | **Size:** L | **Estimate:** 14h | **Sequence:** 1

### Scope

Create the baseline package structure, package metadata, shared path model, and tests that all later work depends on.

### Acceptance Criteria

- [ ] Package metadata uses `ai-task-manager` as the canonical package/bin name.
- [ ] Legacy `claude-gh-task-manager` bin alias remains available for one compatibility release.
- [ ] Shared runtime folder is `.ai-task-manager/`.
- [ ] Legacy `.claude/` runtime files are read as fallback only when shared files are absent.
- [ ] Writes always target `.ai-task-manager/`.
- [ ] Unit tests cover preferred path reads, fallback reads, and write-forward behavior.

### Sub-Issues

#### E1-S1 - Rename package metadata and bins
**Priority:** P0 | **Size:** S | **Estimate:** 2h | **Sequence:** 1 | **Labels:** packaging, dx

Update `package.json`, `package-lock.json`, README quickstart references, repository URLs, keywords, and package description. Keep `claude-gh-task-manager` as a bin alias.

Acceptance Criteria:

- [ ] `package.json.name` is `ai-task-manager`.
- [ ] `bin.ai-task-manager` points to `bin/cli.mjs`.
- [ ] `bin.claude-gh-task-manager` remains as compatibility alias.
- [ ] Package files include future `codex/` artifact directory.

#### E1-S2 - Add runtime path helper module
**Priority:** P0 | **Size:** M | **Estimate:** 3h | **Sequence:** 1 | **Labels:** backend, migration

Create path utilities that know preferred shared paths and legacy Claude fallback paths.

Acceptance Criteria:

- [ ] Helper maps `.ai-task-manager/task-tracker.json` to `.claude/task-tracker.json`.
- [ ] Helper maps state, queue, pickup directive, and DoD files.
- [ ] Helper returns preferred path when both preferred and legacy exist.
- [ ] Helper is covered by unit tests or exercised through config/state tests.

#### E1-S3 - Migrate config defaults and fallback reads
**Priority:** P0 | **Size:** M | **Estimate:** 3h | **Sequence:** 2 | **Depends on:** E1-S2 | **Labels:** backend, migration

Update config loading to prefer `.ai-task-manager/task-tracker.json` and `~/.ai-task-manager/task-tracker-config.json`, with fallback reads from legacy `.claude` locations.

Acceptance Criteria:

- [ ] Default `statePath` is `.ai-task-manager/task-tracker-state.json`.
- [ ] Default `queuePath` is `.ai-task-manager/task-tracker-queue.json`.
- [ ] Project config reads legacy `.claude/task-tracker.json` only if preferred config is absent.
- [ ] User config reads legacy `~/.claude/task-tracker-config.json` only if preferred user config is absent.
- [ ] `setConfigValue` writes only to preferred project config path.

#### E1-S4 - Migrate state and queue reads with write-forward behavior
**Priority:** P0 | **Size:** M | **Estimate:** 3h | **Sequence:** 2 | **Depends on:** E1-S2 | **Labels:** backend, migration

Update state and queue helpers so existing legacy state is readable, but new writes go to `.ai-task-manager/`.

Acceptance Criteria:

- [ ] `loadState(preferredPath)` reads legacy state when preferred file is missing.
- [ ] `saveState` writes preferred path and creates parent directories.
- [ ] Queue reads legacy queue when preferred queue is absent.
- [ ] Queue writes preferred queue path after drain/enqueue.

#### E1-S5 - Fix CLI numeric argument normalization
**Priority:** P1 | **Size:** S | **Estimate:** 1h | **Sequence:** 2 | **Labels:** bug, test

Fix the baseline parser bug where `config wpm 175` is rewritten to `config wpm #175`.

Acceptance Criteria:

- [ ] Bare numeric first arg still starts an issue, e.g. `156` -> `#156`.
- [ ] Issue-accepting verbs normalize numeric operands where appropriate.
- [ ] Config values are not normalized as issue numbers.
- [ ] Existing CLI tests pass.

#### E1-S6 - Add migration-focused tests
**Priority:** P0 | **Size:** M | **Estimate:** 2h | **Sequence:** 3 | **Depends on:** E1-S3, E1-S4, E1-S5 | **Labels:** test

Expand config, state, queue, and CLI tests for migration behavior.

Acceptance Criteria:

- [ ] Config tests cover preferred-over-legacy precedence.
- [ ] Config tests cover legacy fallback.
- [ ] Config tests cover preferred writes.
- [ ] State tests cover legacy fallback and preferred writes.
- [ ] CLI tests cover numeric config values.

## Epic 2 - Core Task Tracker CLI And Session State

**Priority:** P0 | **Size:** XL | **Estimate:** 24h | **Sequence:** 2

### Scope

Build the task-tracker command surface and session state engine.

### Acceptance Criteria

- [ ] CLI supports status, start/switch, resume, pause, update, close, plan, new, log, check, fleet, and config.
- [ ] Timing rows are generated consistently.
- [ ] Active/idle minutes are calculated from session timestamps.
- [ ] Word-count markers survive compaction.
- [ ] Tests cover core command behavior without network.

### Sub-Issues

#### E2-S1 - Implement state model and command dispatcher
**Priority:** P0 | **Size:** M | **Estimate:** 4h | **Sequence:** 1 | **Labels:** backend

Acceptance Criteria:

- [ ] CLI dispatches verbs from `scripts/task-tracker/task-tracker.mjs`.
- [ ] State includes `active`, `lastActive`, `entryStartTs`, `wordsAtEntryStart`, `totalActiveMinutes`, and `planBucket`.
- [ ] Missing or corrupt state returns an empty state object.
- [ ] `status` reports active, paused, and empty states.

#### E2-S2 - Implement active-time calculation
**Priority:** P0 | **Size:** M | **Estimate:** 3h | **Sequence:** 1 | **Labels:** backend

Acceptance Criteria:

- [ ] Active minutes and idle minutes are computed from event timestamps.
- [ ] Idle threshold is configurable.
- [ ] Tests cover continuous work, idle gaps, and empty event streams.

#### E2-S3 - Implement word counter and session markers
**Priority:** P0 | **Size:** M | **Estimate:** 4h | **Sequence:** 1 | **Labels:** backend

Acceptance Criteria:

- [ ] Word counter can read session JSONL.
- [ ] Marker files track baseline line and word offsets.
- [ ] Word delta is calculated from marker to current session line.
- [ ] Tests cover marker load/save and count behavior.

#### E2-S4 - Implement start/switch/pause/update/close flows
**Priority:** P0 | **Size:** L | **Estimate:** 5h | **Sequence:** 2 | **Depends on:** E2-S1, E2-S2, E2-S3 | **Labels:** backend

Acceptance Criteria:

- [ ] Starting `#N` sets active issue and baseline.
- [ ] Switching issues auto-ends prior active issue when configured.
- [ ] Pause flushes active timing and preserves `lastActive`.
- [ ] Update flushes timing and keeps task active.
- [ ] Close flushes timing, clears active state, and preserves last active issue.

#### E2-S5 - Implement plan mode and new issue handoff
**Priority:** P1 | **Size:** M | **Estimate:** 4h | **Sequence:** 2 | **Depends on:** E2-S1 | **Labels:** orchestration

Acceptance Criteria:

- [ ] `/task plan` starts an untracked planning bucket.
- [ ] `/task new` can promote plan mode into an issue when network is enabled.
- [ ] Tests can fake new issue creation without network.
- [ ] Plan bucket is cleared after promotion.

#### E2-S6 - Implement close gate and checkbox helper
**Priority:** P0 | **Size:** M | **Estimate:** 4h | **Sequence:** 3 | **Depends on:** E2-S4 | **Labels:** safety, github

Acceptance Criteria:

- [ ] Close refuses unchecked body checkboxes unless audited force is used.
- [ ] Deep dive checkbox is specifically enforced when present.
- [ ] `/task check "<label>"` toggles matching issue body checkbox.
- [ ] Force close writes an audit note.

## Epic 3 - GitHub Integration And Project Board Automation

**Priority:** P0 | **Size:** XL | **Estimate:** 26h | **Sequence:** 3

### Scope

Build GitHub issue comments, project field updates, Kanban movement, priority updates, and project initialization.

### Acceptance Criteria

- [ ] Timing log comments are created and updated.
- [ ] GitHub Projects V2 fields are discovered and written.
- [ ] Kanban state movement works for Backlog, Ready, In Progress, In Review, and Done.
- [ ] Priority helper supports P0/P1/P2 and cascade mode.
- [ ] Init script writes `.ai-task-manager/task-tracker.json`.

### Sub-Issues

#### E3-S1 - Implement timing comment module
**Priority:** P0 | **Size:** M | **Estimate:** 4h | **Sequence:** 1 | **Labels:** github, backend

Acceptance Criteria:

- [ ] Builds deterministic markdown timing rows.
- [ ] Finds or creates the timing log comment.
- [ ] Appends rows without duplicating table headers.
- [ ] Unit tests cover row formatting and comment updates.

#### E3-S2 - Implement queue for failed GitHub posts
**Priority:** P0 | **Size:** M | **Estimate:** 3h | **Sequence:** 1 | **Labels:** resilience

Acceptance Criteria:

- [ ] Failed timing posts enqueue events.
- [ ] Later invocations drain queued events.
- [ ] Queue preserves remaining events when drain fails partway through.
- [ ] Tests cover enqueue, peek, drain success, and drain failure.

#### E3-S3 - Implement project field actuals updater
**Priority:** P0 | **Size:** L | **Estimate:** 5h | **Sequence:** 2 | **Depends on:** E3-S1 | **Labels:** github, reporting

Acceptance Criteria:

- [ ] Parses timing log into total active minutes.
- [ ] Reads final word marker as Context Length.
- [ ] Updates Actual Session Time and Context Length project fields.
- [ ] Supports `--dry-run`.

#### E3-S4 - Implement Kanban state movement helper
**Priority:** P0 | **Size:** L | **Estimate:** 5h | **Sequence:** 2 | **Labels:** github, workflow

Acceptance Criteria:

- [ ] Reads project config from `.ai-task-manager/` with `.claude/` fallback.
- [ ] Moves project item state through GitHub Projects V2.
- [ ] Supports `--item-id` override.
- [ ] Refuses direct Done movement when close gate conditions fail.

#### E3-S5 - Implement priority helper
**Priority:** P1 | **Size:** M | **Estimate:** 3h | **Sequence:** 2 | **Labels:** github, workflow

Acceptance Criteria:

- [ ] Sets P0/P1/P2 using configured project field option IDs.
- [ ] Supports cascade to direct sub-issues.
- [ ] Skips issues not found in project with clear output.

#### E3-S6 - Implement interactive project initialization
**Priority:** P0 | **Size:** XL | **Estimate:** 6h | **Sequence:** 3 | **Depends on:** E3-S3, E3-S4, E3-S5 | **Labels:** github, dx

Acceptance Criteria:

- [ ] Detects GitHub repo.
- [ ] Selects or creates GitHub Project.
- [ ] Maps or creates Status, Priority, Size, Estimate, Actual Session Time, Context Length, and Sequence fields.
- [ ] Writes config to `.ai-task-manager/task-tracker.json`.
- [ ] Writes task and bug issue templates.

## Epic 4 - Agent Installation, Skills, Hooks, And Templates

**Priority:** P0 | **Size:** XL | **Estimate:** 22h | **Sequence:** 4

### Scope

Package the workflow for Claude Code and Codex through agent-specific skill adapters, stable stubs or symlinks, shared templates, hooks, and optional plugin packaging.

### Acceptance Criteria

- [ ] Installer supports `--agent claude`, `--agent codex`, and `--agent both`.
- [ ] Installer supports `--link-mode stub` and `--link-mode symlink`.
- [ ] Full process contract lives in one shared skill file.
- [ ] Claude and Codex adapters are thin and agent-specific.
- [ ] Shared templates install to `.ai-task-manager/`.
- [ ] Optional Codex plugin artifact exists.

### Sub-Issues

#### E4-S1 - Split shared skill and agent adapters
**Priority:** P0 | **Size:** L | **Estimate:** 5h | **Sequence:** 1 | **Labels:** skill, docs

Acceptance Criteria:

- [ ] `skill/shared/SKILL.md` contains agent-neutral workflow.
- [ ] `skill/adapters/claude/SKILL.md` loads shared workflow and adds Claude-specific guidance.
- [ ] `skill/adapters/codex/SKILL.md` loads shared workflow and adds Codex-specific guidance.
- [ ] Legacy `skill/SKILL.md` remains as a compatibility pointer.

#### E4-S2 - Implement agent-aware installer
**Priority:** P0 | **Size:** L | **Estimate:** 5h | **Sequence:** 1 | **Labels:** cli, install

Acceptance Criteria:

- [ ] `install --agent claude` writes only Claude-specific files plus shared templates.
- [ ] `install --agent codex` writes only Codex-specific files plus shared templates.
- [ ] `install --agent both` writes both.
- [ ] Invalid agent values fail with clear errors.
- [ ] Installer is idempotent.

#### E4-S3 - Implement stub and symlink link modes
**Priority:** P0 | **Size:** M | **Estimate:** 3h | **Sequence:** 2 | **Depends on:** E4-S1, E4-S2 | **Labels:** install

Acceptance Criteria:

- [ ] Stub mode writes valid frontmatter stubs pointing to canonical package files.
- [ ] Symlink mode links skill folders to canonical adapter folders.
- [ ] Symlink mode refuses to overwrite non-symlink folders.
- [ ] Install output prints what was created and what it points to.

#### E4-S4 - Install Claude hooks and slash command
**Priority:** P0 | **Size:** M | **Estimate:** 3h | **Sequence:** 2 | **Depends on:** E4-S2 | **Labels:** claude, hooks

Acceptance Criteria:

- [ ] `.claude/commands/task.md` invokes the task skill.
- [ ] `.claude/hooks/task-tracker.sh` delegates to package hook.
- [ ] `.claude/settings.json` registers SessionStart, PreCompact, and PostCompact hooks.
- [ ] Claude permission allow rules include new package paths.

#### E4-S5 - Install shared templates and preflight gate
**Priority:** P0 | **Size:** M | **Estimate:** 3h | **Sequence:** 2 | **Depends on:** E4-S2 | **Labels:** workflow, safety

Acceptance Criteria:

- [ ] `pickup-directive.md` installs to `.ai-task-manager/`.
- [ ] `definition-of-done.md` installs to `.ai-task-manager/`.
- [ ] Existing edited templates are backed up before overwrite.
- [ ] Preflight requires both templates before issue creation.

#### E4-S6 - Add Codex plugin artifact
**Priority:** P2 | **Size:** S | **Estimate:** 2h | **Sequence:** 3 | **Depends on:** E4-S1 | **Labels:** codex, packaging

Acceptance Criteria:

- [ ] `codex/plugin/.codex-plugin/plugin.json` exists.
- [ ] Plugin skill exists at `codex/plugin/skills/task/SKILL.md`.
- [ ] Plugin skill documents that npm package install is still required for scripts.
- [ ] Package `files` includes `codex/`.

#### E4-S7 - Installer tests
**Priority:** P0 | **Size:** S | **Estimate:** 1h | **Sequence:** 3 | **Depends on:** E4-S2, E4-S3, E4-S4, E4-S5 | **Labels:** test

Acceptance Criteria:

- [ ] Test asserts Claude stub install.
- [ ] Test asserts Codex stub install.
- [ ] Test asserts hook stub points to `node_modules`.
- [ ] Test asserts `.gitignore` includes shared and legacy state entries.
- [ ] Test asserts scripts are not copied into consumer project.

## Epic 5 - Orchestration Workflow And Multi-Agent Governance

**Priority:** P1 | **Size:** L | **Estimate:** 18h | **Sequence:** 5

### Scope

Define and enforce backlog orchestration rules, fan-out discipline, dependency validation, fleet registry, and pickup directives.

### Acceptance Criteria

- [ ] Master-plan-to-backlog workflow creates epics and sub-issues with pickup directives.
- [ ] Agents validate dependencies before fan-out.
- [ ] Fleet registry tracks active tasks across worktrees.
- [ ] Agents do not bypass close gates or direct Done movement.
- [ ] The process contract is testable through issue checklists.

### Sub-Issues

#### E5-S1 - Define pickup directive contract
**Priority:** P0 | **Size:** M | **Estimate:** 3h | **Sequence:** 1 | **Labels:** workflow

Acceptance Criteria:

- [ ] Directive requires deep dive before code edits.
- [ ] Directive requires DoD and AC verification before close.
- [ ] Directive explains fan-out and dependency validation.
- [ ] Directive references `.ai-task-manager/` paths.

#### E5-S2 - Implement preflight block generation
**Priority:** P0 | **Size:** M | **Estimate:** 3h | **Sequence:** 1 | **Labels:** workflow, safety

Acceptance Criteria:

- [ ] Preflight emits pickup directive block with DoD checklist.
- [ ] Preflight supports `--check-only`.
- [ ] Missing templates abort issue creation with clear remediation.
- [ ] Generated block references `.ai-task-manager/pickup-directive.md`.

#### E5-S3 - Implement fleet registry
**Priority:** P1 | **Size:** M | **Estimate:** 4h | **Sequence:** 2 | **Labels:** multi-agent

Acceptance Criteria:

- [ ] Registry records active task, role, branch, and worktree.
- [ ] Registry can deregister completed tasks.
- [ ] Registry supports main worktree lookup.
- [ ] `/task fleet` shows active tasks.

#### E5-S4 - Add orchestrator state-isolation guard
**Priority:** P1 | **Size:** M | **Estimate:** 3h | **Sequence:** 2 | **Labels:** multi-agent, safety

Acceptance Criteria:

- [ ] Orchestrator snapshots shared config/state before fan-out.
- [ ] Orchestrator detects unexpected main-repo state changes after agents return.
- [ ] Recovery guidance is documented.

#### E5-S5 - Add backlog spec parsing guidance
**Priority:** P1 | **Size:** M | **Estimate:** 3h | **Sequence:** 3 | **Depends on:** E5-S1, E5-S2 | **Labels:** docs, orchestration

Acceptance Criteria:

- [ ] Shared skill explains expected master plan format.
- [ ] Shared skill explains epics, sub-issues, solo tasks, Priority, Size, Estimate, Sequence, and Model fields.
- [ ] Shared skill explains same-sequence fan-out and higher-sequence blocking.

#### E5-S6 - Add orchestration acceptance tests or manual smoke script
**Priority:** P2 | **Size:** S | **Estimate:** 2h | **Sequence:** 3 | **Depends on:** E5-S3, E5-S5 | **Labels:** test

Acceptance Criteria:

- [ ] Manual test plan covers creating a backlog from a spec.
- [ ] Manual test plan covers fan-out sequence validation.
- [ ] Manual test plan covers close-gate refusal.

## Epic 6 - Reporting, Documentation, And Release Readiness

**Priority:** P1 | **Size:** L | **Estimate:** 16h | **Sequence:** 6

### Scope

Complete value reporting, status line support, docs, package artifact verification, and release readiness checks.

### Acceptance Criteria

- [ ] Value report reads project config from shared path with legacy fallback.
- [ ] Status line reads shared state with legacy fallback.
- [ ] README covers Claude, Codex, dual install, migration, prerequisites, and update behavior.
- [ ] Package dry-run includes all required files.
- [ ] Full test suite passes.

### Sub-Issues

#### E6-S1 - Implement value report generator
**Priority:** P1 | **Size:** L | **Estimate:** 5h | **Sequence:** 1 | **Labels:** reporting

Acceptance Criteria:

- [ ] Report reads repo/project config from `.ai-task-manager/`.
- [ ] Report supports legacy `.claude/` fallback.
- [ ] Report can filter by issue, date range, status, and state.
- [ ] Report emits HTML and optionally PDF.

#### E6-S2 - Implement Claude status line helper
**Priority:** P2 | **Size:** S | **Estimate:** 2h | **Sequence:** 1 | **Labels:** claude, dx

Acceptance Criteria:

- [ ] Status line reads `.ai-task-manager/task-tracker-state.json`.
- [ ] Status line falls back to `.claude/task-tracker-state.json`.
- [ ] Installer can configure Claude user settings for status line.

#### E6-S3 - Update README and design docs
**Priority:** P0 | **Size:** M | **Estimate:** 3h | **Sequence:** 2 | **Labels:** docs

Acceptance Criteria:

- [ ] README describes `ai-task-manager`.
- [ ] README documents Claude install, Codex install, and dual install.
- [ ] README documents shared state folder and legacy migration.
- [ ] Design doc reflects agent-neutral architecture.

#### E6-S4 - Verify package contents
**Priority:** P0 | **Size:** S | **Estimate:** 1h | **Sequence:** 2 | **Labels:** release

Acceptance Criteria:

- [ ] `npm pack --dry-run` includes `bin/`, `skill/`, `codex/`, `hooks/`, `scripts/`, `statusline/`, `docs/`, and `templates/`.
- [ ] Package does not include generated consumer `.ai-task-manager/` state.
- [ ] Package lock no longer includes old package as a dev dependency.

#### E6-S5 - Full test and smoke validation
**Priority:** P0 | **Size:** M | **Estimate:** 3h | **Sequence:** 3 | **Depends on:** E6-S3, E6-S4 | **Labels:** test, release

Acceptance Criteria:

- [ ] All task-tracker unit tests pass.
- [ ] `install --agent claude` smoke test passes.
- [ ] `install --agent codex` smoke test passes.
- [ ] `install --agent both` smoke test passes.
- [ ] `install --agent both --link-mode symlink` smoke test passes.

#### E6-S6 - Prepare prerelease checklist
**Priority:** P1 | **Size:** S | **Estimate:** 2h | **Sequence:** 3 | **Depends on:** E6-S5 | **Labels:** release

Acceptance Criteria:

- [ ] Open questions are documented.
- [ ] Compatibility alias behavior is documented.
- [ ] Publish command and access mode are documented.
- [ ] Manual GitHub Project test results are recorded.

## Epic 7 - Codex Engagement Metrics

**Priority:** P1 | **Size:** XL | **Estimate:** 36h | **Sequence:** 7

### Scope

Add a Codex-compatible metrics model that separates engaged human review time from true idle time. The current Claude path can derive words and idle gaps from Claude session data, but Codex currently records elapsed task time without a transcript/event source, leaving `Idle Min`, `Delta Words`, and `Word Marker` at zero. This epic makes that limitation explicit and adds a path to recover meaningful engagement metrics.

### Product Model

For each agent turn, the tracker should distinguish:

- **Agent active time** - time spent executing commands or producing output.
- **Human review time** - plausible time spent reading/evaluating visible assistant output.
- **True idle time** - wall-clock gap beyond plausible review/input time.

Default formula:

```text
estimatedReviewMinutes = visibleAssistantWords / configuredWpm
reviewMinutes = min(responseGapMinutes, estimatedReviewMinutes + reviewGraceMinutes)
trueIdleMinutes = max(0, responseGapMinutes - reviewMinutes)
engagedMinutes = wallMinutes - trueIdleMinutes
```

### Acceptance Criteria

- [ ] Codex timing rows no longer silently report unsupported word/idle metrics as real zeros.
- [ ] Tracker can represent `unsupported`, `estimated`, and `measured` metric quality.
- [ ] Human review time is estimated from visible assistant words and configured WPM when Codex transcript/event data is unavailable.
- [ ] True idle time is calculated as time beyond estimated review budget plus grace.
- [ ] The chosen Codex data-capture source is documented with evidence and fallback behavior.
- [ ] Reports and docs explain how engaged time is calculated for Claude and Codex.
- [ ] Tests cover Codex no-source behavior, estimated review behavior, and long true-idle gaps.

### Sub-Issues

#### E7-S1 - Research official Codex observability surfaces
**Priority:** P0 | **Size:** S | **Estimate:** 2h | **Sequence:** 1 | **Labels:** research, codex

Determine what OpenAI officially documents for Codex session persistence, hooks, logs, transcript access, and token/session metadata.

Acceptance Criteria:

- [ ] Official OpenAI docs/help pages are reviewed for Codex CLI/session persistence and hooks.
- [ ] OpenAI Codex repository docs or source references are reviewed for rollout/session storage.
- [ ] Findings distinguish documented API/support from observed implementation details.
- [ ] Gaps and unsupported assumptions are recorded in a design note.

#### E7-S2 - Inspect local Codex rollout/session file schema
**Priority:** P0 | **Size:** M | **Estimate:** 4h | **Sequence:** 1 | **Labels:** research, codex, metrics

Analyze local `~/.codex/sessions/**/*.jsonl` rollout files without exposing transcript contents. Build a schema map for timestamps, message roles, visible assistant text, user messages, tool events, command output, token-count events, and session metadata.

Acceptance Criteria:

- [ ] Script or notes identify rollout file locations and naming pattern.
- [ ] Schema map lists top-level event types and payload shapes.
- [ ] Candidate visible-text fields are identified.
- [ ] Non-reviewable fields are identified and excluded, including system/developer instructions, encrypted reasoning, and internal tool payloads.
- [ ] Privacy constraints are documented so tests use synthetic fixtures, not real transcripts.

#### E7-S3 - Research Codex hooks for real-time capture
**Priority:** P1 | **Size:** M | **Estimate:** 3h | **Sequence:** 1 | **Labels:** research, codex, hooks

Determine whether Codex hooks can capture session events in real time, and whether they expose enough data to count visible output words and timestamps.

Acceptance Criteria:

- [ ] `~/.codex/config.toml` and any `hooks.json` behavior are inspected.
- [ ] Hook event names, payloads, and enablement requirements are documented.
- [ ] Feasibility of adding AI Task Manager hooks is assessed.
- [ ] Hook approach is compared against rollout-file parsing for reliability, latency, and installation complexity.

#### E7-S4 - Determine active Codex session discovery strategy
**Priority:** P0 | **Size:** M | **Estimate:** 3h | **Sequence:** 2 | **Depends on:** E7-S2 | **Labels:** research, codex

Find the safest way to map the current project/thread to the active Codex rollout file.

Acceptance Criteria:

- [ ] `~/.codex/session_index.jsonl` is inspected for usable current-thread/project mapping.
- [ ] Rollout `session_meta` fields are inspected for cwd, session id, source, and model provider.
- [ ] Strategy handles multiple sessions on the same day.
- [ ] Strategy handles resumed sessions.
- [ ] Failure mode is defined when no active session can be confidently selected.

#### E7-S5 - Decide source of truth for Codex metrics
**Priority:** P0 | **Size:** S | **Estimate:** 2h | **Sequence:** 2 | **Depends on:** E7-S1, E7-S2, E7-S3, E7-S4 | **Labels:** design, codex, metrics

Write a short architecture decision record choosing the initial Codex metrics source and fallback order.

Acceptance Criteria:

- [ ] Decision compares official docs, rollout JSONL parsing, hooks, and manual commands.
- [ ] Initial implementation source is selected.
- [ ] Fallback order is selected.
- [ ] Risks are documented, including rollout format drift and privacy concerns.
- [ ] Test fixture strategy is documented.

#### E7-S6 - Define metrics schema and quality flags
**Priority:** P0 | **Size:** M | **Estimate:** 3h | **Sequence:** 1 | **Labels:** backend, metrics

Define a durable schema for session metrics that can represent measured Claude metrics, estimated Codex metrics, and unsupported fields without conflating unknown values with zero.

Acceptance Criteria:

- [ ] State model can store `agentActiveMinutes`, `humanReviewMinutes`, `trueIdleMinutes`, `visibleAssistantWords`, and metric quality.
- [ ] Metric quality supports at least `measured`, `estimated`, and `unsupported`.
- [ ] Existing timing rows can still be emitted in the current table format for backward compatibility.
- [ ] Unknown word metrics are not displayed as real zero values unless zero was actually measured.

#### E7-S7 - Add agent metrics adapter boundary
**Priority:** P0 | **Size:** M | **Estimate:** 4h | **Sequence:** 2 | **Depends on:** E7-S5, E7-S6 | **Labels:** architecture, metrics

Introduce an adapter boundary so Claude and Codex metrics collection can differ without tangling the task tracker core.

Acceptance Criteria:

- [ ] Metrics collection is routed through an adapter selected by agent/environment.
- [ ] Claude adapter preserves existing JSONL/session behavior.
- [ ] Codex adapter has a defined no-source fallback.
- [ ] Tests can inject fake adapters without relying on real agent session files.

#### E7-S8 - Build Codex rollout parser fixture and extractor
**Priority:** P0 | **Size:** L | **Estimate:** 5h | **Sequence:** 3 | **Depends on:** E7-S5, E7-S7 | **Labels:** codex, metrics, test

Implement a parser for the selected Codex rollout JSONL fields using synthetic fixtures modeled on observed schema.

Acceptance Criteria:

- [ ] Parser reads JSONL rollout records incrementally from a line marker.
- [ ] Parser extracts assistant visible-message word counts.
- [ ] Parser extracts user response timestamps.
- [ ] Parser ignores developer/system instructions, encrypted reasoning, internal tool call arguments, and hidden payloads.
- [ ] Tests cover synthetic assistant/user/tool/token-count events.

#### E7-S9 - Implement Codex no-source fallback semantics
**Priority:** P0 | **Size:** M | **Estimate:** 3h | **Sequence:** 3 | **Depends on:** E7-S6, E7-S7 | **Labels:** codex, metrics

Make the current Codex limitation explicit instead of writing misleading zeros.

Acceptance Criteria:

- [ ] When no Codex transcript/event source is available, word metrics are marked `unsupported`.
- [ ] Timing output distinguishes unsupported word metrics from measured `0`.
- [ ] Idle calculation uses wall-clock fallback only when no review budget is available.
- [ ] README and design docs state the fallback behavior.

#### E7-S10 - Add visible-output review budget tracking
**Priority:** P1 | **Size:** L | **Estimate:** 5h | **Sequence:** 4 | **Depends on:** E7-S8, E7-S9 | **Labels:** codex, metrics

Track visible assistant output words so human review time can be estimated even when raw Codex transcript events are not available.

Acceptance Criteria:

- [ ] Tracker can record timestamp and visible word count for the most recent assistant output.
- [ ] Review budget is computed from visible words and `wpm`.
- [ ] Config supports `reviewGraceMinutes` with a conservative default.
- [ ] Multiple pending assistant outputs accumulate review budget without double-counting.

#### E7-S11 - Compute engaged time versus true idle time
**Priority:** P0 | **Size:** M | **Estimate:** 4h | **Sequence:** 5 | **Depends on:** E7-S10 | **Labels:** metrics

Use review budget to split response gaps into human review time and true idle time.

Acceptance Criteria:

- [ ] If user responds within review budget plus grace, true idle is zero or near zero.
- [ ] If user responds after a long gap, only review budget plus grace counts as engaged time.
- [ ] `Active Min` remains backward-compatible as engaged minutes unless a new table format is adopted.
- [ ] Tests cover short review, exact budget, and one-hour walk-away scenarios.

#### E7-S12 - Update timing rows and reports for metric quality
**Priority:** P1 | **Size:** M | **Estimate:** 3h | **Sequence:** 6 | **Depends on:** E7-S11 | **Labels:** reporting, metrics

Expose metric quality clearly in issue timing logs and value reports.

Acceptance Criteria:

- [ ] Timing rows show whether word/idle metrics are measured, estimated, or unsupported.
- [ ] Value report includes engaged time using the correct calculation.
- [ ] Report notes when Codex metrics are estimated.
- [ ] Existing timing comments remain parseable.

#### E7-S13 - Document Codex engagement metric behavior
**Priority:** P1 | **Size:** S | **Estimate:** 2h | **Sequence:** 6 | **Depends on:** E7-S11 | **Labels:** docs, codex

Document how Codex timing differs from Claude timing and how human review time is estimated.

Acceptance Criteria:

- [ ] README explains Agent Active, Human Review, True Idle, and Engaged Time.
- [ ] Codex adapter docs explain no-source fallback and estimated review behavior.
- [ ] Config docs explain `wpm` and `reviewGraceMinutes`.
- [ ] Troubleshooting docs explain why old Codex rows may show zero word markers.

## Benchmark Characteristics

This plan creates:

- 7 epics.
- 49 sub-issues.
- 7 sequential epic phases.
- 20 distinct parallel fan-out groups across sub-issue Sequence waves.
- Multiple high-risk dependency boundaries:
  - path migration before CLI/session work,
  - CLI/session work before GitHub workflow safety,
  - shared skill split before installer/plugin packaging,
  - orchestration governance before docs/release,
  - metrics schema and adapter boundaries before Codex engagement calculations.

This should be a strong benchmark for testing whether AI Task Manager correctly:

- creates epics and sub-issues from a master plan,
- applies Priority/Size/Estimate/Sequence fields,
- respects same-sequence fan-out and higher-sequence blocking,
- injects pickup directives,
- prevents agents from starting implementation before deep dive,
- prevents close before every AC/DoD checkbox is verified,
- records timing and context against the right issue.
