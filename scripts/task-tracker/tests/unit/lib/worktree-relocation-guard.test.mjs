// @story #1191
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  enforceIssueWorktreeLocation,
  parseWorktreeRelocationConfirmation,
  WorktreeRelocationRequiredError,
} from '../../../lib/worktree-relocation-guard.mjs';
import {
  parseIssueWorktreeLocations,
  serializeIssueWorktreeLocationMarker,
} from '../../../lib/issue-worktree-location.mjs';

const LIVE = {
  worktreePath: '/repo/.worktrees/1191',
  worktreeBranch: 'feature/child/1191',
};

const recordedBody = (location) =>
  `## Body\n\n${serializeIssueWorktreeLocationMarker({
    ...location,
    sessionId: 'prior-session',
    ts: '2026-08-10T00:00:00.000Z',
  })}\n`;

function depsFor({ body = '## Body\n', live = LIVE, sessionId = '' } = {}) {
  const calls = { fetch: 0, mutate: 0, mutatedBody: null };
  return {
    calls,
    deps: {
      resolveIdentity: () => live,
      sessionId: () => sessionId,
      now: () => '2026-08-10T01:00:00.000Z',
      fetchIssueBody: async () => {
        calls.fetch += 1;
        return body;
      },
      mutateIssueBody: async ({ mutate }) => {
        calls.mutate += 1;
        calls.mutatedBody = mutate(body);
        return { status: 'updated' };
      },
    },
  };
}

test('global confirmation flag is stripped and requires an explicit occurrence', () => {
  assert.deepEqual(parseWorktreeRelocationConfirmation(['start', '1191']), {
    argv: ['start', '1191'],
    confirmRelocation: false,
  });
  assert.deepEqual(parseWorktreeRelocationConfirmation(['start', '1191', '--confirm-relocation']), {
    argv: ['start', '1191'],
    confirmRelocation: true,
  });
});

test('AC2/AC6: marker-free issue records live location even with no session id', async () => {
  const fixture = depsFor();
  const result = await enforceIssueWorktreeLocation({
    verb: 'start',
    rest: ['1191'],
    cfg: { repo: 'owner/repo' },
    invokingDir: '/repo/.worktrees/1191/subdir',
    deps: fixture.deps,
  });
  assert.equal(result.status, 'recorded');
  assert.equal(fixture.calls.mutate, 1);
  assert.deepEqual(parseIssueWorktreeLocations(fixture.calls.mutatedBody)[0], {
    ...LIVE,
    sessionId: '',
    ts: '2026-08-10T01:00:00.000Z',
  });
});

test('AC1: numeric shorthand bind records the issue-resident location', async () => {
  const fixture = depsFor();
  const result = await enforceIssueWorktreeLocation({
    verb: '#1191',
    rest: [],
    cfg: { repo: 'owner/repo' },
    invokingDir: '/repo/.worktrees/1191',
    deps: fixture.deps,
  });
  assert.equal(result.status, 'recorded');
  assert.equal(fixture.calls.fetch, 1);
  assert.equal(fixture.calls.mutate, 1);
});

test('AC3: mismatch refuses before mutation and names recorded and live locations', async () => {
  const recorded = { worktreePath: '/repo/old', worktreeBranch: 'old-branch' };
  const fixture = depsFor({ body: recordedBody(recorded) });
  await assert.rejects(
    () =>
      enforceIssueWorktreeLocation({
        verb: 'start',
        rest: ['1191'],
        cfg: { repo: 'owner/repo' },
        invokingDir: '/repo/.worktrees/1191',
        deps: fixture.deps,
      }),
    (error) => {
      assert.ok(error instanceof WorktreeRelocationRequiredError);
      assert.match(error.message, /\/repo\/old \(old-branch\)/);
      assert.match(error.message, /\/repo\/\.worktrees\/1191 \(feature\/child\/1191\)/);
      assert.match(error.message, /--confirm-relocation/);
      return true;
    }
  );
  assert.equal(fixture.calls.mutate, 0);
});

test('AC4: explicit confirmation appends relocation history before proceeding', async () => {
  const recorded = { worktreePath: '/repo/old', worktreeBranch: 'old-branch' };
  const fixture = depsFor({ body: recordedBody(recorded), sessionId: 'new-session' });
  const result = await enforceIssueWorktreeLocation({
    verb: 'promote',
    rest: ['1191'],
    cfg: { repo: 'owner/repo' },
    invokingDir: '/repo/.worktrees/1191',
    confirmRelocation: true,
    deps: fixture.deps,
  });
  assert.equal(result.status, 'relocated');
  assert.equal(fixture.calls.mutate, 1);
  assert.deepEqual(
    parseIssueWorktreeLocations(fixture.calls.mutatedBody).map((entry) => ({
      worktreePath: entry.worktreePath,
      worktreeBranch: entry.worktreeBranch,
    })),
    [recorded, LIVE]
  );
});

test('AC5: same worktree root and branch, including subdirectory invocation, does not write', async () => {
  const fixture = depsFor({ body: recordedBody(LIVE) });
  const result = await enforceIssueWorktreeLocation({
    verb: 'review',
    rest: ['1191'],
    cfg: { repo: 'owner/repo' },
    invokingDir: '/repo/.worktrees/1191/nested/path',
    deps: fixture.deps,
  });
  assert.equal(result.status, 'matched');
  assert.equal(fixture.calls.fetch, 1);
  assert.equal(fixture.calls.mutate, 0);
});

test('non-lifecycle commands and target-free invocations do not read the issue', async () => {
  const fixture = depsFor();
  assert.deepEqual(
    await enforceIssueWorktreeLocation({
      verb: 'fleet',
      rest: ['1191'],
      cfg: { repo: 'owner/repo' },
      deps: fixture.deps,
    }),
    { status: 'not-applicable' }
  );
  assert.deepEqual(
    await enforceIssueWorktreeLocation({
      verb: 'promote',
      rest: [],
      cfg: { repo: 'owner/repo' },
      deps: fixture.deps,
    }),
    { status: 'unbound' }
  );
  assert.equal(fixture.calls.fetch, 0);
});

test('repository no-network mode preserves offline dispatcher preflight behavior', async () => {
  const fixture = depsFor();
  const result = await enforceIssueWorktreeLocation({
    verb: 'close',
    rest: ['1191'],
    cfg: { repo: 'owner/repo' },
    deps: { ...fixture.deps, env: { TT_SKIP_NETWORK: '1' } },
  });
  assert.deepEqual(result, { status: 'network-skipped' });
  assert.equal(fixture.calls.fetch, 0);
  assert.equal(fixture.calls.mutate, 0);
});

test('CLI entrypoint checks issue-resident location before local binding and verb preflight', () => {
  const source = readFileSync(new URL('../../../task-tracker.mjs', import.meta.url), 'utf8');
  const durable = source.indexOf('enforceIssueWorktreeLocation(');
  const local = source.indexOf('enforceVerbWorktreeBinding(');
  const preflight = source.indexOf('await runVerbPreflight(ctx);');
  assert.ok(durable > -1);
  assert.ok(durable < local);
  assert.ok(local < preflight);
});
