// @story #2156
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, rmSync, realpathSync, mkdirSync, chmodSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';
import { saveState, loadState } from '../../../task-tracker/state.mjs';
import { stampBodyVersion } from '../../../task-tracker/lib/body-version.mjs';
import { setActiveTask, getActiveTask } from '../../../task-tracker/session-state.mjs';
import { parseDeliverablePosted } from '../../../task-tracker/lib/issue-kind.mjs';
import { validateNoCommitDeliveryPreflight } from '../../../task-tracker/lib/delivery-preflight.mjs';
import { requireDeliveryReceipt } from '../../../task-tracker/lib/close-delivery-receipt.mjs';
import {
  buildNoCommitDeliveryRecord,
  parseNoCommitDeliveryComment,
  projectNoCommitDeliveryRecords,
  renderNoCommitDeliveryComment,
} from '../../../task-tracker/lib/no-commit-delivery-record.mjs';
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

test('published spike marker feeds existing source-bound no-commit delivery and Close contracts', async (t) => {
  const f = await fixture(t);
  const result = await run(f);
  // Synthetic downstream qualification inputs exercise consumers, not live Test or Review evidence.
  const sha = f.git('rev-parse', 'HEAD');
  const lineage = { parentIssueNumber: null, deliveryTarget: 'trunk' };
  const qualified = {
    issue: {
      body: f.body,
      state: 'OPEN',
      projectState: 'Review',
      reviewAuthorization: { standing: true, mode: 'human' },
    },
    lineage,
    pullRequests: [],
    localHeadSha: sha,
    testReceiptSha: sha,
    acceptedReviewSha: sha,
  };
  assert.equal(validateNoCommitDeliveryPreflight(qualified).deliverable.url, result.url);
  assert.throws(
    () => validateNoCommitDeliveryPreflight({ ...qualified, acceptedReviewSha: 'b'.repeat(40) }),
    /no-commit-review-evidence/
  );
  const record = buildNoCommitDeliveryRecord({
    recordId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    repository: 'owner/repo',
    issueNumber: 2156,
    issueKind: 'spike',
    deliverableUrl: result.url,
    acceptedSha: sha,
    provider: 'codex',
    sessionId: f.sid,
    verifiedAt: spikeTimestamp,
  });
  const noCommitRecords = projectNoCommitDeliveryRecords([
    parseNoCommitDeliveryComment({
      id: 'fixture-delivery',
      createdAt: spikeTimestamp,
      body: renderNoCommitDeliveryComment(record),
    }),
  ]);
  const closeInput = {
    issueNumber: 2156,
    repository: 'owner/repo',
    body: f.body,
    lineage,
    branch: f.git('branch', '--show-current'),
    acceptedSha: sha,
    pullRequests: [],
    noCommitRecords,
  };
  assert.equal(requireDeliveryReceipt(closeInput).mode, 'no-commit');
  assert.throws(
    () => requireDeliveryReceipt({ ...closeInput, acceptedSha: 'b'.repeat(40) }),
    /head-mismatch/
  );
});

function publicCommand(f, args) {
  const configDir = path.join(f.root, '.ai-task-manager');
  const binaryDir = path.join(f.root, '.tmp/provider-bin');
  mkdirSync(configDir, { recursive: true });
  mkdirSync(binaryDir, { recursive: true });
  writeFileSync(path.join(configDir, 'task-tracker.json'), JSON.stringify(f.cfg));
  const snapshot = path.join(binaryDir, 'snapshot.json');
  writeFileSync(
    snapshot,
    JSON.stringify({
      data: {
        viewer: { login: 'owner' },
        repository: {
          issue: {
            body: f.body,
            state: 'OPEN',
            assignees: { nodes: [{ login: 'other' }] },
            projectItems: {
              nodes: [
                { id: 'PVTI_a', project: { id: 'PVT_a' }, fieldValueByName: { name: 'Develop' } },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      },
    })
  );
  const program =
    '#!/usr/bin/env node\n' +
    "const fs=require('node:fs');const args=process.argv.slice(2);\n" +
    "if(args[0]==='api'&&args[1]==='user'){process.stdout.write('owner\\n');}" +
    "else if(args[0]==='api'&&args[1]==='graphql'){fs.readFileSync(0);process.stdout.write(fs.readFileSync(" +
    JSON.stringify(snapshot) +
    ", 'utf8'));}" +
    "else{process.stderr.write('forbidden fixture provider effect');process.exitCode=90;}\n";
  const executable = path.join(binaryDir, 'gh');
  writeFileSync(executable, program);
  chmodSync(executable, 0o755);
  return spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../../../../bin/aitm.mjs', import.meta.url)), ...args],
    {
      cwd: f.root,
      encoding: 'utf8',
      timeout: 30000,
      env: {
        ...process.env,
        PATH: binaryDir + path.delimiter + process.env.PATH,
        AITM_GH_TEST_DOUBLE_BIN: binaryDir,
        TT_SKIP_NETWORK: '1',
        AI_TASK_MANAGER_PROJECT_DIR: f.root,
        TT_PROJECT_DIR: '',
        TASK_TRACKER_PROJECT_DIR: '',
        CLAUDE_PROJECT_DIR: '',
        AITM_CAPTURE_PROJECT_DIR: '',
      },
    }
  );
}

test('registered CLI help describes the Develop-only comment publication contract', async (t) => {
  const f = await fixture(t);
  const result = publicCommand(f, ['spike-deliverable', 'help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--from-comment/);
  assert.match(result.stdout, /Develop/);
});

test('public command grammar refuses malformed input with usage exit2 before effects', async (t) => {
  const f = await fixture(t);
  for (const args of [
    [],
    ['2156'],
    ['--from-comment', '50'],
    ['2156', '--from-comment', '50', '--unknown'],
    ['2156', '--from-comment', '50', '--from-comment', '50'],
  ]) {
    const result = publicCommand(f, ['spike-deliverable', ...args]);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /spike-deliverable:/);
    assert.equal(f.writes.length, 0);
  }
});

test('registered target-required preflight refuses a foreign issue before provider effects', async (t) => {
  const f = await fixture(t);
  const result = publicCommand(f, ['spike-deliverable', '2157', '--from-comment', '50']);
  assert.equal(result.status, 7, result.stderr);
  assert.match(result.stderr + result.stdout, /bind|active|2156/i);
});

test('registered dispatcher reaches mandatory live ownership despite network-skip preflight', async (t) => {
  const f = await fixture(t);
  const result = publicCommand(f, ['spike-deliverable', '2156', '--from-comment', '50']);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /spike-deliverable:ownership/);
  assert.equal(f.writes.length, 0);
});

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
