// Assigned ↔ GitHub assignee invariant (#1207).
//
// This policy is intentionally narrower than the assignee work-lock in
// assignee-guard.mjs: it governs only entry into Assigned and drift between
// Backlog/Assigned. Refine and every later lifecycle state are assignment-
// neutral and must never be moved backward by this module.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';

export { resolveConfiguredProjectState } from './project-state-resolver.mjs';

const pexec = promisify(execFile);

export const ASSIGNED_ASSIGNEE_GUARD_ID = 'assigned-requires-assignee';
export const EXIT_ASSIGNED_REQUIRES_ASSIGNEE = 11;

function payloadError(detail) {
  return new TypeError(`invalid assignee payload: ${detail}`);
}

export function parseAssigneeLogins(payload) {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray(payload.assignees)
      ? payload.assignees
      : null;
  if (!list) throw payloadError('expected an array or { assignees: [...] }');

  return list.map((entry, index) => {
    const login = typeof entry === 'string' ? entry : entry?.login;
    if (typeof login !== 'string' || !login.trim()) {
      throw payloadError(`entry ${index + 1} has no non-empty login`);
    }
    return login.trim();
  });
}

export async function fetchAssignedInvariantAssignees({ issueNumber, repo, exec = pexec } = {}) {
  if (!issueNumber) throw new Error('assignee transport: issueNumber is required');
  if (!repo) throw new Error('assignee transport: repo is required');
  let stdout;
  try {
    ({ stdout } = await exec(
      'gh',
      ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'assignees'],
      { timeout: GH_API_TIMEOUT_MS }
    ));
  } catch (error) {
    throw new Error(`assignee transport failed: ${error?.message || String(error)}`);
  }
  let payload;
  try {
    payload = JSON.parse(String(stdout));
  } catch (error) {
    throw payloadError(`response was not JSON (${error.message})`);
  }
  return parseAssigneeLogins(payload);
}

export function classifyAssignedAssigneeDrift({ state, assignees } = {}) {
  const logins = parseAssigneeLogins(assignees);
  const normalized = String(state || '')
    .trim()
    .toLowerCase();
  if (normalized === 'assigned' && logins.length === 0) {
    return { kind: 'assigned-without-assignee', targetState: 'backlog' };
  }
  if (normalized === 'backlog' && logins.length > 0) {
    return { kind: 'backlog-with-assignee', targetState: 'assigned' };
  }
  if (normalized === 'assigned' || normalized === 'backlog') {
    return { kind: 'none', targetState: null };
  }
  return { kind: 'out-of-scope', targetState: null };
}

export function resolveAssignmentTarget(cfg) {
  const configured = cfg?.assignee;
  return typeof configured === 'string' && configured.trim() ? configured.trim() : '@me';
}

export const assignedRequiresAssigneeGuard = Object.freeze({
  id: ASSIGNED_ASSIGNEE_GUARD_ID,
  async run(ctx = {}) {
    const issueNumber = Number(ctx.issueNumber);
    const repo = ctx.repo || ctx.cfg?.repo;
    const fetchAssignees =
      ctx.deps?.fetchAssignedInvariantAssignees || fetchAssignedInvariantAssignees;
    try {
      const assignees = parseAssigneeLogins(await fetchAssignees({ issueNumber, repo }));
      if (assignees.length > 0) return { ok: true };
      return {
        ok: false,
        exitCode: EXIT_ASSIGNED_REQUIRES_ASSIGNEE,
        reason: `#${issueNumber} cannot enter Assigned: at least one live GitHub assignee is required.`,
      };
    } catch (error) {
      return {
        ok: false,
        exitCode: EXIT_ASSIGNED_REQUIRES_ASSIGNEE,
        reason:
          `#${issueNumber} cannot enter Assigned because live assignees could not be verified ` +
          `(fail-closed): ${error?.message || String(error)}`,
      };
    }
  },
});
