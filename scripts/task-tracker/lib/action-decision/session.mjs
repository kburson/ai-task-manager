// @story #1750
import { isDeepStrictEqual } from 'node:util';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { readLastKnownState } from '../../gh-timing-comment.mjs';
import { gql, splitRepo } from '../../../gh/lib/github-projects.mjs';
import { fetchAssignmentSnapshot } from '../assignment-snapshot.mjs';
import { findMainWorktreePath } from '../../fleet-registry.mjs';
import { normalizeStateId } from '../lifecycle-policy/index.mjs';
import { readOccupancy } from '../occupancy.mjs';
import { ownershipDecision } from '../ownership-policy.mjs';
import { occupancyPath } from '../../paths.mjs';
import { BoundWorktreeMissingError, resolveProjectDir } from '../project-dir.mjs';
import { loadReadyForPlanMigrationJournal } from '../ready-for-plan-migration-freeze.mjs';
import { readWorktreeIdentity } from '../worktree-binding-guard.mjs';
import { currentSessionId } from '../../word-counter.mjs';
import { computeScopeIdentity } from '../workflow-policy/scope-identity.mjs';
import { createObservationAttempt } from './observations.mjs';
import { sessionNetworkSkipped } from '../verb-preflight.mjs';

const pexec = promisify(execFile);

const skipped = (source, issue) => ({
  guardId: 'authority-collection',
  code: 'authority-read-skipped',
  args: { source, subject: { issue } },
  noAutomaticRemediation: { reason: 'authority-investigation-required' },
});

const failed = (source, issue, reason = 'unavailable') => ({
  guardId: 'authority-collection',
  code: 'authority-read-failed',
  args: { source, reason, subject: { issue } },
  noAutomaticRemediation: { reason: 'authority-investigation-required' },
});

const blocked = (code) => ({
  guardId: 'authority-collection',
  code,
  args: {},
  noAutomaticRemediation: { reason: 'state-investigation-required' },
});

export function compareBoardMarker(liveState, markerState) {
  const live = normalizeStateId(liveState);
  const marker = normalizeStateId(markerState);
  return {
    live,
    marker,
    status: !live || !marker ? 'incomplete' : live === marker ? 'match' : 'drift',
  };
}

export function resumeEntryPrecondition(state, { issue = null } = {}) {
  if (state?.paused !== true) return 'resume-not-paused';
  const lastActive = String(state.lastActive ?? '').replace(/^#/, '');
  if (!lastActive || (issue !== null && lastActive !== String(issue)))
    return 'session-bind-mismatch';
  return null;
}

/** Production read adapter. All dependencies are reads; no effect capability is accepted. */
export async function evaluateSessionReadiness({
  actionId,
  issue,
  stateBefore,
  config,
  projectDir = process.cwd(),
  invokingDir = process.cwd(),
  now = () => new Date().toISOString(),
  boundaryId = `action:${actionId}:${issue}`,
  explicitTarget = true,
  deps = {},
} = {}) {
  if (!['bind', 'resume'].includes(actionId)) throw new TypeError('session-readiness:action');
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new TypeError('session-readiness:issue');
  const repository = config?.repo;
  if (typeof repository !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    return {
      status: 'indeterminate',
      blockers: [failed('local-config', issue, 'incomplete')],
      effectiveConfig: { gateAssigneeMatch: config?.preferences?.gateAssigneeMatch ?? true },
      observations: [],
    };
  }
  const readIssueBody =
    deps.readIssueBody ??
    (async () => {
      const { owner, repoName } = splitRepo(repository);
      const data = await (deps.gql ?? gql)(
        `query($owner: String!, $repo: String!, $issue: Int!) {
        repository(owner: $owner, name: $repo) { issue(number: $issue) { body } }
      }`,
        { owner, repo: repoName, issue }
      );
      const body = data?.repository?.issue?.body;
      if (typeof body !== 'string') throw new Error('issue body is unavailable');
      return body;
    });
  const skipNetwork = sessionNetworkSkipped();
  const read = async (request) => {
    let value;
    switch (request.resource) {
      case 'local-config':
        value = {
          repo: repository,
          projectId: config.projectId ?? null,
          gateAssigneeMatch: config.preferences?.gateAssigneeMatch ?? true,
        };
        break;
      case 'session-state':
        value = stateBefore;
        break;
      case 'worktree': {
        let boundDir;
        try {
          boundDir = (deps.resolveProjectDir ?? resolveProjectDir)({
            issue,
            deps: { invokingDir, logOverride: () => {} },
          });
        } catch (error) {
          if (!(error instanceof BoundWorktreeMissingError)) throw error;
          boundDir = invokingDir;
        }
        const identity = deps.readWorktreeIdentity ?? readWorktreeIdentity;
        value = {
          matches:
            identity({ projectDir: invokingDir }).worktreePath ===
            identity({ projectDir: boundDir }).worktreePath,
        };
        break;
      }
      case 'occupancy': {
        const rows = (deps.readOccupancy ?? readOccupancy)(
          occupancyPath((deps.findMainWorktreePath ?? findMainWorktreePath)(projectDir))
        );
        const holder = rows[String(issue)];
        const sid = (deps.currentSessionId ?? currentSessionId)();
        const worktreeHeld = Object.values(rows).some(
          (row) => path.resolve(row.worktreePath) === path.resolve(projectDir) && row.sid !== sid
        );
        value = {
          available: (!holder || holder.sid === sid) && !worktreeHeld,
        };
        break;
      }
      case 'migration-journal': {
        const journal = (deps.loadMigrationJournal ?? loadReadyForPlanMigrationJournal)({
          projectDir,
        });
        value = { active: Boolean(journal && journal.phase !== 'final-verification') };
        break;
      }
      case 'project-board':
        value = await (deps.fetchAssignmentSnapshot ?? fetchAssignmentSnapshot)({
          issueNumber: issue,
          cfg: config,
        });
        break;
      case 'issue-body':
        value = { number: issue, body: await readIssueBody() };
        break;
      case 'github-user': {
        const login = deps.readCurrentUser
          ? await deps.readCurrentUser()
          : (await pexec('gh', ['api', 'user', '--jq', '.login'])).stdout.trim();
        value = { login };
        break;
      }
      default:
        throw new TypeError(`session-readiness:unsupported-source:${request.resource}`);
    }
    return { ...request, value };
  };
  const attempt = createObservationAttempt({ repository, issue, boundaryId, now, read });
  let body;
  if (!skipNetwork) {
    try {
      body = await readIssueBody();
    } catch {
      /* represented by the issue-body observation */
    }
  }
  let scope = `session:${issue}`;
  if (body !== undefined) {
    try {
      scope = computeScopeIdentity({ repository, issue, body });
    } catch {
      // The issue-body observation reports malformed scope as authority failure.
    }
  }
  const result = await collectSessionReadiness({
    actionId,
    issue,
    stateBefore,
    config,
    attempt,
    ports: { scope, explicitTarget, skipNetwork },
  });
  return { ...result, bundle: attempt.finish() };
}

/** Read-only bind/resume authority collector. It never receives an effect port. */
export async function collectSessionReadiness({
  actionId,
  issue,
  stateBefore,
  config,
  attempt,
  ports = {},
} = {}) {
  if (!['bind', 'resume'].includes(actionId)) throw new TypeError('session-readiness:action');
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new TypeError('session-readiness:issue');
  if (!attempt || typeof attempt.observe !== 'function')
    throw new TypeError('session-readiness:attempt');
  if (typeof ports.scope !== 'string' || !ports.scope)
    throw new TypeError('session-readiness:scope');

  const observations = [];
  const blockers = [];
  const observed = new Map();
  const local = [
    [
      'local-config',
      config
        ? {
            repo: config.repo ?? null,
            projectId: config.projectId ?? null,
            gateAssigneeMatch: config.preferences?.gateAssigneeMatch ?? true,
          }
        : null,
    ],
    ['session-state', stateBefore ?? null],
    ['worktree', null],
    ['occupancy', null],
    ['migration-journal', null],
  ];
  for (const [resource, expected] of local) {
    const observation = await attempt.observe({
      resource,
      identity: `${resource}:${issue}`,
      scope: ports.scope,
    });
    observations.push(observation);
    if (observation.status === 'observed') observed.set(resource, observation.value);
    if (
      observation.status !== 'observed' ||
      (expected === null && !['worktree', 'occupancy', 'migration-journal'].includes(resource))
    ) {
      blockers.push(observation.cause ?? failed(resource, issue, 'incomplete'));
    }
  }
  if (
    config &&
    observed.has('local-config') &&
    !isDeepStrictEqual(observed.get('local-config'), local[0][1])
  )
    blockers.push(failed('local-config', issue, 'invalid'));
  if (!/^[^/\s]+\/[^/\s]+$/.test(config?.repo ?? ''))
    blockers.push(failed('local-config', issue, 'incomplete'));
  if (
    stateBefore &&
    observed.has('session-state') &&
    !isDeepStrictEqual(observed.get('session-state'), stateBefore)
  )
    blockers.push(failed('session-state', issue, 'invalid'));

  const skipNetwork = ports.skipNetwork === true || sessionNetworkSkipped();
  for (const resource of ['project-board', 'issue-body']) {
    if (skipNetwork) {
      blockers.push(skipped(resource, issue));
      continue;
    }
    const observation = await attempt.observe({
      resource,
      identity: resource === 'issue-body' ? `issue:${issue}:1` : `issue:${issue}:2`,
      scope: ports.scope,
    });
    observations.push(observation);
    if (observation.status === 'observed') observed.set(resource, observation.value);
    if (observation.status !== 'observed') blockers.push(observation.cause);
  }

  if (config?.preferences?.gateAssigneeMatch !== false && !skipNetwork) {
    const user = await attempt.observe({
      resource: 'github-user',
      identity: `github-user:${issue}`,
      scope: ports.scope,
    });
    observations.push(user);
    if (user.status === 'observed') observed.set('github-user', user.value);
    else blockers.push(user.cause);
  }

  if (actionId === 'resume' && ports.explicitTarget === false) {
    const refusal = resumeEntryPrecondition(stateBefore, { issue });
    if (refusal) blockers.push(blocked(refusal));
  }
  if (observed.has('migration-journal')) {
    const active = observed.get('migration-journal')?.active;
    if (typeof active !== 'boolean')
      blockers.push(failed('migration-journal', issue, 'incomplete'));
    else if (ports.migrationFreezeActive !== undefined && ports.migrationFreezeActive !== active)
      blockers.push(failed('migration-journal', issue, 'invalid'));
    else if (active) blockers.push(blocked('migration-freeze'));
  }

  if (observed.has('worktree')) {
    const matches = observed.get('worktree')?.matches;
    if (typeof matches !== 'boolean') blockers.push(failed('worktree', issue, 'incomplete'));
    else if (!matches) blockers.push(blocked('worktree-mismatch'));
  }
  if (observed.has('occupancy')) {
    const available = observed.get('occupancy')?.available;
    if (typeof available !== 'boolean') blockers.push(failed('occupancy', issue, 'incomplete'));
    else if (!available) blockers.push(blocked('occupancy-conflict'));
  }
  const board = observed.get('project-board');
  const issueBody = observed.get('issue-body');
  if (board && issueBody) {
    const comparison = compareBoardMarker(board.state, readLastKnownState(issueBody.body).state);
    if (comparison.status === 'incomplete')
      blockers.push(failed(!comparison.live ? 'project-board' : 'issue-body', issue, 'incomplete'));
    else if (comparison.status === 'drift') blockers.push(blocked('state-drift'));
  }
  if (config?.preferences?.gateAssigneeMatch !== false && board && observed.has('github-user')) {
    if (!Array.isArray(board.assignees))
      blockers.push(failed('project-board', issue, 'incomplete'));
    else {
      const ownership = ownershipDecision({
        state: normalizeStateId(board.state),
        assignees: board.assignees,
        currentUser: observed.get('github-user')?.login,
      });
      if (ownership.kind === 'ownership-unverifiable')
        blockers.push(failed('github-user', issue, 'incomplete'));
      else if (!ownership.ok) blockers.push(blocked('ownership-mismatch'));
    }
  }

  return {
    status: blockers.some((blocker) => blocker.code.startsWith('authority-read-'))
      ? 'indeterminate'
      : blockers.length
        ? 'blocked'
        : 'ready',
    blockers,
    effectiveConfig: { gateAssigneeMatch: config?.preferences?.gateAssigneeMatch ?? true },
    observations,
  };
}
