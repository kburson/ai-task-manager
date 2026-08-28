// @story #1381
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProductionRuntime,
  parseIncidentLedgerArgs,
} from '../../../../task-tracker/verbs/incident-ledger.mjs';
import { verbHelp } from '../../../../task-tracker/verbs/help.mjs';

test('incident-ledger keeps record and approval as mutually exclusive explicit modes', () => {
  assert.deepEqual(parseIncidentLedgerArgs(['1381', '--record', '/tmp/ledger.json']), {
    issueNumber: 1381,
    mode: 'record',
    recordPath: '/tmp/ledger.json',
  });
  assert.deepEqual(
    parseIncidentLedgerArgs([
      '#1381',
      '--approve',
      '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      '--digest',
      `sha256:${'a'.repeat(64)}`,
    ]),
    {
      issueNumber: 1381,
      mode: 'approve',
      ledgerId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      ledgerDigest: `sha256:${'a'.repeat(64)}`,
    }
  );
  assert.throws(() => parseIncidentLedgerArgs(['1381', '--approve', 'bad', '--digest', 'bad']));
  assert.throws(() =>
    parseIncidentLedgerArgs([
      '1381',
      '--record',
      '/tmp/ledger.json',
      '--approve',
      '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    ])
  );
});

test('incident-ledger help and provider rule publish exact verifier phase syntax', async () => {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    verbHelp('incident-ledger');
  } finally {
    console.log = original;
  }
  const rendered = lines.join('\n');
  assert.match(
    rendered,
    /verify-delivery-incident-reconciliation\.mjs --issue 1381 --phase pre-close/
  );
  assert.match(rendered, /--phase terminal/);
  assert.match(rendered, /terminal is the default/i);
});

test('production runtime fetches and pins one fresh origin/trunk snapshot', async () => {
  const calls = [];
  const runtime = createProductionRuntime(
    {
      cfg: { repo: 'kburson/ai-task-manager' },
      projectDir: '/tmp/incident-ledger',
      getIssueBoardState: async () => 'Develop',
    },
    {
      run: async (bin, args) => {
        calls.push([bin, ...args]);
        if (bin === 'git' && args[0] === 'rev-parse') return { stdout: `${'a'.repeat(40)}\n` };
        return { stdout: '' };
      },
    }
  );
  assert.equal(await runtime.liveObservationDeps.readTrunkSha(), 'a'.repeat(40));
  assert.equal(await runtime.liveObservationDeps.readTrunkSha(), 'a'.repeat(40));
  assert.equal(await runtime.liveObservationDeps.isOnTrunk('b'.repeat(40)), true);
  assert.deepEqual(calls, [
    ['git', 'fetch', 'origin', 'trunk'],
    ['git', 'rev-parse', 'origin/trunk'],
    ['git', 'merge-base', '--is-ancestor', 'b'.repeat(40), 'a'.repeat(40)],
  ]);
});
