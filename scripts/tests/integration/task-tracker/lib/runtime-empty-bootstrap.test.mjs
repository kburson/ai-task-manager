// @story #1861
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { rmSync, writeFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { snapshotTree } from '../../../helpers/runtime-empty-contract-fixture.mjs';
import {
  parseRuntimeMigrationInvocation,
  classifyRuntimeMigrationInvocation,
} from '../../../../task-tracker/lib/runtime-migration-admission.mjs';
import { commandByName } from '../../../../task-tracker/lib/command-surface/catalog.mjs';
import * as handler from '../../../../task-tracker/verbs/migrate-runtime.mjs';
import { inspectRuntimeInitialization } from '../../../../task-tracker/lib/runtime-initialize.mjs';
import { inspectEmptyRuntimeInitialization } from '../../../../task-tracker/lib/runtime-empty-initialize.mjs';
import { assertRuntimeReadable } from '../../../../task-tracker/lib/runtime-storage.mjs';
const executable = fileURLToPath(new URL('../../../../../bin/aitm.mjs', import.meta.url));
const owner = {
  provider: 'fixture',
  sid: randomUUID(),
  pid: process.pid,
  processToken: randomUUID(),
  host: hostname(),
};
const adapters = {
  identity: () => owner,
  writerCensus: () => ({ complete: true, writers: [], claims: [], unknown: [] }),
};
function fixture(t) {
  const root = createRuntimeRootFixture('empty-bootstrap-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function registered(root, args) {
  return spawnSync(process.execPath, [executable, 'migrate-runtime', ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
    env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, LANG: 'en_US.UTF-8' },
  });
}
function request(roots, args) {
  const value = classifyRuntimeMigrationInvocation({
    argv: ['migrate-runtime', ...args],
    executable,
    physicalRoots: roots,
  });
  assert.ok(value, 'request must use actual registered executable and physical roots');
  return value;
}
// Production bootstrap without a real provider/session must stay read-only and typed.
test('physical pristine-main empty bootstrap refuses absent native identity without writes', (t) => {
  const root = fixture(t),
    before = snapshotTree(root),
    result = registered(root, ['initialize-plan']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /RUNTIME_MIGRATION_IDENTITY_REQUIRED|RUNTIME_EMPTY_INIT_REFUSED/);
  assert.deepEqual(snapshotTree(root), before);
});
test('closed initialize-resume grammar accepts both exact v2 and historical v1 forms', () => {
  const digest = 'sha256:' + 'a'.repeat(64),
    operation = 'b0395e70-7cfb-49f4-b82b-704fc0de33bc';
  for (const args of [
    ['initialize-resume', '--approved-plan', digest],
    [
      'initialize-resume',
      '--operation',
      operation,
      '--observed',
      digest,
      '--approved-plan',
      digest,
    ],
  ])
    assert.ok(parseRuntimeMigrationInvocation(['migrate-runtime', ...args]));
  for (const extra of [
    ['--operation', operation],
    ['--observed', digest],
    ['--operation', 'invalid', '--observed', digest],
    ['--operation', operation, '--observed', 'bad'],
    ['--operation', operation, '--observed', digest, '--pid', '1'],
    ['--operation', operation, '--observed', digest, '--root', '/tmp/other'],
  ])
    assert.equal(
      parseRuntimeMigrationInvocation([
        'migrate-runtime',
        'initialize-resume',
        '--approved-plan',
        digest,
        ...extra,
      ]),
      null
    );
});
for (const linked of [false, true])
  test(
    'registered initialization union publishes and exposes exact ' +
      (linked ? 'linked-v2' : 'main empty') +
      ' proof',
    async (t) => {
      assert.equal(typeof handler.executeRuntimeInitializationRequest, 'function');
      const root = fixture(t),
        main = { projectRoot: root, mainRoot: root };
      let plan = await handler.executeRuntimeInitializationRequest({
        request: request(main, ['initialize-plan']),
        roots: main,
        adapters,
      });
      assert.equal(plan.schema, 'aitm.runtime-empty-plan/v1');
      const file = path.join(root, 'approved-main.json');
      writeFileSync(file, JSON.stringify(plan));
      await handler.executeRuntimeInitializationRequest({
        request: request(main, [
          'initialize-apply',
          '--plan-file',
          file,
          '--approved-plan',
          plan.digest,
        ]),
        roots: main,
        adapters,
      });
      let roots = main;
      if (linked) {
        execFileSync('git', [
          '-C',
          root,
          '-c',
          'user.name=fixture',
          '-c',
          'user.email=fixture@example.test',
          'commit',
          '--allow-empty',
          '-qm',
          'fixture',
        ]);
        const local = root + '-linked';
        t.after(() => rmSync(local, { recursive: true, force: true }));
        execFileSync('git', ['-C', root, 'worktree', 'add', '-qb', 'linked', local]);
        roots = { projectRoot: local, mainRoot: root };
        plan = await handler.executeRuntimeInitializationRequest({
          request: request(roots, ['initialize-plan']),
          roots,
          adapters,
        });
        assert.equal(plan.schema, 'aitm.runtime-initialization-plan/v2');
        const localFile = path.join(root, 'approved-linked.json');
        writeFileSync(localFile, JSON.stringify(plan));
        await handler.executeRuntimeInitializationRequest({
          request: request(roots, [
            'initialize-apply',
            '--plan-file',
            localFile,
            '--approved-plan',
            plan.digest,
          ]),
          roots,
          adapters,
        });
      }
      const observed = linked
        ? inspectRuntimeInitialization({ ...roots, operationId: plan.operationId })
        : inspectEmptyRuntimeInitialization({ ...roots, operationId: plan.operationId });
      const before = snapshotTree(root);
      await assert.rejects(
        handler.executeRuntimeInitializationRequest({
          request: request(roots, ['initialize-resume', '--approved-plan', plan.digest]),
          roots,
          adapters,
        })
      );
      assert.deepEqual(snapshotTree(root), before);
      const resumed = await handler.executeRuntimeInitializationRequest({
        request: request(roots, [
          'initialize-resume',
          '--operation',
          plan.operationId,
          '--observed',
          observed.digest,
          '--approved-plan',
          plan.digest,
        ]),
        roots,
        adapters,
      });
      assert.equal(resumed.status, 'complete');
      assertRuntimeReadable(roots);
      const status = registered(roots.projectRoot, ['status']);
      assert.equal(status.status, 0, status.stderr);
      const value = JSON.parse(status.stdout);
      if (linked) assert.equal(value.initialization.operationId, plan.operationId);
      else assert.equal(value.emptyInitializations[0].operationId, plan.operationId);
    }
  );

// File inputs remain evidence, never a capability to select another physical root.
test('registered empty apply refuses foreign roots and aliased plan artifacts before writes', async (t) => {
  const root = fixture(t),
    other = fixture(t),
    roots = { projectRoot: root, mainRoot: root },
    foreign = { projectRoot: other, mainRoot: other };
  const plan = await handler.executeRuntimeInitializationRequest({
    request: request(roots, ['initialize-plan']),
    roots,
    adapters,
  });
  const file = path.join(root, 'approved.json');
  writeFileSync(file, JSON.stringify(plan));
  const alias = file + '.alias';
  symlinkSync(file, alias);
  for (const [target, planFile] of [
    [roots, alias],
    [foreign, file],
  ]) {
    const before = snapshotTree(target.projectRoot);
    await assert.rejects(
      handler.executeRuntimeInitializationRequest({
        request: request(target, [
          'initialize-apply',
          '--plan-file',
          planFile,
          '--approved-plan',
          plan.digest,
        ]),
        roots: target,
        adapters,
      }),
      { code: 'RUNTIME_MIGRATION_APPROVAL_REQUIRED' }
    );
    assert.deepEqual(snapshotTree(target.projectRoot), before);
  }
});
test('bootstrap status rejects mutation arguments and nonexistent operation preserves pristine bytes', async (t) => {
  const root = fixture(t),
    roots = { projectRoot: root, mainRoot: root },
    before = snapshotTree(root);
  const status = registered(root, ['status', '--payload', '{}']);
  assert.notEqual(status.status, 0);
  assert.match(status.stderr, /RUNTIME_MIGRATION_USAGE/);
  await assert.rejects(
    handler.executeRuntimeInitializationRequest({
      request: request(roots, [
        'initialize-resume',
        '--operation',
        randomUUID(),
        '--observed',
        'sha256:' + 'a'.repeat(64),
        '--approved-plan',
        'sha256:' + 'b'.repeat(64),
      ]),
      roots,
      adapters,
    }),
    { code: 'RUNTIME_CONTROL_INVALID' }
  );
  assert.deepEqual(snapshotTree(root), before);
});

// Public help examples must classify as the exact supported initialization operations.
test('public bootstrap initialization examples classify through the actual registered grammar', (t) => {
  const root = fixture(t),
    roots = { projectRoot: root, mainRoot: root };
  const descriptor = commandByName('migrate-runtime'),
    examples = descriptor.examples.filter((x) => x.includes(' initialize-'));
  assert.equal(examples.length, 3);
  const modes = [];
  for (const example of examples) {
    const text = example
      .replace('<path>', path.join(root, 'approved.json'))
      .replaceAll('<sha256:digest>', 'sha256:' + 'a'.repeat(64))
      .replace('<UUID>', 'b0395e70-7cfb-49f4-b82b-704fc0de33bc');
    const argv = text.split(' ').slice(1);
    const classified = classifyRuntimeMigrationInvocation({
      argv,
      executable,
      physicalRoots: roots,
    });
    assert.ok(classified, example);
    modes.push(classified.mode);
  }
  assert.deepEqual(modes, ['initialize-plan', 'initialize-apply', 'initialize-resume']);
});
