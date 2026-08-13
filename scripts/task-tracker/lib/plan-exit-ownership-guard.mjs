import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { fetchAssignmentSnapshot, exactSingleton } from './assignment-snapshot.mjs';
import { canonicalLogin, ownershipDecision } from './ownership-policy.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';

const pexec = promisify(execFile);

async function defaultFetchCurrentUser() {
  const { stdout } = await pexec('gh', ['api', 'user', '--jq', '.login'], {
    timeout: GH_API_TIMEOUT_MS,
  });
  return String(stdout).trim();
}

async function defaultPostNotice({ issueNumber, repo, currentUser }) {
  const body = [
    '### Full-Auto story ownership claim',
    '',
    `Before moving #${issueNumber} from Plan to Develop, Full-Auto is assigning the story to @${currentUser}, the authenticated owner of this repository clone.`,
    'The assignment will be read back as an exact singleton before lifecycle Status changes.',
    '',
    '<!-- aitm-full-auto-ownership-claim -->',
  ].join('\n');
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

async function defaultMutateAssignee({ issueNumber, repo, action, login }) {
  if (action !== 'add') throw new Error('plan ownership claim supports only add');
  await pexec('gh', ['issue', 'edit', String(issueNumber), '-R', repo, '--add-assignee', login], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

function refusal(reason, blockers = [reason]) {
  return { ok: false, reason, blockers };
}

export async function commitPlanExitOwnershipClaim({
  issueNumber,
  cfg,
  currentUser,
  mode = 'full-auto',
  deps = {},
} = {}) {
  const expectedUser = canonicalLogin(currentUser);
  const fetchCurrentUser = deps.fetchCurrentUser || defaultFetchCurrentUser;
  const fetchSnapshot = deps.fetchSnapshot || fetchAssignmentSnapshot;
  const postNotice = deps.postNotice || defaultPostNotice;
  const mutateAssignee = deps.mutateAssignee || defaultMutateAssignee;

  let before;
  let user;
  try {
    user = canonicalLogin(await fetchCurrentUser());
    before = await fetchSnapshot({ issueNumber, cfg });
  } catch (error) {
    return refusal(
      `plan-develop-claim-unverifiable: ownership could not be revalidated under lock (${error?.message || String(error)})`
    );
  }
  if (!user || user !== expectedUser) {
    return refusal(
      `plan-develop-identity-changed: authenticated owner changed from @${expectedUser || 'unverifiable'} to @${user || 'unverifiable'} during transition`
    );
  }
  if (before.state !== 'plan') {
    return refusal(
      `plan-develop-claim-revalidation-refused: expected Status plan under lock; observed ${before.state || 'unknown'}`
    );
  }
  const decision = ownershipDecision({
    state: before.state,
    transition: 'develop',
    assignees: before.assignees,
    currentUser: user,
    mode,
  });
  if (decision.ok) return { ok: true };
  if (decision.kind === 'assignment-required') {
    return refusal(
      `plan-develop-assignment-required: #${issueNumber} is unassigned; would you like me to assign it to @${user}?`
    );
  }
  if (decision.kind !== 'claim-at-commitment') {
    return refusal(
      `plan-develop-claim-revalidation-refused: expected unassigned Plan or singleton @${user}; observed Status ${before.state || 'unknown'} and ${decision.owners.length ? decision.owners.map((owner) => `@${owner}`).join(', ') : 'no owners'}`
    );
  }

  try {
    await postNotice({ issueNumber, repo: cfg.repo, currentUser: user });
  } catch (error) {
    return refusal(
      `plan-develop-claim-notice-failed: ownership was not mutated (${error?.message || String(error)})`
    );
  }

  let mutationError = null;
  try {
    await mutateAssignee({ issueNumber, repo: cfg.repo, action: 'add', login: user });
  } catch (error) {
    mutationError = error;
  }

  let after;
  try {
    after = await fetchSnapshot({ issueNumber, cfg });
  } catch (error) {
    return refusal(
      `plan-develop-claim-ambiguous: final ownership is unreadable (${error?.message || String(error)})`
    );
  }
  if (mutationError) {
    return refusal(
      `plan-develop-claim-ambiguous: assignment transport failed and no success is inferred from read-back (${mutationError?.message || String(mutationError)})`
    );
  }
  if (after.state !== 'plan' || !exactSingleton(after, user)) {
    return refusal(
      `plan-develop-claim-postcondition-refused: expected Status plan and singleton @${user}`
    );
  }
  return { ok: true };
}

export const planExitOwnershipGuard = Object.freeze({
  id: 'plan-exit-ownership',
  async run(ctx = {}) {
    if (ctx.fromState !== 'plan' || ctx.toState !== 'develop') return { ok: true };
    const ownership = ctx.deps?.ownership || {};
    const fetchCurrentUser = ownership.fetchCurrentUser || defaultFetchCurrentUser;
    const fetchSnapshot = ownership.fetchSnapshot || fetchAssignmentSnapshot;
    const env = ctx.deps?.env || process.env;

    let currentUser;
    let before;
    try {
      currentUser = canonicalLogin(await fetchCurrentUser());
      before = await fetchSnapshot({ issueNumber: ctx.issueNumber, cfg: ctx.cfg });
    } catch (error) {
      return refusal(
        `plan-develop-ownership-unverifiable: could not verify exclusive story ownership (${error?.message || String(error)})`
      );
    }
    if (before.state !== 'plan') {
      return refusal(
        `plan-develop-state-refused: expected Status plan; observed ${before.state || 'unknown'}`
      );
    }
    const decision = ownershipDecision({
      state: before.state,
      transition: 'develop',
      assignees: before.assignees,
      currentUser,
      mode: env.TT_FULL_AUTO === '1' ? 'full-auto' : 'interactive',
    });
    if (decision.ok) {
      ctx.planExitOwnershipClaim = {
        currentUser,
        mode: env.TT_FULL_AUTO === '1' ? 'full-auto' : 'interactive',
      };
      return { ok: true };
    }
    if (decision.kind === 'assignment-required') {
      return refusal(
        `plan-develop-assignment-required: #${ctx.issueNumber} is unassigned; would you like me to assign it to @${currentUser}?`
      );
    }
    if (decision.kind !== 'claim-at-commitment') {
      return refusal(
        `plan-develop-${decision.kind}: expected exactly one owner @${currentUser}; observed ${decision.owners.length ? decision.owners.map((owner) => `@${owner}`).join(', ') : 'none'}`
      );
    }
    ctx.planExitOwnershipClaim = {
      currentUser,
      mode: env.TT_FULL_AUTO === '1' ? 'full-auto' : 'interactive',
    };
    return { ok: true };
  },
});
