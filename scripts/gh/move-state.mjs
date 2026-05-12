#!/usr/bin/env node
// Move a GitHub issue through board states: Backlog → Groom → Analyze → Development → Validate → Review → Done
// Usage: node scripts/gh/move-state.mjs <issue#> <state> [--item-id <project-item-id>]
// States: backlog | refine | plan | develop | test | review | done

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../task-tracker/config.mjs';
import { gh, projectItemForIssue } from './lib/github-projects.mjs';
import { validateBody, DEFAULT_GATES } from '../task-tracker/lib/body-gates.mjs';
import { parseIssueFieldDb } from '../task-tracker/issue-field-db.mjs';
import { backlogMoveWarning } from './lib/project-tether.mjs';
import { checkDirty, formatSummary, resolveWorkspaceForIssue } from './lib/dirty-workspace.mjs';
import { validateTransition, normalizeStateSlug } from '../task-tracker/state-machine.mjs';
import { uncheckedPreCloseCheckboxes } from '../task-tracker/close-gate.mjs';
import { getProjectDir, existingRuntimePath, SHARED_DIR } from '../task-tracker/paths.mjs';
import { loadState, saveState } from '../task-tracker/state.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SKIP_NETWORK = process.env.TT_SKIP_NETWORK === '1';

// Internal-only gate. move-state.mjs is the chokepoint script for state changes;
// agents must reach it through `/task` verbs, not by shelling out directly. The
// /task chokepoint sets AITM_INTERNAL=1 before spawning this script. A human at
// a TTY may run the script directly. Anything else (non-TTY, no env var) is an
// agent trying to bypass the gates — refuse with a clear pointer.
const AITM_INTERNAL = process.env.AITM_INTERNAL === '1';
const IS_TTY = Boolean(process.stdin.isTTY);
if (!AITM_INTERNAL && !IS_TTY) {
  process.stderr.write(
    'move-state.mjs is internal. Agents must use /task move <state>.\n' +
      'If you are running this manually from a non-TTY shell (CI, pipe, redirect),\n' +
      'set AITM_INTERNAL=1 to confirm.\n'
  );
  process.exit(3);
}

const STATE_TO_CONFIG_KEY = {
  backlog: 'kanbanOptionBacklog',
  refine: 'kanbanOptionGroom',
  plan: 'kanbanOptionAnalyze',
  develop: 'kanbanOptionDevelopment',
  test: 'kanbanOptionValidate',
  review: 'kanbanOptionReview',
  done: 'kanbanOptionDone',
};

function usage() {
  process.stderr.write(
    'Usage: node scripts/gh/move-state.mjs <issue#> <state> [--item-id <project-item-id>] [--from <state>]\n' +
      'States: backlog | refine | plan | develop | test | review | done\n'
  );
  process.exit(1);
}

const cliArgs = process.argv.slice(2);
const issueArg = cliArgs[0];
const stateArg = cliArgs[1];
let itemIdOverride = '';
let fromOverride = '';

for (let i = 2; i < cliArgs.length; i++) {
  if (cliArgs[i] === '--item-id' && cliArgs[i + 1]) {
    itemIdOverride = cliArgs[i + 1];
    i++;
  } else if (cliArgs[i] === '--from' && cliArgs[i + 1]) {
    fromOverride = cliArgs[i + 1];
    i++;
  }
}

if (!issueArg || !stateArg) usage();
if (!/^\d+$/.test(issueArg)) usage();

const configKey = STATE_TO_CONFIG_KEY[stateArg];
if (!configKey) {
  process.stderr.write(
    `Unknown state: ${stateArg}\nStates: backlog | refine | plan | develop | test | review | done\n`
  );
  process.exit(1);
}

const cfg = loadConfig();

if (!SKIP_NETWORK && (!cfg.projectId || !cfg.kanbanFieldId)) {
  process.stderr.write('Error: Kanban board not configured. Run: npx ai-task-manager init\n');
  process.exit(1);
}

const optionId = cfg[configKey];
if (!SKIP_NETWORK && !optionId) {
  process.stderr.write(
    `Error: option ID for state '${stateArg}' not configured. Run: npx ai-task-manager init\n`
  );
  process.exit(1);
}

// State-machine matrix gate. Refuse illegal transitions (sequence-skip class from
// epic #61). From-state resolution: --from flag first (chokepoint can pass the
// recorded lastKnownState and skip the GraphQL roundtrip), then live Status field
// via GraphQL. If neither source is available (e.g. TT_SKIP_NETWORK with no
// --from), the matrix check is skipped — same fall-through behaviour as the
// plan->develop approval gate.
async function resolveLiveStateName(issueNumber) {
  if (SKIP_NETWORK) return '';
  try {
    const { gql, splitRepo } = await import('./lib/github-projects.mjs');
    const { owner, repoName } = splitRepo(cfg.repo);
    const data = await gql(
      `
      query($owner: String!, $repo: String!, $issue: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issue) {
            projectItems(first: 10) {
              nodes {
                project { id }
                fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue { name }
                }
              }
            }
          }
        }
      }`,
      { owner, repo: repoName, issue: Number(issueNumber) }
    );
    const nodes = data?.repository?.issue?.projectItems?.nodes || [];
    const node = nodes.find((n) => n?.project?.id === cfg.projectId);
    return normalizeStateSlug(String(node?.fieldValueByName?.name || '').toLowerCase()) || '';
  } catch {
    return '';
  }
}

let resolvedFromState = '';
if (fromOverride) {
  resolvedFromState = String(fromOverride).toLowerCase();
} else if (!SKIP_NETWORK) {
  resolvedFromState = await resolveLiveStateName(issueArg);
}

if (resolvedFromState) {
  const v = validateTransition(resolvedFromState, stateArg);
  if (!v.ok) {
    process.stderr.write(`\n⛔ Refusing to move #${issueArg} to ${stateArg}:\n`);
    process.stderr.write(`   BLOCKED: ${v.reason}\n`);
    process.stderr.write(
      '\nThe 7-state kanban only permits one-step forward moves plus test->develop\n'
    );
    process.stderr.write(
      'and review->develop rework. See scripts/task-tracker/state-machine.mjs.\n\n'
    );
    process.exit(5);
  }
}

// Gate 1: dirty-workspace warning on move to review. Non-blocking — move still proceeds.
if (stateArg === 'review' && process.env.TT_SKIP_DIRTY_CHECK !== '1') {
  try {
    const projectDir = getProjectDir();
    const cwd = resolveWorkspaceForIssue({ issueRef: `#${issueArg}`, projectDir });
    const result = await checkDirty({ cwd });
    if (result.dirty) {
      process.stderr.write(
        `⚠ Workspace is dirty (${result.total} path(s)) on move to Review for #${issueArg}:\n`
      );
      process.stderr.write(formatSummary(result) + '\n');
      process.stderr.write(
        'Consider running the cleanup flow (docs/guides/workflow.md → Cleanup Procedure) before close.\n'
      );
    }
  } catch {
    /* warning is best-effort */
  }
}

// Structural body gate: applies to test, review, and done.
// - For all three states: verify "evidence-required" ticked boxes have supporting body content
//   (Deep-Dive Analysis section, Dependency Map section, Verification Commands all-checked).
//   Note: verification-commands rule fires only at review/done — at test the auto-runner ticks them.
// - For done only: also enforce "no unchecked checkboxes" and "Deep dive line is checked".
const GATED_STATES = new Set(['test', 'review', 'done']);
if (GATED_STATES.has(stateArg) && !SKIP_NETWORK) {
  let body = '';
  try {
    body = await gh(['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body', '--jq', '.body']);
    body = body.trim();
  } catch {
    /* ignore — missing body is not a gate failure */
  }

  if (body) {
    const reasons = [];
    const refusedRuleNames = [];

    // Structural gates (all gated states). At validate, skip verification-commands
    // because the auto-runner is what ticks those boxes.
    const activeGates =
      stateArg === 'done' || stateArg === 'review'
        ? DEFAULT_GATES
        : DEFAULT_GATES.filter((g) => g.name !== 'verification-commands');
    const gateResult = validateBody(body, { gates: activeGates });
    if (!gateResult.ok) {
      for (const r of gateResult.refusedRules) {
        reasons.push(`${r.rule}: ${r.reason}`);
        refusedRuleNames.push(r.rule);
      }
    }

    // Done-only legacy checks
    if (stateArg === 'done') {
      const unchecked = uncheckedPreCloseCheckboxes(body);
      if (unchecked.length > 0)
        reasons.push(`${unchecked.length} unchecked checkbox(es) in issue body`);
    }

    if (reasons.length > 0) {
      if (process.env.TASK_TRACKER_FORCE_DONE === '1') {
        process.stderr.write(
          `⚠ TASK_TRACKER_FORCE_DONE=1 — bypassing ${stateArg} gate for #${issueArg}\n`
        );
        reasons.forEach((r) => process.stderr.write(`   • ${r}\n`));
        const bypassMsg = `⚠ **${stateArg} gate bypassed** via \`TASK_TRACKER_FORCE_DONE=1\` at ${new Date().toISOString()}. Unverified: ${reasons.join(', ')}.`;
        try {
          await gh(['issue', 'comment', issueArg, '-R', cfg.repo, '--body', bypassMsg]);
        } catch {}
      } else {
        // Append a gate-refused row to the timing log (fire-and-forget).
        if (refusedRuleNames.length > 0) {
          try {
            const { buildRow, postTimingEvent } =
              await import('../task-tracker/gh-timing-comment.mjs');
            const row = buildRow({
              ts: new Date().toISOString(),
              event: 'gate-refused',
              activeMin: 0,
              idleMin: 0,
              deltaWords: 0,
              wordMarker: 0,
              description: `→ ${stateArg}: ${refusedRuleNames.join(', ')}`,
            });
            await postTimingEvent({ issueNumber: issueArg, repo: cfg.repo, row, timeoutMs: 3000 });
          } catch {
            /* fire-and-forget */
          }
        }
        process.stderr.write('\n');
        process.stderr.write(`⛔ Refusing to move #${issueArg} to ${stateArg}:\n`);
        reasons.forEach((r) => process.stderr.write(`   BLOCKED: ${r}\n`));
        process.stderr.write('\n');
        process.stderr.write('See .ai-task-manager/pickup-directive.md Hard Rules.\n');
        const itemIdSuffix = itemIdOverride ? ` --item-id ${itemIdOverride}` : '';
        process.stderr.write(
          'Verify each item, check its box, then retry. Legitimate-abandonment override:\n'
        );
        process.stderr.write(
          `   TASK_TRACKER_FORCE_DONE=1 node scripts/gh/move-state.mjs ${issueArg} ${stateArg}${itemIdSuffix}\n\n`
        );
        process.exit(4);
      }
    }
  }
}

// Approval gate: plan -> develop requires explicit human approval
// recorded as a `<!-- aitm-plan-approved: <ts> -->` marker in the issue body.
// Fires only when the *current* board state is `plan` so transitions back
// from test/review do not require a fresh approval.
if (stateArg === 'develop' && !SKIP_NETWORK) {
  let body = '';
  try {
    body = (
      await gh(['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body', '--jq', '.body'])
    ).trim();
  } catch {
    /* ignore — missing body falls through */
  }

  const approved = /<!--\s*aitm-plan-approved:\s*[^>]+-->/i.test(body);

  // Resolve current state (single-select option name) via the project item.
  let currentStateName = '';
  try {
    const { gql, splitRepo } = await import('./lib/github-projects.mjs');
    const { owner, repoName } = splitRepo(cfg.repo);
    const data = await gql(
      `
      query($owner: String!, $repo: String!, $issue: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issue) {
            projectItems(first: 10) {
              nodes {
                project { id }
                fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue { name }
                }
              }
            }
          }
        }
      }`,
      { owner, repo: repoName, issue: Number(issueArg) }
    );
    const nodes = data?.repository?.issue?.projectItems?.nodes || [];
    const node = nodes.find((n) => n?.project?.id === cfg.projectId);
    const rawName = String(node?.fieldValueByName?.name || '').toLowerCase();
    currentStateName = normalizeStateSlug(rawName) || '';
  } catch {
    /* offline: fall back to body-only check below */
  }

  const fromAnalyze = currentStateName === '' || currentStateName === 'plan';

  if (fromAnalyze && !approved) {
    if (process.env.TASK_TRACKER_FORCE_DONE === '1') {
      process.stderr.write(
        `⚠ TASK_TRACKER_FORCE_DONE=1 — bypassing plan->develop approval gate for #${issueArg}\n`
      );
      const bypassMsg = `⚠ **plan->develop approval gate bypassed** via \`TASK_TRACKER_FORCE_DONE=1\` at ${new Date().toISOString()}.`;
      try {
        await gh(['issue', 'comment', issueArg, '-R', cfg.repo, '--body', bypassMsg]);
      } catch {}
    } else {
      process.stderr.write('\n');
      process.stderr.write(`⛔ Refusing to move #${issueArg} to develop:\n`);
      process.stderr.write(
        '   BLOCKED: plan -> develop requires <!-- aitm-plan-approved: <ts> --> marker in the body (run the approve verb to solicit human approval)\n'
      );
      process.stderr.write('\nResolve the blocker, then retry. Legitimate-abandonment override:\n');
      process.stderr.write(
        `   TASK_TRACKER_FORCE_DONE=1 node scripts/gh/move-state.mjs ${issueArg} develop\n\n`
      );
      process.exit(4);
    }
  }
}

// Backlog warning: moving a sized + estimated issue to Backlog is suspicious.
// Backlog is for unvetted ideas; sized work belongs in the Ready column. Non-blocking.
if (stateArg === 'backlog' && !SKIP_NETWORK) {
  try {
    const body = (
      await gh(['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body', '--jq', '.body'])
    ).trim();
    if (body) {
      const parsed = parseIssueFieldDb(body);
      const warn = backlogMoveWarning({
        targetState: 'backlog',
        fieldValues: parsed.ok ? parsed.values : null,
      });
      if (warn) process.stderr.write(`${warn}\n`);
    }
  } catch {
    /* fire-and-forget */
  }
}

// Resolve project item ID
let itemId = itemIdOverride;
if (!itemId && !SKIP_NETWORK) {
  const result = await projectItemForIssue({
    repo: cfg.repo,
    projectId: cfg.projectId,
    issueNumber: issueArg,
  });
  itemId = result.itemId;
  if (!itemId) {
    process.stderr.write(
      `Issue #${issueArg} not found in project (repo: ${cfg.repo}, projectId: ${cfg.projectId})\n`
    );
    process.exit(1);
  }
}

// Update the kanban board field
if (!SKIP_NETWORK) {
  await gh([
    'project',
    'item-edit',
    '--project-id',
    cfg.projectId,
    '--id',
    itemId,
    '--field-id',
    cfg.kanbanFieldId,
    '--single-select-option-id',
    optionId,
  ]);
}

console.log(`✓ Issue #${issueArg} moved to: ${stateArg}`);

// Persist new kanban state to tracker-state if this issue is the active task.
// activity-guard reads `state` to gate write activity classes; without this,
// every bound issue falls through to the no-active-task policy.
try {
  const projectDir = getProjectDir();
  const sp = existingRuntimePath(projectDir, `${SHARED_DIR}/task-tracker-state.json`);
  const s = loadState(sp);
  if (s.active === `#${issueArg}`) {
    s.state = stateArg;
    saveState(s, sp);
  }
} catch {
  /* best-effort */
}

// Update event fields (fire-and-forget)
if (!SKIP_NETWORK) {
  const repoRoot = getProjectDir();
  const eventScriptCandidates = [
    path.resolve(repoRoot, 'node_modules/ai-task-manager/scripts/gh/update-event-fields.mjs'),
    path.resolve(__dir, 'update-event-fields.mjs'),
  ];
  const eventScript = eventScriptCandidates.find((s) => existsSync(s));
  if (eventScript) {
    const args = [eventScript, issueArg, stateArg];
    if (itemId) args.push('--item-id', itemId);
    pexec(process.execPath, args).catch(() => {});
  }
}

// End task tracking when moving to done (unless during cascade close)
if (stateArg === 'done' && process.env.AITM_CASCADE !== '1' && !SKIP_NETWORK) {
  const repoRoot = getProjectDir();
  const ttScriptCandidates = [
    path.resolve(repoRoot, 'node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs'),
    path.resolve(__dir, '../task-tracker/task-tracker.mjs'),
  ];
  const ttScript = ttScriptCandidates.find((s) => existsSync(s));
  if (ttScript) pexec(process.execPath, [ttScript, 'end']).catch(() => {});
}
