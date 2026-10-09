// @story #1912
// Original cases run in independent processes with intact fixtures and budgets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { parse } from 'acorn';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const directory = path.join(root, 'scripts/tests/integration/task-tracker/lib');
export const budget = 600_000;

export function discoverOriginalCases() {
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
export async function qualify(files, minimum, t) {
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

export async function qualifyOriginalCases(cases, t) {
  const queue = [...cases].sort((a, b) => a.filename.localeCompare(b.filename));
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
