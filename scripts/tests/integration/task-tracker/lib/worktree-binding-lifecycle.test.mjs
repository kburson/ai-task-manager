// @story #1297
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import test from 'node:test';

import {
  isBindingRecordClosed,
  inspectTerminalIssueBindingRelease,
  markClosedBinding,
  readClosedBindingLedger,
  releaseIssueBindings,
  resolveBindingAuthorityMain,
  resumeTerminalIssueBindingRelease,
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

test('malformed terminal entries fail closed instead of reviving a binding', (t) => {
  const root = mkdtempProjectIsolated('closed-binding-invalid-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const target = closedBindingsPath(root);
  const invalid = { schema: 1, sessions: { session: { '#1297': {} } } };
  assert.throws(
    () =>
      readClosedBindingLedger(root, {
        pathExists: () => true,
        readFile: () => JSON.stringify(invalid),
      }),
    /invalid-entry/
  );
  assert.equal(target.endsWith('closed-bindings.json'), true);
});

test('terminal authority refuses a fallback linked-worktree anchor', () => {
  assert.throws(
    () => resolveBindingAuthorityMain('/repo/wt', { listGitWorktrees: () => [] }),
    /main-worktree-unavailable/
  );
});

test('terminal timestamp closes only records that were bound before it', () => {
  assert.deepEqual(
    isBindingRecordClosed({
      record: { issue: '#1297', boundAt: '2026-08-19T14:00:00.000Z' },
      sessionId: 'session',
      ledger: ledger(),
    }),
    true
  );
  assert.deepEqual(
    isBindingRecordClosed({
      record: { issue: '#1297', boundAt: '2026-08-19T16:00:00.000Z' },
      sessionId: 'session',
      ledger: ledger(),
    }),
    false,
    'a post-reopen bind supersedes the older closure'
  );
});

test('terminal release observation accepts the ledger unless a newer binding exists', () => {
  const records = new Map([
    ['/repo', null],
    ['/repo/wt', { issue: '#1297', boundAt: '2026-08-19T14:00:00.000Z' }],
  ]);
  const deps = {
    sessionId: 'session',
    resolveMain: () => '/repo',
    readLedger: () => ledger(),
    readOccupancy: () => ({}),
    collectCandidates: () => [...records.keys()],
    getActiveTask: (_sid, candidate) => records.get(candidate),
  };
  assert.deepEqual(
    inspectTerminalIssueBindingRelease({ projectDir: '/repo/wt', issue: '#1297', deps }),
    { status: 'incomplete', closedAt: CLOSED_AT }
  );
  records.set('/repo/wt', { issue: '#1297', boundAt: '2026-08-19T16:00:00.000Z' });
  assert.deepEqual(
    inspectTerminalIssueBindingRelease({ projectDir: '/repo/wt', issue: '#1297', deps }),
    { status: 'conflict', closedAt: CLOSED_AT },
    'a later rebind must not be adopted as already released'
  );
  records.set('/repo/wt', null);
  deps.readOccupancy = () => ({
    1297: {
      issue: 1297,
      sid: 'session',
      provider: 'codex',
      worktreePath: '/repo/wt',
      boundAt: '2026-08-19T14:00:00.000Z',
      lastHeartbeatAt: '2026-08-19T14:00:00.000Z',
    },
  });
  assert.deepEqual(
    inspectTerminalIssueBindingRelease({ projectDir: '/repo/wt', issue: '#1297', deps }),
    { status: 'incomplete', closedAt: CLOSED_AT },
    'a stale occupancy claim proves terminal binding cleanup is incomplete'
  );
});

test('terminal release resume reuses original ledger authority and clears only stale residue', () => {
  const records = new Map([
    ['/repo/wt-old', { issue: '#1297', boundAt: '2026-08-19T14:00:00.000Z' }],
    ['/repo/wt-new', { issue: '#1297', boundAt: '2026-08-19T16:00:00.000Z' }],
  ]);
  let occupancyReleases = 0;
  assert.throws(
    () =>
      resumeTerminalIssueBindingRelease({
        projectDir: '/repo/wt-new',
        issue: '#1297',
        deps: {
          sessionId: 'session',
          resolveMain: () => '/repo',
          readLedger: () => ledger(),
          collectCandidates: () => [...records.keys()],
          compareAndClearActiveTask: (_sid, candidate, predicate) => {
            const record = records.get(candidate);
            if (!predicate(record)) return { status: 'superseded', record };
            records.delete(candidate);
            return { status: 'cleared', record };
          },
          releaseOccupancyAtOrBefore: () => {
            occupancyReleases += 1;
            return { status: 'released' };
          },
          deregisterTask: () => {},
        },
      }),
    /closed-bindings:resume-conflict/
  );
  assert.equal(records.has('/repo/wt-new'), true);
  assert.equal(occupancyReleases, 0);

  records.delete('/repo/wt-new');
  let newerOccupancyPresent = true;
  assert.throws(
    () =>
      resumeTerminalIssueBindingRelease({
        projectDir: '/repo/wt-old',
        issue: '#1297',
        deps: {
          sessionId: 'session',
          resolveMain: () => '/repo',
          readLedger: () => ledger(),
          collectCandidates: () => [...records.keys()],
          compareAndClearActiveTask: () => ({ status: 'absent', record: null }),
          releaseOccupancyAtOrBefore: ({ closedAt }) => {
            assert.equal(closedAt, CLOSED_AT);
            if (newerOccupancyPresent) throw new Error('occupancy-terminal-release-refused');
            return { status: 'released' };
          },
          deregisterTask: () => {},
        },
      }),
    /occupancy-terminal-release-refused/
  );
  assert.equal(newerOccupancyPresent, true, 'newer occupancy survives the resume race');
  newerOccupancyPresent = false;
  const resumed = resumeTerminalIssueBindingRelease({
    projectDir: '/repo/wt-old',
    issue: '#1297',
    deps: {
      sessionId: 'session',
      resolveMain: () => '/repo',
      readLedger: () => ledger(),
      collectCandidates: () => [...records.keys()],
      compareAndClearActiveTask: (_sid, candidate, predicate) => {
        const record = records.get(candidate);
        if (!predicate(record)) return { status: 'superseded', record };
        records.delete(candidate);
        return { status: 'cleared', record };
      },
      releaseOccupancyAtOrBefore: () => {
        occupancyReleases += 1;
        return { status: 'released' };
      },
      deregisterTask: () => {},
    },
  });
  assert.equal(resumed.status, 'released');
  assert.equal(records.has('/repo/wt-old'), false);
  assert.equal(occupancyReleases, 1);
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
      compareAndClearActiveTask: (_sid, candidate, predicate) => {
        const record = records.get(candidate) ?? null;
        order.push(`compare:${candidate}`);
        if (!record || !predicate(record)) return { status: 'superseded', record };
        records.delete(candidate);
        return { status: 'cleared', record };
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
  assert.ok(order.includes('compare:/repo/wt-a'));
});

test('release CAS preserves a concurrent rebind to another issue or a reopened issue', () => {
  const records = new Map([
    ['/repo/wt-other', { issue: '#1298', boundAt: '2026-08-19T14:00:00.000Z' }],
    ['/repo/wt-reopen', { issue: '#1297', worktreeResolvedAt: '2026-08-19T16:00:00.000Z' }],
  ]);
  const result = releaseIssueBindings({
    projectDir: '/repo/wt-reopen',
    issue: '#1297',
    sessionId: 'session',
    closedAt: CLOSED_AT,
    deps: {
      resolveMain: () => '/repo',
      collectCandidates: () => [...records.keys()],
      markClosedBinding: () => ledger(),
      compareAndClearActiveTask: (_sid, candidate, predicate) => {
        const record = records.get(candidate);
        if (!predicate(record)) return { status: 'superseded', record };
        records.delete(candidate);
        return { status: 'cleared', record };
      },
    },
  });
  assert.deepEqual(result.released, []);
  assert.equal(records.get('/repo/wt-other').issue, '#1298');
  assert.equal(records.get('/repo/wt-reopen').issue, '#1297');
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
