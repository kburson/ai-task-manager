#!/usr/bin/env node
// @story #1848
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enforceDirectGuidance } from './lib/direct-guidance-admission.mjs';
import { readWorktreeIdentity } from './lib/worktree-binding-guard.mjs';
import {
  readExactSessionBinding,
  bindingMatches,
  hasUnsupportedGitEnvironment,
} from './lib/mutation-context.mjs';
import { readBoundState } from './lib/bound-state.mjs';
import { fetchAssignmentSnapshot, singletonOwner } from './lib/assignment-snapshot.mjs';
import { getActiveTask } from './session-state.mjs';
import { currentSessionId } from './word-counter.mjs';
import { withIssueLock } from './issue-mutator-lock.mjs';
import { DRAFTING_STATES } from './activity-policy.mjs';
import { loadConfig } from './config.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';
enforceDirectGuidance(import.meta.url, 'draft-branch');

export async function createDraftBranch({
  issue,
  projectDir = process.cwd(),
  sessionId = currentSessionId(),
  cfg,
  deps = {},
} = {}) {
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new Error('draft-branch: invalid issue');
  if (hasUnsupportedGitEnvironment()) throw new Error('draft-branch: unsupported Git environment');
  const git = (...args) =>
    execFileSync('git', args, { cwd: projectDir, encoding: 'utf8', stdio: 'pipe' }).trim();
  const branch = `codex/${issue}-draft`;
  let expectedHead;
  await withIssueLock(
    { issue: `#${issue}`, verb: 'draft-branch', projDir: projectDir, sessionId },
    async () => {
      const observed = readWorktreeIdentity({ projectDir });
      const bound = readExactSessionBinding(projectDir, { sessionId });
      const record = getActiveTask(sessionId, projectDir);
      const { state } = readBoundState(projectDir, { sessionId });
      if (
        !bound ||
        bound.issueNumber !== issue ||
        bound.worktreePath !== observed.worktreePath ||
        !record?.entryStartTs ||
        !['HEAD', branch].includes(bound.worktreeBranch) ||
        !['HEAD', branch].includes(observed.worktreeBranch)
      )
        throw new Error('draft-branch: exact active binding required');
      if (!statSync(path.join(observed.worktreePath, '.git')).isFile())
        throw new Error('draft-branch: linked worktree required');
      if (!DRAFTING_STATES.includes(state))
        throw new Error('draft-branch: drafting state required');
      if (git('status', '--porcelain', '--untracked-files=all'))
        throw new Error('draft-branch: clean worktree required');
      const snapshot = await (deps.fetchSnapshot || fetchAssignmentSnapshot)({
        issueNumber: issue,
        cfg,
      });
      const user = String(
        await (
          deps.fetchCurrentUser ||
          (() => execFileSync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8' }).trim())
        )()
      ).toLowerCase();
      if (!user || singletonOwner(snapshot.assignees) !== user)
        throw new Error('draft-branch: exact singleton owner required');
      if (snapshot.state !== state)
        throw new Error('draft-branch: live state differs from binding');
      const head = git('rev-parse', 'HEAD');
      expectedHead = head;
      const journalPath = path.join(projectDir, '.tmp', 'aitm', 'draft-branch', `${issue}.json`);
      if (existsSync(journalPath)) {
        const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
        if (
          journal.issue !== issue ||
          journal.sessionId !== sessionId ||
          journal.worktree !== observed.worktreePath ||
          journal.head !== head ||
          journal.branch !== branch
        )
          throw new Error('draft-branch: conflicting recovery journal');
      } else {
        if (observed.worktreeBranch !== 'HEAD' || bound.worktreeBranch !== 'HEAD')
          throw new Error('draft-branch: detached binding required');
        let exists = false;
        try {
          git('show-ref', '--verify', '--quiet', `refs/heads/${branch}`);
          exists = true;
        } catch (error) {
          if (error.status !== 1) throw error;
        }
        if (exists) throw new Error('draft-branch: canonical branch already exists');
        mkdirSync(path.dirname(journalPath), { recursive: true });
        writeFileSync(
          journalPath,
          JSON.stringify({ issue, sessionId, worktree: observed.worktreePath, head, branch }) +
            '\n',
          { flag: 'wx' }
        );
      }
      const fresh = readWorktreeIdentity({ projectDir });
      if (
        fresh.worktreePath !== observed.worktreePath ||
        fresh.worktreeBranch !== observed.worktreeBranch ||
        git('rev-parse', 'HEAD') !== head ||
        git('status', '--porcelain', '--untracked-files=all')
      )
        throw new Error('draft-branch: worktree changed during preflight');
      if (fresh.worktreeBranch === 'HEAD') {
        let existing;
        try {
          existing = git('rev-parse', '--verify', `refs/heads/${branch}`);
        } catch (error) {
          if (error.status !== 128) throw error;
        }
        if (existing && existing !== head) throw new Error('draft-branch: conflicting branch head');
        if (existing) git('switch', branch);
        else git('switch', '-c', branch, head);
      }
    }
  );
  // Ordinary start owns renewal; do not fabricate session or issue markers.
  await (
    deps.renewBinding ||
    (() =>
      execFileSync(
        process.execPath,
        [
          fileURLToPath(new URL('../../bin/aitm.mjs', import.meta.url)),
          'start',
          String(issue),
          '--role',
          'agent',
          '--confirm-relocation',
        ],
        {
          cwd: projectDir,
          env: { ...process.env, AI_TASK_MANAGER_SESSION_ID: sessionId },
          stdio: 'pipe',
        }
      ))
  )();
  const observed = readWorktreeIdentity({ projectDir });
  if (!bindingMatches(observed, readExactSessionBinding(projectDir, { sessionId }), issue))
    throw new Error(`draft-branch: renewed binding unavailable; retry draft-branch ${issue}`);
  if (git('rev-parse', 'HEAD') !== expectedHead)
    throw new Error('draft-branch: HEAD changed during renewal');
  return { branch, head: expectedHead };
}
async function main(argv) {
  if (wantsHelp(argv)) return emitSelfDoc('draft-branch');
  if (argv.length !== 1 || !/^#?[1-9][0-9]*$/.test(argv[0]))
    throw new Error('usage: aitm draft-branch <issue#>');
  const result = await createDraftBranch({
    issue: Number(argv[0].replace(/^#/, '')),
    cfg: loadConfig(),
  });
  process.stdout.write(`Draft branch ${result.branch} at ${result.head}; binding verified.\n`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
