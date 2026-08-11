export const ENTRYPOINT_CLASSIFICATIONS = Object.freeze([
  'agent-callable-verb',
  'agent-callable-standalone',
  'package-lifecycle-cli',
  'live-maintenance-or-migration',
  'internal-hook-or-guard',
  'internal-library-or-orchestration',
  'test-fixture-or-retired-one-shot',
]);

function publicRows(classification, entries) {
  return entries.map(([path, command]) => Object.freeze({ path, classification, command }));
}

function internalRows(classification, paths, reason) {
  return paths.map((path) => Object.freeze({ path, classification, command: null, reason }));
}

export const EXECUTABLE_ENTRYPOINTS = Object.freeze([
  ...publicRows('agent-callable-standalone', [
    ['bin/aitm.mjs', 'aitm'],
    ['bin/cli.mjs', 'ai-task-manager'],
    ['scripts/gh/create-issue.mjs', 'create-issue'],
    ['scripts/gh/dispatch-prep.mjs', 'dispatch-prep'],
    ['scripts/gh/ensure-wave-parent.mjs', 'ensure-wave-parent'],
    ['scripts/gh/log-issue-time.mjs', 'log-issue-time'],
    ['scripts/gh/project-tether.mjs', 'project-tether'],
    ['scripts/gh/set-priority.mjs', 'set-priority'],
    ['scripts/gh/set-rank.mjs', 'set-rank'],
    ['scripts/gh/update-event-fields.mjs', 'update-event-fields'],
    ['scripts/reports/generate-value-report.mjs', 'value-report'],
    ['scripts/task-tracker/cut-child-worktree.mjs', 'cut-child-worktree'],
    ['scripts/task-tracker/cut-epic-branch.mjs', 'cut-epic-branch'],
    ['scripts/task-tracker/heal-backlog.mjs', 'heal-backlog'],
    ['scripts/task-tracker/measure-context.mjs', 'measure-context'],
    ['scripts/task-tracker/merge-back.mjs', 'merge-back'],
    ['scripts/task-tracker/preflight-issue.mjs', 'preflight-issue'],
    ['scripts/task-tracker/sync-epic.mjs', 'sync-epic'],
    ['scripts/task-tracker/verify-develop.mjs', 'verify-develop'],
  ]),
  ...publicRows('agent-callable-verb', [
    ['scripts/task-tracker/verbs/approve.mjs', 'approve'],
    ['scripts/task-tracker/verbs/demote.mjs', 'demote'],
    ['scripts/task-tracker/verbs/park.mjs', 'park'],
    ['scripts/task-tracker/verbs/plan-approve.mjs', 'plan-approve'],
    ['scripts/task-tracker/verbs/promote.mjs', 'promote'],
    ['scripts/task-tracker/verbs/reconcile.mjs', 'reconcile'],
    ['scripts/task-tracker/verbs/refine.mjs', 'refine'],
  ]),
  ...internalRows(
    'package-lifecycle-cli',
    [
      'scripts/benchmarks/compare-test-fixtures.mjs',
      'scripts/run-tests.mjs',
      'scripts/dev-env/verify-local-worktree.mjs',
      'scripts/sync-templates.mjs',
      'scripts/task-tracker/ensure-self-link.mjs',
    ],
    'Invoked by package scripts, release preparation, or repository quality gates.'
  ),
  ...internalRows(
    'live-maintenance-or-migration',
    [
      'scripts/gh/init-repair.mjs',
      'scripts/gh/migrate-project.mjs',
      'scripts/gh/scaffold-web-issue.mjs',
      'scripts/gh/verify-open-issue-bodies.mjs',
      'scripts/gh/verify-priority-p3.mjs',
      'scripts/inspect/ai-memory-parity.mjs',
      'scripts/migrate/heal-options-co-pilot-bodies.mjs',
      'scripts/migrate/options-co-pilot-status-swap.mjs',
      'scripts/migrate/rename-on-deck-to-assigned.mjs',
      'scripts/migrate/start-time-field.mjs',
      'scripts/reports/heal-backlog-attribution.mjs',
      'scripts/task-tracker/backfill-plan-metadata.mjs',
      'scripts/task-tracker/backfill-disposition.mjs',
      'scripts/task-tracker/backfill-timing-logs.mjs',
      'scripts/task-tracker/backfill-vc-sections.mjs',
      'scripts/task-tracker/heal-entry-markers.mjs',
      'scripts/task-tracker/heal-functional-dod.mjs',
      'scripts/task-tracker/heal-lifecycle-dod.mjs',
      'scripts/task-tracker/heal-refine-entry-marker.mjs',
      'scripts/task-tracker/heal-timing-departure.mjs',
      'scripts/task-tracker/heal-timing-log.mjs',
      'scripts/task-tracker/heal-timing-starts-sweep.mjs',
      'scripts/task-tracker/heal-timing-starts.mjs',
      'scripts/task-tracker/heal-vc-refs.mjs',
      'scripts/task-tracker/migrate-fields-encoding.mjs',
      'scripts/task-tracker/migrate-plan-approved.mjs',
      'scripts/task-tracker/tag-story-ids.mjs',
    ],
    'Operator-run repair, audit, backfill, or migration with live repository effects.'
  ),
  ...internalRows(
    'internal-hook-or-guard',
    [
      'scripts/gh/move-state.mjs',
      'scripts/task-tracker/activity-guard.mjs',
      'scripts/task-tracker/agent-guard.mjs',
      'scripts/task-tracker/bash-guard.mjs',
      'scripts/task-tracker/commit-trail-handler.mjs',
      'scripts/task-tracker/ensure-worktree-seeded.mjs',
      'scripts/task-tracker/epic-base-edit-guard.mjs',
      'scripts/task-tracker/hook-handler.mjs',
      'scripts/task-tracker/hooks/codex-prompt-timestamp.mjs',
      'scripts/task-tracker/hooks/memory-index.mjs',
      'scripts/task-tracker/hooks/on-ask.mjs',
      'scripts/task-tracker/hooks/on-stop.mjs',
      'scripts/task-tracker/hooks/on-user-prompt.mjs',
      'scripts/task-tracker/hooks/stop-audit-pause-resume.mjs',
      'scripts/task-tracker/lib/entrypoint-guard-lint.mjs',
      'scripts/task-tracker/lib/guard-entrypoint.mjs',
      'scripts/task-tracker/source-edit-gate.mjs',
    ],
    'Hook plumbing or a guarded internal boundary; not a direct agent command.'
  ),
  ...internalRows(
    'internal-library-or-orchestration',
    [
      'scripts/gh/lib/field-defs-drift.mjs',
      'scripts/task-tracker/assert-file-excludes.mjs',
      'scripts/task-tracker/config-get.mjs',
      'scripts/task-tracker/config-init.mjs',
      'scripts/task-tracker/orchestrator-lock.mjs',
      'scripts/task-tracker/task-tracker.mjs',
      'scripts/task-tracker/tools/coverage-threshold.mjs',
    ],
    'Internal library, dispatcher, configuration helper, or orchestration support.'
  ),
  ...internalRows(
    'test-fixture-or-retired-one-shot',
    [
      'scripts/task-tracker/verify-epic-114.mjs',
      'scripts/task-tracker/verify-epic-trail.mjs',
      'scripts/task-tracker/verify-sweep-comment.mjs',
    ],
    'Historical one-shot verifier retained in the shipped tree for compatibility evidence.'
  ),
]);
