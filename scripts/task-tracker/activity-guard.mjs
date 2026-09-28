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
//   Errors:  malformed JSON passes; mutation context, targets, or staged-index
//            failures refuse the affected mutation.
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

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readWorktreeIdentity } from './lib/worktree-binding-guard.mjs';
import {
  resolveInvocationDirectory,
  resolveMutationTarget,
  parseDirectGit,
  readStagedRecords,
  classifyStagedRecords,
  readExactSessionBinding,
  bindingMatches,
  hasUnsupportedGitEnvironment,
} from './lib/mutation-context.mjs';
import { checkAssigneeMatch } from './lib/assignee-guard.mjs';

import {
  classifyEdit,
  classifyBash,
  isAllowed,
  loadPolicy,
  STATE_MATRIX,
} from './activity-policy.mjs';
import { buildReason as buildReasonCore } from './lib/activity-block-reason.mjs';
import { readBoundState } from './lib/bound-state.mjs';
import { isChoreModeActive } from './lib/chore-mode.mjs';
import { isInstalledGuardPath } from './lib/installed-guard-path.mjs';
import { extractApplyPatchTargets, extractApplyPatchText } from './lib/apply-patch-targets.mjs';

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

let invocationDir;
let projectRoot;
let observedIdentity;
let gitContext = null;
try {
  invocationDir = resolveInvocationDirectory(input);
  if (toolName === 'Bash') gitContext = parseDirectGit(toolInput?.command, invocationDir);
  const effectiveDir = gitContext?.cwd || invocationDir;
  observedIdentity = readWorktreeIdentity({ projectDir: effectiveDir });
  projectRoot = observedIdentity.worktreePath;
} catch (error) {
  block(`[task-tracker] mutation context unavailable: ${error.message}`);
}
const policy = loadPolicy(projectRoot);

let applyPatchTargets = [];
if (toolName === 'apply_patch') {
  try {
    applyPatchTargets = extractApplyPatchTargets(extractApplyPatchText(toolInput));
  } catch (error) {
    block(`[task-tracker] mutation target parsing failed: ${error.message}`);
  }
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
      ? applyPatchTargets
      : [toolInput?.file_path ?? toolInput?.notebook_path ?? ''];
  if (
    !filePaths.length ||
    filePaths.some((filePath) => typeof filePath !== 'string' || !filePath)
  ) {
    process.exit(0);
  }
  let normalizedTargets;
  try {
    normalizedTargets = filePaths.map(
      (filePath) => resolveMutationTarget(filePath, invocationDir, projectRoot).relative
    );
  } catch (error) {
    block(`[task-tracker] mutation target refused: ${error.message}`);
  }
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
  // Carve-out: .scratch/** is disposable scratch, while .tmp/** remains
  // machine-local runtime/generated output. Both are writable in every state.
  // documented in CLAUDE.md "Tool Usage Rules"). Convention subfolders:
  // .scratch/gh/ (issue body scratch), .scratch/plan/ (create-issue fragments),
  // .scratch/heal/ (repair scratch), .scratch/inspect/ (ad-hoc scripts).
  // Bypass classification so scratch writes are permitted in every kanban state.
  if (
    normalizedTargets.every(
      (candidate) =>
        candidate === '.tmp' ||
        candidate.startsWith('.tmp/') ||
        candidate === '.scratch' ||
        candidate.startsWith('.scratch/')
    )
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
  if (gitContext?.kind === 'commit') {
    try {
      const staged = readStagedRecords(gitContext.cwd);
      if (staged.length === 0 && isChoreModeActive(projectRoot)) {
        // Preserve the existing chore-mode preflight for an empty index. There
        // is no document inventory that could receive the new Plan allowance.
        activityClass = 'COMMIT_CODE';
      } else {
        const stagedClass = classifyStagedRecords(staged);
        activityClass =
          gitContext.docEligible && !hasUnsupportedGitEnvironment() ? stagedClass : 'COMMIT_CODE';
      }
    } catch (error) {
      block(`[task-tracker] commit inventory unavailable: ${error.message}`);
    }
  }
} else {
  // Unknown tool — not our concern.
  process.exit(0);
}

function commitMessageFileText(args, cwd) {
  const parts = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    let file = null;
    if (arg === '-F' || arg === '--file') file = args[++index];
    else if (arg.startsWith('--file=')) file = arg.slice('--file='.length);
    else if (arg.startsWith('-F') && arg.length > 2) file = arg.slice(2);
    if (file === null) continue;
    if (!file || file === '-') throw new Error('commit message file is not inspectable');
    parts.push(readFileSync(path.resolve(cwd, file), 'utf8'));
  }
  return parts.join('\n');
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
if (
  activityClass === 'COMMIT_DOCS' ||
  (state === 'plan' && (activityClasses || []).includes('WRITE_DOCS')) ||
  (state === 'plan' &&
    toolName === 'Bash' &&
    gitContext?.kind === 'add' &&
    activityClass === 'WRITE_DOCS')
) {
  const bound = readExactSessionBinding(projectRoot);
  const valid = bindingMatches(
    observedIdentity,
    bound,
    Number(String(activeIssue || '').replace(/^#/, ''))
  );
  if (!valid)
    block(
      '[task-tracker] Plan document mutation refused: current session binding, branch, or worktree mismatch.'
    );
  if (toolName === 'Bash' && gitContext?.kind === 'add' && state === 'plan') {
    if (!gitContext.contextSafe) block('[task-tracker] Plan staging context is not inspectable.');
    try {
      for (const filePath of gitContext.args)
        resolveMutationTarget(filePath, gitContext.cwd, projectRoot);
    } catch (error) {
      block(`[task-tracker] Plan staging target refused: ${error.message}`);
    }
  }
  if (activityClass === 'COMMIT_DOCS') {
    let messageFiles;
    try {
      messageFiles = commitMessageFileText(gitContext.args, gitContext.cwd);
    } catch (error) {
      block(`[task-tracker] document commit message unavailable: ${error.message}`);
    }
    const refs = [...(target + '\n' + messageFiles).matchAll(/\[#(\d+)\]/g)].map((match) =>
      Number(match[1])
    );
    if (refs.some((issue) => issue !== bound.issueNumber))
      block('[task-tracker] document commit references another issue.');
  }
  try {
    const cfg = JSON.parse(
      readFileSync(path.join(projectRoot, '.ai-task-manager', 'task-tracker.json'), 'utf8')
    );
    const verdict = await checkAssigneeMatch({
      issueNumber: bound.issueNumber,
      cfg,
      state: 'develop',
    });
    if (
      !verdict.ok ||
      verdict.assignees.length !== 1 ||
      verdict.assignees[0] !== verdict.currentUser
    ) {
      block('[task-tracker] document mutation requires exact singleton issue ownership.');
    }
  } catch (error) {
    block(`[task-tracker] document ownership unavailable: ${error.message}`);
  }
}
if (isChoreModeActive(projectRoot) && activityClass !== 'COMMIT_DOCS') process.exit(0);

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
