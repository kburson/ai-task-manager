# Code Review Evidence

Date: 2026-06-26

This file records the evidence used for the code review. It intentionally summarizes large outputs instead of embedding bulky command dumps. Re-run the commands from the repository root to verify the current state.

## Repository State

Command:

```sh
git status --short
```

Observed result during review:

```text
<no output>
```

Interpretation: the working tree was clean before the documentation package was created.

## Test Result

Command:

```sh
npm test
```

Observed result:

```text
> ai-task-manager@1.0.3 test
> node scripts/run-tests.mjs --lane fast
lane=fast (380 files)
All 380 test files passed.
```

Notes:

- This validates the fast regression lane at the time of review.
- `npm run test:slow`, `npm run lint`, and `npm run quality` were not run during this review pass.

## Test Inventory

Commands:

```sh
find scripts/tests -type f -name '*.test.mjs' | wc -l
git ls-files 'scripts/tests/unit/**/*.test.mjs' | wc -l
git ls-files 'scripts/tests/slow/**/*.test.mjs' | wc -l
git ls-files 'scripts/tests/integration/**/*.test.mjs' | wc -l
git ls-files 'scripts/tests/unit/providers/**/*.test.mjs' | wc -l
```

Observed counts:

```text
406 total test files under task-tracker/providers test roots
371 unit test files
28 slow test files
9 integration test files
4 provider test files
```

Interpretation: test coverage is unusually deep for a CLI/skill package, but the test fleet is custom and needs CI enforcement to protect it.

## Package Surface

Command:

```sh
npm pack --dry-run --json
```

Observed summary:

```text
name: ai-task-manager
version: 1.0.3
entryCount: 797
size: 2150179
unpackedSize: 5644397
```

Observed package contents included broad non-runtime material, such as:

- `scripts/tests/unit/task-tracker/**`
- `scripts/tests/unit/providers/**`
- `docs/archive/**`
- documentation image/assets under `docs/**`
- maintenance, report, and migration-oriented scripts

Interpretation: the npm package is broad and noisy. That increases install weight and makes it harder for humans and AI agents to identify the runtime contract.

## GitHub Workflow Inventory

Command:

```sh
find .github/workflows -maxdepth 1 -type f -print | sort
```

Observed result:

```text
.github/workflows/label-beta-report.yml
.github/workflows/label-discuss.yml
```

Interpretation: no normal push or pull-request CI workflow was observed for running format, lint, or tests. The existing workflows are issue-label automations.

## Size Hotspots

Observed large source files:

```text
scripts/gh/init-project-config.sh                 1631 lines
bin/cli.mjs                                      1148 lines
scripts/reports/generate-value-report.mjs        1049 lines
scripts/gh/move-state.mjs                         959 lines
scripts/task-tracker/verbs/close.mjs              746 lines
scripts/task-tracker/verbs/promote.mjs            661 lines
scripts/task-tracker/verbs/review.mjs             657 lines
scripts/task-tracker/verbs/test.mjs               655 lines
scripts/task-tracker/lib/markers.mjs              637 lines
scripts/task-tracker/runtime.mjs                  577 lines
scripts/task-tracker/lib/deep-dive.mjs            532 lines
```

Interpretation: several core orchestration paths are large enough to carry multiple responsibilities and create high change friction.

## Key Files Inspected

AI skill and rule loading:

- `skill/adapters/codex/SKILL.md`
- `skill/shared/router.md`
- `skill/shared/rules/*.md`
- `templates/session-boot.md`
- `templates/pickup-directive.md`

CLI and command routing:

- `bin/aitm.mjs`
- `bin/aitm-registry.mjs`
- `bin/cli.mjs`
- `scripts/task-tracker/task-tracker.mjs`
- `scripts/task-tracker/runtime.mjs`

State movement and guard architecture:

- `scripts/gh/move-state.mjs`
- `scripts/task-tracker/state-machine.mjs`
- `scripts/task-tracker/states/index.mjs`
- `scripts/task-tracker/lib/guard-registry.mjs`
- `scripts/task-tracker/lib/state-bootstrap.mjs`
- `scripts/task-tracker/lib/guard-bootstrap.mjs`
- `scripts/task-tracker/verbs/promote.mjs`
- `scripts/task-tracker/verbs/close.mjs`

Mutation and safety helpers:

- `scripts/task-tracker/lib/issue-body-mutate.mjs`
- `scripts/task-tracker/lib/markers.mjs`

Test and quality infrastructure:

- `scripts/run-tests.mjs`
- `eslint.config.mjs`
- `package.json`

## Important Caveats

- A previous interrupted session saw transient test failures while another session was also working. After restarting from a clean position, the fast lane passed. The review findings should use the clean pass, not the interrupted failure, as current evidence.
- The review did not prove production behavior end to end against GitHub. It focused on source architecture, package shape, local test infrastructure, and enforcement design.
