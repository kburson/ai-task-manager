// @story #1618
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const configInitCli = fileURLToPath(
  new URL('../../../../../task-tracker/config-init.mjs', import.meta.url)
);

function runConfigInit(raw) {
  return spawnSync(process.execPath, [configInitCli, 'inspect-workflows'], {
    encoding: 'utf8',
    env: { ...process.env, PROJECT_WORKFLOWS_RAW: raw },
  });
}

test('inspect-workflows emits parseable classified JSON for a complete inventory', () => {
  const result = runConfigInit(
    JSON.stringify({
      complete: true,
      workflows: [{ name: 'Auto-close issue', number: 3, enabled: true }],
    })
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).incompatible, [
    { name: 'Auto-close issue', number: 3, enabled: true },
  ]);
});

test('inspect-workflows fails closed for malformed or incomplete input', () => {
  for (const raw of ['{', JSON.stringify({ complete: false, workflows: [] })]) {
    const result = runConfigInit(raw);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /compatibility could not be verified/i);
  }
});
