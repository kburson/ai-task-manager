// @story #2148
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertRefusal,
  fixture,
  hasNativeActor,
  nativeSid,
  number,
  waitForCall,
} from '../../helpers/location-authority-fixture.mjs';
import { withIssueLock } from '../../../task-tracker/issue-mutator-lock.mjs';
import { activeTaskPath, occupancyPath, sessionsDir } from '../../../task-tracker/paths.mjs';
import {
  parseIssueWorktreeLocations,
  serializeIssueWorktreeLocationMarker,
} from '../../../task-tracker/lib/issue-worktree-location.mjs';
import { getActiveTask } from '../../../task-tracker/session-state.mjs';
import { readLocationActor } from '../../../task-tracker/lib/location-mutation-authority.mjs';
import { assertOccupancyAvailable } from '../../../task-tracker/lib/occupancy.mjs';

for (const change of ['checkout', 'configured target']) {
  test('locked writer observes changed ' + change, { skip: !hasNativeActor }, async (t) => {
    const f = fixture(t);
    let completion;
    await withIssueLock({ issue: number, verb: 'fixture-hold', projDir: f.root }, async () => {
      completion = f.start();
      await waitForCall(f, 'assignment-read');
      if (change === 'checkout') f.git('switch', '-qc', 'changed');
      else
        writeFileSync(
          path.join(f.root, '.ai-task-manager/task-tracker.json'),
          JSON.stringify({ repo: 'fixture/other', projectId: 'board', kanbanFieldId: 'status' })
        );
    });
    const result = await completion;
    assertRefusal(f, f.issue, result);
    assert.match(result.output, /authority changed|target changed/);
  });
}

test(
  'writer detects a checkout change during its final provider read',
  { skip: !hasNativeActor },
  async (t) => {
    const f = fixture(t);
    const before = { ...f.issue, scenario: { holdFinalObservation: true } };
    f.save(before);
    const result = f.start();
    try {
      await waitForCall(f, 'await-local-change');
      f.git('switch', '-qc', 'changed-during-read');
    } finally {
      writeFileSync(path.join(f.root, '.provider/continue'), '');
    }
    assertRefusal(f, before, await result);
  }
);

test(
  'matched Start rechecks a relocated issue before binding',
  { skip: !hasNativeActor },
  async (t) => {
    const f = fixture(t);
    const marker = (worktreePath, worktreeBranch) =>
      serializeIssueWorktreeLocationMarker({
        worktreePath,
        worktreeBranch,
        sessionId: 'prior',
        ts: '2026-09-01T00:00:00Z',
      });
    const entry = f.issue.body + marker(f.root, f.git('branch', '--show-current').trim()) + '\n';
    const afterEntry = { body: entry + marker('/relocated', 'other') + '\n' };
    const before = { ...f.issue, body: entry, scenario: { afterEntry } };
    f.save(before);
    assertRefusal(f, { ...before, ...afterEntry, raced: true }, await f.start());
  }
);

test('provider call reader waits for a complete record', (t) => {
  const f = fixture(t),
    file = path.join(f.root, '.provider/calls.jsonl');
  writeFileSync(file, '{"kind":"complete"}\n{"kind":');
  assert.deepEqual(f.calls(), [{ kind: 'complete' }]);
  writeFileSync(file, '"pending"}\n', { flag: 'a' });
  assert.deepEqual(f.calls(), [{ kind: 'complete' }, { kind: 'pending' }]);
});

test('public Start refuses a terminal fallback before its first location write', async (t) => {
  const f = fixture(t);
  const result = await f.start({ terminal: true, confirm: true });
  assertRefusal(f, f.issue, result);
  assert.match(result.output, /actor|session/i);
});

test('matched location cannot legitimize a terminal actor', async (t) => {
  const f = fixture(t);
  const marker = serializeIssueWorktreeLocationMarker({
    worktreePath: f.root,
    worktreeBranch: f.git('branch', '--show-current').trim(),
    sessionId: 'prior',
    ts: '2026-08-01T00:00:00Z',
  });
  const before = { ...f.issue, body: f.issue.body + marker + '\n' };
  f.save(before);
  assertRefusal(f, before, await f.start({ terminal: true }));
});

test('malformed and reserved actor values cannot authorize a location', () => {
  for (const sid of ['', '../bad', 'default-session', 'default', 'unknown']) {
    assert.throws(() => readLocationActor({ provider: 'codex', env: {}, sid }), {
      code: 'TIMING_ACTOR_INVALID',
    });
  }
});

for (const owners of [['elsewhere'], ['operator', 'elsewhere']]) {
  test(
    'public Start refuses these owners without any location, binding or timing write: ' + owners,
    { skip: !hasNativeActor },
    async (t) => {
      const f = fixture(t, owners);
      const result = await f.start({ confirm: true });
      assert.equal(result.status, 10, result.output);
      assertRefusal(f, f.issue, result);
    }
  );
}

test(
  'entry authorization expires when a foreign owner takes over before the first write',
  { skip: !hasNativeActor },
  async (t) => {
    const f = fixture(t);
    f.save({ ...f.issue, scenario: { afterEntry: { owners: ['elsewhere'] } } });
    const result = await f.start({ confirm: true });
    assert.equal(result.status, 10, result.output);
    assert.equal(f.read().body, f.issue.body);
    assert.equal(f.calls().filter((c) => c.kind === 'body-write').length, 0);
    assert.equal(getActiveTask(nativeSid, f.root), null);
    assert.equal(existsSync(occupancyPath(f.root)), false);
  }
);

test(
  'a retry rechecks the provider owner before a second location write',
  { skip: !hasNativeActor },
  async (t) => {
    const f = fixture(t);
    f.save({ ...f.issue, scenario: { afterWrite: { owners: ['elsewhere'] } } });
    const result = await f.start({ confirm: true });
    assert.equal(result.status, 10, result.output);
    assert.equal(f.calls().filter((c) => c.kind === 'body-write').length, 1);
    assert.equal(f.read().body, 'Concurrent note\n' + f.issue.body);
    assert.equal(getActiveTask(nativeSid, f.root), null);
    assert.equal(existsSync(occupancyPath(f.root)), false);
  }
);

for (const relocation of [false, true]) {
  test(
    'public Start binds and records the genuine session, confirmed relocation=' + relocation,
    { skip: !hasNativeActor },
    async (t) => {
      const f = fixture(t);
      const prior = serializeIssueWorktreeLocationMarker({
        worktreePath: '/fixture/prior',
        worktreeBranch: 'prior',
        sessionId: 'historical',
        ts: '2026-09-01T00:00:00Z',
      });
      if (relocation) f.save({ ...f.issue, body: f.issue.body + prior + '\n' });
      const result = await f.start({ confirm: relocation });
      const diagnostics =
        result.output + JSON.stringify(f.calls().filter((c) => c.kind === 'refused'));
      assert.equal(result.status, 0, diagnostics);
      const record = getActiveTask(nativeSid, f.root);
      assert.equal(record?.issue, '#2148', diagnostics);
      const holder = JSON.parse(readFileSync(occupancyPath(f.root), 'utf8'))[number];
      assert.equal(holder.sid, nativeSid);
      assert.equal(holder.bindingGenerationId, record.bindingGenerationId);
      assert.ok(record.entryStartTs);
      const locations = parseIssueWorktreeLocations(f.read().body);
      assert.equal(locations.length, relocation ? 2 : 1);
      assert.equal(locations.at(-1).sessionId, nativeSid);
      assert.equal(locations.at(-1).worktreePath, f.root);
      if (relocation) assert.ok(f.read().body.includes(prior));
      assert.ok(
        f.read().comments.some((c) => c.body.includes('aitm-actor:')),
        diagnostics
      );
      assert.deepEqual(
        f.calls().filter((c) => c.kind === 'refused'),
        []
      );
    }
  );
}

for (const [reason, afterEntry] of [
  ['board state', { state: 'Develop' }],
  [
    'recorded state',
    { body: '<!-- aitm-last-known-state state="review" ts="2026-03-01T00:00:00Z" -->\n' },
  ],
  [
    'location history',
    {
      body: '<!-- aitm-worktree-location worktree="/prior" branch="other" sid="prior" ts="2026-03-01T00:00:00Z" -->\n',
    },
  ],
  ['unreadable ownership', { failSnapshot: true }],
]) {
  test(
    'public Start refuses changed ' + reason + ' on the fresh write base',
    { skip: !hasNativeActor },
    async (t) => {
      const f = fixture(t);
      f.save({ ...f.issue, scenario: { afterEntry } });
      const result = await f.start({ confirm: true });
      assert.notEqual(result.status, 0, result.output);
      assert.equal(f.read().body, afterEntry.body ?? f.issue.body);
      assert.deepEqual(
        f.calls().filter((c) => c.kind.endsWith('-write')),
        []
      );
      assert.equal(getActiveTask(nativeSid, f.root), null);
      assert.equal(existsSync(occupancyPath(f.root)), false);
    }
  );
}

test(
  'disjoint retry preserves an unrelated concurrent body edit',
  { skip: !hasNativeActor },
  async (t) => {
    const f = fixture(t);
    const concurrent =
      'Concurrent note\n' + f.issue.body + '<!-- aitm-body-version version="2" -->\n';
    f.save({ ...f.issue, scenario: { afterWrite: { body: concurrent } } });
    const result = await f.start();
    assert.equal(result.status, 0, result.output);
    assert.ok(f.read().body.startsWith('Concurrent note\n'));
    assert.match(f.read().body, /aitm-body-version version="[3-9]\d*"/);
    assert.equal(parseIssueWorktreeLocations(f.read().body).length, 1);
    assert.equal(getActiveTask(nativeSid, f.root)?.issue, '#2148');
  }
);

test(
  'an inherited lock token cannot authorize the first location append',
  { skip: !hasNativeActor },
  async (t) => {
    const f = fixture(t);
    assertRefusal(f, f.issue, await f.start({ inheritedLock: true }));
  }
);

test('foreign provider cannot adopt an occupied actor SID', () => {
  const row = {
    issue: number,
    provider: 'codex',
    sid: 'shared-correlation',
    worktreePath: '/fixture',
  };
  assert.throws(
    () =>
      assertOccupancyAvailable(
        { [number]: row },
        { issue: number, provider: 'claude', sid: row.sid, worktreePath: '/fixture' }
      ),
    { code: 'occupancy-issue-held' }
  );
});

test(
  'an invalid trailing marker is rejected even when the last parseable location matches',
  { skip: !hasNativeActor },
  async (t) => {
    const f = fixture(t);
    const marker = serializeIssueWorktreeLocationMarker({
      worktreePath: f.root,
      worktreeBranch: f.git('branch', '--show-current').trim(),
      sessionId: 'prior',
      ts: '2026-08-01T00:00:00Z',
    });
    const before = {
      ...f.issue,
      body: f.issue.body + marker + '\n<!-- aitm-worktree-location invalid="yes" -->\n',
    };
    f.save(before);
    assertRefusal(f, before, await f.start());
  }
);

for (const field of ['body', 'owners'])
  test(
    'same-version ' + field + ' changes during the final provider read are preserved',
    { skip: !hasNativeActor },
    async (t) => {
      const f = fixture(t);
      const before = { ...f.issue, scenario: { holdFinalObservation: true } };
      const concurrent = {
        ...before,
        ...(field === 'body'
          ? { body: before.body + 'Latest owner note.\n' }
          : { owners: ['foreign'] }),
      };
      f.save(before);
      const result = f.start();
      try {
        await waitForCall(f, 'await-local-change');
        f.save(concurrent);
      } finally {
        writeFileSync(path.join(f.root, '.provider/continue'), '');
      }
      const received = await result;
      if (field === 'owners') assert.equal(received.status, 10, received.output);
      assertRefusal(f, concurrent, received);
    }
  );

test(
  'an invalid public Start target cannot select a later numeric argument for a location write',
  { skip: !hasNativeActor },
  async (t) => {
    const f = fixture(t);
    assertRefusal(f, f.issue, await f.start({ command: ['start', 'typo', String(number)] }));
  }
);

test(
  'an ambient Git selector cannot change occupancy and issue lock roots',
  { skip: !hasNativeActor },
  async (t) => {
    const f = fixture(t),
      other = fixture(t);
    assertRefusal(f, f.issue, await f.start({ gitDir: path.join(other.root, '.git') }));
    assert.equal(existsSync(occupancyPath(other.root)), false);
  }
);

for (const command of [['start', '2148'], ['resume', '2148'], ['#2148']]) {
  test(
    'native bound branch change cannot be adopted from a subdirectory with ' + command[0],
    { skip: !hasNativeActor },
    async (t) => {
      const f = fixture(t);
      const bind = await f.start();
      assert.equal(bind.status, 0, bind.output);
      const before = f.read();
      const bound = getActiveTask(nativeSid, f.root);
      const occupancy = readFileSync(occupancyPath(f.root), 'utf8');
      f.git('switch', '-qc', 'changed-after-bind');
      const sub = path.join(f.root, 'subdir');
      mkdirSync(sub);
      writeFileSync(path.join(sub, 'dirty.txt'), 'unrelated work');
      const result = await f.start({ command, cwd: sub, confirm: true });
      assert.notEqual(result.status, 0, result.output);
      assert.match(result.output, /native branch renewal/);
      assert.deepEqual(f.read(), before);
      assert.deepEqual(getActiveTask(nativeSid, f.root), bound);
      assert.equal(readFileSync(occupancyPath(f.root), 'utf8'), occupancy);
    }
  );
}

test(
  'public Resume accepts a legacy decimal string binding',
  { skip: !hasNativeActor },
  async (t) => {
    const f = fixture(t);
    const started = await f.start();
    assert.equal(started.status, 0, started.output);
    const record = activeTaskPath(nativeSid, f.root);
    const active = getActiveTask(nativeSid, f.root);
    writeFileSync(record, JSON.stringify({ ...active, issue: String(number) }));
    const resumed = await f.start({ command: ['resume', String(number)] });
    assert.equal(resumed.status, 0, resumed.output);
    assert.equal(parseIssueWorktreeLocations(f.read().body).length, 1);
    assert.equal(getActiveTask(nativeSid, f.root)?.bindingGenerationId, active.bindingGenerationId);
  }
);

for (const shape of ['invalid JSON', 'numeric issue'])
  test(
    'public Start preserves a damaged binding without recording a new location: ' + shape,
    { skip: !hasNativeActor },
    async (t) => {
      const f = fixture(t);
      const directory = path.join(sessionsDir(f.root), nativeSid);
      mkdirSync(directory, { recursive: true });
      const record = path.join(directory, 'active-task.json');
      const content =
        shape === 'invalid JSON'
          ? '{"damaged"'
          : JSON.stringify({
              issue: 17,
              worktreeBranch: f.git('branch', '--show-current').trim(),
              worktreePath: f.root,
            });
      writeFileSync(record, content);
      const result = await f.start();
      assert.notEqual(result.status, 0, result.output);
      if (shape === 'numeric issue') assert.match(result.output, /unreadable active binding/);
      assert.deepEqual(f.read(), f.issue);
      assert.equal(readFileSync(record, 'utf8'), content);
      assert.equal(existsSync(occupancyPath(f.root)), false);
    }
  );

test('registered non-native actor inputs work without authorizing a guessed transcript SID', () => {
  const sid = 'registered-provider-session';
  for (const [provider, env] of [
    ['claude', { CLAUDE_CODE_SESSION_ID: sid }],
    ['grok', { GROK_SESSION_ID: sid }],
    ['grok', { GROK_AGENT: '1', AI_TASK_MANAGER_SESSION_ID: sid }],
  ])
    assert.deepEqual(readLocationActor({ env, provider, sid }), { provider, sid });
  for (const [provider, env] of [
    ['grok', { CLAUDE_SESSION_ID: sid }],
    ['claude', { GROK_SESSION_ID: sid }],
  ])
    assert.throws(
      () =>
        readLocationActor({ provider, sid, env: { ...env, AI_TASK_MANAGER_APP_NAME: provider } }),
      /attributable/
    );
  // cspell:ignore CLAUDECODE
  assert.throws(
    () =>
      readLocationActor({
        env: { CLAUDECODE: '1' },
        provider: 'claude',
        sid: 'guessed-from-transcript',
      }),
    /attributable/
  );
});

test(
  'broken recorded state cannot be mistaken for a marker-free first bind',
  { skip: !hasNativeActor },
  async (t) => {
    const f = fixture(t);
    const before = {
      ...f.issue,
      body: f.issue.body + '<!-- aitm-last-known-state state=broken -->\n',
    };
    f.save(before);
    assertRefusal(f, before, await f.start());
  }
);

test(
  'matching location with foreign assignees refuses before a requested worktree override audit',
  { skip: !hasNativeActor },
  async (t) => {
    const f = fixture(t);
    const first = await f.start();
    assert.equal(first.status, 0, first.output);
    const alternate = path.join(f.root, '.provider', 'alternate');
    f.git('worktree', 'add', '-q', '-b', 'alternate', alternate, 'HEAD');
    const held = getActiveTask(nativeSid, f.root);
    const occupancy = readFileSync(occupancyPath(f.root), 'utf8');
    const after = f.read();
    after.owners = ['foreign'];
    after.body +=
      serializeIssueWorktreeLocationMarker({
        worktreePath: alternate,
        worktreeBranch: 'alternate',
        sessionId: 'prior',
        ts: '2026-09-01T00:00:00Z',
      }) + '\n';
    f.save(after);
    const offset = f.calls().length;
    const result = await f.start({
      cwd: alternate,
      command: ['start', '2148', '--allow-foreign-worktree'],
    });
    assert.equal(result.status, 10, result.output);
    assert.deepEqual(f.read(), after);
    assert.deepEqual(
      f
        .calls()
        .slice(offset)
        .filter((call) => call.kind.endsWith('-write') || call.kind === 'refused'),
      []
    );
    assert.deepEqual(getActiveTask(nativeSid, f.root), held);
    assert.equal(readFileSync(occupancyPath(f.root), 'utf8'), occupancy);
  }
);

test('unknown explicit provider and disagreeing native IDs are refused', () => {
  const sid = 'fixture-correlation';
  assert.throws(() =>
    readLocationActor({ provider: 'unknown', sid, env: { AI_TASK_MANAGER_SESSION_ID: sid } })
  );
  assert.throws(() =>
    readLocationActor({
      provider: 'codex',
      sid,
      env: { CODEX_SESSION_ID: sid, CODEX_THREAD_ID: 'different' },
    })
  );
});

test(
  'writer refuses a regressed body version despite otherwise identical location authority',
  { skip: !hasNativeActor },
  async (t) => {
    const f = fixture(t);
    const lower = f.issue.body + '<!-- aitm-body-version version="1" -->\n';
    f.save({
      ...f.issue,
      body: f.issue.body + '<!-- aitm-body-version version="2" -->\n',
      scenario: { afterEntry: { body: lower } },
    });
    const result = await f.start();
    assert.notEqual(result.status, 0, result.output);
    assert.equal(f.read().body, lower);
    assert.deepEqual(
      f.calls().filter((c) => c.kind.endsWith('-write')),
      []
    );
  }
);
