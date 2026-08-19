// @story #1165
// cspell:ignore commondir
// Operator-facing execution-context guard. Project-dir resolution redirects
// governed reads to the issue-bound worktree; this guard additionally refuses
// a CLI launched from a different checkout so the operator's edits, tests, and
// Git commands cannot silently remain in the foreign tree.

import { execFile } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { getActiveTask } from '../session-state.mjs';
import { currentSessionId } from '../word-counter.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
import { BoundWorktreeMissingError, resolveProjectDir } from './project-dir.mjs';
import { fleetRegistryPath, readFleet } from '../fleet-registry.mjs';
import { isBindingRecordClosed, readClosedBindingLedger } from './worktree-binding-lifecycle.mjs';

const pexec = promisify(execFile);

const ISSUE_TARGET_VERBS = new Set([
  'ac-stamp',
  'approve',
  'board',
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
        `  If ${issue} is already closed: cd ${correctiveCd} && npx aitm fleet release-closed-binding ${issue}\n` +
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

function locateWorktreeMetadata(projectDir) {
  let cursor = path.resolve(projectDir);
  const root = path.parse(cursor).root;
  while (true) {
    const marker = path.join(cursor, '.git');
    if (existsSync(marker)) {
      let gitDir = marker;
      if (!statSync(marker).isDirectory()) {
        const declaration = readFileSync(marker, 'utf8').trim();
        const match = declaration.match(/^gitdir:\s*(.+)$/i);
        if (!match) throw new Error(`Malformed Git worktree marker at ${marker}`);
        gitDir = path.resolve(cursor, match[1]);
      }
      return { worktreePath: realpathSync(cursor), gitDir };
    }
    if (cursor === root) break;
    cursor = path.dirname(cursor);
  }
  throw new Error(`Unable to locate Git worktree metadata from ${projectDir}`);
}

export function readWorktreeIdentity({ projectDir }) {
  const metadata = locateWorktreeMetadata(projectDir);
  const head = readFileSync(path.join(metadata.gitDir, 'HEAD'), 'utf8').trim();
  const ref = head.match(/^ref:\s*refs\/heads\/(.+)$/);
  return {
    worktreePath: metadata.worktreePath,
    worktreeBranch: ref ? ref[1] : 'HEAD',
  };
}

function mainWorktreePathFromMetadata(projectDir) {
  const metadata = locateWorktreeMetadata(projectDir);
  if (statSync(path.join(metadata.worktreePath, '.git')).isDirectory()) {
    return metadata.worktreePath;
  }
  const commonDeclaration = path.join(metadata.gitDir, 'commondir');
  if (!existsSync(commonDeclaration)) return metadata.worktreePath;
  const commonDir = path.resolve(metadata.gitDir, readFileSync(commonDeclaration, 'utf8').trim());
  return path.basename(commonDir) === '.git' ? path.dirname(commonDir) : metadata.worktreePath;
}

export function resolveCurrentSessionWorktreeBinding({
  invokingDir = process.cwd(),
  deps = {},
} = {}) {
  const sessionId = deps.sessionId ?? currentSessionId();
  if (!sessionId) return null;
  const pathExists = deps.pathExists ?? existsSync;
  const getRecord = deps.getActiveTask ?? getActiveTask;
  const resolveIdentity = deps.resolveIdentity ?? readWorktreeIdentity;
  const findMain = deps.findMain ?? mainWorktreePathFromMetadata;
  const loadFleet = deps.readFleet ?? readFleet;
  const candidates = new Set([path.resolve(invokingDir)]);

  for (const variable of ['AI_TASK_MANAGER_PROJECT_DIR', 'TASK_TRACKER_PROJECT_DIR']) {
    const value = process.env[variable];
    if (typeof value === 'string' && value.trim()) candidates.add(path.resolve(value));
  }

  const mainPath = findMain(invokingDir);
  const fleet = loadFleet(fleetRegistryPath(mainPath));
  const closedLedger = (deps.readClosedBindings ?? readClosedBindingLedger)(mainPath);
  const isClosed = deps.isBindingClosed ?? isBindingRecordClosed;
  for (const entry of Object.values(fleet || {})) {
    if (typeof entry?.worktreePath === 'string' && entry.worktreePath.trim()) {
      candidates.add(path.resolve(entry.worktreePath));
    }
  }

  let best = null;
  for (const candidate of candidates) {
    if (!pathExists(candidate)) continue;
    const record = getRecord(sessionId, candidate);
    if (
      !record ||
      typeof record.issue !== 'string' ||
      typeof record.worktreePath !== 'string' ||
      !record.worktreePath.trim() ||
      !pathExists(record.worktreePath)
    ) {
      continue;
    }
    if (isClosed({ record, sessionId, ledger: closedLedger })) continue;
    let identity;
    try {
      identity = resolveIdentity({ projectDir: record.worktreePath });
    } catch {
      continue;
    }
    const issueMatch = record.issue.match(/^#(\d+)$/);
    const timestamp = Date.parse(record.worktreeResolvedAt || record.boundAt || '') || 0;
    const resolved = {
      issueNumber: issueMatch ? Number(issueMatch[1]) : null,
      ...identity,
      timestamp,
    };
    if (!best || resolved.timestamp > best.timestamp) best = resolved;
  }
  if (!best) return null;
  const { timestamp: _timestamp, ...binding } = best;
  return binding;
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
  // Read `.git` metadata directly. The entry guard must run before verbs and
  // remain trustworthy even when a verification fixture intentionally shims
  // the `git` executable on PATH.
  const resolveBinding = deps.resolveBinding || readWorktreeIdentity;
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
