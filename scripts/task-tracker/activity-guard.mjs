#!/usr/bin/env node
// PreToolUse hook — enforces activity/state alignment.
//
// For Edit/Write/NotebookEdit/Bash tool calls, classifies the activity via
// `activity-policy.mjs` and refuses if the cached current Kanban state does
// not permit that activity class.
//
// Pairs with `bash-guard.mjs` (path scope) — both run on PreToolUse for Bash
// and are independent: either blocking is sufficient.
//
// Decision protocol (matches bash-guard.mjs):
//   Pass:    exit 0, no stdout.
//   Block:   stdout = JSON {decision:'block', reason:'<msg>'}, exit 0.
//   Errors:  pass (exit 0) — never deadlock the agent on parse/I/O failure.
//
// State source: `.ai-task-manager/task-tracker-state.json` (`state` field).
// When the file or field is missing, treated as "no active task" — the
// classifier's no-active-task policy applies (refuse WRITE_CODE/COMMIT_CODE,
// allow everything else).

import { readFileSync, realpathSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

import {
  classifyEdit,
  classifyBash,
  isAllowed,
  loadPolicy,
  STATE_MATRIX,
} from './activity-policy.mjs';
import { GIT_TIMEOUT_MS } from './lib/process-timeouts.mjs';

// ---------------------------------------------------------------------------
// Read stdin payload
// ---------------------------------------------------------------------------

let input;
try {
  input = JSON.parse(readFileSync('/dev/stdin', 'utf8'));
} catch {
  process.exit(0); // malformed payload — pass-through
}

const toolName = input?.tool_name;
const toolInput = input?.tool_input ?? {};

if (!toolName) process.exit(0);

// ---------------------------------------------------------------------------
// Resolve project root + load policy + state
// ---------------------------------------------------------------------------

let projectRoot;
try {
  projectRoot = execSync('git rev-parse --show-toplevel', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: GIT_TIMEOUT_MS,
  }).trim();
} catch {
  projectRoot = process.cwd();
}

const policy = loadPolicy(projectRoot);
const { activeIssue, state: recordedState } = readState(projectRoot);
// When no task is bound (paused or never started), ignore the residual
// `state` field from the last active task. Otherwise editing infra/meta
// files between tasks would be permanently blocked: WRITE_OTHER is excluded
// from every kanban state's allow-list, so a stale `state=develop` left by
// pause would refuse all non-code edits. The no-active-task policy (in
// activity-policy.mjs) allows everything except WRITE_CODE/COMMIT_CODE.
const state = activeIssue ? recordedState : null;

// ---------------------------------------------------------------------------
// Classify
// ---------------------------------------------------------------------------

let activityClass;
let target;

if (toolName === 'Edit' || toolName === 'Write' || toolName === 'NotebookEdit') {
  const filePath = toolInput?.file_path ?? toolInput?.notebook_path ?? '';
  if (typeof filePath !== 'string' || !filePath) process.exit(0);
  target = normalizePath(filePath, projectRoot);
  // Carve-out: tmp/** is the canonical scratch directory (gitignored,
  // documented in CLAUDE.md "Tool Usage Rules"). Bypass classification so
  // scratch writes are permitted in every kanban state.
  if (target === 'tmp' || target.startsWith('tmp/')) process.exit(0);
  activityClass = classifyEdit(target, policy);
} else if (toolName === 'Bash') {
  const command = toolInput?.command ?? '';
  if (typeof command !== 'string' || !command) process.exit(0);
  target = command;
  activityClass = classifyBash(command, policy);
} else {
  // Unknown tool — not our concern.
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

// Active task bound but no kanban state recorded → drift. Refuse all write
// activity classes and point at reconcile. READ_* still passes.
if (activeIssue && state == null && activityClass !== 'READ_*') {
  block(buildReason({ activityClass, target, state, activeIssue, toolName }));
}

if (isAllowed(state, activityClass)) {
  process.exit(0);
}

block(buildReason({ activityClass, target, state, activeIssue, toolName }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readState(root) {
  const statePath = path.join(root, '.ai-task-manager', 'task-tracker-state.json');
  let raw;
  try {
    raw = readFileSync(statePath, 'utf8');
  } catch {
    return { activeIssue: null, state: null };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { activeIssue: null, state: null };
    const activeIssue = typeof parsed.active === 'string' ? parsed.active : null;
    const stateRaw = typeof parsed.state === 'string' ? parsed.state : null;
    const state =
      stateRaw && Object.prototype.hasOwnProperty.call(STATE_MATRIX, stateRaw) ? stateRaw : null;
    return { activeIssue, state };
  } catch {
    return { activeIssue: null, state: null };
  }
}

function normalizePath(filePath, root) {
  // Resolve symlinks on root so /var/... and /private/var/... unify on macOS.
  // (filePath may not exist yet, so don't realpath it.)
  const roots = new Set([root]);
  try {
    roots.add(realpathSync(root));
  } catch {
    /* noop */
  }
  // On macOS /var → /private/var; map both directions to widen the prefix set.
  for (const r of [...roots]) {
    if (r.startsWith('/private/')) roots.add(r.slice('/private'.length));
    else if (r.startsWith('/')) roots.add('/private' + r);
  }

  for (const r of roots) {
    if (filePath.startsWith(r + '/')) return filePath.slice(r.length + 1);
  }
  if (filePath.startsWith('./')) return filePath.slice(2);
  return filePath;
}

function buildReason({ activityClass, target, state, activeIssue, toolName }) {
  const targetLabel = toolName === 'Bash' ? `\`${truncate(target, 80)}\`` : target;
  const stateLabel = state ?? 'no-active-task';
  const issueLabel = activeIssue ?? 'none';

  if (state == null) {
    if (activeIssue) {
      // Active task is set but no kanban state recorded — drift between
      // tracker-state and the board. Tell the user how to repair.
      const id = activeIssue.replace(/^#/, '');
      return [
        `activity refused: ${activityClass} on ${targetLabel} — active task ${activeIssue} has no recorded kanban state.`,
        `  Active task: ${activeIssue}`,
        `  To proceed: Run \`/task reconcile accept-live ${id}\` to sync local state with the board.`,
      ].join('\n');
    }
    // No-active-task message
    return [
      `activity refused: ${activityClass} on ${targetLabel} is not permitted with no active task.`,
      `  Active task: none`,
      `  To proceed: Run \`/task start <issue#>\` (or \`/task plan\` for untracked work) before editing code.`,
    ].join('\n');
  }

  const allowed = STATE_MATRIX[state] ?? [];
  const suggestion = suggestTransition(activityClass, state, activeIssue);

  return [
    `activity refused: ${activityClass} on ${targetLabel} is not permitted in state ${stateLabel}.`,
    `  Active task: ${issueLabel}`,
    `  Allowed in ${stateLabel}: ${allowed.join(', ') || '(none)'}`,
    `  To proceed: ${suggestion}`,
  ].join('\n');
}

function suggestTransition(activityClass, currentState, activeIssue) {
  const id = activeIssue ? activeIssue.replace(/^#/, '') : '<id>';

  // Find the canonical state that allows this activity class. Pick the
  // earliest in the kanban flow that grants it.
  const order = ['backlog', 'refine', 'plan', 'develop', 'test', 'review', 'done'];
  for (const s of order) {
    if (s === currentState) continue;
    const allowed = STATE_MATRIX[s] ?? [];
    if (allowed.includes(activityClass)) {
      return `\`/task move ${id} ${s}\``;
    }
  }
  return `(no kanban state permits ${activityClass}; review activity-policy.json)`;
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}
