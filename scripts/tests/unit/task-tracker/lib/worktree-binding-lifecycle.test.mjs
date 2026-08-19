// @story #1297
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import test from 'node:test';

import {
  isBindingRecordClosed,
  markClosedBinding,
  readClosedBindingLedger,
  releaseIssueBindings,
} from '../../../../task-tracker/lib/worktree-binding-lifecycle.mjs';
import { resolveCurrentSessionWorktreeBinding } from '../../../../task-tracker/lib/worktree-binding-guard.mjs';
import { closedBindingsPath } from '../../../../task-tracker/paths.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';

const CLOSED_AT = '2026-08-19T15:00:00.000Z';

function ledger(issue = '#1297', closedAt = CLOSED_AT) {
  return {
    schema: 1,
    sessions: { session: { [issue]: { closedAt } } },
  };
}

test('terminal ledger persists atomically at the main fleet authority path', (t) => {
  const root = mkdtempProjectIsolated('closed-binding-ledger-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  markClosedBinding({
    mainWorktreePath: root,
    sessionId: 'session',
    issue: '#1297',
    closedAt: CLOSED_AT,
  });
  const ledgerPath = closedBindingsPath(root);
  assert.equal(existsSync(ledgerPath), true);
  assert.equal(JSON.parse(readFileSync(ledgerPath, 'utf8')).schema, 1);
  assert.deepEqual(readClosedBindingLedger(root), ledger());
});

test('terminal timestamp closes only records that were bound before it', () => {
  assert.equal(
    isBindingRecordClosed({
      record: { issue: '#1297', boundAt: '2026-08-19T14:00:00.000Z' },
      sessionId: 'session',
      ledger: ledger(),
    }),
    true
  );
  assert.equal(
    isBindingRecordClosed({
      record: { issue: '#1297', boundAt: '2026-08-19T16:00:00.000Z' },
      sessionId: 'session',
      ledger: ledger(),
    }),
    false,
    'a post-reopen bind supersedes the older closure'
  );
});

function resolverFixture(records, closedLedger) {
  return {
    sessionId: 'session',
    pathExists: () => true,
    findMain: () => '/repo',
    readFleet: () => ({
      '#1297': { worktreePath: '/repo/wt-closed' },
      '#1298': { worktreePath: '/repo/wt-live' },
    }),
    getActiveTask: (_sid, candidate) => records[candidate] ?? null,
    resolveIdentity: ({ projectDir }) => ({
      worktreePath: projectDir,
      worktreeBranch: projectDir.split('/').at(-1),
    }),
    readClosedBindings: () => closedLedger,
  };
}

test('closed candidate loses to a live binding even when the closed record is newer', () => {
  const records = {
    '/repo/wt-closed': {
      issue: '#1297',
      worktreePath: '/repo/wt-closed',
      boundAt: '2026-08-19T14:55:00.000Z',
    },
    '/repo/wt-live': {
      issue: '#1298',
      worktreePath: '/repo/wt-live',
      boundAt: '2026-08-19T14:30:00.000Z',
    },
  };
  assert.deepEqual(
    resolveCurrentSessionWorktreeBinding({
      invokingDir: '/repo',
      deps: resolverFixture(records, ledger()),
    }),
    {
      issueNumber: 1298,
      worktreePath: '/repo/wt-live',
      worktreeBranch: 'wt-live',
    }
  );
});

test('a closed-only candidate set resolves to null', () => {
  const records = {
    '/repo/wt-closed': {
      issue: '#1297',
      worktreePath: '/repo/wt-closed',
      boundAt: '2026-08-19T14:55:00.000Z',
    },
  };
  assert.equal(
    resolveCurrentSessionWorktreeBinding({
      invokingDir: '/repo',
      deps: resolverFixture(records, ledger()),
    }),
    null
  );
});

test('release marks terminal authority then clears every matching worktree only', () => {
  const records = new Map([
    ['/repo', { issue: '#1298', boundAt: '2026-08-19T14:00:00.000Z' }],
    ['/repo/wt-a', { issue: '#1297', boundAt: '2026-08-19T14:10:00.000Z' }],
    ['/repo/wt-b', { issue: '#1297', boundAt: '2026-08-19T14:20:00.000Z' }],
  ]);
  const order = [];
  const result = releaseIssueBindings({
    projectDir: '/repo/wt-b',
    issue: '#1297',
    sessionId: 'session',
    closedAt: CLOSED_AT,
    deps: {
      findMain: () => '/repo',
      collectCandidates: () => ['/repo', '/repo/wt-a', '/repo/wt-b'],
      markClosedBinding: (input) => {
        order.push(`mark:${input.issue}`);
        return ledger();
      },
      getActiveTask: (_sid, candidate) => records.get(candidate) ?? null,
      setActiveTask: (_sid, record, candidate) => {
        order.push(`stamp:${candidate}`);
        records.set(candidate, record);
      },
      clearActiveTask: (_sid, candidate) => {
        order.push(`clear:${candidate}`);
        records.delete(candidate);
      },
    },
  });

  assert.deepEqual(result.released, ['/repo/wt-a', '/repo/wt-b']);
  assert.deepEqual(records.get('/repo'), {
    issue: '#1298',
    boundAt: '2026-08-19T14:00:00.000Z',
  });
  assert.equal(records.has('/repo/wt-a'), false);
  assert.equal(records.has('/repo/wt-b'), false);
  assert.equal(order[0], 'mark:#1297');
  assert.ok(order.indexOf('stamp:/repo/wt-a') < order.indexOf('clear:/repo/wt-a'));
});

test('clearing live B cannot resurrect terminal A', () => {
  const records = {
    '/repo/wt-a': {
      issue: '#1297',
      worktreePath: '/repo/wt-a',
      boundAt: '2026-08-19T14:55:00.000Z',
    },
  };
  const deps = resolverFixture(records, ledger());
  deps.readFleet = () => ({ '#1297': { worktreePath: '/repo/wt-a' } });
  assert.equal(
    resolveCurrentSessionWorktreeBinding({ invokingDir: '/repo', deps }),
    null,
    'the old A record remains terminal after unrelated B disappears'
  );
});
