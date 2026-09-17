// @story #1654
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { captureLegacyWorkflow } from '../../../helpers/guidance-legacy-cli.mjs';
import { reconcileTransportLedger } from '../../../helpers/guidance-legacy-transport.mjs';

test('guidance legacy transport rejects an empty positive ledger', () => {
  assert.throws(
    () => reconcileTransportLedger([{ id: 'required' }], []),
    /physical transport ledger is empty/
  );
});

function writeScenario(root, name, source) {
  const file = path.join(root, name);
  writeFileSync(file, source);
  return file;
}

test('preload intercepts callback, promise, sync, spawn, nested Node and HTTP lanes', () => {
  const scratchRoot = path.join(process.cwd(), '.tmp/aitm/1654-transport-test');
  mkdirSync(scratchRoot, { recursive: true });
  const fixtureRoot = path.join(scratchRoot, `fixtures-${process.pid}`);
  mkdirSync(fixtureRoot, { recursive: true });
  const nested = writeScenario(
    fixtureRoot,
    'nested.mjs',
    `import { execFile } from 'node:child_process';\nexecFile('nested-tool', ['read'], (error, stdout) => { if (error) throw error; process.stdout.write(stdout); });\n`
  );
  const main = writeScenario(
    fixtureRoot,
    'main.mjs',
    `
import { execFile, exec, execFileSync, spawn, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import { ghClient } from '${path.join(process.cwd(), 'scripts/gh/lib/gh-client.mjs')}';
const callback = await new Promise((resolve, reject) => execFile('callback-tool', ['one'], (e, out, err) => e ? reject(e) : resolve({ out, err })));
const shell = await new Promise((resolve, reject) => exec('shell-tool two', (e, out, err) => e ? reject(e) : resolve({ out, err })));
const promised = promisify(execFile)('promise-tool', ['three']);
if (!promised.child) throw new Error('missing promise.child');
const promiseResult = await promised;
let promiseError;
try { await promisify(execFile)('error-tool', ['fail']); } catch (error) { promiseError = { message: error.message, code: error.code, stdout: error.stdout, stderr: error.stderr }; }
const aliasResult = await ghClient.pexec('alias-tool', ['four']);
const sync = execFileSync('sync-tool', ['five'], { encoding: 'utf8' });
const spawned = await new Promise((resolve) => { const child = spawn('spawn-tool', ['six']); let out = ''; child.stdout.on('data', c => out += c); child.on('close', code => resolve({ code, out })); });
const syncSpawn = spawnSync('spawn-sync-tool', ['seven'], { encoding: 'utf8' });
const nestedResult = await promisify(execFile)(process.execPath, ['${nested}']);
const network = await new Promise((resolve, reject) => { http.get('http://fixture.local/data', response => { let body = ''; response.on('data', c => body += c); response.on('end', () => resolve({ status: response.statusCode, body })); }).on('error', reject); });
console.log(JSON.stringify({ callback, shell, promiseResult, promiseError, aliasResult, sync, spawned, syncSpawn: syncSpawn.stdout, nested: nestedResult.stdout, network, poisoned: process.env.TT_SKIP_NETWORK ?? null }));
`
  );
  const requests = [
    {
      id: 'callback',
      lane: 'execFile',
      file: 'callback-tool',
      args: ['one'],
      response: { stdout: 'callback-ok', stderr: 'callback-note' },
    },
    { id: 'exec', lane: 'exec', command: 'shell-tool two', response: { stdout: 'exec-ok' } },
    {
      id: 'promise',
      lane: 'execFile',
      file: 'promise-tool',
      args: ['three'],
      response: { stdout: 'promise-ok', stderr: 'promise-note' },
    },
    {
      id: 'promise-error',
      lane: 'execFile',
      file: 'error-tool',
      args: ['fail'],
      response: { error: 'fixture failed', code: 23, stdout: 'partial', stderr: 'failure detail' },
    },
    {
      id: 'alias',
      lane: 'execFile',
      file: 'alias-tool',
      args: ['four'],
      response: { stdout: 'alias-ok' },
    },
    {
      id: 'sync',
      lane: 'execFileSync',
      file: 'sync-tool',
      args: ['five'],
      response: { stdout: 'sync-ok' },
    },
    {
      id: 'spawn',
      lane: 'spawn',
      file: 'spawn-tool',
      args: ['six'],
      response: { stdout: 'spawn-ok' },
    },
    {
      id: 'spawn-sync',
      lane: 'spawnSync',
      file: 'spawn-sync-tool',
      args: ['seven'],
      response: { stdout: 'spawn-sync-ok' },
    },
    {
      id: 'nested-node',
      lane: 'execFile',
      file: process.execPath,
      args: [nested],
      response: { delegate: true },
    },
    {
      id: 'nested-transport',
      lane: 'execFile',
      file: 'nested-tool',
      args: ['read'],
      response: { stdout: 'nested-ok' },
    },
    {
      id: 'http',
      lane: 'http',
      url: 'http://fixture.local/data',
      response: { statusCode: 207, body: 'http-ok' },
    },
  ];
  const capture = captureLegacyWorkflow({
    sourceCommit: '0123456789abcdef0123456789abcdef01234567',
    adapter: 'codex',
    scenario: { entrypoint: main, requests, env: { TT_SKIP_NETWORK: '1' } },
    authorityFixture: path.join(fixtureRoot, 'authority.json'),
    scratchRoot,
  });
  assert.equal(capture.status, 0, capture.stderr);
  assert.equal(capture.runtime, process.version);
  assert.deepEqual(
    capture.transportLedger.map((row) => row.requestId),
    requests.map((request) => request.id)
  );
  const output = JSON.parse(capture.stdout.trim());
  assert.deepEqual(output.callback, { out: 'callback-ok', err: 'callback-note' });
  assert.deepEqual(output.promiseResult, { stdout: 'promise-ok', stderr: 'promise-note' });
  assert.deepEqual(output.promiseError, {
    message: 'fixture failed',
    code: 23,
    stdout: 'partial',
    stderr: 'failure detail',
  });
  assert.deepEqual(output.aliasResult, { stdout: 'alias-ok', stderr: '' });
  assert.equal(output.nested, 'nested-ok');
  assert.deepEqual(output.network, { status: 207, body: 'http-ok' });
  assert.equal(output.poisoned, null);
  assert.equal(capture.environmentKeys.includes('TT_SKIP_NETWORK'), false);
});

test('caught undeclared subprocesses still fail the outer capture with ledger evidence', () => {
  const scratchRoot = path.join(process.cwd(), '.tmp/aitm/1654-transport-escape');
  mkdirSync(scratchRoot, { recursive: true });
  const entrypoint = writeScenario(
    scratchRoot,
    `escape-${process.pid}.mjs`,
    `import { execFileSync } from 'node:child_process';\nimport http from 'node:http';\ntry { execFileSync('not-declared', []); } catch {}\ntry { http.get('http://not-declared.local/'); } catch {}\n`
  );
  assert.throws(
    () =>
      captureLegacyWorkflow({
        sourceCommit: 'a'.repeat(40),
        adapter: 'claude',
        scenario: { entrypoint, requests: [] },
        scratchRoot,
      }),
    (error) => {
      assert.match(error.message, /undeclared physical transport/);
      assert.equal(error.capture.status, 0);
      assert.equal(error.capture.transportEscapes.length, 2);
      assert.equal(error.capture.transportEscapes[0].file, 'not-declared');
      assert.equal(error.capture.transportEscapes[1].url, 'http://not-declared.local/');
      return true;
    }
  );
});

test('ledger reconciliation detects a restored native custom-promisify bypass', () => {
  assert.throws(
    () => reconcileTransportLedger([{ id: 'promise-canary' }], [{ requestId: 'some-other-call' }]),
    /does not reconcile/
  );
});

test('restoring a native custom symbol fails the positive local canary', () => {
  const scratchRoot = path.join(process.cwd(), '.tmp/aitm/1654-transport-native-symbol');
  mkdirSync(scratchRoot, { recursive: true });
  const entrypoint = writeScenario(
    scratchRoot,
    `native-symbol-${process.pid}.mjs`,
    `import childProcess from 'node:child_process';\nimport { promisify } from 'node:util';\nchildProcess.execFile[promisify.custom] = () => Promise.resolve({ stdout: 'bypassed', stderr: '' });\nawait promisify(childProcess.execFile)('canary-tool', []);\n`
  );
  assert.throws(
    () =>
      captureLegacyWorkflow({
        sourceCommit: 'b'.repeat(40),
        adapter: 'codex',
        scenario: {
          entrypoint,
          requests: [
            {
              id: 'canary',
              lane: 'execFile',
              file: 'canary-tool',
              args: [],
              response: { stdout: 'intercepted' },
            },
          ],
        },
        scratchRoot,
      }),
    /physical transport ledger is empty/
  );
});
