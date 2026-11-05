// @story #2156
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync, realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';
import { saveState, loadState } from '../../../task-tracker/state.mjs';
import { stampBodyVersion } from '../../../task-tracker/lib/body-version.mjs';
import { setActiveTask, getActiveTask } from '../../../task-tracker/session-state.mjs';
import { parseDeliverablePosted } from '../../../task-tracker/lib/issue-kind.mjs';
import { currentUnitAuthority } from '../../unit/task-tracker/lib/decomposition-unit-admission-fixture.mjs';
import {
  spikeProviderFixture,
  spikeUrl,
  spikeTimestamp,
} from '../../fixtures/spike-deliverable-provider.mjs';

const api = await import('../../../task-tracker/verbs/spike-deliverable.mjs').catch((error) => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});

async function fixture(t) {
  const f = spikeProviderFixture();
  const root = realpathSync(mkdtempProjectIsolated('spike-deliverable-2156-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('config', 'user.name', 'Spike Fixture');
  git('config', 'user.email', 'spike@example.invalid');
  writeFileSync(path.join(root, 'source.txt'), 'stable investigation source\n');
  git('add', '-f', 'source.txt');
  git('commit', '-qm', '[#2156] isolated investigation source');
  const sid = '2156-fixture-' + randomUUID();
  const before = {
    CODEX_THREAD_ID: process.env.CODEX_THREAD_ID,
    AI_TASK_MANAGER_SESSION_ID: process.env.AI_TASK_MANAGER_SESSION_ID,
  };
  process.env.CODEX_THREAD_ID = sid;
  delete process.env.AI_TASK_MANAGER_SESSION_ID;
  t.after(() => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const statePath = path.join(root, '.tmp/aitm/state/task-tracker-state.json');
  saveState(
    {
      ...f.timer,
      worktreePath: root,
      worktreeBranch: git('branch', '--show-current'),
      bindingGenerationId: randomUUID(),
    },
    statePath
  );
  const authority = await currentUnitAuthority({
    body: f.body,
    issue: 2156,
    repository: 'owner/repo',
    hours: 4,
  });
  Object.defineProperty(f, 'body', {
    get: () => authority.authority.body,
    set: (value) => {
      authority.authority.body = value;
    },
    configurable: true,
  });
  f.root = root;
  f.git = git;
  f.sid = sid;
  f.statePath = statePath;
  f.ctx = { ...f.ctx, projectDir: root, statePath };
  f.deps = {
    ...f.transport,
    decomposition: { subject: authority.subject, runtime: authority.runtime },
  };
  return f;
}

async function run(f) {
  assert.equal(typeof api.runSpikeDeliverable, 'function', 'missing guarded native spike writer');
  return api.runSpikeDeliverable(f.ctx, f.deps);
}

test('real Git/binding, GraphQL ownership projection and governed writer publish once then no-op', async (t) => {
  const f = await fixture(t);
  const head = f.git('rev-parse', 'HEAD');
  const result = await run(f);
  assert.equal(result.status, 'recorded');
  assert.equal(result.sourceSha, head);
  assert.deepEqual(parseDeliverablePosted(f.body), { url: spikeUrl, ts: spikeTimestamp });
  const after = f.body;
  const repeated = await run(f);
  assert.equal(repeated.status, 'no-op');
  assert.equal(f.body, after);
  assert.equal(f.writes.length, 1);
  assert.equal(f.git('rev-parse', 'HEAD'), head);
});

test('real dirty tracked source refuses before a provider write', async (t) => {
  const f = await fixture(t);
  writeFileSync(path.join(f.root, 'source.txt'), 'uncommitted source\n');
  await assert.rejects(() => run(f), /spike-deliverable:/);
  assert.equal(f.writes.length, 0);
});

test('real binding generation changes during comment observation cannot publish', async (t) => {
  const f = await fixture(t);
  f.hooks.beforeComment = () => {
    const binding = getActiveTask(f.sid, f.root);
    setActiveTask(f.sid, { ...binding, bindingGenerationId: randomUUID() }, f.root);
  };
  await assert.rejects(() => run(f), /spike-deliverable:/);
  assert.equal(f.writes.length, 0);
});

test('real source commit advancement during comment observation refuses', async (t) => {
  const f = await fixture(t);
  let advanced = false;
  f.hooks.beforeComment = () => {
    if (advanced) return;
    writeFileSync(path.join(f.root, 'source.txt'), 'advanced source\n');
    f.git('commit', '-qam', '[#2156] isolated source advancement');
    advanced = true;
  };
  await assert.rejects(() => run(f), /spike-deliverable:/);
  assert.equal(f.writes.length, 0);
});

test('real timer pause after initial report read cannot retain invocation authority', async (t) => {
  const f = await fixture(t);
  f.hooks.beforeComment = () => {
    saveState(
      {
        ...loadState(f.statePath),
        active: null,
        entryStartTs: null,
        wordsAtEntryStart: 0,
        pausedAtTs: spikeTimestamp,
      },
      f.statePath
    );
  };
  await assert.rejects(() => run(f), /spike-deliverable:/);
  assert.equal(f.writes.length, 0);
});

test('closed native binding is refused even with an apparently active timer', async (t) => {
  const f = await fixture(t);
  setActiveTask(f.sid, { ...getActiveTask(f.sid, f.root), closedAt: spikeTimestamp }, f.root);
  await assert.rejects(() => run(f), /spike-deliverable:/);
  assert.equal(f.writes.length, 0);
});

test('actual scoped-deliverable admission refuses a foreign authority subject', async (t) => {
  const f = await fixture(t);
  f.deps.decomposition.subject = { ...f.deps.decomposition.subject, issue: 2157 };
  await assert.rejects(() => run(f), /spike-deliverable:/);
  assert.equal(f.writes.length, 0);
});

test('real governed retry preserves unrelated content and checks current native authority', async (t) => {
  const f = await fixture(t);
  const original = f.body;
  f.hooks.push = (candidate) => {
    f.body =
      f.writes.length === 1
        ? stampBodyVersion(original + '\n\n## Notes\n\nConcurrent report note.\n', 2)
        : candidate;
  };
  assert.equal((await run(f)).status, 'recorded');
  assert.equal(f.writes.length, 2);
  assert.ok(f.body.includes('Concurrent report note.'));
  assert.deepEqual(parseDeliverablePosted(f.body), { url: spikeUrl, ts: spikeTimestamp });
});

test('post-write comment change is reported as uncertainty while preserving actual marker', async (t) => {
  const f = await fixture(t);
  f.hooks.afterPush = () => {
    f.comment.body += '\nEdited after write.';
  };
  await assert.rejects(() => run(f), /spike-deliverable:comment-drift/);
  assert.equal(f.writes.length, 1);
  assert.deepEqual(parseDeliverablePosted(f.body), { url: spikeUrl, ts: spikeTimestamp });
});

test('ignored investigative findings remain local without changing source or publication', async (t) => {
  const f = await fixture(t);
  const head = f.git('rev-parse', 'HEAD');
  writeFileSync(path.join(f.root, 'findings.md'), '# Preserved local experiment findings\n');
  assert.equal((await run(f)).status, 'recorded');
  assert.equal(f.git('rev-parse', 'HEAD'), head);
});
