// @story #1912
// Qualify actual original native cases; each process retains its own complete
// fixture, actor, ordering and private authority. No simulated prefix replay.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { parse } from 'acorn';

const root = fileURLToPath(new URL('../../../../..', import.meta.url));
const directory = path.join(root, 'scripts/tests/integration/task-tracker/lib');
const budget = 600_000;

function discoverOriginalCases() {
  const cases = [];
  for (const filename of fs.readdirSync(directory).filter((name) => name.endsWith('.test.mjs'))) {
    const ast = parse(fs.readFileSync(path.join(directory, filename), 'utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'module',
    });
    const imported = ast.body.some(
      (node) =>
        node.type === 'ImportDeclaration' &&
        node.source.value === './native-stage-continuation-fixture.mjs' &&
        node.specifiers.some((value) => value.imported?.name === 'registerNativeStageCase')
    );
    if (!imported) continue;
    for (const statement of ast.body) {
      const call = statement.expression;
      if (
        statement.type !== 'ExpressionStatement' ||
        call?.type !== 'CallExpression' ||
        call.callee.name !== 'registerNativeStageCase'
      )
        continue;
      const rawMode = call.arguments[0]?.value;
      const mode = rawMode === false ? 'guard-fence' : rawMode;
      if (typeof mode !== 'string') {
        assert.ok(
          ['native-stage-complete-saga.test.mjs'].includes(filename),
          `Undiscovered dynamic mode requires classification: ${filename}`
        );
        continue;
      }
      const fault = call.arguments[2];
      let descriptor = null;
      if (fault) {
        assert.equal(fault.type, 'ObjectExpression');
        descriptor = Object.fromEntries(
          fault.properties.map((property) => {
            assert.equal(property.type, 'Property');
            assert.equal(property.value.type, 'Literal');
            return [property.key.name, property.value.value];
          })
        );
      }
      cases.push({ filename, mode, fault: descriptor });
    }
  }
  return cases;
}
const discovered = discoverOriginalCases();
const sentinel = discovered.filter((value) =>
  ['sentinel-complete', 'sentinel-prefix'].includes(value.mode)
);
const negativeModes = new Set([
  'guard-fence',
  'sentinel-data',
  'sentinel-history',
  'actor-override',
  'sentinel-late-persist-token-accessor',
  'sentinel-late-persist-invocation-identity',
  'sentinel-late-context-executor-accessor',
]);
const negatives = discovered.filter((value) => negativeModes.has(value.mode));

test('independent original descriptors account for the complete sentinel and all eight fault points', (t) => {
  assert.equal(sentinel.filter((value) => value.mode === 'sentinel-complete').length, 1);
  const faults = sentinel.filter((value) => value.mode === 'sentinel-prefix');
  assert.equal(faults.length, 8);
  assert.deepEqual(
    faults.map((value) => `${value.fault.when}:${value.fault.suffix}`).sort(),
    ['failBefore', 'failAfter']
      .flatMap((when) =>
        ['intent-write', 'intent-readback', 'effect-write', 'effect-readback'].map(
          (suffix) => `${when}:${suffix}`
        )
      )
      .sort()
  );
  assert.deepEqual(negatives.map((value) => value.mode).sort(), [...negativeModes].sort());
  assert.equal(new Set([...sentinel, ...negatives].map((value) => value.filename)).size, 16);
  t.diagnostic(JSON.stringify([...sentinel, ...negatives]));
});

async function qualify(files, minimum, t) {
  const paths = files.map((file) => path.join(root, file));
  for (const file of paths)
    assert.ok(fs.statSync(file).isFile(), `Missing original verifier: ${file}`);
  const env = {
    ...process.env,
    AI_TASK_MANAGER_SESSION_ID: 'fixture-1912-profile',
    AI_TASK_MANAGER_APP_NAME: 'claude',
  };
  delete env.NODE_TEST_CONTEXT;
  const result = await new Promise((resolve) =>
    execFile(
      process.execPath,
      ['--test', '--test-concurrency=1', '--test-reporter=tap', ...paths],
      { cwd: root, env, encoding: 'utf8', timeout: budget, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => resolve({ error, stdout, stderr })
    )
  );
  if (result.error) t.diagnostic(result.stdout + result.stderr);
  assert.ifError(result.error);
  const count = Number(result.stdout.match(new RegExp('^# tests (\\d+)\\s*$', 'm'))?.[1]);
  assert.ok(count >= minimum, `No empty or partial original selection: ${count}`);
  for (const field of ['fail', 'cancelled', 'skipped'])
    assert.match(result.stdout, new RegExp(`^# ${field} 0\\s*$`, 'm'));
  t.diagnostic(`${files.join(', ')}: ${count} complete original cases`);
}

test('complete original prefix DATA and custody regressions', { timeout: budget }, (t) =>
  qualify(
    [
      'scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-execution-resources.test.mjs',
      'scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-body-data.test.mjs',
      'scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-local-data.test.mjs',
      'scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-sentinel-boundary.test.mjs',
      'scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-board-attempts.test.mjs',
    ],
    61,
    t
  )
);

test(
  'actual original sentinel and source/request cases retain their full prefix and verified facts',
  { timeout: budget, concurrency: true },
  async (t) => {
    const queue = [...sentinel, ...negatives].sort((a, b) => a.filename.localeCompare(b.filename));
    let cursor = 0;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (cursor < queue.length) {
          const item = queue[cursor++];
          await t.test(item.filename, { timeout: budget }, (child) =>
            qualify([`scripts/tests/integration/task-tracker/lib/${item.filename}`], 1, child)
          );
        }
      })
    );
    assert.equal(cursor, queue.length);
  }
);
