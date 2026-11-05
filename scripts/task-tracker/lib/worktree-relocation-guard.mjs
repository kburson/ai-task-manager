// @story #1191
// Durable re-engagement guard. It compares the issue's append-only location
// history with the invoking checkout before local task state or verb preflight
// is allowed to govern the command.

import { pexec } from '../../gh/lib/gh-client.mjs';

import { mutateIssueBody as defaultMutateIssueBody } from './issue-body-mutate.mjs';
import {
  mostRecentIssueWorktreeLocation,
  recordIssueWorktreeLocationOnChange,
  sameIssueWorktreeLocation,
} from './issue-worktree-location.mjs';
import { readWorktreeIdentity } from './worktree-binding-guard.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
import { currentIssueLockOwner, withIssueLock } from '../issue-mutator-lock.mjs';

const LOCATION_GUARDED_VERBS = new Set([
  'ac-stamp',
  'approve',
  'block',
  'check',
  'close',
  'commit-trace',
  'comment',
  'demote',
  'dod-stamp',
  'end',
  'ensureChecked',
  'ensureUnchecked',
  'evidence-markers',
  'kind',
  'issue-body',
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
  // Start/resume consume their first positional argument; other numbers can be option values.
  const candidates = isBindVerb(verb) ? (rest || []).slice(0, 1) : rest || [];
  const target = candidates.find((arg) => /^#?\d+$/.test(String(arg)));
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
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  const { body } = JSON.parse(stdout);
  if (typeof body !== 'string') throw new Error('location authority: issue body unreadable');
  return body;
}

async function writeLocation({
  issueNumber,
  repo,
  entry,
  confirmRelocation,
  validateFreshBaseAsync,
  fetchBody,
  deps,
}) {
  const mutateIssueBody = deps.mutateIssueBody || defaultMutateIssueBody;
  await mutateIssueBody({
    issueNumber,
    repo,
    deps: { pexec, fetchBody },
    validateFreshBaseAsync,
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
  allowForeignWorktree = false,
  renewal = null,
  observeRenewal,
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
  const readCurrentBody = () => getBody({ issueNumber: target.issueNumber, repo: cfg.repo });
  const body = await readCurrentBody();
  const recorded = mostRecentIssueWorktreeLocation(body);
  const bind = isBindVerb(verb);

  const matched = recorded && sameIssueWorktreeLocation(recorded, live);
  if (matched && !bind) {
    return { status: 'matched', issueNumber: target.issueNumber, recorded, live };
  }
  if (recorded && !matched && !confirmRelocation) {
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
  if (!recorded && !bind) {
    return { status: 'unrecorded', issueNumber: target.issueNumber, live };
  }

  const { readLocationMutationAuthority, assertLocationMutationAuthority } =
    await import('./location-mutation-authority.mjs');
  const readAuthority = deps.readAuthority ?? readLocationMutationAuthority;
  const context = {
    issueNumber: target.issueNumber,
    verb,
    rest,
    cfg,
    invokingDir,
    bind,
    allowForeignWorktree,
    renewal,
    deps,
  };
  const authority = await readAuthority({ ...context, body });
  if (!sameIssueWorktreeLocation(live, authority.live)) {
    throw new Error('location authority changed after entry observation');
  }
  if (matched) {
    const fresh = await readAuthority({ ...context, body, observeRenewal });
    assertLocationMutationAuthority(authority, fresh);
    return { status: 'matched', issueNumber: target.issueNumber, recorded, live };
  }
  const now = deps.now || (() => new Date().toISOString());
  const entry = { ...authority.live, sessionId: authority.actor.sid, ts: now() };
  const lock = deps.withIssueLock ?? withIssueLock;
  const assertOwner = () => {
    const owner = (deps.currentIssueLockOwner ?? currentIssueLockOwner)(target.issueNumber);
    if (!owner || owner.projDir !== authority.mainRoot || owner.sessionId !== entry.sessionId) {
      throw new Error('location authority: physical issue lock ownership required');
    }
  };
  await lock(
    {
      issue: target.issueNumber,
      verb: 'worktree-location',
      projDir: authority.live.worktreePath,
      sessionId: entry.sessionId,
    },
    () => {
      assertOwner();
      return writeLocation({
        issueNumber: target.issueNumber,
        repo: cfg.repo,
        entry,
        confirmRelocation,
        fetchBody: readCurrentBody,
        deps,
        async validateFreshBaseAsync(base, next, rawBody) {
          const fresh = await readAuthority({
            ...context,
            body: rawBody,
            observeRenewal,
          });
          assertLocationMutationAuthority(authority, fresh);
          assertOwner();
          if (recordIssueWorktreeLocationOnChange(base, entry).body !== next) {
            throw new Error('location authority: retry no longer represents the authorized append');
          }
        },
      });
    }
  );
  return {
    status: recorded ? 'relocated' : 'recorded',
    issueNumber: target.issueNumber,
    recorded,
    live,
  };
}
