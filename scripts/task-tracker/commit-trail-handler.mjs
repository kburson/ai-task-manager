#!/usr/bin/env node
// INTERNAL — DO NOT INVOKE DIRECTLY, and not exposed through `aitm`.
// Plumbing: invoked only by the Claude Code hook runner, never by a human or
// the AI. See bin/aitm-registry.mjs (INTERNAL map) for the rationale.
//
// PostToolUse hook handler — appends a row to the `### 🔗 Commits` comment
// on the bound issue when a `git commit` succeeds while a task is bound.
//
// Reads the Claude Code tool-call payload from stdin:
//   { tool_name, tool_input: { command }, tool_response: { exit_code, ... }, cwd }
//
// Silent on all failures: this hook must never break the developer's shell.

import { readFileSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import {
  detectGitCommit,
  parseMarker,
  buildInitialTrail,
  buildRow,
  appendCommitRow,
  updateMarker,
  reconcileLedger,
  hasWorktreeCols,
  TRAIL_HEADING,
} from './lib/commit-trail.mjs';
import { GH_API_TIMEOUT_MS, GIT_TIMEOUT_MS } from './lib/process-timeouts.mjs';
import { isChoreModeActive } from './lib/chore-mode.mjs';
import { lintCommitSubject } from './lib/commit-attribution-format.mjs';
import { statePath as resolveStatePath } from './paths.mjs';

// #327 — chore-mode commit-subject gate.
//
// While chore-mode is active, every commit subject must start with
// `chore: ` (case-sensitive, colon + space required). The check is exposed
// as a pure helper so it can be unit-tested without spinning up the full
// PostToolUse handler shell.
//
// Returns `null` when the commit is allowed, or a structured refusal
// `{ code, message }` when it must be flagged.
export function checkChoreCommitSubject(subject) {
  if (typeof subject !== 'string') return null;
  if (/^chore:\s/.test(subject)) return null;
  return {
    code: 'chore-mode-untagged-commit',
    message:
      `chore-mode is active — commit subjects must begin with "chore: ".\n` +
      `Refused subject: ${subject}\n` +
      `Fix: amend the commit (\`git commit --amend\`) with a \`chore: \` subject,\n` +
      `     or exit chore-mode first: \`node scripts/task-tracker/task-tracker.mjs chore-mode off\`.`,
  };
}

const pexec = promisify(execFile);

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function parsePayload(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function findProjectDir(startDir) {
  if (process.env.AI_TASK_MANAGER_PROJECT_DIR) return process.env.AI_TASK_MANAGER_PROJECT_DIR;
  let dir = path.resolve(startDir || process.cwd());
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, '.ai-task-manager'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function loadActiveIssue(projectDir) {
  const statePath = resolveStatePath(projectDir); // #573: `.tmp/aitm/state/`
  if (!existsSync(statePath)) return null;
  try {
    const s = JSON.parse(readFileSync(statePath, 'utf8'));
    const active = s.active;
    if (!active || active === 'discover' || active === 'plan') return null;
    const m = String(active).match(/^#?(\d+)$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function loadRepo(projectDir) {
  const cfgPath = path.join(projectDir, '.ai-task-manager', 'task-tracker.json');
  if (!existsSync(cfgPath)) return null;
  try {
    const c = JSON.parse(readFileSync(cfgPath, 'utf8'));
    return c.repo || null;
  } catch {
    return null;
  }
}

export async function gitInfo(cwd) {
  const run = async (args) => {
    const { stdout } = await pexec('git', args, { cwd, timeout: GIT_TIMEOUT_MS });
    return stdout.trim();
  };
  const sha = await run(['rev-parse', 'HEAD']);
  const log = await run(['log', '-1', '--format=%H%x09%s%x09%an%x09%aI']);
  const [logSha, subject, author, ts] = log.split('\t');
  const branch = await run(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '');
  let isWorktree = false;
  let worktree = '';
  try {
    const gitDir = await run(['rev-parse', '--git-dir']);
    const commonDir = await run(['rev-parse', '--git-common-dir']);
    isWorktree = path.resolve(cwd, gitDir) !== path.resolve(cwd, commonDir);
    worktree = await run(['rev-parse', '--show-toplevel']).catch(() => cwd);
  } catch {
    /* best-effort: failure must not abort the primary operation */
  }
  return { sha: logSha || sha, subject, author, ts, branch, worktree, isWorktree };
}

async function ghJson(args, { timeoutMs = GH_API_TIMEOUT_MS } = {}) {
  const { stdout } = await pexec('gh', args, { timeout: timeoutMs });
  return stdout;
}

export async function findTrailComment(issueNumber, repo, { timeoutMs } = {}) {
  const out = await ghJson(['issue', 'view', issueNumber, '-R', repo, '--json', 'comments'], {
    timeoutMs,
  });
  const { comments } = JSON.parse(out);
  const hit = comments.find((c) => c.body && c.body.startsWith(TRAIL_HEADING));
  return hit ? { id: hit.id, url: hit.url, body: hit.body } : null;
}

export async function createTrailComment(issueNumber, repo, body, { timeoutMs } = {}) {
  await ghJson(['issue', 'comment', issueNumber, '-R', repo, '--body', body], { timeoutMs });
}

export async function updateTrailComment(commentId, body, { timeoutMs } = {}) {
  const mutation = `
    mutation($id: ID!, $body: String!) {
      updateIssueComment(input: { id: $id, body: $body }) { issueComment { id } }
    }`;
  await ghJson(
    ['api', 'graphql', '-f', `query=${mutation}`, '-f', `id=${commentId}`, '-f', `body=${body}`],
    { timeoutMs }
  );
}

// Reachability probe — ADVISORY ONLY as of #732. `git merge-base --is-ancestor
// <sha> HEAD` exits 0 when ancestor, 1 when not, and 128 when the object is
// unknown/GC'd; `execFile` rejects on any non-zero exit, so the catch maps both
// 1 and 128 → false. This USED to drive trail pruning (drop unreachable SHAs),
// which deadlocked gates after history rewrites. The trail is now an
// informational ledger that tolerates unreachable SHAs (#732), and gate
// assertion keys on message attribution (#731 `hasAttributingCommit`), so this
// predicate is no longer a precondition for a SHA to stay in the trail — it is
// kept as optional annotation (#731 `annotateReachable`) and remains injectable
// so the exit-code mapping is unit-testable.
export async function defaultIsReachable(sha, { cwd, pexec: pexecDep = pexec } = {}) {
  try {
    await pexecDep('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

export async function postCommitTrail({
  issueNumber,
  repo,
  info,
  timeoutMs = GH_API_TIMEOUT_MS,
  deps = {},
}) {
  const find = deps.find || findTrailComment;
  const create = deps.create || createTrailComment;
  const update = deps.update || updateTrailComment;

  const existing = await find(issueNumber, repo, { timeoutMs });
  const worktreeCols = existing ? hasWorktreeCols(existing.body) : info.isWorktree;
  const commitUrl = info.commitUrl || `https://github.com/${repo}/commit/${info.sha}`;
  const row = buildRow({ ...info, commitUrl }, { worktreeCols });

  if (existing) {
    // #732 — reconcile (never prune): tolerate unreachable/rewritten SHAs and
    // back-fill the informational-ledger caveat onto legacy trails.
    const reconciled = await reconcileLedger(existing.body, { issueNumber });
    const parsed = parseMarker(reconciled);
    if (parsed.shas.has(info.sha)) {
      if (reconciled !== existing.body) {
        await update(existing.id, reconciled, { timeoutMs });
        return { action: 'reconciled' };
      }
      return { action: 'noop-duplicate' };
    }
    let next = appendCommitRow(reconciled, row);
    next = updateMarker(next, info.sha);
    await update(existing.id, next, { timeoutMs });
    return { action: 'updated' };
  } else {
    let body = buildInitialTrail({ worktreeCols, issueNumber });
    body = appendCommitRow(body, row);
    body = updateMarker(body, info.sha);
    await create(issueNumber, repo, body, { timeoutMs });
    return { action: 'created' };
  }
}

async function main() {
  const raw = readStdin();
  const payload = parsePayload(raw);
  if (!payload) return;
  if (payload.tool_name !== 'Bash') return;
  const exitCode = payload.tool_response?.exit_code ?? payload.tool_response?.exitCode ?? 0;
  if (exitCode !== 0) return;
  const cmd = payload.tool_input?.command || '';
  const det = detectGitCommit(cmd);
  if (!det.isCommit || det.isAmend) return;

  const cwd = payload.cwd || process.cwd();
  const projectDir = findProjectDir(cwd);
  if (!projectDir) return;

  // #327 — chore-mode short-circuit. When chore-mode is active there is no
  // bound issue (the verb detached it) and no trail row to write — but we
  // DO need to inspect the commit subject and warn if it lacks the `chore: `
  // prefix. Otherwise we hand off to the active-issue path below.
  const choreActive = isChoreModeActive(projectDir);
  const issueNumber = choreActive ? null : loadActiveIssue(projectDir);
  if (!choreActive && !issueNumber) return;

  let info;
  try {
    info = await gitInfo(cwd);
  } catch (err) {
    process.stderr.write(`[commit-trail] git error: ${err.message}\n`);
    return;
  }
  if (!info.sha) return;

  if (choreActive) {
    const refusal = checkChoreCommitSubject(info.subject);
    if (refusal) {
      process.stderr.write(`[commit-trail] ${refusal.code}: ${refusal.message}\n`);
    }
    return;
  }

  // #730 — subject-line attribution lint. Non-fatal by design: warn when the
  // commit that just landed lacks the bound issue's `[#N]` prefix. The blocking
  // enforcement (gate migration) is #733's job; here we only nudge, so this can
  // never break the developer's shell or an in-flight drive.
  const lint = lintCommitSubject(info.subject, issueNumber);
  if (lint) {
    process.stderr.write(`[commit-trail] ${lint.code}: ${lint.message}\n`);
  }

  const repo = loadRepo(projectDir);
  if (!repo) return;

  try {
    await postCommitTrail({ issueNumber, repo, info, cwd });
  } catch (err) {
    process.stderr.write(`[commit-trail] gh error: ${err.message}\n`);
  }
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('commit-trail-handler.mjs');
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`[commit-trail] ${err.message}\n`);
    process.exit(0);
  });
}
