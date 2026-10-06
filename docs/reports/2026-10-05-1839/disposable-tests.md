# #1839 disposable live tests

The retained live tests are `scripts/tests/slow/task-tracker/graphql-usage-disposable.test.mjs`. Both use Node's `skip` option unless their explicit configuration environment variable is set. Ordinary local and cloud suites do not create GitHub resources. Offline fixture tests and `node scripts/maintenance/verify-1839-baseline.mjs` remain available after all scratch resources are deleted.

The repository and project are operator inputs. No runtime default points to the repository used for this historical measurement. Setup and cleanup are deliberate operator steps; these tests do not clone, provision, delete or migrate repositories automatically.

## Setup

1. Choose an expendable GitHub repository and clone it locally. Make an initial commit if empty, then create two linked worktrees with different branches. Use the native AITM installer to provision consumer templates and hook stubs in both worktrees.
2. Configure a separate GitHub Project and the canonical eight lifecycle states through native AITM setup. Tether only the disposable repository. Disable automatic PR linkage/merge and issue-close workflows that conflict with this controlled recipe. Each worktree's `.ai-task-manager/task-tracker.json` must name the same scratch repo and project; neither may equal the source project's repo or project.
3. Prepare canonical solo-issue recipe files (`scope.md`, `ac.md`, `origin.md`, `story.md`, `plan.md`, `vc.md`) under an operator-owned directory. Include a supported issue label, assignee, priority, User Story and Plan Metadata. Creation always uses `scripts/gh/create-issue.mjs --shape solo`.
4. Run a separately identified pilot to validate attribution and identify candidate operations. Before the accepted run, freeze the permitted participants, operation groups, comparable signal and interval with `node scripts/maintenance/prepare-1839-baseline.mjs CONFIG PILOT_SESSION EVIDENCE_DIRECTORY`. Set `workerScript` to the retained `scripts/tests/helpers/graphql-usage/disposable-worker.mjs`; pin the source commit and keep the collector files unchanged across the measurement. Preparation reads local evidence and does not contact GitHub.
5. Supply `declarationFile` in the workload config. Schedule a start at least a minute ahead of live-test launch and allow at least 60 minutes before the end. Use fresh session IDs per attempt. Complete consumer setup, preflight and smoke before freezing the accepted declaration.

The workload JSON schema is `aitm.graphql-usage.workload/v1`. Required operator fields are `repository`, `projectId`, `source` (this source checkout), `sourceCommit`, `recipe`, `output`, `assignee`, `titlePrefix`, `startedAt`, `endedAt`, `repetitions`, `spacingSeconds`, `workerScript`, `declarationFile` and `workers`. Each of the exactly two workers supplies `id`, absolute `worktree`, and a fresh `sessionId`. Configuration contains no credentials. The retained helper consumes this same recipe as the historical run; its formatted source has a different byte hash from the predeclared historical helper.

```sh
AITM_DISPOSABLE_BASELINE_CONFIG=/absolute/path/to/workload.json \
  node --test scripts/tests/slow/task-tracker/graphql-usage-disposable.test.mjs
```

The worker performs creation, bind, refinement entry, refinement completion, Plan entry and native stop. Stop releases occupancy and flushes timing; it does not close the disposable issue. Collectors wait through the declared end. Keep real command timestamps, exit statuses, enrollment IDs and collector lifetime in the saved run evidence. A failed cycle or incomplete overlap must remain preliminary; do not adjust the population after observing results.

## Separate smoke

Provide `AITM_DISPOSABLE_SMOKE_CONFIG` pointing to JSON containing explicit `repository`, `projectId`, absolute `worktree`, existing disposable `issueNumber`, fresh `sessionId`, and absolute output JSON path. Run the same test file with that variable. The smoke reads the issue, temporarily changes its title, and restores it in `finally`. It records the same-response query cost and explicit unavailable mutation costs without saving the title, token, query, variables or response payload. Check `cleanupSucceeded` before removing resources.

The two environment variables are independent. Leave both unset in ordinary suites. Running smoke before a scheduled baseline keeps its three HTTP attempts, including cleanup, outside the declared sample.

## Evidence and cleanup

Render the declared window with the offline report CLI. Save the report, immutable declaration/preflight, actual run manifest, sanitized smoke and qualification before cleanup. Normalize the worker's `steps[].name` into the run schema's `steps[].action`, preserving all original timestamps and statuses. Reconcile the planned denominator against completed cycles in both worktrees. The saved verifier fails with exit 2 for preliminary evidence and exit 1 for unreadable inputs; it uses no clone, Git remote, authentication or network.

Retain raw command logs and writer JSONL locally for operator audit; do not commit them. The report is metadata-only. Delete scratch issues/project/repo and local worktrees only at the human's cleanup boundary. The historical scratch identity appears only in evidence, never as a future test target or required dependency.
