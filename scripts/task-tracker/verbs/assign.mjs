// `assign` verb — locally couples GitHub assignee edits to the Assigned state (#1207).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { splitRepo, gql } from '../../gh/lib/github-projects.mjs';
import { runMoveStateHost } from '../../gh/move-state.mjs';
import { getProjectDir } from '../paths.mjs';
import { withIssueLock, IssueLockError } from '../issue-mutator-lock.mjs';
import {
  fetchAssignedInvariantAssignees,
  parseAssigneeLogins,
  resolveAssignmentTarget,
  resolveConfiguredProjectState,
} from '../lib/assigned-assignee-invariant.mjs';
import { stateIds } from '../lib/lifecycle-policy/index.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';

const pexec = promisify(execFile);

async function defaultGetLiveState({ issueNumber, cfg }) {
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
  const nodes = data?.repository?.issue?.projectItems?.nodes ?? [];
  return resolveConfiguredProjectState(nodes, cfg.projectId);
}

async function defaultResolveLogin(login) {
  if (login !== '@me') return login;
  const { stdout } = await pexec('gh', ['api', 'user', '--jq', '.login'], {
    timeout: GH_API_TIMEOUT_MS,
  });
  const resolved = String(stdout).trim();
  if (!resolved) throw new Error('could not resolve @me to a GitHub login');
  return resolved;
}

async function defaultMutateAssignee({ issueNumber, repo, login, remove }) {
  await pexec(
    'gh',
    [
      'issue',
      'edit',
      String(issueNumber),
      '-R',
      repo,
      remove ? '--remove-assignee' : '--add-assignee',
      login,
    ],
    { timeout: GH_API_TIMEOUT_MS }
  );
}

function defaultRunMoveState({ issueNumber, target, reason }) {
  const extraArgs = target === 'backlog' && reason ? ['--demote', '--demote-reason', reason] : [];
  return runMoveStateHost({
    argv: [process.execPath, 'move-state.mjs', String(issueNumber), target, ...extraArgs],
    env: { ...process.env, AITM_INTERNAL: '1', AITM_VERB_CONTEXT: 'assign' },
  });
}

async function safeCompensate(action) {
  try {
    await action();
    return null;
  } catch (error) {
    return error?.message || String(error);
  }
}

function sameLogin(left, right) {
  return String(left).toLowerCase() === String(right).toLowerCase();
}

async function readAssigneesWithRetry(fetchAssignees, args, attempts = 2) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return parseAssigneeLogins(await fetchAssignees(args));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function runAssign({ issueNumber, login, remove = false, cfg, deps = {} } = {}) {
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('assign: issue# must be a positive integer');
  }
  if (!cfg?.repo) throw new Error('assign: cfg.repo is required');

  const requestedLogin = login || resolveAssignmentTarget(cfg);
  const resolveLogin = deps.resolveLogin || defaultResolveLogin;
  const getLiveState = deps.getLiveState || defaultGetLiveState;
  const fetchAssignees = deps.fetchAssignees || fetchAssignedInvariantAssignees;
  const mutateAssignee = deps.mutateAssignee || defaultMutateAssignee;
  const runMoveState = deps.runMoveState || defaultRunMoveState;

  try {
    const resolvedLogin = await resolveLogin(requestedLogin);
    const state = await getLiveState({ issueNumber, cfg });
    if (!stateIds().includes(state)) {
      throw new Error('live project state is missing or unrecognized');
    }
    const before = parseAssigneeLogins(await fetchAssignees({ issueNumber, repo: cfg.repo }));
    const alreadyPresent = before.some((entry) => sameLogin(entry, resolvedLogin));

    if (!remove) {
      if (!alreadyPresent) {
        await mutateAssignee({
          issueNumber,
          repo: cfg.repo,
          login: requestedLogin,
          remove: false,
        });
        try {
          const afterAdd = parseAssigneeLogins(
            await fetchAssignees({ issueNumber, repo: cfg.repo })
          );
          if (!afterAdd.some((entry) => sameLogin(entry, resolvedLogin))) {
            throw new Error(`GitHub did not report ${resolvedLogin} after assignment`);
          }
        } catch (error) {
          const compensationError = await safeCompensate(() =>
            mutateAssignee({
              issueNumber,
              repo: cfg.repo,
              login: requestedLogin,
              remove: true,
            })
          );
          return {
            status: compensationError
              ? 'assignment-verification-failed-compensation-failed'
              : 'assignment-verification-failed-compensated',
            exitCode: 1,
            login: requestedLogin,
            compensationError,
            message: `assignment could not be verified: ${error?.message || String(error)}`,
          };
        }
      }

      if (state === 'backlog') {
        const exitCode = await runMoveState({ issueNumber, target: 'assigned', cfg });
        if (exitCode !== 0) {
          const compensationError = alreadyPresent
            ? null
            : await safeCompensate(() =>
                mutateAssignee({
                  issueNumber,
                  repo: cfg.repo,
                  login: requestedLogin,
                  remove: true,
                })
              );
          return {
            status: compensationError
              ? 'move-failed-compensation-failed'
              : 'move-failed-compensated',
            exitCode,
            login: requestedLogin,
            compensationError,
            message: `assignment succeeded but Backlog → Assigned failed with exit ${exitCode}`,
          };
        }
      }

      return {
        status: alreadyPresent && state !== 'backlog' ? 'already-assigned' : 'assigned',
        issueNumber,
        login: requestedLogin,
        state: state === 'backlog' ? 'assigned' : state,
      };
    }

    if (!alreadyPresent) {
      return { status: 'already-unassigned', issueNumber, login: requestedLogin, state };
    }

    const removesFinalAssigned = state === 'assigned' && before.length === 1;
    if (removesFinalAssigned) {
      const demoteExit = await runMoveState({
        issueNumber,
        target: 'backlog',
        reason: 'Assigned invariant: final assignee removal requires Assigned → Backlog',
        cfg,
      });
      if (demoteExit !== 0) {
        return {
          status: 'demote-failed',
          exitCode: demoteExit,
          login: requestedLogin,
          message: `refusing to remove the final Assigned assignee because demotion failed`,
        };
      }
    }

    try {
      await mutateAssignee({
        issueNumber,
        repo: cfg.repo,
        login: requestedLogin,
        remove: true,
      });
    } catch (error) {
      if (!removesFinalAssigned) throw error;
      const restoreExit = await runMoveState({ issueNumber, target: 'assigned', cfg });
      return {
        status: restoreExit === 0 ? 'remove-failed-restored' : 'remove-failed-restore-failed',
        exitCode: 1,
        login: requestedLogin,
        restoreExit,
        message: `assignee removal failed after demotion: ${error?.message || String(error)}`,
      };
    }

    let afterRemove;
    let verificationError = null;
    try {
      afterRemove = await readAssigneesWithRetry(fetchAssignees, {
        issueNumber,
        repo: cfg.repo,
      });
    } catch (error) {
      verificationError = error;
    }
    if (verificationError || afterRemove.some((entry) => sameLogin(entry, resolvedLogin))) {
      if (removesFinalAssigned) {
        const restoreExit = await runMoveState({ issueNumber, target: 'assigned', cfg });
        return {
          status:
            restoreExit === 0
              ? 'remove-verification-failed-restored'
              : 'remove-verification-failed-restore-failed',
          exitCode: 1,
          login: requestedLogin,
          restoreExit,
          message: verificationError
            ? `assignee removal could not be verified: ${verificationError.message}`
            : `GitHub still reports ${resolvedLogin} after removal`,
        };
      }
      return {
        status: 'error',
        exitCode: 1,
        message: verificationError
          ? `assignee removal could not be verified: ${verificationError.message}`
          : `GitHub still reports ${resolvedLogin} after removal`,
      };
    }
    return {
      status: 'unassigned',
      issueNumber,
      login: requestedLogin,
      state: removesFinalAssigned ? 'backlog' : state,
    };
  } catch (error) {
    return { status: 'error', exitCode: 1, message: error?.message || String(error) };
  }
}

export async function runInvariantAwareClaim({ issueNumber, cfg, deps = {} } = {}) {
  const fetchAssignees = deps.fetchAssignees || fetchAssignedInvariantAssignees;
  const lock = deps.withIssueLock || withIssueLock;
  const runAssignFn = deps.runAssign || runAssign;
  return lock(
    { issue: issueNumber, verb: 'full-auto-claim', projDir: deps.projDir || getProjectDir() },
    async () => {
      const before = parseAssigneeLogins(await fetchAssignees({ issueNumber, repo: cfg.repo }));
      if (before.length > 0) {
        return { ok: false, kind: 'already-assigned', assignees: before };
      }
      const result = await runAssignFn({ issueNumber, login: '@me', cfg, deps });
      if (result.status === 'assigned' || result.status === 'already-assigned') {
        return { ok: true, claimed: true, state: result.state, login: result.login };
      }
      return {
        ok: false,
        kind: result.status,
        assignees: [],
        exitCode: result.exitCode || 1,
        message: result.message,
      };
    }
  );
}

export function parseArgs(rest = []) {
  let issueNumber = null;
  let login = null;
  let remove = false;
  for (let index = 0; index < rest.length; index += 1) {
    const value = String(rest[index]);
    const issue = value.match(/^#?(\d+)$/);
    if (issue) issueNumber = Number(issue[1]);
    else if (value === '--remove') remove = true;
    else if (value === '--assignee' && rest[index + 1]) login = String(rest[++index]);
    else if (!value.startsWith('--') && login == null) login = value;
  }
  return { issueNumber, login, remove };
}

export async function verbAssign(rest, cfg, deps = {}) {
  const args = parseArgs(rest);
  if (!args.issueNumber) {
    process.stderr.write('Usage: /task assign #N [<login>|--assignee <login>] [--remove]\n');
    process.exit(2);
  }
  let result;
  try {
    result = await withIssueLock(
      { issue: args.issueNumber, verb: 'assign', projDir: getProjectDir() },
      () => runAssign({ ...args, cfg, deps })
    );
  } catch (error) {
    if (error instanceof IssueLockError) {
      process.stderr.write(`⛔ ${error.message}\n`);
      process.exit(7);
    }
    process.stderr.write(`assign: ${error?.message || String(error)}\n`);
    process.exit(1);
  }
  if (
    ['assigned', 'already-assigned', 'unassigned', 'already-unassigned'].includes(result.status)
  ) {
    process.stdout.write(
      `✓ #${args.issueNumber} ${result.status}: ${result.login} (${result.state})\n`
    );
    return;
  }
  process.stderr.write(`assign: ${result.message || result.status}\n`);
  if (result.compensationError) {
    process.stderr.write(`assign: compensation failed: ${result.compensationError}\n`);
  }
  process.exit(result.exitCode || 1);
}
