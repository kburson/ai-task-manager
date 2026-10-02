// @story #1867
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { evaluateCloseReadiness } from '../../../../task-tracker/lib/action-decision/close.mjs';
import {
  resolveDoneTargetBranch,
  lineageDoneGate,
} from '../../../../task-tracker/lib/close-gates-lineage.mjs';

const exec = promisify(execFile);
const ISSUE = 1867;
const PARENT = 'codex/retained-parent';
const ANCESTOR = 'codex/retained-ancestor';

function fixture(
  t,
  { nested = false, attributed = true, remoteParent = false, localParent = true } = {}
) {
  const root = mkdtempProjectIsolated('close-local-parent-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, 'repo');
  const remote = path.join(root, 'origin.git');
  mkdirSync(cwd);
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'trunk');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.test');
  writeFileSync(path.join(cwd, 'source.txt'), 'base\n');
  git('add', '.');
  git('commit', '-m', 'Base');
  const base = git('rev-parse', 'HEAD');
  git('init', '--bare', remote);
  git('remote', 'add', 'origin', remote);
  git('push', 'origin', 'trunk');
  if (remoteParent) git('push', 'origin', `trunk:refs/heads/${PARENT}`);
  git('checkout', '-b', 'codex/child');
  writeFileSync(path.join(cwd, 'source.txt'), 'delivered\n');
  git('add', '.');
  git('commit', '-m', attributed ? '[#1867] Delivered child' : '[#18670] Another child');
  const head = git('rev-parse', 'HEAD');
  if (localParent) git('branch', PARENT);
  if (nested) git('branch', ANCESTOR);
  const graph = new Map([
    [ISSUE, { parent: 1800, children: [], parentAuthoritativeBranch: PARENT }],
    [
      1800,
      {
        parent: nested ? 1700 : null,
        children: [ISSUE],
        ...(nested ? { parentAuthoritativeBranch: ANCESTOR } : {}),
      },
    ],
    [1700, { parent: null, children: [1800] }],
  ]);
  const data = Buffer.from(JSON.stringify({ stage: 'test', commitSha: head })).toString(
    'base64url'
  );
  const body = [
    '## User Story\nAs a delivery operator\nI want safe child closure\nSo that local delivery is recognized',
    '## Scope\nClose readiness',
    '## Acceptance Criteria\n- [x] Close safely',
    '<!-- aitm-last-known-state state="review" ts="2026-10-02T00:00:00Z" -->',
    ...['backlog', 'refine', 'plan', 'develop', 'test', 'review'].map(
      (stage, i) => `<!-- aitm-entered-${stage}: 2026-10-02T0${i}:00:00Z -->`
    ),
    `<!-- aitm-dod-verified: ${head}:2026-10-02T07:00:00Z -->`,
    '<!-- aitm-review-approved: 2026-10-02T08:00:00Z -->',
    '- [x] Agent Review Passed <!-- aitm-verified gate="agent-review" result="pass" -->',
    `<!-- aitm-verification-receipt stage="test" data="${data}" -->`,
  ].join('\n');
  const calls = [];
  const run = async (command, args, options) => {
    calls.push([command, args]);
    if (command === 'git') return exec(command, args, { ...options, cwd });
    assert.equal(command, 'gh');
    if (args[0] === 'pr') return { stdout: '[]' };
    if (args[0] === 'api') return { stdout: '[[]]' };
    if (args[0] === 'issue')
      return {
        stdout:
          args.includes('blockedBy') || args.includes('blockedBy,blocking')
            ? JSON.stringify({
                blockedBy: { nodes: [], totalCount: 0 },
                blocking: { nodes: [], totalCount: 0 },
              })
            : JSON.stringify({
                number: ISSUE,
                body,
                state: 'OPEN',
                updatedAt: '2026-10-02T08:00:00Z',
              }),
      };
    throw new Error(`Unexpected read: ${args.join(' ')}`);
  };
  const snapshot = () => [
    git('show-ref'),
    git('status', '--porcelain'),
    readFileSync(path.join(cwd, 'source.txt'), 'utf8'),
  ];
  const evaluate = () =>
    evaluateCloseReadiness({
      issue: ISSUE,
      cfg: {
        repo: 'example/project',
        projectId: 'P',
        trunkRef: 'origin/trunk',
        lifecycleCheckboxesRequired: false,
      },
      projectDir: cwd,
      deps: {
        run,
        readGraph: async (n) => graph.get(n),
        fetchBoard: async () => ({ state: 'review' }),
        resolveBoundDir: () => cwd,
        worktreeIdentity: ({ projectDir }) => ({ worktreePath: projectDir }),
      },
    });
  const ordinaryTarget = () =>
    resolveDoneTargetBranch({
      issueNumber: ISSUE,
      deps: {
        graph: (n) => graph.get(n),
        trunk: 'origin/trunk',
        branchExists: (branch) => {
          try {
            git('rev-parse', '--verify', '--quiet', `refs/heads/${branch}`);
            return true;
          } catch {
            return false;
          }
        },
      },
    });
  const ordinaryGate = () =>
    lineageDoneGate({
      cfg: { repo: 'example/project', trunkRef: 'origin/trunk' },
      issueNumber: ISSUE,
      projectDir: cwd,
      body,
      deps: {
        graph: (n) => graph.get(n),
        listComments: async () => [{ body: `### 🔗 Commits\n<!-- aitm-commits: ${head} -->` }],
        branchExists: (branch) => {
          try {
            git('rev-parse', '--verify', '--quiet', `refs/heads/${branch}`);
            return true;
          } catch {
            return false;
          }
        },
      },
    });
  return { git, cwd, base, head, calls, snapshot, evaluate, ordinaryTarget, ordinaryGate };
}

for (const remoteParent of [false, true]) {
  test(`local parent closes ready with ${remoteParent ? 'divergent' : 'absent'} remote parent`, async (t) => {
    const f = fixture(t, { remoteParent });
    const before = f.snapshot();
    assert.equal(f.ordinaryTarget(), PARENT);
    const ordinary = await f.ordinaryGate();
    assert.equal(ordinary.ok, true);
    assert.equal(ordinary.doneBranch, PARENT);
    const result = await f.evaluate();
    assert.equal(
      result.status,
      'ready',
      JSON.stringify({ status: result.status, blockers: result.blockers })
    );
    const delivery = result.bundle.observations.find(
      ({ identity }) => identity === 'evidence:1867:1'
    ).value;
    assert.equal(delivery.gateInput.lineage.deliveryTarget, PARENT);
    const attribution = result.bundle.observations.find(
      ({ identity }) => identity === 'evidence:1867:2'
    ).value;
    assert.equal(attribution.tip.sha, f.head);
    assert.equal(attribution.tip.authority, 'local');
    assert.deepEqual(f.snapshot(), before);
    assert.ok(
      f.calls.every(
        ([cmd, args]) =>
          cmd !== 'git' ||
          !['fetch', 'push', 'update-ref', 'checkout', 'branch'].includes(args[0]) ||
          (args[0] === 'branch' && args[1] === '--show-current')
      )
    );
  });
}

test('missing opaque parent walks to the surviving registered ancestor', async (t) => {
  const f = fixture(t, { nested: true, localParent: false });
  assert.equal(f.ordinaryTarget(), ANCESTOR);
  const ordinary = await f.ordinaryGate();
  assert.equal(ordinary.ok, true);
  assert.equal(ordinary.doneBranch, ANCESTOR);
  const result = await f.evaluate();
  assert.equal(
    result.status,
    'ready',
    JSON.stringify({ status: result.status, blockers: result.blockers })
  );
  assert.equal(
    result.bundle.observations.find(({ identity }) => identity === 'evidence:1867:1').value
      .gateInput.lineage.deliveryTarget,
    ANCESTOR
  );
});

test('absent parents fall back to trunk and cannot attribute an undelivered child', async (t) => {
  const f = fixture(t, { localParent: false });
  assert.equal(f.ordinaryTarget(), 'origin/trunk');
  const result = await f.evaluate();
  assert.notEqual(result.status, 'ready');
  assert.ok(
    result.blockers.some(({ code }) => code === 'close-delivery-not-attributed'),
    JSON.stringify({ status: result.status, blockers: result.blockers })
  );
});

test('local delivery rejects false numeric-prefix attribution', async (t) => {
  const f = fixture(t, { attributed: false });
  const result = await f.evaluate();
  assert.notEqual(result.status, 'ready');
  assert.ok(result.blockers.some(({ code }) => code === 'close-delivery-not-attributed'));
  assert.equal(
    result.bundle.observations.find(({ identity }) => identity === 'evidence:1867:2').value.status,
    'not-attributed'
  );
});

test('missing local commit objects fail closed without remote substitution', async (t) => {
  const f = fixture(t, { remoteParent: true });
  const tree = f.git('rev-parse', `${f.head}^{tree}`);
  rmSync(path.join(f.cwd, '.git', 'objects', tree.slice(0, 2), tree.slice(2)));
  const result = await f.evaluate();
  assert.notEqual(result.status, 'ready');
  assert.ok(
    result.blockers.some(
      ({ code }) => code === 'attribution-authority-unavailable' || code === 'authority-read-failed'
    ),
    JSON.stringify({ status: result.status, blockers: result.blockers })
  );
});
