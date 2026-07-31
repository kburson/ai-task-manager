// @story #1049

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { mutateIssueBody } from '../../../lib/issue-body-mutate.mjs';
import { stampBodyVersion } from '../../../lib/body-version.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeSource = readFileSync(path.resolve(__dirname, '../../../runtime.mjs'), 'utf8');

function authorityRefusal(code) {
  const error = new Error(`${code} body authority`);
  error.code = code;
  return error;
}

for (const code of ['lease-not-held', 'fence-stale', 'authority-forbidden']) {
  test(`${code} body authority invokes zero fetch, mutate, or push effects`, async () => {
    const effects = [];
    const authorityCalls = [];
    await assert.rejects(
      () =>
        mutateIssueBody({
          issueNumber: 1049,
          repo: 'owner/repo',
          mutate: () => {
            effects.push('mutate');
            return 'changed';
          },
          deps: {
            withGovernedEffect: async (options) => {
              authorityCalls.push(options);
              throw authorityRefusal(code);
            },
            fetchBody: async () => {
              effects.push('fetch');
              return stampBodyVersion('base', 1);
            },
            pushBody: async () => {
              effects.push('push');
            },
          },
        }),
      (error) => error.code === code
    );
    assert.deepEqual(authorityCalls, [
      { issueId: '1049', operation: 'issue-body-mutation', heartbeat: true },
    ]);
    assert.deepEqual(effects, []);
  });
}

test('body retry reverifies authority immediately before every remote push', async () => {
  let remote = stampBodyVersion(['header', 'A', 'mid', 'B', 'footer'].join('\n'), 1);
  let firstPush = true;
  const events = [];

  const result = await mutateIssueBody({
    issueNumber: 1049,
    repo: 'owner/repo',
    operation: 'evidence-mutation',
    mutate: (body) => body.replace('A', 'A-ours'),
    deps: {
      withGovernedEffect: async (options, callback) => {
        events.push(`verify:${options.operation}`);
        return callback({
          reverify: async () => {
            events.push('reverify');
          },
        });
      },
      fetchBody: async () => {
        events.push('fetch');
        return remote;
      },
      pushBody: async (_repo, _issue, next) => {
        events.push('push');
        remote = next;
        if (firstPush) {
          firstPush = false;
          remote = stampBodyVersion(['header', 'A', 'mid', 'B-theirs', 'footer'].join('\n'), 3);
        }
      },
    },
  });

  assert.equal(result.status, 'ok');
  assert.deepEqual(events, [
    'verify:evidence-mutation',
    'fetch',
    'reverify',
    'push',
    'fetch',
    'fetch',
    'reverify',
    'push',
    'fetch',
  ]);
  assert.match(remote, /A-ours/);
  assert.match(remote, /B-theirs/);
});

test('runtime evidence helpers surface authority refusal instead of enqueueing or swallowing it', () => {
  const safePost = runtimeSource.slice(
    runtimeSource.indexOf('ctx.safePostTiming ='),
    runtimeSource.indexOf('ctx.safeRecordSessionRef =')
  );
  const safeRecord = runtimeSource.slice(
    runtimeSource.indexOf('ctx.safeRecordSessionRef ='),
    runtimeSource.indexOf('ctx.safeReadLastRowTs =')
  );
  assert.match(
    safePost,
    /withGovernedEffect:\s*withGovernedEffect\s*\?\?\s*ctx\.withGovernedEffect/
  );
  assert.match(safePost, /if \(isGovernedAuthorityError\(err\)\) throw err/);
  assert.match(safeRecord, /operation:\s*'evidence-mutation'/);
  assert.match(safeRecord, /withGovernedEffect:\s*ctx\.withGovernedEffect/);
  assert.match(safeRecord, /if \(isGovernedAuthorityError\(err\)\) throw err/);
});
