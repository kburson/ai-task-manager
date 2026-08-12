#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProjectDir } from '../paths.mjs';
import { withIssueLock } from '../issue-mutator-lock.mjs';
import { fetchAssignmentSnapshot, exactSingleton } from '../lib/assignment-snapshot.mjs';
import { canonicalLogin, canonicalLogins } from '../lib/ownership-policy.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { parseStrict, StrictArgvError } from '../lib/argv-strict.mjs';
import { assertBoundToIssue } from '../lib/bind-context.mjs';

const pexec = promisify(execFile);

export async function defaultResolveLogin(login) {
  if (login !== '@me') return login;
  const { stdout } = await pexec('gh', ['api', 'user', '--jq', '.login'], {
    timeout: GH_API_TIMEOUT_MS,
  });
  return String(stdout).trim();
}

async function defaultMutateAssignee({ issueNumber, repo, action, login }) {
  const flag = action === 'remove' ? '--remove-assignee' : '--add-assignee';
  await pexec('gh', ['issue', 'edit', String(issueNumber), '-R', repo, flag, login], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

export function formatOwnershipAudit({ issueNumber, from, to, state }) {
  return [
    '### Story ownership transaction',
    '',
    `Requested ownership change for #${issueNumber} from ${from ? `@${from}` : 'unassigned'} to @${to}.`,
    `Lifecycle Status remained \`${state}\`.`,
    'This durable intent is recorded before mutation; AITM accepts success only after exact read-back.',
    '',
    `<!-- aitm-ownership-change from="${from || 'unassigned'}" to="${to}" -->`,
  ].join('\n');
}

async function defaultPostAudit({ issueNumber, repo, from, to, state }) {
  await pexec(
    'gh',
    [
      'issue',
      'comment',
      String(issueNumber),
      '-R',
      repo,
      '--body',
      formatOwnershipAudit({ issueNumber, from, to, state }),
    ],
    { timeout: GH_API_TIMEOUT_MS }
  );
}

export async function runAssign({
  issueNumber,
  cfg,
  target,
  currentUser,
  operation = 'auto',
  deps = {},
} = {}) {
  if (!issueNumber) throw new Error('assign: issueNumber is required');
  if (!cfg?.repo || !cfg?.projectId) throw new Error('assign: cfg is required');
  const resolveLogin = deps.resolveLogin || defaultResolveLogin;
  const login = canonicalLogin(await resolveLogin(target));
  const actor = canonicalLogin(currentUser);
  if (!login || !actor) return { status: 'identity-unverifiable' };

  const runtime = {
    fetchSnapshot: deps.fetchSnapshot || fetchAssignmentSnapshot,
    mutateAssignee: deps.mutateAssignee || defaultMutateAssignee,
    postAudit: deps.postAudit || defaultPostAudit,
  };
  const lock = deps.withIssueLock || withIssueLock;
  const projectDir = deps.projectDir || getProjectDir();

  return lock({ issue: issueNumber, verb: 'assign', projDir: projectDir }, async () => {
    const before = await runtime.fetchSnapshot({ issueNumber, cfg });
    const owners = canonicalLogins(before.assignees);
    if (owners.length > 1) return { status: 'multiple-owners-refused', assignees: owners };
    const prior = owners[0] || null;
    if (prior && prior !== actor) return { status: 'foreign-owner-refused', assignees: owners };
    if (operation === 'assign' && prior && prior !== login) {
      return { status: 'transfer-required', state: before.state, assignees: owners };
    }
    if (operation === 'transfer' && !prior) {
      return { status: 'assign-required', state: before.state, assignees: owners };
    }
    if (prior === login) {
      return { status: 'already-assigned', state: before.state, assignees: owners };
    }

    // Reserve durable audit provenance before the first irreversible GitHub
    // mutation. If the comment write fails, ownership is untouched. If a
    // later mutation/read-back fails, the record truthfully remains an attempt.
    await runtime.postAudit({
      issueNumber,
      repo: cfg.repo,
      from: prior,
      to: login,
      state: before.state,
    });

    let addError = null;
    try {
      await runtime.mutateAssignee({
        issueNumber,
        repo: cfg.repo,
        action: 'add',
        login,
      });
    } catch (error) {
      addError = error;
    }

    let afterAdd;
    try {
      afterAdd = await runtime.fetchSnapshot({ issueNumber, cfg });
    } catch (error) {
      return {
        status: addError ? 'assignment-ambiguous' : 'postcondition-unverifiable',
        error: error?.message || String(error),
      };
    }
    if (addError) {
      return {
        status: 'assignment-ambiguous',
        error: addError?.message || String(addError),
        state: afterAdd.state,
        assignees: canonicalLogins(afterAdd.assignees),
      };
    }

    const ownersAfterAdd = canonicalLogins(afterAdd.assignees);
    const expectedAfterAdd = prior ? [prior, login] : [login];
    const expectedSet = [...expectedAfterAdd].sort();
    const actualSet = [...ownersAfterAdd].sort();
    const postAddMatches =
      expectedSet.length === actualSet.length &&
      expectedSet.every((owner, index) => owner === actualSet[index]);
    if (afterAdd.state !== before.state || !postAddMatches) {
      return {
        // A successful GitHub add has no transaction provenance. A concurrent
        // UI actor could have added the same owner between our snapshots, so
        // removing it would be destructive compensation we cannot justify.
        status: 'postcondition-refused-uncompensated',
        state: afterAdd.state,
        assignees: ownersAfterAdd,
      };
    }

    if (prior) {
      let removeError = null;
      try {
        await runtime.mutateAssignee({
          issueNumber,
          repo: cfg.repo,
          action: 'remove',
          login: prior,
        });
      } catch (error) {
        removeError = error;
      }
      let afterTransfer;
      try {
        afterTransfer = await runtime.fetchSnapshot({ issueNumber, cfg });
      } catch (error) {
        return {
          status: 'transfer-ambiguous',
          error: error?.message || String(error),
        };
      }
      if (removeError) {
        return {
          status: 'transfer-ambiguous',
          error: removeError?.message || String(removeError),
          state: afterTransfer.state,
          assignees: canonicalLogins(afterTransfer.assignees),
        };
      }
      if (afterTransfer.state !== before.state || !exactSingleton(afterTransfer, login)) {
        return {
          // The prior-owner removal already returned success. Removing the
          // transaction-added target now could leave the story ownerless, and
          // re-adding the prior owner would begin a second ambiguous saga.
          // Preserve the observed live owners and require human coordination.
          status: 'transfer-postcondition-refused-uncompensated',
          state: afterTransfer.state,
          assignees: canonicalLogins(afterTransfer.assignees),
        };
      }
      return { status: 'transferred', state: before.state, assignees: [login] };
    }
    return { status: 'assigned', state: before.state, assignees: [login] };
  });
}

function parseOwnershipArgs(rest, usage) {
  const parsed = parseStrict(rest, {
    options: ['--to'],
    positionals: { min: 1, max: 1 },
    usage,
  });
  if (!parsed.values['--to']) {
    throw new StrictArgvError('option --to requires a value', { usage });
  }
  const issue = String(parsed.positionals[0]).match(/^#?(\d+)$/);
  if (!issue) throw new StrictArgvError('issue must be a positive number', { usage });
  return { issueNumber: Number(issue[1]), target: parsed.values['--to'] };
}

async function runOwnershipVerb(rest, cfg, operation, deps = {}) {
  const usage = `Usage: ${operation} <N> --to <github-login|@me>`;
  let args;
  try {
    args = parseOwnershipArgs(rest, usage);
  } catch (error) {
    if (!(error instanceof StrictArgvError)) throw error;
    process.stderr.write(`${error.message}\n${usage}\n`);
    process.exitCode = 2;
    return;
  }
  const assertBound = deps.assertBound || assertBoundToIssue;
  assertBound(args.issueNumber);
  const resolveLogin = deps.resolveLogin || defaultResolveLogin;
  const currentUser = canonicalLogin(await resolveLogin('@me'));
  const result = await runAssign({ ...args, cfg, currentUser, operation, deps });
  if (['assigned', 'transferred', 'already-assigned'].includes(result.status)) {
    process.stdout.write(
      `${operation}: #${args.issueNumber} ${result.status}; owner @${result.assignees[0]}; Status ${result.state}\n`
    );
    return;
  }
  process.stderr.write(`${operation}: refused (${result.status})\n`);
  process.exitCode = 10;
}

export async function verbAssign(rest, cfg, deps = {}) {
  return runOwnershipVerb(rest, cfg, 'assign', deps);
}

export async function verbTransfer(rest, cfg, deps = {}) {
  return runOwnershipVerb(rest, cfg, 'transfer', deps);
}

const isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMain) {
  const { loadConfig } = await import('../config.mjs');
  await verbAssign(process.argv.slice(2), loadConfig());
}
