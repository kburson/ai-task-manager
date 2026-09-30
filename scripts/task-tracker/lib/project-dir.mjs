// @story #1164
// Read-side execution-directory authority. Bind records checkout identity in
// active-task.json (#1163); this resolver is the only sanctioned consumer.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { resolveRuntimeRootOverride } from './runtime-storage.mjs';

import { resolveRegisteredWorkspaceForIssue } from '../../gh/lib/dirty-workspace.mjs';
import { getActiveTask } from '../session-state.mjs';
import { currentSessionId } from '../word-counter.mjs';

export class BoundWorktreeMissingError extends Error {
  constructor(issueRef, detail = 'no matching active-task worktree record is available') {
    super(`Bound worktree unavailable for ${issueRef}: ${detail}`);
    this.name = 'BoundWorktreeMissingError';
    this.issueRef = issueRef;
  }
}

function normalizeIssueRef(issue) {
  if (issue == null || String(issue).trim() === '') return null;
  return String(issue).startsWith('#') ? String(issue) : `#${issue}`;
}

function defaultBindingForIssue({ issueRef, invokingDir }) {
  let sid;
  try {
    sid = currentSessionId();
  } catch {
    return null;
  }
  if (!sid) return null;

  const local = getActiveTask(sid, invokingDir);
  if (local && (!issueRef || local.issue === issueRef)) return local;
  if (!issueRef) return null;

  const registered = resolveRegisteredWorkspaceForIssue({ issueRef, projectDir: invokingDir });
  if (!registered || registered === invokingDir) return null;
  const remote = getActiveTask(sid, registered);
  return remote?.issue === issueRef ? remote : null;
}

export function resolveProjectDir({ issue, deps = {} } = {}) {
  if (typeof deps.projectDir === 'string' && deps.projectDir.trim()) {
    return path.resolve(deps.projectDir);
  }

  const issueRef = normalizeIssueRef(issue);
  const issueLabel = issueRef || 'the active issue';
  const env = deps.env ?? process.env;
  const logOverride = deps.logOverride ?? ((message) => console.error(message));
  const override = resolveRuntimeRootOverride({
    env,
    cwd: deps.invokingDir ?? process.cwd(),
    foreignWorktreeAdmission: deps.foreignWorktreeAdmission,
    adapters: deps.runtimeRootAdapters,
  });
  if (override) {
    logOverride(
      `[task-tracker] validated projectDir override: ${override.selectedAlias}=${override.projectRoot} for ${issueLabel}`
    );
    return override.projectRoot;
  }

  // cwd is discovery context only: it locates this repository's session/fleet
  // records and is never returned as execution authority.
  const invokingDir = path.resolve(deps.invokingDir ?? process.cwd());
  const bindingForIssue = deps.bindingForIssue ?? defaultBindingForIssue;
  const binding = bindingForIssue({ issueRef, invokingDir });
  const pathExists = deps.pathExists ?? existsSync;
  if (
    !binding ||
    (issueRef && binding.issue !== issueRef) ||
    typeof binding.worktreePath !== 'string' ||
    !binding.worktreePath.trim() ||
    !pathExists(binding.worktreePath)
  ) {
    throw new BoundWorktreeMissingError(issueLabel);
  }
  return path.resolve(binding.worktreePath);
}
