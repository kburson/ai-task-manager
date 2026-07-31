#!/usr/bin/env node
// INTERNAL — DO NOT INVOKE DIRECTLY, and not exposed through `aitm`.
// Plumbing: invoked by the Claude Code and Codex hook runners.
//
// PreToolUse hook — enforces activity/state alignment and verifies the
// exclusive work lease before an allowed source edit reaches the tool.
//
// Decision protocol:
//   Pass:    exit 0, no stdout.
//   Block:   stdout = JSON {decision:'block', reason:'<msg>'}, exit 0.
//   Errors before a governed edit is classified preserve pass-through.
//   Errors after classification fail closed with an explicit block.

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
import { buildReason as buildReasonCore } from './lib/activity-block-reason.mjs';
import { readBoundState } from './lib/bound-state.mjs';
import { isChoreModeActive } from './lib/chore-mode.mjs';
import { isInstalledGuardPath } from './lib/installed-guard-path.mjs';
import { resolveSourceToolTargets, SOURCE_EDIT_TOOLS } from './lib/source-tool-targets.mjs';
import { createRuntimeGovernedEffectAdapter } from './lib/work-lease/governed-effect.mjs';

function allow(reason) {
  return { decision: 'allow', reason };
}

function blockResult(reason, code) {
  return { decision: 'block', reason, ...(code ? { code } : {}) };
}

function resolveProjectRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_TIMEOUT_MS,
    }).trim();
  } catch {
    return process.cwd();
  }
}

// Async and dependency-injectable so tests can prove policy-before-authority
// ordering without spawning git, GitHub, or a lease provider.
export async function runActivityGuard(input, deps = {}) {
  const toolName = input?.tool_name;
  const toolInput = input?.tool_input ?? {};
  if (!toolName) return allow('missing-tool');
  if (!SOURCE_EDIT_TOOLS.has(toolName) && toolName !== 'Bash') return allow('tool-not-gated');

  const projectRoot =
    'projectRoot' in deps
      ? deps.projectRoot
      : await (deps.resolveProjectRoot || resolveProjectRoot)();

  let target;
  let isGovernedEdit = false;
  let editTargets = [];
  let conservativeApplyPatch = false;
  if (SOURCE_EDIT_TOOLS.has(toolName)) {
    const resolved = resolveSourceToolTargets(toolName, toolInput);
    if (resolved.targets.length === 0) return allow('missing-edit-path');
    conservativeApplyPatch = toolName === 'apply_patch' && !resolved.exact;
    editTargets = resolved.targets.map((filePath) => normalizePath(filePath, projectRoot));

    // Installed guard self-modification is an unconditional pure refusal. Its
    // position before scratch/chore/state/authority is a pinned contract.
    const installedTarget = editTargets.find((candidate) => isInstalledGuardPath(candidate));
    if (installedTarget) {
      return blockResult(
        `Refusing to edit an installed guard file: ${installedTarget}\n` +
          `  Files under an installed \`node_modules/.../scripts\` guard tree are off-limits to the source-edit tools they gate (self-modification interlock, #659).\n` +
          `  This refusal is unconditional — neither develop state nor chore-mode grants a bypass. Edit the package in its own source checkout and reinstall; never hand-edit the installed copy.`,
        'activity-installed-guard-refused'
      );
    }

    editTargets = editTargets.filter(
      (candidate) => candidate !== '.tmp' && !candidate.startsWith('.tmp/')
    );
    if (editTargets.length === 0) return allow('scratch-path');
    target = editTargets.join(', ');
    isGovernedEdit = true;
  } else {
    const command = toolInput?.command ?? '';
    if (typeof command !== 'string' || !command) return allow('missing-command');
    target = command;
  }

  try {
    const policy = (deps.loadPolicy || loadPolicy)(projectRoot);
    const { activeIssue, state: recordedState } = (deps.readBoundState || readBoundState)(
      projectRoot
    );
    const state = activeIssue ? recordedState : null;
    const activityClasses = isGovernedEdit
      ? conservativeApplyPatch
        ? ['WRITE_CODE']
        : editTargets.map((candidate) => (deps.classifyEdit || classifyEdit)(candidate, policy))
      : [(deps.classifyBash || classifyBash)(target, policy)];

    // Chore mode is the sanctioned source-write bypass. It is evaluated after
    // the installed-guard interlock and before authority initialization.
    const choreModeActive = deps.isChoreModeActive
      ? deps.isChoreModeActive(projectRoot)
      : isChoreModeActive(projectRoot);
    if (choreModeActive) {
      return allow('chore-mode-bypass');
    }

    const nonReadClass = activityClasses.find((activityClass) => activityClass !== 'READ_*');
    if (activeIssue && state == null && nonReadClass) {
      return blockResult(
        buildReason({ activityClass: nonReadClass, target, state, activeIssue, toolName }),
        'activity-state-drift'
      );
    }

    const refusedClass = activityClasses.find((activityClass) => !isAllowed(state, activityClass));
    if (refusedClass) {
      return blockResult(
        buildReason({ activityClass: refusedClass, target, state, activeIssue, toolName }),
        'activity-state-refused'
      );
    }

    // Bash is governed independently by bash-guard. Read-only Bash policy and
    // every pure bypass above must never initialize work-lease authority here.
    if (!isGovernedEdit) return allow('activity-policy-allowed');

    if (!activeIssue) {
      return blockResult(
        buildReason({
          activityClass: activityClasses[0],
          target,
          state,
          activeIssue,
          toolName,
        }),
        'activity-source-no-bound-issue'
      );
    }

    const withGovernedEffect = deps.withGovernedEffect
      ? deps.withGovernedEffect
      : createRuntimeGovernedEffectAdapter({
          projectDir: projectRoot,
          config:
            deps.config ||
            JSON.parse(
              readFileSync(path.join(projectRoot, '.ai-task-manager', 'task-tracker.json'), 'utf8')
            ),
        });
    return await withGovernedEffect(
      {
        issueId: String(activeIssue).replace(/^#/, ''),
        operation: 'source-write',
        heartbeat: true,
      },
      async () => allow('activity-policy-and-authority-allowed')
    );
  } catch (error) {
    if (!isGovernedEdit) throw error;
    return authorityFailure(error);
  }
}

function authorityFailure(error) {
  const code = typeof error?.code === 'string' && error.code.trim() ? error.code.trim() : 'unknown';
  const detail = error?.message ? `: ${error.message}` : '';
  return blockResult(
    `[task-tracker] Activity refused: source-write authority ${code}${detail}\n` +
      `  The source tool was not authorized to mutate the workspace.`,
    'activity-source-authority-refused'
  );
}

function normalizePath(filePath, root) {
  const roots = new Set([root]);
  try {
    roots.add(realpathSync(root));
  } catch {
    /* noop */
  }
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

function buildReason(opts) {
  return buildReasonCore({ ...opts, STATE_MATRIX });
}

async function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return;
  }

  let result;
  try {
    result = await runActivityGuard(input);
  } catch {
    // Preserve the historical pass-through for failures that occur before an
    // source-edit mutation is classified.
    return;
  }
  if (result.decision === 'block') {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }));
  }
}

// Explicit installed-bootstrap seam. Dynamic import must remain side-effect
// free for unit tests; guardBootstrapCommand invokes this callable exactly once.
export const runGuardBootstrap = main;

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('activity-guard.mjs');
if (isMain) {
  runGuardBootstrap().catch((error) => {
    process.stdout.write(
      JSON.stringify({
        decision: 'block',
        reason: authorityFailure(error).reason,
      })
    );
  });
}
