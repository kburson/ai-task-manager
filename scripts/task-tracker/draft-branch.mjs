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
import { resolveCurrentIssueWorktreeBranch } from './lib/issue-worktree-location.mjs';
import { readOccupancy } from './lib/occupancy.mjs';
import { occupancyPath } from './paths.mjs';
import { resolveBindingAuthorityMain } from './lib/worktree-binding-lifecycle.mjs';
import { withLock } from './fleet-registry.mjs';
import { assertNativeSession } from './lib/native-worktree-bootstrap.mjs';
enforceDirectGuidance(import.meta.url, 'draft-branch');

export async function createDraftBranch({
  issue,
  role = 'agent',
  projectDir = process.cwd(),
  sessionId = currentSessionId(),
  cfg,
  deps = {},
} = {}) {
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new Error('draft-branch: invalid issue');
  if (!['agent', 'orchestrator'].includes(role)) throw new Error('draft-branch: invalid role');
  if (
    (process.env.CODEX_THREAD_ID || process.env.CODEX_SESSION_ID) &&
    (process.env.npm_command === 'exec' || process.env.npm_lifecycle_event === 'npx')
  )
    throw new Error('draft-branch: native initial naming requires the direct bin/aitm.mjs carrier');
  if (hasUnsupportedGitEnvironment()) throw new Error('draft-branch: unsupported Git environment');
  const git = (...args) =>
    execFileSync('git', args, { cwd: projectDir, encoding: 'utf8', stdio: 'pipe' }).trim();
  let branch = `codex/${issue}-draft`;
  let expectedHead;
  await withIssueLock(
    { issue: `#${issue}`, verb: 'draft-branch', projDir: projectDir, sessionId },
    async () => {
      const observed = readWorktreeIdentity({ projectDir });
      const bound = readExactSessionBinding(projectDir, { sessionId });
      const record = getActiveTask(sessionId, projectDir);
      const { state } = readBoundState(projectDir, { sessionId });
      const occupancyFile = occupancyPath(resolveBindingAuthorityMain(projectDir));
      const claim = readOccupancy(occupancyFile)[String(issue)] ?? null;
      const assertClaim = () => {
        const current = readOccupancy(occupancyFile)[String(issue)] ?? null;
        if (
          JSON.stringify(current) !== JSON.stringify(claim) ||
          (current &&
            (current.sid !== sessionId ||
              path.resolve(current.worktreePath) !== observed.worktreePath)) ||
          (record?.bindingGenerationId &&
            current?.bindingGenerationId !== record.bindingGenerationId)
        )
          throw new Error('draft-branch: occupancy writer or generation differs from binding');
      };
      assertClaim();
      if (
        !bound ||
        bound.issueNumber !== issue ||
        bound.worktreePath !== observed.worktreePath ||
        !record?.entryStartTs
      )
        throw new Error('draft-branch: exact active binding required');
      if (!statSync(path.join(observed.worktreePath, '.git')).isFile())
        throw new Error('draft-branch: linked worktree required');
      if (!DRAFTING_STATES.includes(state) && state !== 'develop')
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
      const body = await (
        deps.fetchIssueBody ||
        (() => {
          if (!cfg?.repo) return '';
          const issueData = JSON.parse(
            execFileSync(
              'gh',
              ['issue', 'view', String(issue), '-R', cfg.repo, '--json', 'body,state'],
              { encoding: 'utf8' }
            )
          );
          if (issueData.state !== 'OPEN') throw new Error('draft-branch: issue must be open');
          return issueData.body;
        })
      )();
      const durableBranch = resolveCurrentIssueWorktreeBranch(body);
      branch = durableBranch ?? `codex/${issue}-draft`;
      git('check-ref-format', 'refs/heads/' + branch);
      if (
        !['HEAD', branch].includes(bound.worktreeBranch) ||
        !['HEAD', branch].includes(observed.worktreeBranch)
      )
        throw new Error('draft-branch: exact active binding required');
      const holders = git('worktree', 'list', '--porcelain')
        .split('\n\n')
        .filter((block) => block.split('\n').includes('branch refs/heads/' + branch));
      if (holders.some((block) => !block.split('\n').includes('worktree ' + observed.worktreePath)))
        throw new Error('draft-branch: durable branch is checked out elsewhere');
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
        if (exists && !durableBranch)
          throw new Error('draft-branch: canonical branch already exists');
        if (exists && git('rev-parse', `refs/heads/${branch}`) !== head)
          throw new Error('draft-branch: conflicting branch head');
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
        withLock(occupancyFile, () => {
          assertClaim();
          if (existing) git('switch', branch);
          else git('switch', '-c', branch, head);
        });
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
          role,
          '--confirm-relocation',
        ],
        {
          cwd: projectDir,
          env: process.env,
          stdio: 'pipe',
        }
      ))
  )({ issue, role, projectDir, sessionId });
  const observed = readWorktreeIdentity({ projectDir });
  if (!bindingMatches(observed, readExactSessionBinding(projectDir, { sessionId }), issue))
    throw new Error(`draft-branch: renewed binding unavailable; retry draft-branch ${issue}`);
  if (git('rev-parse', 'HEAD') !== expectedHead)
    throw new Error('draft-branch: HEAD changed during renewal');
  return { branch, head: expectedHead };
}
async function main(argv) {
  if (wantsHelp(argv)) return emitSelfDoc('draft-branch');
  if (
    !/^#?[1-9][0-9]*$/.test(argv[0]) ||
    !(
      argv.length === 1 ||
      (argv.length === 3 && argv[1] === '--role' && ['agent', 'orchestrator'].includes(argv[2]))
    )
  )
    throw new Error('usage: aitm draft-branch <issue#> [--role agent|orchestrator]');
  if (process.env.CODEX_THREAD_ID || process.env.CODEX_SESSION_ID)
    assertNativeSession(currentSessionId());
  const result = await createDraftBranch({
    issue: Number(argv[0].replace(/^#/, '')),
    role: argv[2] ?? 'agent',
    cfg: loadConfig(),
  });
  process.stdout.write(`Draft branch ${result.branch} at ${result.head}; binding verified.\n`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
