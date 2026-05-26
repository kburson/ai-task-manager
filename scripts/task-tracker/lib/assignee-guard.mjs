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
import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';

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
