#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { getProjectDir } from '../paths.mjs';
import { withIssueLock } from '../issue-mutator-lock.mjs';
import { exactSingleton, fetchAssignmentSnapshot } from '../lib/assignment-snapshot.mjs';
import { canonicalLogin, canonicalLogins, isPreDevelopState } from '../lib/ownership-policy.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { parseStrict, StrictArgvError } from '../lib/argv-strict.mjs';
import { assertBoundToIssue } from '../lib/bind-context.mjs';
import {
  defaultListOwnershipAudits,
  defaultPostOwnershipAudit,
  defaultResolveLogin,
  parseOwnershipAudits,
} from './assign.mjs';

const pexec = promisify(execFile);

async function defaultMutateAssignee({ issueNumber, repo, action, login }) {
  if (!['add', 'remove'].includes(action)) throw new Error(`unassign: unsupported ${action}`);
  const flag = action === 'add' ? '--add-assignee' : '--remove-assignee';
  await pexec('gh', ['issue', 'edit', String(issueNumber), '-R', repo, flag, login], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

export async function runUnassign({ issueNumber, cfg, currentUser, deps = {} } = {}) {
  if (!issueNumber) throw new Error('unassign: issueNumber is required');
  if (!cfg?.repo || !cfg?.projectId) throw new Error('unassign: cfg is required');
  const actor = canonicalLogin(currentUser);
  if (!actor) return { status: 'identity-unverifiable' };
  const fetchSnapshot = deps.fetchSnapshot || fetchAssignmentSnapshot;
  const mutateAssignee = deps.mutateAssignee || defaultMutateAssignee;
  const postAudit = deps.postAudit || defaultPostOwnershipAudit;
  const listAuditBodies =
    deps.listAuditBodies || (deps.postAudit ? async () => [] : defaultListOwnershipAudits);
  const lock = deps.withIssueLock || withIssueLock;
  const projectDir = deps.projectDir || getProjectDir();

  async function restorePriorOwner() {
    try {
      await mutateAssignee({
        issueNumber,
        repo: cfg.repo,
        action: 'add',
        login: actor,
      });
      const restored = await fetchSnapshot({ issueNumber, cfg });
      return {
        verified: exactSingleton(restored, actor),
        snapshot: restored,
      };
    } catch {
      return { verified: false, snapshot: null };
    }
  }

  return lock({ issue: issueNumber, verb: 'unassign', projDir: projectDir }, async () => {
    const before = await fetchSnapshot({ issueNumber, cfg });
    const owners = canonicalLogins(before.assignees);
    if (!isPreDevelopState(before.state)) {
      return { status: 'in-flight-unassign-refused', state: before.state, assignees: owners };
    }
    const audits = parseOwnershipAudits(await listAuditBodies({ issueNumber, repo: cfg.repo }));
    const pending = audits.find(
      (record) =>
        record.phase === 'intent' &&
        record.from === actor &&
        record.to === 'unassigned' &&
        record.state === before.state &&
        !audits.some(
          (candidate) =>
            candidate.phase === 'completed' &&
            candidate.from === record.from &&
            candidate.to === record.to &&
            candidate.state === record.state
        )
    );
    if (owners.length === 0) {
      if (pending) {
        await postAudit({ issueNumber, repo: cfg.repo, ...pending, phase: 'completed' });
        return { status: 'unassigned', state: before.state, assignees: [] };
      }
      return { status: 'already-unassigned', state: before.state };
    }
    if (owners.length > 1) return { status: 'multiple-owners-refused', assignees: owners };
    if (owners[0] !== actor) return { status: 'foreign-owner-refused', assignees: owners };

    // Audit intent is the transaction's durable first write. A failed audit
    // leaves ownership unchanged; a failed mutation leaves a truthful attempt.
    await postAudit({
      issueNumber,
      repo: cfg.repo,
      from: actor,
      to: 'unassigned',
      state: before.state,
      phase: 'intent',
    });

    let removeError = null;
    try {
      await mutateAssignee({
        issueNumber,
        repo: cfg.repo,
        action: 'remove',
        login: actor,
      });
    } catch (error) {
      removeError = error;
    }
    let after;
    try {
      after = await fetchSnapshot({ issueNumber, cfg });
    } catch (error) {
      const restoration = await restorePriorOwner();
      return {
        status: restoration.verified
          ? 'postcondition-unverifiable-restored'
          : 'postcondition-unverifiable-restoration-unverified',
        error: error?.message || String(error),
        state: restoration.snapshot?.state,
        assignees: canonicalLogins(restoration.snapshot?.assignees || []),
      };
    }
    if (removeError) {
      const afterOwners = canonicalLogins(after.assignees);
      const restoration = afterOwners.includes(actor)
        ? { verified: true, snapshot: after }
        : await restorePriorOwner();
      return {
        status: restoration.verified
          ? 'assignee-removal-ambiguous-restored'
          : 'assignee-removal-ambiguous-restoration-unverified',
        error: removeError?.message || String(removeError),
        state: restoration.snapshot?.state || after.state,
        assignees: canonicalLogins(restoration.snapshot?.assignees || after.assignees),
      };
    }
    if (after.state !== before.state) {
      const restoration = await restorePriorOwner();
      const restored = restoration.snapshot;
      return {
        status:
          restored?.state === after.state && restoration.verified
            ? 'status-drift-restored'
            : 'status-drift-restoration-unverified',
        state: restored?.state || after.state,
        assignees: canonicalLogins(restored?.assignees || after.assignees),
      };
    }
    const finalOwners = canonicalLogins(after.assignees);
    if (finalOwners.length !== 0) {
      return { status: 'postcondition-refused', state: after.state, assignees: finalOwners };
    }
    try {
      await postAudit({
        issueNumber,
        repo: cfg.repo,
        from: actor,
        to: 'unassigned',
        state: before.state,
        phase: 'completed',
      });
    } catch (error) {
      return {
        status: 'unassigned-audit-pending',
        state: before.state,
        assignees: [],
        error: error?.message || String(error),
      };
    }
    return { status: 'unassigned', state: before.state, assignees: [] };
  });
}

export async function verbUnassign(rest, cfg, deps = {}) {
  const usage = 'Usage: unassign <N>';
  let parsed;
  try {
    parsed = parseStrict(rest, { positionals: { min: 1, max: 1 }, usage });
  } catch (error) {
    if (!(error instanceof StrictArgvError)) throw error;
    process.stderr.write(`${error.message}\n${usage}\n`);
    process.exitCode = 2;
    return;
  }
  const issue = String(parsed.positionals[0]).match(/^#?(\d+)$/);
  if (!issue) {
    process.stderr.write(`issue must be a positive number\n${usage}\n`);
    process.exitCode = 2;
    return;
  }
  const issueNumber = Number(issue[1]);
  const assertBound = deps.assertBound || assertBoundToIssue;
  assertBound(issueNumber);
  const resolveLogin = deps.resolveLogin || defaultResolveLogin;
  const currentUser = canonicalLogin(await resolveLogin('@me'));
  const result = await runUnassign({ issueNumber, cfg, currentUser, deps });
  if (['unassigned', 'already-unassigned'].includes(result.status)) {
    process.stdout.write(
      `unassign: #${issueNumber} ${result.status}; Status ${result.state || 'unchanged'}\n`
    );
    return;
  }
  process.stderr.write(`unassign: refused (${result.status})\n`);
  process.exitCode = 10;
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
  await verbUnassign(process.argv.slice(2), loadConfig());
}
