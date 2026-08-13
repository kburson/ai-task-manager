#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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

export function formatOwnershipAudit({
  issueNumber,
  from,
  to,
  state,
  phase = 'completed',
  tx = 'legacy',
}) {
  const completed = phase === 'completed';
  return [
    '### Story ownership transaction',
    '',
    `${completed ? 'Verified' : 'Requested'} ownership change for #${issueNumber} from ${from ? `@${from}` : 'unassigned'} to ${to === 'unassigned' ? 'unassigned' : `@${to}`}.`,
    `Lifecycle Status remained \`${state}\`.`,
    completed
      ? 'AITM verified the final singleton ownership and unchanged Status by exact read-back.'
      : 'This durable intent is recorded before mutation; a separate completed record follows exact read-back.',
    ...(completed && from && to !== 'unassigned'
      ? [
          'Repeated ownership transfers can indicate coordination or delivery risk; review the transaction history.',
        ]
      : []),
    '',
    `<!-- aitm-ownership-change tx="${tx}" phase="${phase}" from="${from || 'unassigned'}" to="${to}" state="${state}" -->`,
  ].join('\n');
}

export async function defaultPostOwnershipAudit({ issueNumber, repo, from, to, state, phase, tx }) {
  await pexec(
    'gh',
    [
      'issue',
      'comment',
      String(issueNumber),
      '-R',
      repo,
      '--body',
      formatOwnershipAudit({ issueNumber, from, to, state, phase, tx }),
    ],
    { timeout: GH_API_TIMEOUT_MS }
  );
}

export async function defaultListOwnershipAudits({ issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    ['api', '--paginate', '--slurp', `repos/${repo}/issues/${issueNumber}/comments?per_page=100`],
    { timeout: GH_API_TIMEOUT_MS }
  );
  const pages = JSON.parse(stdout || '[]');
  return pages.flat().map((comment) => String(comment?.body || ''));
}

const OWNERSHIP_AUDIT_RE =
  /<!--\s*aitm-ownership-change\s+(?:tx="([^"]+)"\s+)?phase="(intent|completed)"\s+from="([^"]+)"\s+to="([^"]+)"\s+state="([^"]+)"\s*-->/i;

export function parseOwnershipAudits(bodies) {
  return (bodies || []).flatMap((body) => {
    const match = String(body || '').match(OWNERSHIP_AUDIT_RE);
    return match
      ? [
          {
            tx: match[1] || 'legacy',
            phase: match[2].toLowerCase(),
            from: match[3],
            to: match[4],
            state: match[5],
          },
        ]
      : [];
  });
}

function auditMatches(record, transaction) {
  return record.tx === transaction.tx;
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
    postAudit: deps.postAudit || defaultPostOwnershipAudit,
    listAuditBodies:
      deps.listAuditBodies || (deps.postAudit ? async () => [] : defaultListOwnershipAudits),
  };
  const lock = deps.withIssueLock || withIssueLock;
  const projectDir = deps.projectDir || getProjectDir();

  return lock({ issue: issueNumber, verb: 'assign', projDir: projectDir }, async () => {
    const before = await runtime.fetchSnapshot({ issueNumber, cfg });
    const owners = canonicalLogins(before.assignees);
    if (owners.length > 1) return { status: 'multiple-owners-refused', assignees: owners };
    const prior = owners[0] || null;
    const audits = parseOwnershipAudits(
      await runtime.listAuditBodies({ issueNumber, repo: cfg.repo })
    );
    const pending = [...audits]
      .reverse()
      .find(
        (record) =>
          record.phase === 'intent' &&
          record.to === login &&
          record.state === before.state &&
          !audits.some(
            (candidate) => candidate.phase === 'completed' && auditMatches(candidate, record)
          )
      );
    if (prior && prior !== actor) {
      if (operation === 'transfer' && pending?.from === actor && pending.to === prior) {
        await runtime.postAudit({ issueNumber, repo: cfg.repo, ...pending, phase: 'completed' });
        return { status: 'transferred', state: before.state, assignees: [prior] };
      }
      return { status: 'foreign-owner-refused', assignees: owners };
    }
    if (operation === 'assign' && prior && prior !== login) {
      return { status: 'transfer-required', state: before.state, assignees: owners };
    }
    if (operation === 'transfer' && !prior) {
      return { status: 'assign-required', state: before.state, assignees: owners };
    }
    if (prior === login) {
      if (pending) {
        await runtime.postAudit({ issueNumber, repo: cfg.repo, ...pending, phase: 'completed' });
        return {
          status: pending.from === 'unassigned' ? 'assigned' : 'transferred',
          state: before.state,
          assignees: owners,
        };
      }
      return { status: 'already-assigned', state: before.state, assignees: owners };
    }

    if (before.state === 'done') {
      return { status: 'done-ownership-immutable', state: before.state, assignees: owners };
    }

    const tx = randomUUID();

    // Reserve durable audit provenance before the first irreversible GitHub
    // mutation. If the comment write fails, ownership is untouched. If a
    // later mutation/read-back fails, the record truthfully remains an attempt.
    await runtime.postAudit({
      issueNumber,
      repo: cfg.repo,
      from: prior,
      to: login,
      state: before.state,
      phase: 'intent',
      tx,
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
      try {
        await runtime.postAudit({
          issueNumber,
          repo: cfg.repo,
          from: prior,
          to: login,
          state: before.state,
          phase: 'completed',
          tx,
        });
      } catch (error) {
        return {
          status: 'transferred-audit-pending',
          state: before.state,
          assignees: [login],
          error: error?.message || String(error),
        };
      }
      return { status: 'transferred', state: before.state, assignees: [login] };
    }
    try {
      await runtime.postAudit({
        issueNumber,
        repo: cfg.repo,
        from: null,
        to: login,
        state: before.state,
        phase: 'completed',
        tx,
      });
    } catch (error) {
      return {
        status: 'assigned-audit-pending',
        state: before.state,
        assignees: [login],
        error: error?.message || String(error),
      };
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

export function formatOwnershipRefusal({ operation, issueNumber, result, currentUser }) {
  const owner = result.assignees?.[0];
  if (result.status === 'foreign-owner-refused') {
    return [
      `${operation}: refused (foreign-owner-refused); #${issueNumber} is owned by @${owner || 'unknown'}, not @${currentUser || 'unknown'}.`,
      `  @${owner || 'the current owner'} must run \`npx aitm transfer ${issueNumber} --to @${currentUser || 'me'}\` from their workstation,`,
      '  or a human must reconcile the single owner in the GitHub UI before this workspace retries.',
    ].join('\n');
  }
  if (result.status === 'multiple-owners-refused') {
    return [
      `${operation}: refused (multiple-owners-refused); #${issueNumber} has ${result.assignees?.length || 0} owners.`,
      "  Reconcile the assignees in the GitHub UI to exactly one owner, then retry from that owner's workstation.",
    ].join('\n');
  }
  if (result.status === 'done-ownership-immutable') {
    return `${operation}: refused (done-ownership-immutable); Done preserves its final owner. Reopen/demote through the governed lifecycle before changing ownership.`;
  }
  if (String(result.status || '').endsWith('-audit-pending')) {
    return [
      `${operation}: incomplete (${result.status}); ownership is verified but the completed audit comment is pending.`,
      '  Retry the exact same command; AITM will correlate the durable transaction and write only its missing completion record.',
    ].join('\n');
  }
  return `${operation}: refused (${result.status}); inspect the reported live Status/owners and use the governed assign, transfer, or unassign verb to reconcile them.`;
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
  process.stderr.write(
    `${formatOwnershipRefusal({
      operation,
      issueNumber: args.issueNumber,
      result,
      currentUser,
    })}\n`
  );
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
