// #413 — Self-documenting CLI support for the `aitm` orchestrator.
//
// Single source of truth for the help text of every operator-facing support
// script exposed through `aitm`. Each exposed script imports `wantsHelp` +
// `emitSelfDoc` and adds a top-of-execution guard so that invoking the script
// with `help`, `?`, `--help`, or `-h` — directly OR via `aitm <name> help` —
// prints its full API plus a who-should-call-it / how note. `aitm` forwards the
// help token unchanged, so the script is the one that answers.
//
// Intended caller: the exposed scripts themselves (guard) and
// `bin/aitm-registry.mjs` (to build the grouped command listing). Not a CLI.

import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Help-token detection. Bare `help`/`?` (the `aitm <name> help` form) and the
// conventional `--help`/`-h` flags all count.
const HELP_TOKENS = new Set(['help', '?', '--help', '-h']);
const APPLY_FLAG = ['--', 'apply'].join('');

export function wantsHelp(argv = []) {
  return argv.length === 1 && HELP_TOKENS.has(String(argv[0]));
}

export function isDirectInvocation(moduleUrl, argv1) {
  const candidate = argv1 ?? process.argv.at(1);
  if (!candidate) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(path.resolve(candidate));
  } catch {
    return fileURLToPath(moduleUrl) === path.resolve(candidate);
  }
}

// SELF_DOC — name → metadata. `group` drives the grouped `aitm` listing.
// `path` is repo-root-relative. `synopsis` is the one-line summary, `audience`
// states who should call it (and via what), `usage` is the invocation line
// shown as `aitm <name> ...` (never a node_modules filepath).
const ROUTABLE_SELF_DOC = {
  'create-issue': {
    group: 'GitHub',
    path: 'scripts/gh/create-issue.mjs',
    synopsis: 'Atomically create a GitHub issue: gh create + project tether + sub-issue link.',
    audience:
      'AI/operator creating a new issue. Prefer `aitm preflight-issue` to stamp the body first.',
    usage:
      'aitm create-issue --title <t> (--body-file <path> | --shape epic|sub-issue|solo|defect --scope-file <p> --ac-file <p> --story-origin-file <p> [--plan-metadata-file <p>] [--verification-commands-file <p>] [--reproduction-file <p>] [--root-cause-file <p>] [--fix-direction-file <p>] [--out-of-scope-file <p>] [--sub-issue-list-file <p>] | --shape stub [--idea-file <p>]) [--label <l> ...] [--priority p0|p1|p2] [--size XS|S|M|L|XL] [--estimate <hours>] [--rank <n>] [--start-time <iso>] [--kind <kind>] [--parent <N>] [--assignee <a>] [--allow-duplicate-child] [--dry-run] [--no-tether] [--no-placeholder-substitution] [--internal]',
  },
  'preflight-issue': {
    group: 'GitHub',
    path: 'scripts/task-tracker/preflight-issue.mjs',
    synopsis: 'Stamp the DoD + Pickup-Directive tail onto a draft issue body before creation.',
    audience: 'AI/operator preparing an issue body. Output feeds `aitm create-issue --body-file`.',
    usage:
      'aitm preflight-issue [--check-only|--check-integrity <N>] [--shape epic|sub-issue|solo|defect|stub] [--scope-file <p>] [--ac-file <p>] [--story-origin-file <p>] [--plan-metadata-file <p>] [--verification-commands-file <p>] [--reproduction-file <p>] [--root-cause-file <p>] [--fix-direction-file <p>] [--out-of-scope-file <p>] [--parent <N>] [--sub-issue-list-file <p>] [--idea-file <p>] [--priority <P>] [--size <S>] [--estimate <hours>] [--rank <n>] [--start-time <iso>] [--kind <kind>] [--changed-paths-file <p>]',
  },
  'capture-actions': {
    group: 'GitHub',
    path: 'scripts/task-tracker/capture-actions.mjs',
    synopsis: 'Control and inspect temporary, local capture of GitHub-bound task actions.',
    audience:
      'AI/operator running the #1295 capture experiment for the active or explicitly selected issue.',
    usage: 'aitm capture-actions <on|off|status|summary> [--issue N] [--json]',
  },
  'set-priority': {
    group: 'GitHub',
    path: 'scripts/gh/set-priority.mjs',
    synopsis: 'Set the Priority field on an issue (optionally cascading to sub-issues).',
    audience: 'AI/operator setting priority. Priorities: p0|p1|p2|p3.',
    usage: 'aitm set-priority <issue#> <p0|p1|p2|p3> [--cascade]',
  },
  'set-rank': {
    group: 'GitHub',
    path: 'scripts/gh/set-rank.mjs',
    synopsis: "Set the Rank (wave-order) number field on an existing issue's project item.",
    audience: 'AI/operator re-ranking an open issue. Rank is the wave-ordering value.',
    usage: 'aitm set-rank <issue#> <n>',
  },
  'update-event-fields': {
    group: 'GitHub',
    path: 'scripts/gh/update-event-fields.mjs',
    synopsis: 'Repair the per-stage event timestamp fields (Start/Plan/Develop/...) on the board.',
    audience: 'AI/operator repairing a board item after a field-sync warning.',
    usage:
      'aitm update-event-fields <issue#> <refine|plan|develop|test|review|done> --item-id <PVTI_...>',
  },
  'project-tether': {
    group: 'GitHub',
    path: 'scripts/gh/project-tether.mjs',
    synopsis: 'Attach an issue to the configured GitHub Project and return its project item id.',
    audience: 'AI/operator re-tethering a detached issue. Usually called by `aitm create-issue`.',
    usage:
      'aitm project-tether --issue <N> [--parent <N>] [--status <state>] [--priority <P>] [--size <S>] [--estimate <hours>] [--rank <N>]',
  },
  'log-issue-time': {
    group: 'GitHub',
    path: 'scripts/gh/log-issue-time.mjs',
    synopsis: 'Roll up an issue ⏱ Timing Log into the board Engaged/Session/Review/Plan fields.',
    audience:
      'Operator/diagnostics reconciling board timing. Normal timing flows through the /task verbs.',
    usage: 'aitm log-issue-time <issue#> [--dry-run]',
  },
  'verify-develop': {
    group: 'Workflow',
    path: 'scripts/task-tracker/verify-develop.mjs',
    synopsis: 'Run affected Develop iteration checks or clean exact-SHA finalization.',
    audience:
      'AI/operator during Develop. Use iteration while editing; Test invokes final with an issue number.',
    usage: 'aitm verify-develop [--mode iteration|final] [--issue <N>]',
  },
  'co-review': {
    group: 'Workflow',
    path: 'scripts/review/co-review.mjs',
    synopsis: 'Coordinate immutable owner/reviewer artifact rounds through explicit acceptance.',
    audience: 'Artifact owner, external reviewer, or human continuation authority.',
    usage:
      'aitm co-review <init|status|claim|wait|handoff|continue> --dir <path> [--artifact <path>] [--owner <identity>] [--reviewer <identity>] [--max-turns <N>] [--import-review <file>] [--review-of <sha>] [--actor <identity>] [--timeout <seconds>] [--response <file>] [--commit <sha>] [--answers <review>] [--review <file>] [--decision accepted|changes-requested] [--summary <file>] [--message <text>] [--additional-turns <N>] [--approved-by <identity>] [--focus <file>] [--json]',
  },
  'value-report': {
    group: 'Reports',
    path: 'scripts/reports/generate-value-report.mjs',
    aliases: ['github-project-report'],
    synopsis: 'Generate the AI-value / project report from the GitHub Project board.',
    audience:
      'Operator producing an epic value summary. Also installed as bin `github-project-report`.',
    usage:
      'aitm value-report [--project-id <id>] [--repo owner/name] [--title <text>] [--output <path>] [--issues N,N] [--role <level>] [--solo-role <level>] [--senior-factor <n>] [--region <id>] [--focus-hours <n>] [--reading-wpm <n>] [--reading-overlap <n>] [--chat-words <n>] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--state open|closed|all] [--status <state>] [--trunk <ref>] [--html]',
  },
  'measure-context': {
    group: 'Reports',
    path: 'scripts/task-tracker/measure-context.mjs',
    synopsis: 'Measure context-word usage for a session/issue.',
    audience: 'Operator/diagnostics. Also invoked internally by timing hooks.',
    usage:
      'aitm measure-context [--idle|--invoked|--active [N]|--scenario <name>|--all] [--adapter claude|codex] [--rule <file>] [--list-scenarios] [--json]',
  },
  'heal-backlog': {
    group: 'Maintenance',
    path: 'scripts/task-tracker/heal-backlog.mjs',
    synopsis:
      'Normalize body encodings, reconcile aitm-fields vs the timing log, validate field schema. `--rename-timing-slugs` rewrites historical timing-log Event slugs to the #516 vocabulary.',
    audience: 'Operator healing drifted issue bodies. Dry-run by default; --apply to write.',
    usage:
      'aitm heal-backlog [--state open|closed|all] [--apply] [--scope N,N] [--no-schema-check] [--ignore-schema-drift] [--rename-timing-slugs] [--yes]',
  },
  'ensure-wave-parent': {
    group: 'Parallel',
    path: 'scripts/gh/ensure-wave-parent.mjs',
    synopsis:
      'Pre-flight a fan-out: create/reuse a shared wave-parent issue and re-parent solo children.',
    audience:
      'Orchestrator before a parallel dispatch loop. Emits `PARENT: #<N>` or `NO_WAVE_PARENT_NEEDED`.',
    usage:
      'aitm ensure-wave-parent --children 12,13,14 --purpose "<text>" [--priority p0|p1|p2] [--rank <n>] [--dry-run]',
  },
  'dispatch-prep': {
    group: 'Parallel',
    path: 'scripts/gh/dispatch-prep.mjs',
    synopsis:
      'Claim a sub-issue for an agent: flip the board to In Progress and post a start timing row.',
    audience: 'Orchestrator just before handing a sub-issue to an agent.',
    usage: 'aitm dispatch-prep <issue#> [--description "<text>"]',
  },
  'cut-epic-branch': {
    group: 'Epic Branching',
    path: 'scripts/task-tracker/cut-epic-branch.mjs',
    synopsis:
      'Cut a role-typed epic branch `feature/epic/<N>` from its resolved parent head (trunk for a root epic, the outer epic for a nested one).',
    audience: 'Orchestrator opening an epic. Lineage is resolved live from the sub-issue graph.',
    usage: 'aitm cut-epic-branch <epic#>',
  },
  'cut-child-worktree': {
    group: 'Epic Branching',
    path: 'scripts/task-tracker/cut-child-worktree.mjs',
    synopsis:
      'Correct-by-construction child worktree: `git worktree add -b feature/child/<N> <path> <epicHead>`. The owned replacement for native worktree isolation on epic children.',
    audience:
      'Orchestrator dispatching an epic child. Bases the child on the epic head, never trunk.',
    usage: 'aitm cut-child-worktree <child#> <worktree-path>',
  },
  'merge-back': {
    group: 'Epic Branching',
    path: 'scripts/task-tracker/merge-back.mjs',
    synopsis:
      'Merge a child back into its epic: opportunistic epic sync, rebase child onto epic head, run child tests, `--ff-only`, then clean up. Refuses on conflict or test failure.',
    audience: 'Orchestrator landing a finished child. Keeps the epic a clean linear branch.',
    usage: 'aitm merge-back <child#> <worktree-path>',
  },
  'sync-epic': {
    group: 'Epic Branching',
    path: 'scripts/task-tracker/sync-epic.mjs',
    synopsis:
      'Re-sync an epic branch onto trunk (rebase, then push --force-with-lease unless noPushToOrigin). Keeps the epic a clean linear descendant of trunk.',
    audience: 'Orchestrator/operator after trunk advances under a live epic.',
    usage: 'aitm sync-epic <epic#>',
  },
};

const argument = (name, description) => Object.freeze({ name, description });
const STANDARD_EXIT_CODES = Object.freeze([
  Object.freeze({ code: 0, meaning: 'help or command completed successfully' }),
  Object.freeze({ code: 1, meaning: 'runtime, validation, or requested check failure' }),
  Object.freeze({ code: 2, meaning: 'invalid command usage when the parser distinguishes usage' }),
]);

const ROUTABLE_ARGUMENTS = Object.freeze({
  'create-issue': [
    argument('--title <text>', 'Issue title.'),
    argument('--body-file <path>', 'Use an already assembled canonical issue body.'),
    argument('--shape epic|sub-issue|solo|defect|stub', 'Assemble a sanctioned issue shape.'),
    argument('--scope-file <path>', 'Scope section required for non-stub shape assembly.'),
    argument('--ac-file <path>', 'Acceptance Criteria required for non-stub shape assembly.'),
    argument('--story-origin-file <path>', 'Story Origin required for non-stub assembly.'),
    argument('--plan-metadata-file <path>', 'Optional early Plan Metadata for shaped assembly.'),
    argument(
      '--verification-commands-file <path>',
      'Optional exact verification commands for shaped assembly.'
    ),
    argument('--reproduction-file <path>', 'Optional defect reproduction section.'),
    argument('--root-cause-file <path>', 'Optional defect root-cause section.'),
    argument('--fix-direction-file <path>', 'Optional defect fix-direction section.'),
    argument('--out-of-scope-file <path>', 'Optional defect out-of-scope section.'),
    argument('--sub-issue-list-file <path>', 'Optional epic sub-issue list section.'),
    argument('--idea-file <path>', 'Optional initial Scope content for a stub.'),
    argument('--label <name>', 'Repeatable issue label.'),
    argument('--priority p0|p1|p2', 'Initial project priority.'),
    argument('--size XS|S|M|L|XL', 'Initial project size.'),
    argument('--estimate <hours>', 'Initial project estimate in hours.'),
    argument('--rank <n>', 'Initial project rank.'),
    argument('--start-time <iso>', 'Initial project start-time value.'),
    argument('--kind <kind>', 'Issue kind used to filter and mark the generated body.'),
    argument('--parent <N>', 'Required parent for a sub-issue.'),
    argument('--assignee <login>', 'Issue assignee.'),
    argument('--allow-duplicate-child', 'Explicitly allow a similar open sibling.'),
    argument('--dry-run', 'Validate and print without creating an issue.'),
    argument('--no-tether', 'Skip GitHub Project attachment.'),
    argument('--no-placeholder-substitution', 'Leave supported issue-number placeholders intact.'),
    argument('--internal', 'Mark an authorized internal creation path.'),
  ],
  'preflight-issue': [
    argument('--check-only', 'Verify required templates without rendering a body.'),
    argument('--check-integrity <N>', 'Audit one issue body against close-gate integrity checks.'),
    argument('--shape epic|sub-issue|solo|defect|stub', 'Optional full-body template shape.'),
    argument('--scope-file <path>', 'Scope section source for full-body rendering.'),
    argument('--ac-file <path>', 'Acceptance Criteria source for full-body rendering.'),
    argument('--story-origin-file <path>', 'Story Origin source for full-body rendering.'),
    argument(
      '--plan-metadata-file <path>',
      'Optional Plan Metadata source for full-body rendering.'
    ),
    argument(
      '--verification-commands-file <path>',
      'Optional exact verification commands for full-body rendering.'
    ),
    argument('--reproduction-file <path>', 'Optional defect reproduction section source.'),
    argument('--root-cause-file <path>', 'Optional defect root-cause section source.'),
    argument('--fix-direction-file <path>', 'Optional defect fix-direction section source.'),
    argument('--out-of-scope-file <path>', 'Optional defect out-of-scope section source.'),
    argument('--parent <N>', 'Parent issue substituted into a sub-issue body.'),
    argument('--sub-issue-list-file <path>', 'Epic sub-issue list section source.'),
    argument('--idea-file <path>', 'Optional stub idea source.'),
    argument('--priority <P>', 'Seed priority in the generated aitm-fields trailer.'),
    argument('--size <S>', 'Seed size in the generated aitm-fields trailer.'),
    argument('--estimate <hours>', 'Seed estimate in the generated aitm-fields trailer.'),
    argument('--rank <n>', 'Seed rank in the generated aitm-fields trailer.'),
    argument('--start-time <iso>', 'Seed start time in the generated aitm-fields trailer.'),
    argument('--kind <kind>', 'Issue kind used to filter Definition of Done items.'),
    argument('--changed-paths-file <path>', 'Changed-path evidence used for DoD filtering.'),
  ],
  'capture-actions': [
    argument('on|off|status|summary', 'Enable, disable, inspect, or summarize capture.'),
    argument('--issue <N>', 'Target issue; defaults to the active bound issue.'),
    argument('--json', 'Emit machine-readable status or summary output.'),
  ],
  'set-priority': [
    argument('<issue#>', 'Issue to update.'),
    argument('<p0|p1|p2|p3>', 'Priority value.'),
    argument('--cascade', 'Apply to descendants.'),
  ],
  'set-rank': [argument('<issue#> <n>', 'Issue and numeric wave rank.')],
  'update-event-fields': [
    argument('<issue#> <state>', 'Issue and lifecycle event state.'),
    argument('--item-id <id>', 'GitHub Project item id.'),
  ],
  'project-tether': [
    argument('--issue <N>', 'Issue to attach to the configured project.'),
    argument('--parent <N>', 'Optional parent epic relationship.'),
    argument(
      '--status <state>',
      'Initial backlog, assigned, refine, plan, develop, test, review, or done state.'
    ),
    argument('--priority P0|P1|P2', 'Initial priority value.'),
    argument('--size XS|S|M|L|XL', 'Initial size value.'),
    argument('--estimate <hours>', 'Initial estimate in hours.'),
    argument('--rank <N>', 'Initial numeric rank.'),
  ],
  'log-issue-time': [
    argument('<issue#>', 'Issue whose timing log is reconciled.'),
    argument('--dry-run', 'Report field writes without applying them.'),
  ],
  'verify-develop': [
    argument('--mode iteration|final', 'Affected edit loop (default) or exact-SHA finalization.'),
    argument('--issue <N>', 'Required in final mode; binds the receipt to its issue.'),
  ],
  'co-review': [
    argument('init|status|claim|wait|handoff|continue', 'Protocol subcommand.'),
    argument('--dir <path>', 'Caller-selected Git-ignored protocol directory.'),
    argument('--artifact <path>', 'Authoritative tracked artifact; init and owner handoff.'),
    argument('--owner <identity>', 'Configured artifact-owner identity; init only.'),
    argument('--reviewer <identity>', 'Configured external-reviewer identity; init only.'),
    argument('--max-turns <N>', 'Positive reviewer-response budget; init only.'),
    argument('--import-review <file>', 'Existing immutable review; init with --review-of.'),
    argument('--review-of <sha>', 'Exact owner commit reviewed by import or reviewer handoff.'),
    argument('--actor <identity>', 'Configured identity claiming, waiting, or handing off.'),
    argument('--timeout <seconds>', 'Bounded wait timeout from 0 through 60; default 55.'),
    argument('--response <file>', 'Immutable owner response file.'),
    argument('--commit <sha>', 'Exact commit containing the owner artifact revision.'),
    argument('--answers <review>', 'Preceding immutable review answered by the owner.'),
    argument('--review <file>', 'Immutable reviewer output file.'),
    argument('--decision accepted|changes-requested', 'Explicit reviewer decision.'),
    argument('--summary <file>', 'Human interception summary required at exhausted budget.'),
    argument('--message <text>', 'Human-readable handoff message.'),
    argument('--additional-turns <N>', 'Positive reviewer turns added after interception.'),
    argument('--approved-by <identity>', 'Declared human continuation provenance.'),
    argument('--focus <file>', 'Optional immutable human refocus instructions.'),
    argument('--json', 'Machine-readable status output.'),
  ],
  'value-report': [
    argument('--project-id <id>', 'GitHub Project id override.'),
    argument('--repo owner/name', 'Repository override.'),
    argument('--title <text>', 'Report heading.'),
    argument('--output <path>', 'Output base path without extension.'),
    argument('--issues N,N', 'Restrict report to issue numbers.'),
    argument('--role <level>', 'Engineering role used by valuation.'),
    argument('--solo-role <level>', 'Solo baseline role used by valuation.'),
    argument('--senior-factor <n>', 'Senior efficiency factor.'),
    argument('--region <id>', 'Regional rate-table identifier.'),
    argument('--focus-hours <n>', 'Focused engineering hours per day.'),
    argument('--reading-wpm <n>', 'Reading-speed assumption.'),
    argument('--reading-overlap <n>', 'Reading overlap factor.'),
    argument('--chat-words <n>', 'Reader-visible chat context words.'),
    argument('--from YYYY-MM-DD', 'Earliest closed date.'),
    argument('--to YYYY-MM-DD', 'Latest closed date.'),
    argument('--state open|closed|all', 'GitHub issue state filter.'),
    argument('--status <state>', 'Case-insensitive project status filter.'),
    argument('--trunk <ref>', 'Trunk reference used for attribution signals.'),
    argument('--html', 'Generate HTML without PDF.'),
  ],
  'measure-context': [
    argument('--idle', 'Measure the tier-zero shim.'),
    argument('--invoked', 'Measure shim, adapter, and router.'),
    argument('--active [N]', 'Measure active-task context, optionally for issue N.'),
    argument('--scenario <name>', 'Measure a named context scenario.'),
    argument('--all', 'Measure idle, invoked, and every scenario.'),
    argument('--adapter claude|codex', 'Adapter surface to measure.'),
    argument('--rule <file.md>', 'Repeatable extra active-mode rule file.'),
    argument('--list-scenarios', 'List scenarios and budgets.'),
    argument('--json', 'Emit machine-readable output.'),
  ],
  'heal-backlog': [
    argument('--state open|closed|all', 'Corpus state filter.'),
    argument('--scope N,N', 'Issue-number scope.'),
    argument(APPLY_FLAG, 'Apply changes; default is dry-run.'),
    argument('--no-schema-check', 'Skip project field schema comparison.'),
    argument('--ignore-schema-drift', 'Continue despite detected project field drift.'),
    argument('--rename-timing-slugs', 'Run the timing-event rename mode.'),
    argument('--yes', 'Skip multi-issue write confirmation.'),
  ],
  'ensure-wave-parent': [
    argument('--children N,N', 'Children in the dispatch wave.'),
    argument('--child <N>', 'Repeatable child issue alternative to --children.'),
    argument('--purpose <text>', 'Wave-parent purpose.'),
    argument('--priority p0|p1|p2', 'Optional parent priority.'),
    argument('--rank <n>', 'Optional parent rank.'),
    argument('--dry-run', 'Classify and report without creating or re-parenting.'),
  ],
  'dispatch-prep': [
    argument('<issue#>', 'Child issue to claim.'),
    argument('--description <text>', 'Timing-row description.'),
  ],
  'cut-epic-branch': [argument('<epic#>', 'Epic whose role-typed branch is created.')],
  'cut-child-worktree': [
    argument('<child#>', 'Epic child issue.'),
    argument('<worktree-path>', 'Destination worktree path.'),
  ],
  'merge-back': [
    argument('<child#>', 'Epic child issue.'),
    argument('<worktree-path>', 'Child worktree to verify and merge.'),
  ],
  'sync-epic': [argument('<epic#>', 'Epic branch to rebase onto trunk.')],
});

const exitCode = (code, meaning) => Object.freeze({ code, meaning });
const routableContract = ({ output, exitCodes, examples, relatedCommands }) =>
  Object.freeze({
    output: Object.freeze(output),
    exitCodes: Object.freeze(exitCodes),
    examples: Object.freeze(examples),
    relatedCommands: Object.freeze(relatedCommands),
  });

const ROUTABLE_CONTRACTS = Object.freeze({
  'create-issue': routableContract({
    output: [
      'Prints the created issue URL, or the validated dry-run payload.',
      'After creation, stderr includes `AITM_CREATED_ISSUE=<N>` for partial-success recovery.',
    ],
    exitCodes: [
      exitCode(0, 'issue created or dry-run validation passed'),
      exitCode(1, 'generic GitHub, tether, or internal failure'),
      exitCode(2, 'missing, invalid, or conflicting arguments'),
      exitCode(4, 'body-file failed canonical issue-body verification'),
      exitCode(6, 'issue created but a required follow-up step failed'),
      exitCode(7, 'similar open sibling rejected by the duplicate-child guard'),
    ],
    examples: [
      'npx aitm create-issue --title "Story" --body-file issue.md --parent 1005',
      'npx aitm create-issue --title "Idea" --shape stub --dry-run',
    ],
    relatedCommands: ['preflight-issue', 'project-tether'],
  }),
  'preflight-issue': routableContract({
    output: ['Prints a rendered issue body, template-check result, or integrity audit.'],
    exitCodes: [
      exitCode(0, 'body rendered or requested check completed'),
      exitCode(2, 'required template, file, or shape argument is invalid'),
      exitCode(12, 'rendered checklist contains a forbidden verification command'),
    ],
    examples: [
      'npx aitm preflight-issue --check-only',
      'npx aitm preflight-issue --check-integrity 1023',
    ],
    relatedCommands: ['create-issue', 'evidence-markers'],
  }),
  'capture-actions': routableContract({
    output: [
      'Prints enablement status or corpus counts, serialized bytes, payload bytes, and mutation-kind totals.',
    ],
    exitCodes: [
      exitCode(0, 'control or inspection completed'),
      exitCode(1, 'configuration or local corpus operation failed'),
      exitCode(2, 'command, issue, or repository context is invalid'),
    ],
    examples: [
      'npx aitm capture-actions on',
      'npx aitm capture-actions summary --issue 1295 --json',
      'npx aitm capture-actions off',
    ],
    relatedCommands: ['status', 'issue-body'],
  }),
  'set-priority': routableContract({
    output: ['Prints each issue whose project Priority field was updated.'],
    exitCodes: [
      exitCode(0, 'priority update completed'),
      exitCode(1, 'usage, configuration, or GitHub update failed'),
    ],
    examples: ['npx aitm set-priority 1023 p1', 'npx aitm set-priority 1005 p2 --cascade'],
    relatedCommands: ['set-rank', 'project-tether'],
  }),
  'set-rank': routableContract({
    output: ['Prints the issue and numeric Rank written, or a configured-field warning.'],
    exitCodes: [
      exitCode(0, 'rank updated or no Rank field was configured'),
      exitCode(1, 'usage, configuration, or GitHub update failed'),
    ],
    examples: ['npx aitm set-rank 1023 1'],
    relatedCommands: ['set-priority', 'project-tether'],
  }),
  'update-event-fields': routableContract({
    output: [
      'Prints field-sync diagnostics; no-event states and unconfigured projects are no-ops.',
    ],
    exitCodes: [
      exitCode(0, 'event fields updated or no update was applicable'),
      exitCode(1, 'usage, binding, or GitHub update failed'),
    ],
    examples: ['npx aitm update-event-fields 1023 develop --item-id PVTI_example'],
    relatedCommands: ['project-tether', 'log-issue-time'],
  }),
  'project-tether': routableContract({
    output: ['Prints the attached project title and GitHub Project item id.'],
    exitCodes: [
      exitCode(0, 'issue attached and requested fields applied'),
      exitCode(1, 'configuration, project lookup, or GitHub update failed'),
      exitCode(2, 'required issue or supplied status/number argument is invalid'),
    ],
    examples: [
      'npx aitm project-tether --issue 1023',
      'npx aitm project-tether --issue 1023 --parent 1005 --priority P1 --rank 1',
    ],
    relatedCommands: ['create-issue', 'set-priority', 'set-rank'],
  }),
  'log-issue-time': routableContract({
    output: ['Prints timing totals and board-field writes for the selected issue.'],
    exitCodes: [
      exitCode(0, 'timing rollup completed, including the no-timing-log no-op'),
      exitCode(1, 'issue, configuration, timing read, or GitHub update failed'),
    ],
    examples: ['npx aitm log-issue-time 1023', 'npx aitm log-issue-time 1023 --dry-run'],
    relatedCommands: ['value-report', 'update-event-fields'],
  }),
  'verify-develop': routableContract({
    output: [
      'Prints affected-test explanations and structured command results; final mode also prints the receipt.',
    ],
    exitCodes: [
      exitCode(0, 'iteration passed, or clean finalization emitted an exact-SHA receipt'),
      exitCode(1, 'selection, command, cleanliness, SHA, or receipt validation failed'),
      exitCode(2, 'invalid mode or command argument'),
    ],
    examples: [
      'npx aitm verify-develop --mode iteration',
      'npx aitm verify-develop --mode final --issue 1089',
    ],
    relatedCommands: ['test', 'run-tests'],
  }),
  'co-review': routableContract({
    output: [
      'Prints recovery help, validated protocol state, immutable artifact hashes, budget arithmetic, and the exact next action.',
    ],
    exitCodes: [
      exitCode(0, 'help or requested protocol command completed'),
      exitCode(1, 'runtime, Git, integrity, lock, role, or protocol transition refused'),
      exitCode(2, 'subcommand or option usage is invalid'),
      exitCode(3, 'bounded wait timed out without mutating protocol state'),
    ],
    examples: ['npx aitm co-review --help', 'npx aitm co-review status --dir .tmp/1117-review'],
    relatedCommands: ['status', 'verify-develop'],
  }),
  'value-report': routableContract({
    output: ['Writes the HTML report and, unless --html is set, attempts PDF generation.'],
    exitCodes: [
      exitCode(0, 'report generated successfully'),
      exitCode(1, 'configuration, date validation, data retrieval, or rendering failed'),
    ],
    examples: [
      'npx aitm value-report --issues 1011,1023 --html',
      'npx github-project-report --from 2026-07-01 --to 2026-07-31 --html',
    ],
    relatedCommands: ['log-issue-time', 'measure-context'],
  }),
  'measure-context': routableContract({
    output: ['Prints human-readable or JSON context measurements and budget comparisons.'],
    exitCodes: [
      exitCode(0, 'measurement completed within budget or informational listing printed'),
      exitCode(1, 'one or more measured contexts exceeded budget'),
      exitCode(2, 'mode or option combination is invalid'),
    ],
    examples: [
      'npx aitm measure-context --all --adapter codex',
      'npx aitm measure-context --scenario review --json',
    ],
    relatedCommands: ['value-report', 'help'],
  }),
  'heal-backlog': routableContract({
    output: ['Prints issue-body drift, planned repairs, schema findings, and write results.'],
    exitCodes: [
      exitCode(0, 'audit or requested repairs completed without blocking drift'),
      exitCode(1, 'schema drift, read, mutation, or GitHub operation failed'),
      exitCode(2, 'arguments are invalid or blast-radius confirmation was declined'),
      exitCode(3, 'blocking project-field schema drift was detected'),
    ],
    examples: [
      'npx aitm heal-backlog --state open',
      'npx aitm heal-backlog --scope 1023 --apply --yes',
    ],
    relatedCommands: ['verify-open-issue-bodies', 'heal-entry-markers'],
  }),
  'ensure-wave-parent': routableContract({
    output: ['Prints PARENT: #N or NO_WAVE_PARENT_NEEDED.'],
    exitCodes: [
      exitCode(0, 'wave parent created, reused, or unnecessary'),
      exitCode(1, 'GitHub query, issue creation, or re-parenting failed'),
      exitCode(2, 'arguments or child-parent topology are invalid'),
    ],
    examples: [
      'npx aitm ensure-wave-parent --children 12,13 --purpose "parser refactor" --dry-run',
    ],
    relatedCommands: ['dispatch-prep', 'create-issue'],
  }),
  'dispatch-prep': routableContract({
    output: ['Prints the claimed issue after moving it to Develop and posting a start timing row.'],
    exitCodes: [
      exitCode(0, 'issue claimed and timing row posted'),
      exitCode(1, 'state transition, timing write, or runtime operation failed'),
      exitCode(2, 'issue argument or repository configuration is invalid'),
      exitCode(3, 'move-state refused a direct non-verb transition'),
      exitCode(4, 'move-state entry guard refused the transition'),
      exitCode(5, 'move-state transition matrix refused the requested state change'),
      exitCode(6, 'move-state contiguity guard refused the transition'),
      exitCode(7, 'move-state issue lock or status readback failed'),
      exitCode(8, 'move-state status marker consistency check failed'),
      exitCode(9, 'move-state human-move guard refused the transition'),
      exitCode(10, 'move-state assignee guard refused the transition'),
    ],
    examples: ['npx aitm dispatch-prep 1023 --description "agent boot"'],
    relatedCommands: ['ensure-wave-parent', 'start'],
  }),
  'cut-epic-branch': routableContract({
    output: ['Prints the created epic branch and its resolved parent base.'],
    exitCodes: [
      exitCode(0, 'epic branch created'),
      exitCode(1, 'lineage, fetch, or git operation failed'),
      exitCode(2, 'epic issue argument is invalid'),
    ],
    examples: ['npx aitm cut-epic-branch 1005'],
    relatedCommands: ['cut-child-worktree', 'sync-epic'],
  }),
  'cut-child-worktree': routableContract({
    output: ['Prints the child branch, worktree path, and epic-head base.'],
    exitCodes: [
      exitCode(0, 'child branch and worktree created'),
      exitCode(1, 'lineage or git worktree operation failed'),
      exitCode(2, 'child issue or worktree path is invalid'),
    ],
    examples: ['npx aitm cut-child-worktree 1023 .worktrees/1023-cli-help-defect'],
    relatedCommands: ['merge-back', 'cut-epic-branch'],
  }),
  'merge-back': routableContract({
    output: ['Prints the child branch and epic branch after verified fast-forward integration.'],
    exitCodes: [
      exitCode(0, 'child verified and merged into its epic'),
      exitCode(1, 'lineage, sync, rebase, tests, or fast-forward merge failed'),
      exitCode(2, 'child issue or worktree path is invalid'),
    ],
    examples: ['npx aitm merge-back 1023 .worktrees/1023-cli-help-defect'],
    relatedCommands: ['cut-child-worktree', 'sync-epic'],
  }),
  'sync-epic': routableContract({
    output: ['Prints the epic branch, resolved trunk base, and whether it was pushed.'],
    exitCodes: [
      exitCode(0, 'epic rebased and required push completed'),
      exitCode(1, 'lineage, fetch, rebase, or push failed'),
      exitCode(2, 'epic issue argument is invalid'),
    ],
    examples: ['npx aitm sync-epic 1005'],
    relatedCommands: ['cut-epic-branch', 'merge-back'],
  }),
});

function completeRoutableDoc(name, doc) {
  const argumentsList = ROUTABLE_ARGUMENTS[name];
  if (!argumentsList) throw new Error(`self-doc: missing explicit arguments for ${name}`);
  const contract = ROUTABLE_CONTRACTS[name];
  if (!contract) throw new Error(`self-doc: missing explicit command contract for ${name}`);
  return Object.freeze({
    ...doc,
    aliases: Object.freeze([...(doc.aliases || [])]),
    classification: 'agent-callable-standalone',
    agentCallable: true,
    arguments: Object.freeze(argumentsList),
    preconditions: Object.freeze([doc.audience]),
    effects: Object.freeze([doc.synopsis]),
    output: contract.output,
    exitCodes: contract.exitCodes,
    examples: contract.examples,
    relatedCommands: contract.relatedCommands,
  });
}

function directDoc(name, contract) {
  for (const field of [
    'group',
    'path',
    'classification',
    'synopsis',
    'usage',
    'arguments',
    'preconditions',
    'effects',
    'output',
    'relatedCommands',
  ]) {
    if (!contract[field]) throw new Error(`self-doc: ${name} missing ${field}`);
  }
  return Object.freeze({
    ...contract,
    aliases: Object.freeze([...(contract.aliases || [])]),
    audience: contract.preconditions.join(' '),
    routable: contract.routable ?? false,
    agentCallable: contract.classification === 'agent-callable-standalone',
    arguments: Object.freeze(contract.arguments),
    preconditions: Object.freeze(contract.preconditions),
    effects: Object.freeze(contract.effects),
    output: Object.freeze(contract.output),
    exitCodes: Object.freeze(contract.exitCodes || STANDARD_EXIT_CODES),
    examples: Object.freeze(contract.examples || [`node ${contract.path} --help`]),
    relatedCommands: Object.freeze(contract.relatedCommands),
  });
}

const DIRECT_SELF_DOC = Object.freeze({
  aitm: directDoc('aitm', {
    group: 'CLI',
    path: 'bin/aitm.mjs',
    classification: 'agent-callable-standalone',
    synopsis: 'Discover and route AITM workflow verbs and shipped standalone commands.',
    routable: true,
    usage: 'aitm <command> [args] | aitm <command> <help|?|--help|-h>',
    arguments: [argument('<command> [args]', 'Workflow verb or shipped standalone command.')],
    preconditions: ['A command must be present in the canonical command catalog.'],
    effects: ['Routes normal execution to the selected command; help only prints documentation.'],
    output: ['Prints aggregate or command-specific help and routed command results.'],
    examples: ['npx aitm help', 'npx aitm create-issue --help'],
    relatedCommands: ['ai-task-manager', 'help'],
  }),
  'ai-task-manager': directDoc('ai-task-manager', {
    group: 'Package lifecycle',
    path: 'bin/cli.mjs',
    classification: 'agent-callable-standalone',
    synopsis: 'Install, initialize, repair, configure, and inspect the AITM package.',
    routable: true,
    usage:
      'ai-task-manager <install|init|repair|statusline|configure preferences|memory-resync|version> [subcommand options]',
    arguments: [
      argument('install', 'Install agent files, hooks, templates, and optional memory seed.'),
      argument('init', 'Initialize GitHub Project configuration.'),
      argument('repair', 'Repair missing task-tracker configuration fields.'),
      argument('statusline', 'Install the Claude status-line integration.'),
      argument('configure preferences', 'Run the team-workflow preferences editor.'),
      argument('memory-resync', 'Classify and resync installed operational memory.'),
      argument('version', 'Print the installed package version.'),
      argument('--target <path>', 'Install, init, repair, configure, or resync target directory.'),
      argument('--agent claude|codex|both', 'Install target agents; install only.'),
      argument('--link-mode stub|symlink', 'Installed skill link mode; install only.'),
      argument('--codex-superpowers', 'Install project-scoped Codex Superpowers bootstrap.'),
      argument('--codex-superpowers-global', 'Also update the global Codex AGENTS bootstrap.'),
      argument(
        '--memory-seed all|choose|none',
        'Non-interactive operational memory selection; install only.'
      ),
      argument('--project <url|owner:number>', 'GitHub Project selection; init only.'),
      argument('--project-url <url>', 'Legacy GitHub Project URL alias; init only.'),
      argument('--dry-run', 'Classify memory resync without writing.'),
      argument('--list', 'List memory resync classifications without writing.'),
    ],
    preconditions: ['Normal execution requires a writable target for mutating package commands.'],
    effects: ['May install or repair AITM files; help and version are read-only.'],
    output: ['Prints lifecycle progress, configuration diagnostics, or package help.'],
    examples: [
      'npx ai-task-manager install --agent codex --link-mode stub --memory-seed none',
      'npx ai-task-manager init --project owner:1',
      'npx ai-task-manager memory-resync --list',
      'npx ai-task-manager install --help',
    ],
    relatedCommands: ['aitm', 'ai-task-manager version'],
  }),
  'run-tests': directDoc('run-tests', {
    group: 'Package lifecycle',
    path: 'scripts/run-tests.mjs',
    classification: 'package-lifecycle-cli',
    synopsis: 'Run the selected repository test lane with bounded pooling and timing.',
    usage: 'run-tests [--lane <unit|integration|fast|slow|all>] [--timing-report]',
    arguments: [
      argument('--lane <name>', 'Test lane; fast is the default.'),
      argument('--timing-report', 'Print the human-readable timing report.'),
    ],
    preconditions: ['Repository dependencies must be installed.'],
    effects: ['Executes discovered test files; it does not mutate project or issue state.'],
    output: ['Prints per-file and aggregate test results.'],
    relatedCommands: ['npm test', 'npm run test:slow'],
  }),
  'compare-test-fixtures': directDoc('compare-test-fixtures', {
    group: 'Package lifecycle',
    path: 'scripts/benchmarks/compare-test-fixtures.mjs',
    classification: 'package-lifecycle-cli',
    synopsis: 'Benchmark old and new test-file compositions in seeded temporary worktrees.',
    usage:
      'compare-test-fixtures --baseline-ref <ref> --candidate-ref <ref> --file <path> [--file <path> ...] [--samples <n>] [--output <json>]',
    arguments: [
      argument('--baseline-ref <ref>', 'Git ref for the original composition.'),
      argument('--candidate-ref <ref>', 'Git ref for the candidate composition.'),
      argument('--file <path>', 'Repeatable path used by both refs.'),
      argument('--baseline-file <path>', 'Repeatable baseline-only path.'),
      argument('--candidate-file <path>', 'Repeatable candidate-only path.'),
      argument('--samples <n>', 'Cold and warm sample count per ref; defaults to five.'),
      argument('--output <json>', 'Machine-readable result path.'),
    ],
    preconditions: ['Both refs must be locally resolvable and repository setup must succeed.'],
    effects: [
      'Creates, seeds, measures, and removes two explicit temporary git worktrees without mutating the caller worktree.',
    ],
    output: ['Writes benchmark JSON and prints the threshold comparison.'],
    relatedCommands: ['run-tests', 'npm run test:unit'],
  }),
  'verify-local-worktree': directDoc('verify-local-worktree', {
    group: 'Package lifecycle',
    path: 'scripts/dev-env/verify-local-worktree.mjs',
    classification: 'package-lifecycle-cli',
    synopsis: 'Verify a local AITM dogfood worktree and its required development tools.',
    usage: 'verify-local-worktree',
    arguments: [],
    preconditions: [
      'Run from an AITM source checkout with Node.js 22 or newer after dependencies and the self-link are installed.',
    ],
    effects: ['Reads environment and worktree state without modifying either.'],
    output: ['Reports every contract violation or confirms the local worktree is ready.'],
    relatedCommands: ['ensure-self-link', 'npm ci', 'npm run link:self'],
  }),
  'heal-stage-rollups': directDoc('heal-stage-rollups', {
    group: 'Maintenance',
    path: 'scripts/maintenance/heal-stage-rollups.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Rebuild legacy stage-rollup markers from raw timing evidence.',
    usage: 'heal-stage-rollups [--apply] [--dry-run] [--verify] [--issue <n>] [--yes]',
    arguments: [
      argument(APPLY_FLAG, 'Write rebuilt stage-rollup markers.'),
      argument('--dry-run', 'Preview repairs without writing; this is the default.'),
      argument('--verify', 'Scan only and fail if legacy markers remain.'),
      argument('--issue <n>', 'Restrict the scan to one issue.'),
      argument('--yes', 'Skip the write confirmation.'),
    ],
    preconditions: ['Configured repository and authenticated GitHub access are required.'],
    effects: ['Dry-run by default; apply mode rewrites stage-rollup markers.'],
    output: ['Reports scanned, repaired, skipped, and failed issues.'],
    relatedCommands: ['heal-timing-log', 'heal-entry-markers'],
  }),
  'rename-estimation-headers': directDoc('rename-estimation-headers', {
    group: 'Maintenance',
    path: 'scripts/maintenance/rename-estimation-headers.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Migrate historical estimation comment headers to current lifecycle vocabulary.',
    usage: 'rename-estimation-headers [--dry-run] [--repo owner/name]',
    arguments: [
      argument('--dry-run', 'Preview matching comment rewrites without writing.'),
      argument('--repo owner/name', 'Override the configured repository.'),
    ],
    preconditions: [
      'Configured or explicit repository and authenticated GitHub access are required.',
    ],
    effects: ['Rewrites matching historical issue comments unless dry-run.'],
    output: ['Reports scanned, matched, patched, and failed comments.'],
    relatedCommands: ['migrate-project', 'heal-backlog'],
  }),
  'sync-templates': directDoc('sync-templates', {
    group: 'Package lifecycle',
    path: 'scripts/sync-templates.mjs',
    classification: 'package-lifecycle-cli',
    synopsis: 'Synchronize tracked AITM template mirrors from their canonical templates.',
    usage: 'sync-templates',
    arguments: [],
    preconditions: ['Run from an AITM source checkout with canonical template directories.'],
    effects: ['Writes template mirrors that differ from their canonical source.'],
    output: ['Reports created, changed, and already-current template mirrors.'],
    relatedCommands: ['npm run sync:templates'],
  }),
  'ensure-self-link': directDoc('ensure-self-link', {
    group: 'Package lifecycle',
    path: 'scripts/task-tracker/ensure-self-link.mjs',
    classification: 'package-lifecycle-cli',
    synopsis: 'Ensure a development checkout links node_modules/ai-task-manager to itself.',
    usage: 'ensure-self-link',
    arguments: [],
    preconditions: ['Run inside an AITM development checkout.'],
    effects: ['Creates or repairs the development self symlink; packaged installs are unchanged.'],
    output: ['Reports whether the self link was created, repaired, present, or skipped.'],
    relatedCommands: ['npm run link:self', 'npm ci'],
  }),
  'init-repair': directDoc('init-repair', {
    group: 'Maintenance',
    path: 'scripts/gh/init-repair.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Repair missing initialized project fields using live GitHub Project metadata.',
    usage: 'init-repair',
    arguments: [],
    preconditions: ['Configured repository, project id, and authenticated gh access are required.'],
    effects: ['Updates missing configuration values after live project discovery.'],
    output: ['Reports each repaired or already-populated field.'],
    relatedCommands: ['ai-task-manager init', 'ai-task-manager repair'],
  }),
  'migrate-project': directDoc('migrate-project', {
    group: 'Maintenance',
    path: 'scripts/gh/migrate-project.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Migrate issue bodies and board state to the current AITM project schema.',
    usage: 'migrate-project [--dry-run] [--skip-init] [--closed|--all] [--keep-retired]',
    arguments: [
      argument('--dry-run', 'Report without writes.'),
      argument('--skip-init', 'Skip project initialization.'),
      argument('--closed|--all', 'Include closed issues.'),
      argument('--keep-retired', 'Preserve retired project options.'),
    ],
    preconditions: ['Configured project and authenticated GitHub access are required.'],
    effects: ['May initialize project fields and rewrite/tether issues unless dry-run.'],
    output: ['Reports migrated, skipped, and failed issues.'],
    relatedCommands: ['ai-task-manager init', 'heal-backlog'],
  }),
  'scaffold-web-issue': directDoc('scaffold-web-issue', {
    group: 'Maintenance',
    path: 'scripts/gh/scaffold-web-issue.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Add the missing backlog-entry marker to an issue created outside AITM.',
    usage: 'scaffold-web-issue <issue-number>',
    arguments: [argument('<issue-number>', 'Web-authored issue to scaffold.')],
    preconditions: ['Configured repository and authenticated GitHub access are required.'],
    effects: ['Rewrites the issue body only when its backlog-entry marker is absent.'],
    output: ['Reports whether the issue was scaffolded or already canonical.'],
    relatedCommands: ['create-issue', 'heal-entry-markers'],
  }),
  'verify-open-issue-bodies': directDoc('verify-open-issue-bodies', {
    group: 'Maintenance',
    path: 'scripts/gh/verify-open-issue-bodies.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Audit open issue bodies for canonical AITM structure.',
    usage: 'verify-open-issue-bodies [--json]',
    arguments: [argument('--json', 'Emit machine-readable results.')],
    preconditions: ['Configured repository and authenticated GitHub access are required.'],
    effects: ['Read-only audit of open GitHub issues.'],
    output: ['Prints structural conformance failures or a JSON audit report.'],
    relatedCommands: ['heal-backlog', 'preflight-issue'],
  }),
  'verify-priority-p3': directDoc('verify-priority-p3', {
    group: 'Maintenance',
    path: 'scripts/gh/verify-priority-p3.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Verify configured P3 priority metadata against the live GitHub Project option.',
    usage: 'verify-priority-p3',
    arguments: [],
    preconditions: ['Configured project metadata and authenticated gh access are required.'],
    effects: ['Read-only comparison of local configuration and live project metadata.'],
    output: ['Prints the matching P3 option or a drift diagnostic.'],
    relatedCommands: ['set-priority', 'ai-task-manager repair'],
  }),
  'ai-memory-parity': directDoc('ai-memory-parity', {
    group: 'Maintenance',
    path: 'scripts/inspect/ai-memory-parity.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Inspect rebase, file, index, or diff parity for durable ai-memory content.',
    usage: 'ai-memory-parity --mode <rebase|files|index|diff> [--live <path>]',
    arguments: [
      argument('--mode <mode>', 'Parity check mode.'),
      argument('--live <path>', 'Live memory checkout override.'),
    ],
    preconditions: ['Git history and the selected durable memory paths must be readable.'],
    effects: ['Read-only git and file parity inspection.'],
    output: ['Prints parity status or a reconciliation diff.'],
    relatedCommands: ['git worktree list', 'aitm memory-resync'],
  }),
  'heal-options-co-pilot-bodies': directDoc('heal-options-co-pilot-bodies', {
    group: 'Maintenance',
    path: 'scripts/migrate/heal-options-co-pilot-bodies.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Heal Options Copilot issue bodies to canonical AITM fields.',
    usage: 'heal-options-co-pilot-bodies [--dry-run] [--limit <n>]',
    arguments: [
      argument('--dry-run', 'Report planned rewrites.'),
      argument('--limit <n>', 'Maximum issues processed.'),
    ],
    preconditions: ['Authenticated access to the Options Copilot repository is required.'],
    effects: ['Rewrites non-standard issue bodies unless dry-run.'],
    output: ['Prints planned/written, skipped, and error counts.'],
    relatedCommands: ['heal-backlog'],
  }),
  'options-co-pilot-status-swap': directDoc('options-co-pilot-status-swap', {
    group: 'Maintenance',
    path: 'scripts/migrate/options-co-pilot-status-swap.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Run one phase of the Options Copilot status-field migration.',
    usage:
      'options-co-pilot-status-swap <--create|--translate|--rename-status|--cleanup> [--dry-run]',
    arguments: [
      argument('--create|--translate|--rename-status|--cleanup', 'Required migration phase.'),
      argument('--dry-run', 'Report phase actions without writes.'),
    ],
    preconditions: ['Run phases in order with authenticated access to the target project.'],
    effects: ['May create, translate, rename, or delete project fields unless dry-run.'],
    output: ['Prints field and item migration actions.'],
    relatedCommands: ['migrate-project'],
  }),
  'rename-on-deck-to-assigned': directDoc('rename-on-deck-to-assigned', {
    group: 'Maintenance',
    path: 'scripts/migrate/rename-on-deck-to-assigned.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Preview or explicitly rename the legacy Status option to Assigned in place.',
    usage: 'rename-on-deck-to-assigned [--apply] [--yes]',
    arguments: [
      argument(APPLY_FLAG, 'Rename the configured option; default is a read-only preview.'),
      argument('--yes', 'Bypass blast-radius confirmation when required.'),
    ],
    preconditions: [
      'Configured project and Status field ids plus authenticated GitHub access are required.',
    ],
    effects: [
      'Read-only by default; --apply renames the existing option without changing its id or item assignments.',
    ],
    output: ['Prints the stable option id and dry-run, applied, or already-canonical result.'],
    exitCodes: [
      exitCode(0, 'preview, no-op, or explicit migration completed successfully'),
      exitCode(1, 'configuration, project query, schema validation, or mutation failed'),
      exitCode(2, 'invalid usage or blast-radius confirmation refusal'),
    ],
    examples: [
      'node scripts/migrate/rename-on-deck-to-assigned.mjs',
      'node scripts/migrate/rename-on-deck-to-assigned.mjs --apply',
    ],
    relatedCommands: ['migrate-project', 'ai-task-manager init'],
  }),
  'assigned-to-ready-for-plan': directDoc('assigned-to-ready-for-plan', {
    group: 'Maintenance',
    path: 'scripts/migrate/assigned-to-ready-for-plan.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Preview or apply the journaled Assigned to Ready for Planning board cutover.',
    usage: 'assigned-to-ready-for-plan [--apply] [--yes] [--views-verified]',
    arguments: [
      argument(APPLY_FLAG, 'Apply the immutable dry-run plan; default is read-only inspection.'),
      argument('--yes', 'Confirm the complete printed migration blast radius.'),
      argument(
        '--views-verified',
        'Record an operator-confirmed saved-view fallback when GitHub read-back is unavailable.'
      ),
    ],
    preconditions: [
      'Run only after the #1209 repository behavior stack is integrated and the live board is otherwise quiescent.',
      'Configured project, Status field, Backlog option, and legacy Assigned option ids are required.',
    ],
    effects: [
      'Read-only by default; --apply moves inventoried Assigned items to Backlog, preserves assignees, renames and reorders the Status option, and cuts over configuration through a durable journal.',
    ],
    output: [
      'Prints the repository-qualified immutable inventory, exact option id and target order, then the final journal phase.',
    ],
    exitCodes: [
      exitCode(0, 'dry-run or explicit migration completed and verified successfully'),
      exitCode(1, 'inventory, read-back, journal, view, configuration, or GitHub operation failed'),
      exitCode(2, 'invalid usage or blast-radius confirmation refusal'),
    ],
    examples: [
      'node scripts/migrate/assigned-to-ready-for-plan.mjs',
      'node scripts/migrate/assigned-to-ready-for-plan.mjs --apply --yes',
      'node scripts/migrate/assigned-to-ready-for-plan.mjs --apply --yes --views-verified',
    ],
    relatedCommands: ['rename-on-deck-to-assigned', 'ai-task-manager init'],
  }),
  'start-time-field': directDoc('start-time-field', {
    group: 'Maintenance',
    path: 'scripts/migrate/start-time-field.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Migrate board Started values into the canonical Start field.',
    usage: 'start-time-field [--dry-run] [--delete-old-fields]',
    arguments: [
      argument('--dry-run', 'Report planned field changes.'),
      argument('--delete-old-fields', 'Remove legacy start fields after migration.'),
    ],
    preconditions: ['Configured project and authenticated GitHub access are required.'],
    effects: ['Copies start values and may delete legacy fields unless dry-run.'],
    output: ['Reports migrated items and field cleanup.'],
    relatedCommands: ['migrate-project'],
  }),
  'heal-backlog-attribution': directDoc('heal-backlog-attribution', {
    group: 'Maintenance',
    path: 'scripts/reports/heal-backlog-attribution.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Audit or repair issue commit-attribution markers from trunk history.',
    usage:
      'heal-backlog-attribution [--repo owner/name] [--trunk <ref>] [--limit <n>] [--apply] [--json] [--yes]',
    arguments: [
      argument('--repo/--trunk', 'Repository and trunk overrides.'),
      argument('--limit <n>', 'Maximum issues.'),
      argument(APPLY_FLAG, 'Apply body repairs.'),
      argument('--json', 'Emit JSON.'),
      argument('--yes', 'Skip multi-issue confirmation.'),
    ],
    preconditions: ['Readable trunk history and repository issue access are required.'],
    effects: ['Read-only by default; --apply rewrites attribution markers.'],
    output: ['Prints attribution audit or repair results.'],
    relatedCommands: ['commit-trace', 'audit-trunk-integration'],
  }),
  'backfill-plan-metadata': directDoc('backfill-plan-metadata', {
    group: 'Maintenance',
    path: 'scripts/task-tracker/backfill-plan-metadata.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Split legacy Story Origin provenance and normalize metadata labels.',
    usage: 'backfill-plan-metadata [--apply] [--yes]',
    arguments: [
      argument(APPLY_FLAG, 'Write matching issue bodies.'),
      argument('--yes', 'Skip multi-issue confirmation.'),
    ],
    preconditions: ['Configured repository and issue access are required.'],
    effects: [
      'Dry-run by default; --apply rewrites matching Story Origin and Plan Metadata sections.',
    ],
    output: ['Reports issues needing or receiving the backfill.'],
    relatedCommands: ['heal-backlog'],
  }),
  'backfill-disposition': directDoc('backfill-disposition', {
    group: 'Maintenance',
    path: 'scripts/task-tracker/backfill-disposition.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Audit or backfill terminal Disposition values for closed issues.',
    usage: 'backfill-disposition [--apply] [--issues N,N] [--yes]',
    arguments: [
      argument(APPLY_FLAG, 'Write derived Disposition values to the project field.'),
      argument('--issues N,N', 'Limit the audit or backfill to the listed issue numbers.'),
      argument('--yes', 'Skip confirmation when applying to more than one issue.'),
    ],
    preconditions: [
      'Configured repository and authenticated issue access are required; --apply also requires the terminal Disposition project field.',
    ],
    effects: ['Read-only by default; --apply writes evidence-derived terminal Disposition values.'],
    output: [
      'Reports each issue classification and planned, unchanged, updated, or failed totals.',
    ],
    exitCodes: [
      exitCode(0, 'help or backfill completed without item failures'),
      exitCode(1, 'one or more per-item apply operations failed after the sweep completed'),
      exitCode(2, 'invalid usage, configuration, issue fetch, or confirmation refusal'),
    ],
    examples: [
      'node scripts/task-tracker/backfill-disposition.mjs --issues 1027,1028',
      'node scripts/task-tracker/backfill-disposition.mjs --apply --issues 1027,1028',
    ],
    relatedCommands: ['close', 'supersede'],
  }),
  'backfill-timing-logs': directDoc('backfill-timing-logs', {
    group: 'Maintenance',
    path: 'scripts/task-tracker/backfill-timing-logs.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Backfill recoverable legacy timing rows for one issue or all open issues.',
    usage: 'backfill-timing-logs (--issue N | --all-open) [--apply] [--cap-hours H] [--yes]',
    arguments: [
      argument('--issue N|--all-open', 'Required target selection.'),
      argument(APPLY_FLAG, 'Write healed timing comments.'),
      argument('--cap-hours H', 'Recovery-duration cap.'),
      argument('--yes', 'Skip confirmation.'),
    ],
    preconditions: ['Configured repository and timing-comment access are required.'],
    effects: ['Dry-run by default; --apply rewrites timing comments with backups.'],
    output: ['Reports recoverable, unrecoverable, changed, and skipped rows.'],
    relatedCommands: ['heal-timing-log', 'log-issue-time'],
  }),
  'backfill-vc-sections': directDoc('backfill-vc-sections', {
    group: 'Maintenance',
    path: 'scripts/task-tracker/backfill-vc-sections.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Backfill canonical Verification Commands sections on issue bodies.',
    usage: 'backfill-vc-sections [--apply|--dry-run] [--scope N,N] [--yes]',
    arguments: [
      argument('--apply|--dry-run', 'Write or explicitly audit.'),
      argument('--scope N,N', 'Issue-number scope.'),
      argument('--yes', 'Skip confirmation.'),
    ],
    preconditions: ['Configured repository and issue access are required.'],
    effects: ['Dry-run by default; --apply rewrites missing VC sections.'],
    output: ['Reports scoped issues and VC-section changes.'],
    relatedCommands: ['preflight-issue', 'heal-vc-refs'],
  }),
  'heal-entry-markers': directDoc('heal-entry-markers', {
    group: 'Maintenance',
    path: 'scripts/task-tracker/heal-entry-markers.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Audit or heal lifecycle entry-marker chains.',
    usage: 'heal-entry-markers [<issue#> ...] [--apply|--check-only] [--yes]',
    arguments: [
      argument('[<issue#> ...]', 'Optional issue scope; defaults to open issues.'),
      argument('--apply|--check-only', 'Write repairs or fail when repairs are needed.'),
      argument('--yes', 'Skip confirmation.'),
    ],
    preconditions: ['Configured repository and issue access are required.'],
    effects: ['Dry-run by default; --apply rewrites lifecycle entry markers.'],
    output: ['Prints per-issue marker drift and repair actions.'],
    relatedCommands: ['scaffold-web-issue', 'reconcile'],
  }),
  'heal-functional-dod': directDoc('heal-functional-dod', {
    group: 'Maintenance',
    path: 'scripts/task-tracker/heal-functional-dod.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Heal canonical Functional Definition of Done sections.',
    usage: 'heal-functional-dod [--state open|closed|all] [--scope N,N] [--apply] [--yes]',
    arguments: [
      argument('--state <state>', 'Issue-state filter.'),
      argument('--scope N,N', 'Issue-number scope.'),
      argument(APPLY_FLAG, 'Write body repairs.'),
      argument('--yes', 'Skip confirmation.'),
    ],
    preconditions: ['Configured repository and issue access are required.'],
    effects: ['Dry-run by default; --apply rewrites Functional DoD sections.'],
    output: ['Reports canonical, changed, skipped, and failed issues.'],
    relatedCommands: ['heal-lifecycle-dod', 'preflight-issue'],
  }),
  'heal-lifecycle-dod': directDoc('heal-lifecycle-dod', {
    group: 'Maintenance',
    path: 'scripts/task-tracker/heal-lifecycle-dod.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Heal canonical Lifecycle Definition of Done sections.',
    usage: 'heal-lifecycle-dod [--state open|closed|all] [--scope N,N] [--apply] [--yes]',
    arguments: [
      argument('--state <state>', 'Issue-state filter.'),
      argument('--scope N,N', 'Issue-number scope.'),
      argument(APPLY_FLAG, 'Write body repairs.'),
      argument('--yes', 'Skip confirmation.'),
    ],
    preconditions: ['Configured repository and issue access are required.'],
    effects: ['Dry-run by default; --apply rewrites Lifecycle DoD sections.'],
    output: ['Reports canonical, changed, skipped, and failed issues.'],
    relatedCommands: ['heal-functional-dod', 'preflight-issue'],
  }),
  'heal-refine-entry-marker': directDoc('heal-refine-entry-marker', {
    group: 'Maintenance',
    path: 'scripts/task-tracker/heal-refine-entry-marker.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Backfill missing refine-entry audit markers.',
    usage: 'heal-refine-entry-marker [<issue#> ...] [--apply] [--yes]',
    arguments: [
      argument('[<issue#> ...]', 'Optional issue scope.'),
      argument(APPLY_FLAG, 'Write marker repairs.'),
      argument('--yes', 'Skip confirmation.'),
    ],
    preconditions: ['Configured repository and issue access are required.'],
    effects: ['Dry-run by default; --apply rewrites missing refine markers.'],
    output: ['Reports issues needing or receiving a refine-marker backfill.'],
    relatedCommands: ['heal-entry-markers'],
  }),
  'heal-timing-log': directDoc('heal-timing-log', {
    group: 'Maintenance',
    path: 'scripts/task-tracker/heal-timing-log.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Audit or heal retired and malformed Timing Log rows.',
    usage:
      'heal-timing-log (<issue#> [--apply|--check-only] | --sweep [--state open|closed|all] [--scope N,N] [--apply]) [--yes]',
    arguments: [
      argument('<issue#>|--sweep', 'Single issue or corpus mode.'),
      argument('--state/--scope', 'Sweep filters.'),
      argument('--apply|--check-only', 'Write repairs or fail when needed.'),
      argument('--yes', 'Skip confirmation.'),
    ],
    preconditions: ['Configured repository and timing-comment access are required.'],
    effects: ['Dry-run by default; --apply rewrites Timing Log comments.'],
    output: ['Reports row transformations and per-issue results.'],
    relatedCommands: ['backfill-timing-logs', 'log-issue-time'],
  }),
  'heal-timing-departure': directDoc('heal-timing-departure', {
    group: 'Maintenance',
    path: 'scripts/task-tracker/heal-timing-departure.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Repair one missing Timing Log departure before an unpaired reengagement.',
    usage:
      'heal-timing-departure <issue#> [--apply|--check-only] [--row-index N] [--event pause:<reason>] [--description TEXT] [--at TIMESTAMP] [--yes]',
    arguments: [
      argument('<issue#>', 'Issue whose Timing Log is inspected.'),
      argument(APPLY_FLAG, 'Write the selected missing departure repair.'),
      argument('--check-only', 'Audit and render the repair without writing.'),
      argument('--row-index N', 'Select a zero-based Timing Log data-row index when ambiguous.'),
      argument('--event pause:<reason>', 'Departure event to insert; pause:other is the default.'),
      argument('--description TEXT', 'Description recorded on the repaired departure row.'),
      argument(
        '--at TIMESTAMP',
        'Place the departure at this timestamp; it must fall strictly between the preceding row and the reengagement. Defaults to one second before the reengagement.'
      ),
      argument('--yes', 'Skip confirmation for apply.'),
    ],
    preconditions: ['Configured repository and timing-comment access are required.'],
    effects: [
      'Dry-run by default; --apply inserts one departure row under the timing lock.',
      'An out-of-interval --at is rejected, never clamped; nothing is written.',
    ],
    output: ['Reports unpaired reengagement counts before and after the repair.'],
    relatedCommands: ['heal-timing-log', 'heal-timing-starts'],
  }),
  'heal-timing-interval': directDoc('heal-timing-interval', {
    group: 'Maintenance',
    path: 'scripts/task-tracker/heal-timing-interval.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Record one caller-reported AFK interval as an authoritative Timing Log bracket.',
    usage:
      'heal-timing-interval <issue#> --start TIMESTAMP --end TIMESTAMP [--apply|--check-only] [--yes]',
    arguments: [
      argument('<issue#>', 'Issue whose Timing Log is inspected.'),
      argument('--start TIMESTAMP', 'Exclusive start of the retroactive AFK interval.'),
      argument('--end TIMESTAMP', 'Exclusive end of the retroactive AFK interval.'),
      argument(APPLY_FLAG, 'Write the validated pause:retroactive/resumed pair.'),
      argument(
        '--check-only',
        'Render authoritative timing-v2 before/after totals without writing.'
      ),
      argument('--yes', 'Skip confirmation for apply.'),
    ],
    preconditions: [
      'Both endpoints must fall strictly within one unambiguous lifecycle phase visit.',
      'The interval must not overlap existing interruption evidence or any timing row.',
    ],
    effects: [
      'Dry-run by default; --apply runs the full read/transform/write/read-back under the timing lock.',
      'Apply inserts one zero-value pause:retroactive/resumed pair and reconciles cached completion durations.',
      'A write is successful only after exact read-back, including ambiguous transport reconciliation.',
    ],
    output: [
      'Reports the phase, interval seconds, and authoritative active/idle totals before and after.',
    ],
    relatedCommands: ['heal-timing-departure', 'heal-timing-log'],
  }),
  'heal-timing-starts-sweep': directDoc('heal-timing-starts-sweep', {
    group: 'Maintenance',
    path: 'scripts/task-tracker/heal-timing-starts-sweep.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Audit or heal duplicate Timing Log start rows across a scoped corpus.',
    usage: 'heal-timing-starts-sweep [--state closed|open|all] [--all] [--scope N,N]',
    arguments: [
      argument('--state closed|open|all', 'Issue-state filter; closed is default.'),
      argument('--all', 'Apply all detected repairs.'),
      argument('--scope N,N', 'Issue-number scope.'),
    ],
    preconditions: ['Configured repository, project, and timing-comment access are required.'],
    effects: ['Read-only by default; --all rewrites duplicate start rows.'],
    output: ['Reports audited, corrupted, healed, and failed timing logs.'],
    relatedCommands: ['heal-timing-starts', 'heal-timing-log'],
  }),
  'heal-timing-starts': directDoc('heal-timing-starts', {
    group: 'Maintenance',
    path: 'scripts/task-tracker/heal-timing-starts.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Collapse duplicate Timing Log start rows for one issue.',
    usage: 'heal-timing-starts <issue#> [--apply|--check-only] [--yes]',
    arguments: [
      argument('<issue#>', 'Issue whose Timing Log is inspected.'),
      argument(APPLY_FLAG, 'Rewrite duplicate start rows.'),
      argument('--check-only', 'Audit without writing.'),
      argument('--yes', 'Skip confirmation for apply.'),
    ],
    preconditions: ['Configured repository and timing-comment access are required.'],
    effects: [
      'Check-only by default; --apply rewrites duplicate start rows under the timing lock.',
    ],
    output: ['Reports start-row counts and whether the log was changed.'],
    relatedCommands: ['heal-timing-starts-sweep', 'heal-timing-log'],
  }),
  'heal-vc-refs': directDoc('heal-vc-refs', {
    group: 'Maintenance',
    path: 'scripts/task-tracker/heal-vc-refs.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Heal malformed acceptance-to-verification-command references.',
    usage: 'heal-vc-refs [--state open|closed|all] [--scope N,N] [--apply] [--yes]',
    arguments: [
      argument('--state <state>', 'Issue-state filter.'),
      argument('--scope N,N', 'Issue-number scope.'),
      argument(APPLY_FLAG, 'Write body repairs.'),
      argument('--yes', 'Skip confirmation.'),
    ],
    preconditions: ['Configured repository and issue access are required.'],
    effects: ['Dry-run by default; --apply rewrites malformed VC references.'],
    output: ['Reports canonical, repaired, skipped, and failed issues.'],
    relatedCommands: ['backfill-vc-sections', 'preflight-issue'],
  }),
  'migrate-fields-encoding': directDoc('migrate-fields-encoding', {
    group: 'Maintenance',
    path: 'scripts/task-tracker/migrate-fields-encoding.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Migrate legacy issue-field block encodings.',
    usage: 'migrate-fields-encoding <issue#> [...] [--dry-run] [--scan]',
    arguments: [
      argument('<issue#> [...]', 'Issues to migrate.'),
      argument('--scan', 'Discover additional open issues.'),
      argument('--dry-run', 'Report without writes.'),
    ],
    preconditions: ['Configured repository and issue access are required.'],
    effects: ['Rewrites legacy field encodings unless dry-run.'],
    output: ['Reports migrated, unchanged, and failed issues.'],
    relatedCommands: ['heal-backlog'],
  }),
  'migrate-plan-approved': directDoc('migrate-plan-approved', {
    group: 'Maintenance',
    path: 'scripts/task-tracker/migrate-plan-approved.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Migrate one issue from legacy plan approval evidence to the canonical marker.',
    usage: 'migrate-plan-approved <issue#>',
    arguments: [argument('<issue#>', 'Issue whose approval evidence is migrated.')],
    preconditions: ['Configured repository and issue access are required.'],
    effects: ['Rewrites the issue only when legacy approval evidence is present.'],
    output: ['Reports migrated, already canonical, or skipped status.'],
    relatedCommands: ['plan-approve', 'heal-backlog'],
  }),
  'tag-story-ids': directDoc('tag-story-ids', {
    group: 'Maintenance',
    path: 'scripts/task-tracker/tag-story-ids.mjs',
    classification: 'live-maintenance-or-migration',
    synopsis: 'Backfill @story tags in repository test files from creation history.',
    usage: 'tag-story-ids',
    arguments: [],
    preconditions: ['Run from a git checkout with readable test-file history.'],
    effects: ['Writes missing or misplaced @story tags in discovered test files.'],
    output: ['Reports tagged, fixed, skipped, and unresolved test files.'],
    relatedCommands: ['npm run lint:story-tags'],
  }),
});

const COMPLETE_ROUTABLE_SELF_DOC = Object.freeze(
  Object.fromEntries(
    Object.entries(ROUTABLE_SELF_DOC).map(([name, doc]) => [name, completeRoutableDoc(name, doc)])
  )
);

export const SELF_DOC = Object.freeze({
  ...DIRECT_SELF_DOC,
  ...COMPLETE_ROUTABLE_SELF_DOC,
});

// Print the full self-doc for one command to stdout. Called by each exposed
// script's help guard.
export function emitSelfDoc(name, write = (s) => process.stdout.write(s)) {
  const doc = SELF_DOC[name];
  if (!doc) {
    write(`aitm: no self-doc registered for "${name}"\n`);
    return;
  }
  const lines = [
    `${name} — ${doc.synopsis}`,
    '',
    `  Purpose:       ${doc.synopsis}`,
    `  Group:         ${doc.group}`,
    `  Usage:         ${doc.usage}`,
    `  Audience:      ${doc.audience}`,
    `  Arguments:     ${(doc.arguments || []).map((item) => item.name || item).join(', ') || 'See usage'}`,
    `  Preconditions: ${(doc.preconditions || ['See usage and runtime diagnostics']).join('; ')}`,
    `  Effects:       ${(doc.effects || ['Performs the command action; help is read-only']).join('; ')}`,
    `  Output:        ${(doc.output || ['Results on stdout; diagnostics on stderr']).join('; ')}`,
    `  Exit codes:    ${(doc.exitCodes || [{ code: 0, meaning: 'success' }])
      .map((item) => `${item.code}=${item.meaning}`)
      .join('; ')}`,
    `  Examples:      ${(doc.examples || [`npx ${doc.usage}`]).join('; ')}`,
    `  Related:       ${(doc.relatedCommands || ['aitm help']).join(', ')}`,
    '',
    doc.routable === false
      ? 'Invoke this entry point directly only after reviewing its effects.'
      : 'Invoke via the package or orchestrator command name:',
    doc.routable === false ? `  node ${doc.path} --help` : `  npx ${doc.usage}`,
    '',
  ];
  write(lines.join('\n'));
}
