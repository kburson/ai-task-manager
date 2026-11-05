// @story #2146
// Run from the real committed carrier in CI/native verification. Missing history
// or uncommitted tooling is a failure, never a skip or network fallback.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(
  new URL('../../../../research/2146-native-recovery/verify.mjs', import.meta.url)
);

for (const mode of ['report', 'plan']) {
  test(`strict committed carrier verifies ${mode} with actual historical objects and CI metadata`, () => {
    const beforeEnv = { ...process.env };
    const childEnv = { ...beforeEnv };
    const workflow = readFileSync(path.join(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
    for (const name of [
      'GIT_AUTHOR_NAME',
      'GIT_AUTHOR_EMAIL',
      'GIT_COMMITTER_NAME',
      'GIT_COMMITTER_EMAIL',
    ]) {
      const declaration = workflow.split('\n').find((line) => line.startsWith('  ' + name + ': '));
      assert.ok(declaration, name + ' workflow declaration missing');
      // Test-only CI fixture: preserve existing values, including empty strings.
      if (!Object.hasOwn(childEnv, name))
        childEnv[name] = declaration.slice(('  ' + name + ': ').length);
    }
    const run = spawnSync(process.execPath, [script, mode], {
      cwd: process.cwd(),
      env: childEnv,
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 2 * 1024 * 1024,
    });
    assert.deepEqual({ ...process.env }, beforeEnv);
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.match(result.archiveCarrierCommit, /^[a-f0-9]{40}$/);
    assert.equal(result.archiveCarrierClean, true);
    assert.equal(result.historicalSourceCommit, '2fd89e1103a0ee1976e0e1a1210c2d4e1bb57de0');
    assert.equal(result.historicalSourceTree, '36a4b5ba652094df909b05b4a99352bb7e41233d');
    assert.equal(result.historicalReconstructionClean, true);
    assert.equal(result.executionRecords, 81);
    assert.equal(result.matrixCases, 16);
    assert.equal(result.exactRecovery, 'UNIMPLEMENTED');
    assert.equal(result.nativeHostActivation, 'UNPROVEN');
    assert.equal(result.artifact, mode);
    assert.equal(Object.hasOwn(result, 'sourceClean'), false);
    assert.ok(result.gitCommands.some((row) => row.args.includes('cat-file') && row.status === 0));
    assert.equal(
      result.gitCommands.some((row) =>
        row.args.some((arg) => ['fetch', 'push', 'pull'].includes(arg))
      ),
      false
    );
  });
}
