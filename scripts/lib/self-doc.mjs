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

import path from 'node:path';
import { EXECUTABLE_ENTRYPOINTS } from '../task-tracker/lib/command-surface/entrypoints.mjs';

// Help-token detection. Bare `help`/`?` (the `aitm <name> help` form) and the
// conventional `--help`/`-h` flags all count.
const HELP_TOKENS = new Set(['help', '?', '--help', '-h']);

export function wantsHelp(argv = []) {
  return argv.some((a) => HELP_TOKENS.has(String(a)));
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
      'aitm create-issue --title <t> --body-file <path> [--parent <#>] [--shape epic|sub-issue|solo|stub]',
  },
  'preflight-issue': {
    group: 'GitHub',
    path: 'scripts/task-tracker/preflight-issue.mjs',
    synopsis: 'Stamp the DoD + Pickup-Directive tail onto a draft issue body before creation.',
    audience: 'AI/operator preparing an issue body. Output feeds `aitm create-issue --body-file`.',
    usage: 'aitm preflight-issue --title <t> --body-file <draft> [--shape ...] [--assignee <v>]',
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
    usage: 'aitm project-tether <issue#>',
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
    synopsis:
      'Develop-phase gate: lint:js --fix, format, then targeted node --test on changed tests.',
    audience: 'AI/operator before every Develop commit. Never run npm run test:all in Develop.',
    usage: 'aitm verify-develop',
  },
  'value-report': {
    group: 'Reports',
    path: 'scripts/reports/generate-value-report.mjs',
    synopsis: 'Generate the AI-value / project report from the GitHub Project board.',
    audience:
      'Operator producing an epic value summary. Also installed as bin `github-project-report`.',
    usage: 'aitm value-report [--since <date>] [--format md|json]',
  },
  'measure-context': {
    group: 'Reports',
    path: 'scripts/task-tracker/measure-context.mjs',
    synopsis: 'Measure context-word usage for a session/issue.',
    audience: 'Operator/diagnostics. Also invoked internally by timing hooks.',
    usage: 'aitm measure-context [--issue <#>]',
  },
  'heal-backlog': {
    group: 'Maintenance',
    path: 'scripts/task-tracker/heal-backlog.mjs',
    synopsis:
      'Normalize body encodings, reconcile aitm-fields vs the timing log, validate field schema. `--rename-timing-slugs` rewrites historical timing-log Event slugs to the #516 vocabulary.',
    audience: 'Operator healing drifted issue bodies. Dry-run by default; --apply to write.',
    usage:
      'aitm heal-backlog [--state open|closed|all] [--apply] [--scope 1,2,3] [--rename-timing-slugs]',
  },
  'heal-stage-rollups': {
    group: 'Maintenance',
    path: 'scripts/maintenance/heal-stage-rollups.mjs',
    synopsis:
      'Heal legacy aitm-stage-rollup markers to schema:2 seconds, rebuilt from raw timing evidence.',
    audience: 'Operator running a corpus migration. Dry-run by default; --apply to write.',
    usage: 'aitm heal-stage-rollups [--apply] [--dry-run] [--verify] [--issue <n>]',
  },
  'rename-estimation-headers': {
    group: 'Maintenance',
    path: 'scripts/maintenance/rename-estimation-headers.mjs',
    synopsis: 'One-shot maintenance: rename legacy estimation headers across open issue bodies.',
    audience: 'Operator running a corpus migration. Dry-run by default; --apply to write.',
    usage: 'aitm rename-estimation-headers [--apply]',
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

const DIRECT_HELP_CLASSIFICATIONS = new Set([
  'agent-callable-standalone',
  'package-lifecycle-cli',
  'live-maintenance-or-migration',
]);

function derivedCommandName(entry) {
  return entry.command || path.posix.basename(entry.path).replace(/\.(?:mjs|js)$/, '');
}

function derivedSelfDoc(entry) {
  const name = derivedCommandName(entry);
  const lifecycle = entry.classification === 'package-lifecycle-cli';
  const maintenance = entry.classification === 'live-maintenance-or-migration';
  return {
    group: lifecycle ? 'Package lifecycle' : maintenance ? 'Maintenance' : 'CLI',
    path: entry.path,
    synopsis: `Run the ${name} command or inspect its side-effect-free help contract.`,
    audience: maintenance
      ? 'Operator maintaining or migrating an AITM repository; review effects before execution.'
      : 'AITM operator or package lifecycle automation.',
    usage: `${name} [options]`,
    routable: false,
    classification: entry.classification,
    agentCallable: entry.classification === 'agent-callable-standalone',
    preconditions: [
      'Help has no prerequisites; normal execution may require an initialized project.',
    ],
    effects: [
      'Help is read-only; normal execution may change the repository or connected project.',
    ],
    output: ['Human-readable help on stdout and diagnostics on stderr.'],
    exitCodes: [
      { code: 0, meaning: 'help or command completed successfully' },
      { code: 1, meaning: 'runtime failure' },
      { code: 2, meaning: 'usage error or unknown command' },
    ],
    examples: [`node ${entry.path} --help`],
    relatedCommands: ['aitm help'],
  };
}

const DERIVED_SELF_DOC = Object.fromEntries(
  EXECUTABLE_ENTRYPOINTS.filter((entry) =>
    DIRECT_HELP_CLASSIFICATIONS.has(entry.classification)
  ).map((entry) => [derivedCommandName(entry), derivedSelfDoc(entry)])
);

export const SELF_DOC = Object.freeze({
  ...DERIVED_SELF_DOC,
  ...ROUTABLE_SELF_DOC,
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
      : 'Invoke via the orchestrator (never by node_modules filepath):',
    doc.routable === false ? `  node ${doc.path} --help` : `  npx ${doc.usage}`,
    '',
  ];
  write(lines.join('\n'));
}
