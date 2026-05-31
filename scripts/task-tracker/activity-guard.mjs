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
// State source (#218 + follow-up): the bound issue's `aitm-last-known-state`
// body marker IS the local kanban state. Because hooks must read synchronously
// on every tool call, move-state.mjs / reconcile / bind mirror the marker into
// a derived `kanbanState` field on the per-session
// `.ai-task-manager/sessions/<sid>/active-task.json` so the guard can read it
// without a network round-trip. Legacy fallback: the global
// `task-tracker-state.json#state` field (pre-#218). When neither is present
// but an active task is bound, the guard refuses writes and points at
// `reconcile accept-live` to repair the body marker.

import { readFileSync, realpathSync, readdirSync, statSync } from 'node:fs';
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
  // Carve-out: .tmp/** is the canonical scratch directory (gitignored,
  // documented in CLAUDE.md "Tool Usage Rules"). Convention subfolders:
  // .tmp/gh/ (issue body scratch), .tmp/plan/ (create-issue fragments),
  // .tmp/heal/ (heal/repair scratch), .tmp/inspect/ (ad-hoc scripts).
  // Bypass classification so scratch writes are permitted in every kanban state.
  if (target === '.tmp' || target.startsWith('.tmp/')) process.exit(0);
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
  let parsed = null;
  try {
    parsed = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    /* missing or malformed — fall through with parsed null */
  }
  const activeIssue =
    parsed && typeof parsed === 'object' && typeof parsed.active === 'string'
      ? parsed.active
      : null;

  // #218: prefer the per-session derived cache (`kanbanState` on the most
  // recently updated active-task.json). The session writer mirrors the body
  // marker every time move-state.mjs / reconcile / bind touches it, so this
  // is a synchronous, near-current view of the body's `aitm-last-known-state`.
  const sessionState = readSessionKanbanState(root, activeIssue);
  if (sessionState != null) return { activeIssue, state: sessionState };

  // Legacy fallback: pre-#218 global `state` field. Retained so that
  // installations that haven't yet picked up the new writers don't deadlock.
  if (parsed && typeof parsed === 'object' && typeof parsed.state === 'string') {
    const legacy = parsed.state;
    if (Object.prototype.hasOwnProperty.call(STATE_MATRIX, legacy)) {
      return { activeIssue, state: legacy };
    }
  }
  return { activeIssue, state: null };
}

// Scan `.ai-task-manager/sessions/*/active-task.json` for a record whose
// `issue` matches `activeIssue` and return its `kanbanState` (when valid).
// Picks the most-recently-modified match when more than one session is bound
// to the same issue. Returns null if no match.
function readSessionKanbanState(root, activeIssue) {
  if (!activeIssue) return null;
  const sessionsDir = path.join(root, '.ai-task-manager', 'sessions');
  let entries;
  try {
    entries = readdirSync(sessionsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  let best = null; // { mtimeMs, state }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const p = path.join(sessionsDir, ent.name, 'active-task.json');
    let raw, parsed, mtimeMs;
    try {
      mtimeMs = statSync(p).mtimeMs;
      raw = readFileSync(p, 'utf8');
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object') continue;
    if (parsed.issue !== activeIssue) continue;
    const k = typeof parsed.kanbanState === 'string' ? parsed.kanbanState : null;
    if (!k || !Object.prototype.hasOwnProperty.call(STATE_MATRIX, k)) continue;
    if (!best || mtimeMs > best.mtimeMs) best = { mtimeMs, state: k };
  }
  return best ? best.state : null;
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
