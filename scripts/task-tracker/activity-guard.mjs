#!/usr/bin/env node
// INTERNAL — DO NOT INVOKE DIRECTLY, and not exposed through `aitm`.
// Plumbing: invoked only by the Claude Code hook runner, never by a human or
// the AI. See bin/aitm-registry.mjs (INTERNAL map) for the rationale.
//
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

import { readFileSync, realpathSync } from 'node:fs';
import { execSync } from 'node:child_process';

import {
  classifyEdit,
  classifyBash,
  isAllowed,
  loadPolicy,
  STATE_MATRIX,
} from './activity-policy.mjs';
import { GIT_TIMEOUT_MS } from './lib/process-timeouts.mjs';
import { buildReason as buildReasonCore } from './lib/activity-block-reason.mjs';
import { readBoundState } from './lib/bound-state.mjs';
import { isChoreModeActive } from './lib/chore-mode.mjs';
import { isInstalledGuardPath } from './lib/installed-guard-path.mjs';
import { detectProvider } from '../providers/index.mjs';
import { resolveSessionId } from './lib/session-id.mjs';
import { extractApplyPatchTargets, extractBashWriteTargets } from './lib/mutation-targets.mjs';
import { evaluateCoReviewWrite } from './lib/co-review-write-policy.mjs';

// ---------------------------------------------------------------------------
// Read stdin payload
// ---------------------------------------------------------------------------

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
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

let coReviewTargets = [];
let coReviewParseError = null;
let coReviewAmbiguous = false;
if (toolName === 'Edit' || toolName === 'Write' || toolName === 'NotebookEdit') {
  const candidate = toolInput?.file_path ?? toolInput?.notebook_path ?? '';
  if (candidate) coReviewTargets = [candidate];
} else if (toolName === 'apply_patch') {
  try {
    coReviewTargets = extractApplyPatchTargets(
      toolInput?.patch || toolInput?.input || toolInput?.text || ''
    );
  } catch (error) {
    coReviewParseError = error;
  }
} else if (toolName === 'Bash') {
  const parsed = extractBashWriteTargets(toolInput?.command || '', projectRoot);
  coReviewTargets = parsed.targets;
  coReviewAmbiguous = parsed.ambiguousMutation;
}
if (['Edit', 'Write', 'NotebookEdit', 'apply_patch', 'Bash'].includes(toolName)) {
  const provider = detectProvider().name;
  let sid = null;
  try {
    sid = resolveSessionId();
  } catch {
    // Missing provider identity remains non-matching and authority stays denied.
  }
  const coReview = evaluateCoReviewWrite({
    projectDir: projectRoot,
    worktreePath: projectRoot,
    provider,
    sid,
    toolName,
    targets: coReviewTargets,
    parseError: coReviewParseError,
    ambiguousMutation: coReviewAmbiguous,
  });
  if (coReview.decision === 'deny') block(`[task-tracker] ${coReview.reason}`);
  if (coReview.decision === 'allow') process.exit(0);
}
const { activeIssue, state: recordedState } = readBoundState(projectRoot);
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
let activityClasses;
let target;

if (
  toolName === 'Edit' ||
  toolName === 'Write' ||
  toolName === 'NotebookEdit' ||
  toolName === 'apply_patch'
) {
  const filePaths =
    toolName === 'apply_patch'
      ? coReviewTargets
      : [toolInput?.file_path ?? toolInput?.notebook_path ?? ''];
  if (
    !filePaths.length ||
    filePaths.some((filePath) => typeof filePath !== 'string' || !filePath)
  ) {
    process.exit(0);
  }
  const normalizedTargets = filePaths.map((filePath) => normalizePath(filePath, projectRoot));
  target = normalizedTargets.join(', ');
  // #659 AC2 — installed-guard self-modification interlock. A write whose
  // resolved path lands inside an installed guard tree (a `node_modules/`
  // segment leading to the ai-task-manager `scripts/` dir) is refused
  // UNCONDITIONALLY, ahead of the `.tmp/**` carve-out, the chore-mode bypass,
  // and every kanban-state allow-check below. Ordering is the contract:
  // neither `develop` state nor active chore-mode can re-open guard
  // self-editing because this interlock has already returned. The package's
  // own dev checkout (no `node_modules/` ancestor) is unaffected and stays
  // editable via its repo-root path.
  const installedTarget = normalizedTargets.find((candidate) => isInstalledGuardPath(candidate));
  if (installedTarget) {
    block(
      `Refusing to edit an installed guard file: ${installedTarget}\n` +
        `  Files under an installed \`node_modules/.../scripts\` guard tree are off-limits to the Edit/Write/NotebookEdit tools they gate (self-modification interlock, #659).\n` +
        `  This refusal is unconditional — neither develop state nor chore-mode grants a bypass. Edit the package in its own source checkout and reinstall; never hand-edit the installed copy.`
    );
  }
  // Carve-out: .tmp/** is the canonical scratch directory (gitignored,
  // documented in CLAUDE.md "Tool Usage Rules"). Convention subfolders:
  // .tmp/gh/ (issue body scratch), .tmp/plan/ (create-issue fragments),
  // .tmp/heal/ (heal/repair scratch), .tmp/inspect/ (ad-hoc scripts).
  // Bypass classification so scratch writes are permitted in every kanban state.
  if (
    normalizedTargets.every((candidate) => candidate === '.tmp' || candidate.startsWith('.tmp/'))
  ) {
    process.exit(0);
  }
  activityClasses = normalizedTargets.map((candidate) => classifyEdit(candidate, policy));
  activityClass = activityClasses[0];
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

// chore-mode bypass (#440). chore-mode is the sanctioned escape hatch for
// editing source files when no issue can legitimately reach `develop` (e.g. an
// infrastructure prerequisite that must land before the verb chain can run).
// By design `chore-mode on` detaches the active task, so `state` is null and
// the no-active-task policy (activity-policy.mjs) would refuse every
// WRITE_CODE/COMMIT_CODE — silently defeating the hatch. Allow every activity
// class while chore-mode is active, mirroring source-edit-gate.mjs's
// `chore-mode-bypass` (line 76) so the two PreToolUse gates that the installer
// wires on Edit|Write|NotebookEdit never disagree about whether chore-mode
// grants a bypass (#440 AC2). The commit-subject contract is unaffected: the
// PostToolUse commit-trail still requires `chore:` subjects while chore-mode is
// on, so loosening the edit gate does not loosen the commit gate (#440 AC5).
if (isChoreModeActive(projectRoot)) process.exit(0);

// Active task bound but no kanban state recorded → drift. Refuse all write
// activity classes and point at reconcile. READ_* still passes.
if (
  activeIssue &&
  state == null &&
  (activityClasses || [activityClass]).some((value) => value !== 'READ_*')
) {
  block(buildReason({ activityClass, target, state, activeIssue, toolName }));
}

const refusedClass = (activityClasses || [activityClass]).find((value) => !isAllowed(state, value));
if (!refusedClass) {
  process.exit(0);
}

block(buildReason({ activityClass: refusedClass, target, state, activeIssue, toolName }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// #273 — extracted to lib/activity-block-reason.mjs so tests can pin the
// block-message shape without importing the hook script. These thin wrappers
// preserve the previous local-name call sites.
function buildReason(opts) {
  return buildReasonCore({ ...opts, STATE_MATRIX });
}

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}
