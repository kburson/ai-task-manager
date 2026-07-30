// #219 — Assignee guard for state-mutating verbs.
//
// `checkAssigneeMatch` is a pure core: given an issue number + cfg + injected
// fetchers, it returns one of three verdicts:
//
//   ok:                  current `gh` user is in the issue's assignees.
//   assigned-to-other:   non-empty assignees, current user absent — refuse.
//   unassigned:          assignees list is empty — refuse ("dropped on floor").
//
// All network I/O is injected. When the preference `gateAssigneeMatch=false`,
// or env `TT_SKIP_NETWORK=1`, the caller should skip invoking this entirely;
// the guard itself doesn't read those gates — it stays pure.
//
// `fetchCurrentUser` is memoized via the `deps.cache` object the caller
// threads through, so a verb that runs the guard once per process does a
// single `gh api user` lookup.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WorkLeaseError } from '@kburson/aitm-ledger';
import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
import { ISSUE_ID_GLOBAL_RE } from './commit-attribution-format.mjs';

const pexec = promisify(execFile);

export const EXIT_ASSIGNEE_MISMATCH = 10;

async function defaultFetchAssignees({ issueNumber, repo }) {
  const { owner, repoName } = splitRepo(repo);
  const data = await gql(
    `query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) {
          assignees(first: 20) { nodes { login } }
        }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  const nodes = data?.repository?.issue?.assignees?.nodes ?? [];
  return nodes.map((n) => n.login).filter(Boolean);
}

async function defaultFetchCurrentUser() {
  const { stdout } = await pexec('gh', ['api', 'user', '--jq', '.login'], {
    timeout: GH_API_TIMEOUT_MS,
  });
  return String(stdout).trim();
}

// The ONLY assignment mutation the AI is ever permitted to perform: claim an
// unassigned issue for the authenticated user. `@me` resolves to the same
// login `defaultFetchCurrentUser` reads, so a claim and a subsequent check
// agree. Label/assignee edits are not body writes, so they pass the bash guard.
async function defaultAddAssignee({ issueNumber, repo }) {
  await pexec('gh', ['issue', 'edit', String(issueNumber), '-R', repo, '--add-assignee', '@me'], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

async function defaultPostComment({ issueNumber, repo, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

export { defaultPostComment };

async function defaultListComments({ issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'comments'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  const parsed = JSON.parse(stdout || '{}');
  return Array.isArray(parsed.comments) ? parsed.comments : [];
}

export async function checkAssigneeMatch({ issueNumber, cfg, deps = {} } = {}) {
  if (!issueNumber) throw new Error('checkAssigneeMatch: issueNumber is required');
  if (!cfg) throw new Error('checkAssigneeMatch: cfg is required');

  const fetchAssignees = deps.fetchAssignees || defaultFetchAssignees;
  const fetchCurrentUser = deps.fetchCurrentUser || defaultFetchCurrentUser;
  const cache = deps.cache || {};

  let currentUser = cache.currentUser;
  if (!currentUser) {
    currentUser = await fetchCurrentUser();
    cache.currentUser = currentUser;
  }
  currentUser = String(currentUser || '').toLowerCase();

  const assignees = (await fetchAssignees({ issueNumber, repo: cfg.repo })) || [];
  const lower = assignees.map((a) => String(a).toLowerCase());

  if (lower.length === 0) {
    return { ok: false, kind: 'unassigned', currentUser, assignees };
  }
  if (!lower.includes(currentUser)) {
    return { ok: false, kind: 'assigned-to-other', currentUser, assignees };
  }
  return { ok: true, currentUser, assignees };
}

// Read-only bind eligibility. Full-Auto may proceed to acquire a work lease
// for an unassigned issue, but assignment remains a deferred projection:
// callers must run claimAssignee only after authority acquisition succeeds.
// This function performs fetches only and never invokes mutation dependencies.
export async function readOnlyBindEligibility({
  issueNumber,
  cfg,
  fullAuto = false,
  deps = {},
} = {}) {
  const verdict = await checkAssigneeMatch({ issueNumber, cfg, deps });
  if (verdict.ok) {
    return {
      ...verdict,
      kind: 'assigned-to-current',
      claimRequired: false,
    };
  }
  if (verdict.kind === 'unassigned' && fullAuto) {
    return {
      ...verdict,
      ok: true,
      claimRequired: true,
    };
  }
  return {
    ...verdict,
    claimRequired: false,
  };
}

export function formatAssigneeRefusal({ verb, issueNumber, verdict }) {
  const issue = `#${issueNumber}`;
  const cmd = `gh issue edit ${issueNumber} --add-assignee @me`;
  const disableHint = `  To disable for solo workflows: set "preferences.gateAssigneeMatch": false in .claude/task-tracker.json.`;
  if (verdict.kind === 'unassigned') {
    return [
      `⛔ Refusing /task ${verb}: ${issue} has no assignees.`,
      `  Even unassigned tickets require a sync conversation — someone may be working on this off-board.`,
      `  Confer with the team, then run \`${cmd}\` to claim it.`,
      disableHint,
    ].join('\n');
  }
  const others = verdict.assignees.join(', ');
  return [
    `⛔ Refusing /task ${verb}: ${issue} is assigned to ${others}, not @${verdict.currentUser}.`,
    `  Confer with the assignee(s) and sync WIP (branch, in-flight changes, blockers) before requesting reassignment.`,
    `  After the conversation, run \`${cmd}\` to claim it, then retry.`,
    disableHint,
  ].join('\n');
}

export function formatAssigneePromptLine({ issueNumber, verdict }) {
  const list = verdict.assignees.join(',');
  return `PROMPT_REQUIRED: assignee-mismatch #${issueNumber} ${verdict.kind} ${list}`;
}

// #769 — the assignee lock must not open on a transient `gh` failure. When the
// assignee list cannot be fetched, callers refuse (fail CLOSED) with this
// message instead of assuming ownership. The two documented escapes cover the
// legitimate offline cases.
export function formatAssigneeUnverifiable({ verb, issueNumber, error }) {
  const detail = error ? ` (${error})` : '';
  return [
    `⛔ Refusing /task ${verb}: could not verify the assignee of #${issueNumber}${detail}.`,
    `  The assignee is a work-lock; with the lock unverifiable this fails CLOSED rather than`,
    `  assuming ownership. Retry when \`gh\` connectivity is restored.`,
    `  Offline escapes: set "preferences.gateAssigneeMatch": false in .claude/task-tracker.json,`,
    `  or run with TT_SKIP_NETWORK=1 for a genuinely offline session.`,
  ].join('\n');
}

// #769 — audit trail written to the issue when Full-Auto auto-claims an
// unassigned issue. Mirrors the existing `aitm-full-auto-*` audit discipline so
// the machine-driven assignment is visible and greppable.
function claimAuditProjectionMarker(projectionId) {
  if (typeof projectionId !== 'string' || projectionId.trim() === '') {
    throw new TypeError('claim audit projectionId is required');
  }
  return `<!-- aitm-full-auto-assignee-claim-projection id-b64="${Buffer.from(
    projectionId,
    'utf8'
  ).toString('base64url')}" -->`;
}

export function formatClaimAuditComment({ verb, issueNumber, currentUser, projectionId }) {
  const who = currentUser ? `@${currentUser}` : 'the authenticated `gh` user';
  return [
    '### 🤖 Full-Auto assignee claim',
    '',
    `\`#${issueNumber}\` was **unassigned**; \`TT_FULL_AUTO=1\` auto-claimed it for ${who}`,
    `(\`gh issue edit ${issueNumber} --add-assignee @me\`) so \`/task ${verb}\` could proceed.`,
    '',
    'Only the unassigned→me claim is automated. An issue already assigned to another',
    'developer is never reassigned by the AI — a human must transfer the lock via the',
    'GitHub UI.',
    '',
    '<!-- aitm-full-auto-assignee-claim -->',
    ...(projectionId ? [claimAuditProjectionMarker(projectionId)] : []),
  ].join('\n');
}

export async function reconcileClaimAuditProjection({
  issueNumber,
  repo,
  projectionId,
  body,
  listComments = defaultListComments,
  postComment = defaultPostComment,
} = {}) {
  if (!issueNumber || !repo) {
    throw new TypeError('claim audit projection issue and repo are required');
  }
  const marker = claimAuditProjectionMarker(projectionId);
  if (typeof body !== 'string' || !body.includes(marker)) {
    throw new TypeError('claim audit projection body does not match its identity');
  }
  const matching = (comments) =>
    comments.filter((comment) => String(comment?.body ?? '').includes(marker));
  let comments = await listComments({ issueNumber, repo });
  let matches = matching(comments);
  if (matches.length > 1) {
    throw new Error('duplicate claim audit projection receipts');
  }
  if (matches.length === 0) {
    await postComment({ issueNumber, repo, body });
    comments = await listComments({ issueNumber, repo });
    matches = matching(comments);
  }
  if (matches.length !== 1 || matches[0].body !== body) {
    throw new Error('claim audit projection remote read-back does not match');
  }
  return { reconciled: true, projectionId };
}

// #769 — the single chokepoint for the "only permitted AI assignment"
// invariant. Re-fetches the live assignee list and refuses to touch an issue
// that already has ANY assignee, so the AI can only ever go unassigned→me and
// structurally never other→me (AC2). Only on an empty assignee list does it run
// the `--add-assignee @me` mutation.
export async function claimAssignee({ issueNumber, cfg, deps = {} } = {}) {
  if (!issueNumber) throw new Error('claimAssignee: issueNumber is required');
  if (!cfg) throw new Error('claimAssignee: cfg is required');

  const fetchAssignees = deps.fetchAssignees || defaultFetchAssignees;
  const addAssignee = deps.addAssignee || defaultAddAssignee;

  const assignees = (await fetchAssignees({ issueNumber, repo: cfg.repo })) || [];
  if (assignees.length > 0) {
    return { ok: false, kind: 'already-assigned', assignees };
  }
  await addAssignee({ issueNumber, repo: cfg.repo });
  return { ok: true, claimed: true, assignees };
}

// Task 5A bind claim reconciler. The caller persists `input` and `projectionId`
// before authority acquisition; this helper never accepts a replacement
// eligibility decision at replay time. A prior response-lost mutation is
// resolved by the same positive @me read-back as a fresh mutation.
export async function reconcilePreparedAssigneeClaim({
  input,
  projectionId,
  liveEligibility,
  deps = {},
} = {}) {
  if (
    !input ||
    typeof input !== 'object' ||
    !String(input.issueNumber || '').match(/^[1-9]\d*$/) ||
    typeof input.repo !== 'string' ||
    !input.repo ||
    typeof input.claimRequired !== 'boolean' ||
    typeof input.currentUser !== 'string' ||
    !input.currentUser ||
    !Array.isArray(input.preparedAssignees) ||
    typeof input.preparedKind !== 'string' ||
    typeof projectionId !== 'string' ||
    !projectionId
  ) {
    throw new TypeError('prepared assignment intent is malformed');
  }
  const fetchAssignees = deps.fetchAssignees || defaultFetchAssignees;
  const addAssignee = deps.addAssignee || defaultAddAssignee;
  const currentUser = input.currentUser.toLowerCase();
  const fetch = async () =>
    ((await fetchAssignees({ issueNumber: input.issueNumber, repo: input.repo })) || []).map((a) =>
      String(a).toLowerCase()
    );

  let assignees = Array.isArray(liveEligibility?.assignees)
    ? liveEligibility.assignees.map((assignee) => String(assignee).toLowerCase())
    : await fetch();
  if (assignees.length === 1 && assignees[0] === currentUser) {
    return {
      reconciled: true,
      projectionName: 'github-claim',
      projectionId,
      assignmentResult: 'assigned-to-current',
      currentUser,
      assignees,
    };
  }
  if (assignees.length > 0) {
    throw new WorkLeaseError(
      'authority-forbidden',
      `foreign assignee prevents prepared assignment intent: ${assignees.join(',')}`
    );
  }
  if (!input.claimRequired) {
    throw new WorkLeaseError(
      'authority-forbidden',
      'live assignee state no longer matches prepared assignment intent'
    );
  }

  try {
    await addAssignee({ issueNumber: input.issueNumber, repo: input.repo });
  } catch {
    // A mutation error may be a response-lost success. The authoritative
    // follow-up read below distinguishes success from failure.
  }
  assignees = await fetch();
  if (assignees.length !== 1 || assignees[0] !== currentUser) {
    if (assignees.length > 0) {
      throw new WorkLeaseError(
        'authority-forbidden',
        `foreign assignee prevents prepared assignment intent: ${assignees.join(',')}`
      );
    }
    throw new WorkLeaseError(
      'authority-forbidden',
      'assignee mutation did not reconcile prepared assignment intent'
    );
  }
  return {
    reconciled: true,
    projectionName: 'github-claim',
    projectionId,
    assignmentResult: 'assigned-to-current',
    currentUser,
    assignees,
  };
}

// #769 — extract the issue ids a commit command attributes to, via its leading
// `[#N]` tokens. Deduped, numeric, order-preserving. A token-less command
// (chore / un-bound commit) yields an empty array — the visible, un-gated
// escape hatch the commit-time seam relies on.
export function parseCommitIssueRefs(command) {
  const ids = [];
  const seen = new Set();
  const src = String(command ?? '');
  for (const m of src.matchAll(ISSUE_ID_GLOBAL_RE)) {
    const n = Number(m[1]);
    if (!seen.has(n)) {
      seen.add(n);
      ids.push(n);
    }
  }
  return ids;
}
