// #219 / #1212 — Lifecycle-aware exclusive ownership adapter for governed
// boundaries.
//
// `checkAssigneeMatch` fetches identity/assignees and delegates all decisions
// to ownership-policy.mjs. Early lifecycle work may be unassigned; Develop+
// requires exactly one case-insensitively matching local owner; foreign,
// multiple, unknown, and unreadable ownership fail closed.
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
import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
import { ISSUE_ID_GLOBAL_RE } from './commit-attribution-format.mjs';
import { ownershipDecision } from './ownership-policy.mjs';

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

export async function checkAssigneeMatch({ issueNumber, cfg, state = 'develop', deps = {} } = {}) {
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
  const decision = ownershipDecision({
    state,
    assignees,
    currentUser,
    mode: 'interactive',
  });
  return {
    ...decision,
    assignees: decision.owners,
  };
}

export function formatAssigneeRefusal({ verb, issueNumber, verdict }) {
  const issue = `#${issueNumber}`;
  if (verdict.kind === 'team-unassigned') {
    return [
      `⛔ Refusing /task ${verb}: ${issue} has no assignees.`,
      `  Assign it with \`npx aitm assign ${issueNumber} --to @me\` before entering Develop.`,
    ].join('\n');
  }
  if (verdict.kind === 'human-coordination-required') {
    return [
      `⛔ Refusing /task ${verb}: ${issue} is in flight but has no story owner.`,
      `  Work cannot progress until the story is assigned to @${verdict.currentUser} for this workspace,`,
      `  or transferred to another owner and continued from that owner's workstation.`,
      `  Full-Auto does not reclaim ownership after development has begun.`,
    ].join('\n');
  }
  if (verdict.kind === 'multiple-owners') {
    return [
      `⛔ Refusing /task ${verb}: ${issue} has multiple story owners (${verdict.assignees.join(', ')}).`,
      `  AITM development collateral belongs to exactly one workstation owner. Transfer to one owner before continuing.`,
    ].join('\n');
  }
  const others = verdict.assignees.join(', ');
  return [
    `⛔ Refusing /task ${verb}: ${issue} is assigned to ${others}, not @${verdict.currentUser}.`,
    `  Confer with the assignee(s) and sync WIP (branch, in-flight changes, blockers) before requesting reassignment.`,
    `  After the conversation, use \`npx aitm transfer ${issueNumber} --to @${verdict.currentUser}\`, then retry.`,
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
    `  Retry when GitHub connectivity is restored; TT_SKIP_NETWORK=1 remains the explicit`,
    `  genuinely-offline escape for non-network work.`,
  ].join('\n');
}

// #769 — audit trail written to the issue when Full-Auto auto-claims an
// unassigned issue. Mirrors the existing `aitm-full-auto-*` audit discipline so
// the machine-driven assignment is visible and greppable.
export function formatClaimAuditComment({ verb, issueNumber, currentUser }) {
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
  ].join('\n');
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
