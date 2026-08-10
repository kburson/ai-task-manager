// @story #1191
// Durable re-engagement guard. It compares the issue's append-only location
// history with the invoking checkout before local task state or verb preflight
// is allowed to govern the command.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { mutateIssueBody as defaultMutateIssueBody } from './issue-body-mutate.mjs';
import {
  mostRecentIssueWorktreeLocation,
  recordIssueWorktreeLocationOnChange,
  sameIssueWorktreeLocation,
} from './issue-worktree-location.mjs';
import { readWorktreeIdentity } from './worktree-binding-guard.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
import { currentSessionId } from '../word-counter.mjs';

const pexec = promisify(execFile);

const LOCATION_GUARDED_VERBS = new Set([
  'ac-stamp',
  'approve',
  'block',
  'check',
  'close',
  'commit-trace',
  'demote',
  'dod-stamp',
  'end',
  'ensureChecked',
  'ensureUnchecked',
  'evidence-markers',
  'kind',
  'next',
  'park',
  'plan',
  'plan-approve',
  'plan-estimate',
  'promote',
  'refine',
  'reject',
  'resume',
  'review',
  'start',
  'stop',
  'supersede',
  'test',
  'unblock',
  'update',
]);

export class WorktreeRelocationRequiredError extends Error {
  constructor({ issueNumber, recorded, live }) {
    super(
      `AITM worktree relocation confirmation required for #${issueNumber}.\n` +
        `  Recorded location: ${recorded.worktreePath} (${recorded.worktreeBranch})\n` +
        `  Live location: ${live.worktreePath} (${live.worktreeBranch})\n` +
        'No task state or lifecycle mutation was performed. Re-run the same command with --confirm-relocation to append the new location and continue.'
    );
    this.name = 'WorktreeRelocationRequiredError';
    this.issueNumber = issueNumber;
    this.recorded = recorded;
    this.live = live;
  }

  get promptToken() {
    return `PROMPT_REQUIRED: worktree-relocation #${this.issueNumber}`;
  }
}

export function parseWorktreeRelocationConfirmation(argv = []) {
  let confirmRelocation = false;
  const clean = [];
  for (const arg of argv) {
    if (arg === '--confirm-relocation') {
      confirmRelocation = true;
      continue;
    }
    clean.push(arg);
  }
  return { argv: clean, confirmRelocation };
}

function issueNumberFromVerb({ verb, rest }) {
  const shorthand = String(verb || '').match(/^#(\d+)$/);
  if (shorthand) return { applicable: true, issueNumber: Number(shorthand[1]) };
  if (!LOCATION_GUARDED_VERBS.has(verb)) return { applicable: false, issueNumber: null };
  const target = (rest || []).find((arg) => /^#?\d+$/.test(String(arg)));
  return {
    applicable: true,
    issueNumber: target == null ? null : Number(String(target).replace(/^#/, '')),
  };
}

function isBindVerb(verb) {
  return /^#\d+$/.test(String(verb || '')) || verb === 'start' || verb === 'resume';
}

async function fetchIssueBody({ issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return stdout;
}

async function writeLocation({ issueNumber, repo, entry, confirmRelocation, deps }) {
  const mutateIssueBody = deps.mutateIssueBody || defaultMutateIssueBody;
  await mutateIssueBody({
    issueNumber,
    repo,
    deps: { pexec },
    mutate(base) {
      const recorded = mostRecentIssueWorktreeLocation(base);
      if (recorded && !sameIssueWorktreeLocation(recorded, entry) && !confirmRelocation) {
        throw new WorktreeRelocationRequiredError({ issueNumber, recorded, live: entry });
      }
      return recordIssueWorktreeLocationOnChange(base, entry).body;
    },
  });
}

export async function enforceIssueWorktreeLocation({
  verb,
  rest = [],
  cfg,
  invokingDir = process.cwd(),
  confirmRelocation = false,
  deps = {},
} = {}) {
  const target = issueNumberFromVerb({ verb, rest });
  if (!target.applicable) return { status: 'not-applicable' };
  if (!target.issueNumber || !cfg?.repo) return { status: 'unbound' };
  const env = deps.env || process.env;
  if (env.TT_SKIP_NETWORK === '1') return { status: 'network-skipped' };

  const resolveIdentity = deps.resolveIdentity || readWorktreeIdentity;
  const live = resolveIdentity({ projectDir: invokingDir });
  const getBody = deps.fetchIssueBody || fetchIssueBody;
  const body = await getBody({ issueNumber: target.issueNumber, repo: cfg.repo });
  const recorded = mostRecentIssueWorktreeLocation(body);

  if (recorded && sameIssueWorktreeLocation(recorded, live)) {
    return { status: 'matched', issueNumber: target.issueNumber, recorded, live };
  }
  if (recorded && !confirmRelocation) {
    throw new WorktreeRelocationRequiredError({
      issueNumber: target.issueNumber,
      recorded,
      live,
    });
  }
  // Legacy issues acquire their initial durable location at bind. A later verb
  // that is invoked without the required bind may still run its existing
  // semantic preflight, but this entry guard must not mutate the body before
  // that preflight decides whether the verb itself is permitted.
  if (!recorded && !isBindVerb(verb)) {
    return { status: 'unrecorded', issueNumber: target.issueNumber, live };
  }

  const sessionIdProvider = deps.sessionId || currentSessionId;
  let sessionId = '';
  try {
    sessionId = sessionIdProvider() || '';
  } catch {
    sessionId = '';
  }
  const now = deps.now || (() => new Date().toISOString());
  const entry = { ...live, sessionId, ts: now() };
  await writeLocation({
    issueNumber: target.issueNumber,
    repo: cfg.repo,
    entry,
    confirmRelocation,
    deps,
  });
  return {
    status: recorded ? 'relocated' : 'recorded',
    issueNumber: target.issueNumber,
    recorded,
    live,
  };
}
