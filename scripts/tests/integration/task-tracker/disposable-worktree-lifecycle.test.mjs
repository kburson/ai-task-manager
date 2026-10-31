// @story #2134
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveCurrentIssueWorktreeLocation,
  resolveCurrentIssueWorktreeBranch,
  parseIssueWorktreeLocations,
  serializeIssueWorktreeLocationMarker,
} from '../../../task-tracker/lib/issue-worktree-location.mjs';
import { buildGraphNodeAuthority } from '../../../task-tracker/lib/graph-node-authority.mjs';
import {
  TERMINAL_CLOSE_STEPS,
  upsertDeliveredCloseTransaction,
  readDeliveredCloseTransactions,
} from '../../../task-tracker/lib/close-convergence.mjs';
import { releaseTerminalIssueBinding } from '../../../task-tracker/lib/worktree-binding-lifecycle.mjs';

const acceptedSha = 'a'.repeat(40);
const location = {
  worktreePath: '/retired/source',
  worktreeBranch: 'codex/custom-delivery-finish',
  sessionId: 'retired-operator',
  ts: '2026-10-30T12:00:00.000Z',
};
function completedBody() {
  return upsertDeliveredCloseTransaction(
    [
      serializeIssueWorktreeLocationMarker(location),
      '<!-- aitm-last-known-state state="done" ts="2026-10-31T12:00:00.000Z" -->',
      `<!-- aitm-review-approved ts="2026-10-31T11:00:00.000Z" approved-sha="${acceptedSha}" -->`,
      'Timing: Unknown',
    ].join('\n'),
    {
      schema: 'aitm.delivered-close/v1',
      transactionId: 'completed-fixture',
      issueNumber: 2134,
      acceptedSha,
      reviewAuthority: 'human-gate',
      completedSteps: [...TERMINAL_CLOSE_STEPS],
    }
  );
}

test('completed delivery retires location authority while retaining strict historical evidence', () => {
  const body = completedBody();
  assert.equal(resolveCurrentIssueWorktreeLocation(body), null);
  assert.equal(resolveCurrentIssueWorktreeBranch(body), location.worktreeBranch);
  assert.deepEqual(parseIssueWorktreeLocations(body), [location]);
  assert.equal(readDeliveredCloseTransactions(body)[0].acceptedSha, acceptedSha);
  assert.ok(body.includes('Timing: Unknown'));
  const graph = buildGraphNodeAuthority({ ownBody: body });
  assert.equal(graph.authoritativeWorktree, undefined);
  assert.equal(graph.authoritativeBranch, location.worktreeBranch);
});

test('Done text or an incomplete transaction never retires current authority', () => {
  assert.deepEqual(
    resolveCurrentIssueWorktreeLocation(serializeIssueWorktreeLocationMarker(location) + '\nDone'),
    location
  );
  const incomplete = completedBody().replace('&quot;binding&quot;', '&quot;not-binding&quot;');
  assert.throws(() => resolveCurrentIssueWorktreeLocation(incomplete), /terminal|transaction/);
});

test('terminal retirement still rejects malformed or ambiguous location history', () => {
  assert.throws(
    () =>
      resolveCurrentIssueWorktreeLocation(
        completedBody() + '\n<!-- aitm-worktree-location bad="yes" -->'
      ),
    /malformed/
  );
  const conflict = serializeIssueWorktreeLocationMarker({ ...location, worktreePath: '/foreign' });
  assert.throws(
    () => resolveCurrentIssueWorktreeLocation(completedBody() + '\n' + conflict),
    /ambiguous/
  );
});

test('a detached replacement keeps the latest named durable custom branch', () => {
  const body = [
    serializeIssueWorktreeLocationMarker(location),
    serializeIssueWorktreeLocationMarker({
      ...location,
      worktreePath: '/replacement',
      worktreeBranch: 'HEAD',
      sessionId: 'replacement-operator',
      ts: '2026-10-31T13:00:00.000Z',
    }),
  ].join('\n');
  assert.equal(resolveCurrentIssueWorktreeBranch(body), location.worktreeBranch);
  const node = buildGraphNodeAuthority({ ownBody: body });
  assert.equal(node.authoritativeBranch, location.worktreeBranch);
  assert.equal(node.authoritativeWorktree, '/replacement');
});

test('terminal release cannot report success without read-back of binding and occupancy', () => {
  assert.throws(
    () =>
      releaseTerminalIssueBinding({
        projectDir: '/fixture',
        issue: '#2134',
        deps: {
          releaseIssueBindings: () => ({ released: [] }),
          releaseBindingOccupancy: () => ({ status: 'released' }),
          deregisterTask: () => {},
          inspectTerminalIssueBindingRelease: () => ({ status: 'incomplete' }),
        },
      }),
    /release.*readback|release.*incomplete/
  );
});

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setActiveTask, getActiveTask } from '../../../task-tracker/session-state.mjs';
import { createDraftBranch } from '../../../task-tracker/draft-branch.mjs';

function gitFixture(t) {
  mkdirSync('.scratch/2134', { recursive: true });
  const top = mkdtempSync(path.resolve('.scratch/2134/disposable-'));
  const main = path.join(top, 'main');
  mkdirSync(main);
  const git = (cwd, ...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git(main, 'init', '-q', '-b', 'base');
  git(main, 'config', 'user.name', 'fixture');
  git(main, 'config', 'user.email', 'fixture@example.invalid');
  writeFileSync(path.join(main, '.gitignore'), '.tmp/\nnode_modules/\nverified.txt\n');
  writeFileSync(path.join(main, 'source.txt'), 'retained source\n');
  git(main, 'add', '.');
  git(main, 'commit', '-qm', 'base');
  t.after(() => rmSync(top, { recursive: true, force: true }));
  return { top, main, git };
}

for (const custom of [false, true]) {
  test(
    '#2134: native draft setup names a clean Develop checkout and preserves custom target=' +
      custom,
    async (t) => {
      const { top, main, git } = gitFixture(t);
      const checkout = path.join(top, 'replacement');
      const expectedBranch = custom ? 'codex/custom-delivery-finish' : 'codex/2134-draft';
      if (custom) git(main, 'branch', expectedBranch);
      git(main, 'worktree', 'add', '--detach', checkout, 'HEAD');
      const sid = 'fixture-initial-naming';
      const record = setActiveTask(
        sid,
        {
          issue: '#2134',
          kanbanState: 'develop',
          entryStartTs: '2026-10-31T12:00:00.000Z',
          worktreePath: checkout,
          worktreeBranch: 'HEAD',
        },
        checkout
      );
      const body =
        (custom ? serializeIssueWorktreeLocationMarker(location) + '\n' : '') +
        serializeIssueWorktreeLocationMarker({
          ...location,
          worktreePath: checkout,
          worktreeBranch: 'HEAD',
          sessionId: sid,
          ts: '2026-10-31T12:00:00.000Z',
        });
      const before = git(checkout, 'rev-parse', 'HEAD');
      const result = await createDraftBranch({
        issue: 2134,
        role: 'orchestrator',
        projectDir: checkout,
        sessionId: sid,
        cfg: { repo: 'fixture/project' },
        deps: {
          fetchSnapshot: async () => ({ state: 'develop', assignees: ['fixture-owner'] }),
          fetchCurrentUser: async () => 'fixture-owner',
          fetchIssueBody: async () => body,
          renewBinding: async ({ role }) => {
            assert.equal(role, 'orchestrator');
            setActiveTask(sid, { ...record, worktreeBranch: expectedBranch }, checkout);
          },
        },
      });
      assert.equal(result.branch, expectedBranch);
      assert.equal(result.head, before);
      assert.equal(git(checkout, 'branch', '--show-current'), expectedBranch);
      assert.equal(getActiveTask(sid, checkout).worktreeBranch, expectedBranch);
      assert.equal(readFileSync(path.join(checkout, 'source.txt'), 'utf8'), 'retained source\n');
    }
  );
}

import { claimOccupancy } from '../../../task-tracker/lib/occupancy.mjs';

test('#2134: initial naming refuses a different live writer before switching branches', async (t) => {
  const { top, main, git } = gitFixture(t);
  const checkout = path.join(top, 'replacement');
  git(main, 'worktree', 'add', '--detach', checkout, 'HEAD');
  const sid = 'fixture-initial-owner';
  const record = setActiveTask(
    sid,
    {
      issue: '#2134',
      kanbanState: 'develop',
      entryStartTs: new Date().toISOString(),
      worktreePath: checkout,
      worktreeBranch: 'HEAD',
    },
    checkout
  );
  claimOccupancy({
    projectDir: checkout,
    issue: '#2134',
    sid: 'different-live-writer',
    provider: 'codex',
    worktreePath: checkout,
  });
  await assert.rejects(
    createDraftBranch({
      issue: 2134,
      projectDir: checkout,
      sessionId: sid,
      cfg: { repo: 'fixture/project' },
      deps: {
        fetchSnapshot: async () => ({ state: 'develop', assignees: ['fixture-owner'] }),
        fetchCurrentUser: async () => 'fixture-owner',
        fetchIssueBody: async () => '',
        renewBinding: async () =>
          setActiveTask(sid, { ...record, worktreeBranch: 'codex/2134-draft' }, checkout),
      },
    }),
    /occupancy|writer/
  );
  assert.equal(git(checkout, 'branch', '--show-current'), '');
  assert.equal(git(main, 'for-each-ref', '--format=%(refname)', 'refs/heads/codex/2134-draft'), '');
});
