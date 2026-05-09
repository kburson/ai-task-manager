#!/usr/bin/env node
// Move a GitHub issue through board states: Backlog → Ready → In Progress → In Review → R4R → Done
// Usage: node scripts/gh/move-state.mjs <issue#> <state> [--item-id <project-item-id>]
// States: backlog | ready | in-progress | in-review | r4r | done

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../task-tracker/config.mjs';
import { gh, projectItemForIssue } from './lib/github-projects.mjs';
import { validateBody, DEFAULT_GATES } from '../task-tracker/lib/body-gates.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SKIP_NETWORK = process.env.TT_SKIP_NETWORK === '1';

const STATE_TO_CONFIG_KEY = {
  'backlog':           'kanbanOptionBacklog',
  'ready':             'kanbanOptionReady',
  'in-progress':       'kanbanOptionInProgress',
  'in_progress':       'kanbanOptionInProgress',
  'in-review':         'kanbanOptionInReview',
  'in_review':         'kanbanOptionInReview',
  'r4r':               'kanbanOptionR4R',
  'r_4_r':             'kanbanOptionR4R',
  'ready-for-release': 'kanbanOptionR4R',
  'done':              'kanbanOptionDone',
};

// Checkboxes that are close-side-effects, not user-verifiable items
const CLOSE_SIDE_EFFECT_PATTERNS = [
  /^- \[ \] Issue moved to Done$/,
  /^- \[ \] `\/task close` run \(writes Engaged Time/,
  /^- \[ \] If this completes the parent epic:/,
];

function usage() {
  process.stderr.write(
    'Usage: node scripts/gh/move-state.mjs <issue#> <state> [--item-id <project-item-id>]\n' +
    'States: backlog | ready | in-progress | in-review | r4r | done\n'
  );
  process.exit(1);
}

const cliArgs = process.argv.slice(2);
const issueArg = cliArgs[0];
const stateArg = cliArgs[1];
let itemIdOverride = '';

for (let i = 2; i < cliArgs.length; i++) {
  if (cliArgs[i] === '--item-id' && cliArgs[i + 1]) { itemIdOverride = cliArgs[i + 1]; i++; }
}

if (!issueArg || !stateArg) usage();
if (!/^\d+$/.test(issueArg)) usage();

const configKey = STATE_TO_CONFIG_KEY[stateArg];
if (!configKey) {
  process.stderr.write(`Unknown state: ${stateArg}\nStates: backlog | ready | in-progress | in-review | r4r | done\n`);
  process.exit(1);
}

const cfg = loadConfig();

if (!SKIP_NETWORK && (!cfg.projectId || !cfg.kanbanFieldId)) {
  process.stderr.write('Error: Kanban board not configured. Run: npx ai-task-manager init\n');
  process.exit(1);
}

const optionId = cfg[configKey];
if (!SKIP_NETWORK && !optionId) {
  process.stderr.write(`Error: option ID for state '${stateArg}' not configured. Run: npx ai-task-manager init\n`);
  process.exit(1);
}

// Structural body gate: applies to in-review, r4r, and done.
// - For all three states: verify "evidence-required" ticked boxes have supporting body content
//   (Deep-Dive Analysis section, Dependency Map section, Verification Commands all-checked).
//   Note: verification-commands rule fires only at r4r/done — at in-review the auto-runner ticks them.
// - For done only: also enforce "no unchecked checkboxes" and "Deep dive line is checked".
const GATED_STATES = new Set(['in-review', 'in_review', 'r4r', 'r_4_r', 'ready-for-release', 'done']);
if (GATED_STATES.has(stateArg) && !SKIP_NETWORK) {
  let body = '';
  try {
    body = await gh(['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body', '--jq', '.body']);
    body = body.trim();
  } catch { /* ignore — missing body is not a gate failure */ }

  if (body) {
    const reasons = [];
    const refusedRuleNames = [];

    // Structural gates (all gated states). At in-review, skip verification-commands
    // because verbReview's auto-runner is what ticks those boxes.
    const activeGates = stateArg === 'done' || stateArg === 'r4r' || stateArg === 'r_4_r' || stateArg === 'ready-for-release'
      ? DEFAULT_GATES
      : DEFAULT_GATES.filter(g => g.name !== 'verification-commands');
    const gateResult = validateBody(body, { gates: activeGates });
    if (!gateResult.ok) {
      for (const r of gateResult.refusedRules) {
        reasons.push(`${r.rule}: ${r.reason}`);
        refusedRuleNames.push(r.rule);
      }
    }

    // Done-only legacy checks
    if (stateArg === 'done') {
      const lines = body.split('\n');
      const unchecked = lines.filter(l =>
        l.startsWith('- [ ] ') &&
        !CLOSE_SIDE_EFFECT_PATTERNS.some(p => p.test(l))
      );
      const hasDeepDiveLine = lines.some(l => l.includes('Deep dive complete'));
      const deepDiveChecked = lines.some(l => /^- \[x\] Deep dive complete/.test(l));
      if (unchecked.length > 0) reasons.push(`${unchecked.length} unchecked checkbox(es) in issue body`);
      if (hasDeepDiveLine && !deepDiveChecked) reasons.push('Deep dive checkpoint is not checked off');
    }

    if (reasons.length > 0) {
      if (process.env.TASK_TRACKER_FORCE_DONE === '1') {
        process.stderr.write(`⚠ TASK_TRACKER_FORCE_DONE=1 — bypassing ${stateArg} gate for #${issueArg}\n`);
        reasons.forEach(r => process.stderr.write(`   • ${r}\n`));
        const bypassMsg = `⚠ **${stateArg} gate bypassed** via \`TASK_TRACKER_FORCE_DONE=1\` at ${new Date().toISOString()}. Unverified: ${reasons.join(', ')}.`;
        try { await gh(['issue', 'comment', issueArg, '-R', cfg.repo, '--body', bypassMsg]); } catch {}
      } else {
        // Append a gate-refused row to the timing log (fire-and-forget).
        if (refusedRuleNames.length > 0) {
          try {
            const { buildRow, postTimingEvent } = await import('../task-tracker/gh-timing-comment.mjs');
            const row = buildRow({
              ts: new Date().toISOString(),
              event: 'gate-refused',
              activeMin: 0, idleMin: 0, deltaWords: 0, wordMarker: 0,
              description: `→ ${stateArg}: ${refusedRuleNames.join(', ')}`,
            });
            await postTimingEvent({ issueNumber: issueArg, repo: cfg.repo, row, timeoutMs: 3000 });
          } catch { /* fire-and-forget */ }
        }
        process.stderr.write('\n');
        process.stderr.write(`⛔ Refusing to move #${issueArg} to ${stateArg}:\n`);
        reasons.forEach(r => process.stderr.write(`   BLOCKED: ${r}\n`));
        process.stderr.write('\n');
        process.stderr.write('See .ai-task-manager/pickup-directive.md Hard Rules.\n');
        const itemIdSuffix = itemIdOverride ? ` --item-id ${itemIdOverride}` : '';
        process.stderr.write('Verify each item, check its box, then retry. Legitimate-abandonment override:\n');
        process.stderr.write(`   TASK_TRACKER_FORCE_DONE=1 node scripts/gh/move-state.mjs ${issueArg} ${stateArg}${itemIdSuffix}\n\n`);
        process.exit(4);
      }
    }
  }
}

// Resolve project item ID
let itemId = itemIdOverride;
if (!itemId && !SKIP_NETWORK) {
  const result = await projectItemForIssue({ repo: cfg.repo, projectId: cfg.projectId, issueNumber: issueArg });
  itemId = result.itemId;
  if (!itemId) {
    process.stderr.write(`Issue #${issueArg} not found in project (repo: ${cfg.repo}, projectId: ${cfg.projectId})\n`);
    process.exit(1);
  }
}

// Update the kanban board field
if (!SKIP_NETWORK) {
  await gh(['project', 'item-edit',
    '--project-id', cfg.projectId,
    '--id', itemId,
    '--field-id', cfg.kanbanFieldId,
    '--single-select-option-id', optionId,
  ]);
}

console.log(`✓ Issue #${issueArg} moved to: ${stateArg}`);

// Update event fields (fire-and-forget)
if (!SKIP_NETWORK) {
  const repoRoot = process.env.AI_TASK_MANAGER_PROJECT_DIR ||
                   process.env.CLAUDE_PROJECT_DIR ||
                   process.cwd();
  const eventScriptCandidates = [
    path.resolve(repoRoot, 'node_modules/ai-task-manager/scripts/gh/update-event-fields.mjs'),
    path.resolve(__dir, 'update-event-fields.mjs'),
  ];
  const eventScript = eventScriptCandidates.find(s => existsSync(s));
  if (eventScript) {
    const args = [eventScript, issueArg, stateArg];
    if (itemId) args.push('--item-id', itemId);
    pexec(process.execPath, args).catch(() => {});
  }
}

// End task tracking when moving to done (unless during cascade close)
if (stateArg === 'done' && process.env.AITM_CASCADE !== '1' && !SKIP_NETWORK) {
  const repoRoot = process.env.AI_TASK_MANAGER_PROJECT_DIR ||
                   process.env.CLAUDE_PROJECT_DIR ||
                   process.cwd();
  const ttScriptCandidates = [
    path.resolve(repoRoot, 'node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs'),
    path.resolve(__dir, '../task-tracker/task-tracker.mjs'),
  ];
  const ttScript = ttScriptCandidates.find(s => existsSync(s));
  if (ttScript) pexec(process.execPath, [ttScript, 'end']).catch(() => {});
}
