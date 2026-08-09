// @story #1165
// Operator-facing execution-context guard. Project-dir resolution redirects
// governed reads to the issue-bound worktree; this guard additionally refuses
// a CLI launched from a different checkout so the operator's edits, tests, and
// Git commands cannot silently remain in the foreign tree.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { getActiveTask } from '../session-state.mjs';
import { currentSessionId } from '../word-counter.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
import { BoundWorktreeMissingError, resolveProjectDir } from './project-dir.mjs';
import { resolveWorktreeBinding } from './worktree-binding.mjs';

const pexec = promisify(execFile);

const ISSUE_TARGET_VERBS = new Set([
  'ac-stamp',
  'approve',
  'board',
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
  'log',
  'mirror-deep-dive',
  'next',
  'park',
  'plan',
  'plan-approve',
  'plan-estimate',
  'promote',
  'pull-next',
  'reconcile',
  'refine',
  'reject',
  'resume',
  'review',
  'start',
  'stop',
  'supersede',
  'test',
  'update',
]);

export class ForeignWorktreeBindingError extends Error {
  constructor({ issueNumber, bound, invoking }) {
    const issue = issueNumber ? `#${issueNumber}` : 'the active issue';
    const correctiveCd = shellQuote(bound.worktreePath);
    super(
      `AITM worktree binding mismatch for ${issue}.\n` +
        `  Bound worktree: ${bound.worktreePath} (${bound.worktreeBranch})\n` +
        `  Invoking worktree: ${invoking.worktreePath} (${invoking.worktreeBranch})\n` +
        `  Run: cd ${correctiveCd}\n` +
        'Refusing before task state access. Re-run with --allow-foreign-worktree only for an explicit, audited exception.'
    );
    this.name = 'ForeignWorktreeBindingError';
    this.issueNumber = issueNumber;
    this.bound = bound;
    this.invoking = invoking;
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}

function issueNumberFromVerb({ verb, rest }) {
  if (!ISSUE_TARGET_VERBS.has(verb)) return null;
  const match = (rest || []).find((arg) => /^#?\d+$/.test(String(arg)));
  return match == null ? null : Number(String(match).replace(/^#/, ''));
}

function issueNumberFromBoundDir(boundDir) {
  const sid = currentSessionId();
  const ref = getActiveTask(sid, boundDir)?.issue;
  const match = String(ref || '').match(/^#(\d+)$/);
  return match ? Number(match[1]) : null;
}

function auditBody({ issueNumber, verb, bound, invoking }) {
  return [
    '### AITM Foreign-Worktree Override Audit',
    '',
    `- Issue: #${issueNumber}`,
    `- Verb: \`${verb}\``,
    `- Bound worktree: \`${bound.worktreePath}\` (\`${bound.worktreeBranch}\`)`,
    `- Invoking worktree: \`${invoking.worktreePath}\` (\`${invoking.worktreeBranch}\`)`,
    `- Recorded at: ${new Date().toISOString()}`,
    '',
    '`--allow-foreign-worktree` was supplied explicitly for this invocation.',
  ].join('\n');
}

async function postForeignWorktreeAudit({ issueNumber, verb, cfg, bound, invoking }) {
  if (!issueNumber) {
    throw new Error(
      'foreign-worktree override refused: no bound issue number is available for the audit record'
    );
  }
  if (!cfg?.repo) {
    throw new Error('foreign-worktree override refused: repository is unavailable for audit');
  }
  await pexec(
    'gh',
    [
      'issue',
      'comment',
      String(issueNumber),
      '-R',
      cfg.repo,
      '--body',
      auditBody({ issueNumber, verb, bound, invoking }),
    ],
    { timeout: GH_API_TIMEOUT_MS }
  );
}

export function parseForeignWorktreeOverride(argv = []) {
  let allowForeignWorktree = false;
  const clean = [];
  for (const arg of argv) {
    if (arg === '--allow-foreign-worktree') {
      allowForeignWorktree = true;
      continue;
    }
    clean.push(arg);
  }
  return { argv: clean, allowForeignWorktree };
}

export async function enforceVerbWorktreeBinding({
  verb,
  rest = [],
  cfg,
  invokingDir = process.cwd(),
  allowForeignWorktree = false,
  deps = {},
} = {}) {
  const resolveBinding = deps.resolveBinding || resolveWorktreeBinding;
  const resolveBoundDir = deps.resolveBoundDir || resolveProjectDir;
  const resolveBoundIssue = deps.resolveBoundIssue || issueNumberFromBoundDir;
  const postAudit = deps.postAudit || postForeignWorktreeAudit;
  const explicitIssueNumber = issueNumberFromVerb({ verb, rest });

  let boundDir;
  try {
    boundDir = resolveBoundDir({
      issue: explicitIssueNumber,
      deps: { invokingDir },
    });
  } catch (error) {
    if (error instanceof BoundWorktreeMissingError) return { status: 'unbound' };
    throw error;
  }

  const invoking = resolveBinding({ projectDir: invokingDir });
  const bound = resolveBinding({ projectDir: boundDir });
  if (invoking.worktreePath === bound.worktreePath) {
    return { status: 'matched', bound, invoking };
  }

  const issueNumber = explicitIssueNumber || resolveBoundIssue(bound.worktreePath);
  if (!allowForeignWorktree) {
    throw new ForeignWorktreeBindingError({ issueNumber, bound, invoking });
  }

  await postAudit({ issueNumber, verb, cfg, bound, invoking });
  return { status: 'override-audited', issueNumber, bound, invoking };
}
