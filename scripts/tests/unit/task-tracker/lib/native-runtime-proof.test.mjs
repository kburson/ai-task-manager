// @story #2088
// @story #2106
// cspell:ignore Xmjs
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  runtimeProofNonce,
  compareObservedHelpers,
} from '../../../../task-tracker/lib/native-runtime-proof.mjs';
import { bindingProofNonce } from '../../../../task-tracker/lib/native-binding-proof.mjs';

const nonce = 'a'.repeat(32);
const publicBin = 'node_modules/@kburson/ai-task-manager/bin/aitm.mjs';
const helperPath = path.resolve('runtime-helper-fixture.mjs');
function observation() {
  return {
    schema: 'aitm.runtime-observation/v1',
    helperModule: {
      url: pathToFileURL(helperPath).href,
      evidence: 'actual-helper-module-only',
      file: { status: 'present', kind: 'file', resolvedPath: helperPath, sha256: 'a'.repeat(64) },
    },
  };
}

test('runtime nonce recognition accepts only the two exact public invocation forms', () => {
  for (const bin of ['npx aitm', publicBin]) {
    const command = `${bin} doctor --json --runtime-proof ${nonce}`;
    assert.equal(runtimeProofNonce(command), nonce);
    assert.equal(runtimeProofNonce(`env AITM_GRAPHQL_USAGE=1 TT_FULL_AUTO=1 ${command}`), nonce);
    for (const candidate of [
      command + '\n',
      command + '; true',
      command + ' --json',
      command + ' > receipt',
      command + ' # comment',
      `env ${command}`,
      command.replace(nonce, '../escape'),
    ]) {
      assert.equal(runtimeProofNonce(candidate), null);
    }
  }
  assert.equal(
    runtimeProofNonce(`somewhere/${publicBin} doctor --json --runtime-proof ${nonce}`),
    null
  );
  assert.equal(
    runtimeProofNonce(
      publicBin.replace('.mjs', 'Xmjs') + ` doctor --json --runtime-proof ${nonce}`
    ),
    null
  );
});

test('runtime and original binding proof commands remain separate domains', () => {
  const binding = `npx aitm doctor --json --binding-proof ${nonce}`;
  const runtime = `npx aitm doctor --json --runtime-proof ${nonce}`;
  assert.equal(bindingProofNonce(binding), nonce);
  assert.equal(runtimeProofNonce(binding), null);
  assert.equal(bindingProofNonce(runtime), null);
});

test('only two present canonical helper URL and byte observations can agree', () => {
  const hook = observation(),
    cli = observation();
  assert.equal(compareObservedHelpers(hook, cli).sameObservedHelper, true);
  assert.equal(compareObservedHelpers(hook, cli).scope, 'observed-helper-only-not-whole-runtime');
  cli.helperModule.file.sha256 = 'b'.repeat(64);
  assert.equal(compareObservedHelpers(hook, cli).sameObservedHelper, false);
  const other = observation();
  other.helperModule.url = pathToFileURL(helperPath + '.other').href;
  other.helperModule.file.resolvedPath = helperPath + '.other';
  assert.equal(compareObservedHelpers(hook, other).sameObservedHelper, false);
});

test('unknown, null or unsupported observations cannot compare into a success', () => {
  for (const transform of [
    () => null,
    () => ({}),
    (value) => ({ ...value, schema: 'unknown' }),
    (value) => ({ ...value, helperModule: { ...value.helperModule, url: null } }),
    (value) => ({
      ...value,
      helperModule: {
        ...value.helperModule,
        file: { ...value.helperModule.file, status: 'unavailable', sha256: null },
      },
    }),
    (value) => ({
      ...value,
      helperModule: { ...value.helperModule, file: { ...value.helperModule.file, sha256: null } },
    }),
  ]) {
    const unknown = transform(observation());
    assert.equal(compareObservedHelpers(unknown, unknown).sameObservedHelper, false);
    assert.equal(compareObservedHelpers(observation(), unknown).sameObservedHelper, false);
  }
});

test('noncanonical URL aliases and inconsistent reported file paths stay non-green', () => {
  const unknown = observation();
  unknown.helperModule.url = unknown.helperModule.url.replace(
    '/runtime-helper-fixture.mjs',
    '/missing/../runtime-helper-fixture.mjs'
  );
  assert.equal(compareObservedHelpers(unknown, unknown).sameObservedHelper, false);
  const wrongFile = observation();
  wrongFile.helperModule.file.resolvedPath = helperPath + '.different';
  assert.equal(compareObservedHelpers(wrongFile, wrongFile).sameObservedHelper, false);
});
