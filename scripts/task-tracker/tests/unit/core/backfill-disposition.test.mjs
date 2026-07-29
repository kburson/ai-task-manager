// @story #1035 #1043
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deriveDisposition, main, parseArgs, runBackfill } from '../../../backfill-disposition.mjs';

test('deriveDisposition gives superseded marker precedence over NOT_PLANNED', () => {
  assert.equal(
    deriveDisposition({
      stateReason: 'NOT_PLANNED',
      body: '<!-- aitm-superseded-by refs="#1033" ts="T" -->',
    }),
    'Replaced'
  );
});

test('deriveDisposition maps delivered, duplicate, and discarded terminal evidence', () => {
  assert.equal(deriveDisposition({ stateReason: 'COMPLETED', body: '' }), 'Delivered');
  assert.equal(deriveDisposition({ stateReason: 'DUPLICATE', body: '' }), 'Duplicate');
  assert.equal(
    deriveDisposition({
      stateReason: 'NOT_PLANNED',
      body: '<!-- aitm-closed-as reason="not-planned" ts="T" -->',
    }),
    'Discarded'
  );
  assert.equal(
    deriveDisposition({
      stateReason: 'COMPLETED',
      body: '<!-- aitm-closed-as reason="duplicate" of="#1" ts="T" -->',
    }),
    'Duplicate'
  );
  assert.equal(deriveDisposition({ stateReason: 'OPEN', body: '' }), null);
});

test('parseArgs supports dry-run default, apply, and explicit issue scope', () => {
  assert.deepEqual(parseArgs([]), { apply: false, issueNumbers: [], yes: false });
  assert.deepEqual(parseArgs(['--apply', '--yes', '--issues', '1027,1028,#1032']), {
    apply: true,
    issueNumbers: [1027, 1028, 1032],
    yes: true,
  });
  assert.throws(() => parseArgs(['--wat']), /unknown flag/);
  assert.throws(() => parseArgs(['--issues', '']), /requires/);
});

const issues = [
  { number: 1027, stateReason: 'COMPLETED', body: '' },
  {
    number: 1028,
    stateReason: 'NOT_PLANNED',
    body: '<!-- aitm-superseded-by refs="#1033" ts="T" -->',
  },
  { number: 1034, stateReason: 'NOT_PLANNED', body: '' },
];

test('dry-run reports classifications without reading or writing the board', async () => {
  const writes = [];
  const result = await runBackfill({
    cfg: { repo: 'o/r', projectId: 'P', fieldDisposition: 'F' },
    issues,
    apply: false,
    deps: {
      readDisposition: async () => {
        throw new Error('dry-run must not read');
      },
      writeDisposition: async (input) => writes.push(input),
    },
  });
  assert.deepEqual(
    result.items.map(({ number, disposition, status }) => ({ number, disposition, status })),
    [
      { number: 1027, disposition: 'Delivered', status: 'planned' },
      { number: 1028, disposition: 'Replaced', status: 'planned' },
      { number: 1034, disposition: 'Discarded', status: 'planned' },
    ]
  );
  assert.deepEqual(writes, []);
});

test('apply skips unchanged values and writes only real classification deltas', async () => {
  const writes = [];
  const current = new Map([
    [1027, 'Delivered'],
    [1028, 'Discarded'],
    [1034, ''],
  ]);
  const result = await runBackfill({
    cfg: { repo: 'o/r', projectId: 'P', fieldDisposition: 'F' },
    issues,
    apply: true,
    deps: {
      readDisposition: async ({ issueNumber }) => current.get(issueNumber),
      writeDisposition: async (input) => writes.push(input),
    },
  });
  assert.deepEqual(
    result.items.map(({ number, status }) => ({ number, status })),
    [
      { number: 1027, status: 'unchanged' },
      { number: 1028, status: 'updated' },
      { number: 1034, status: 'updated' },
    ]
  );
  assert.deepEqual(
    writes.map(({ issueNumber, disposition }) => ({ issueNumber, disposition })),
    [
      { issueNumber: 1028, disposition: 'Replaced' },
      { issueNumber: 1034, disposition: 'Discarded' },
    ]
  );
});

test('apply records an isolated write failure and continues the sweep', async () => {
  const result = await runBackfill({
    cfg: { repo: 'o/r', projectId: 'P', fieldDisposition: 'F' },
    issues: issues.slice(0, 2),
    apply: true,
    deps: {
      readDisposition: async () => '',
      writeDisposition: async ({ issueNumber }) => {
        if (issueNumber === 1027) throw new Error('board offline');
      },
    },
  });
  assert.equal(result.items[0].status, 'failed');
  assert.match(result.items[0].error, /board offline/);
  assert.equal(result.items[1].status, 'updated');
  assert.equal(result.failed, 1);
});

function successfulSummary(overrides = {}) {
  return {
    apply: true,
    items: [],
    updated: 0,
    unchanged: 0,
    failed: 0,
    ...overrides,
  };
}

test('main refuses a declined multi-issue apply before the backfill runner', async () => {
  let backfillCalls = 0;
  let confirmation;
  const code = await main(['--apply'], {
    loadConfig: () => ({ repo: 'o/r' }),
    fetchClosedIssues: async () => issues.slice(0, 2),
    confirmBlastRadius: async (input) => {
      confirmation = input;
      return { proceed: false, reason: 'tty-declined', count: 2 };
    },
    runBackfill: async () => {
      backfillCalls += 1;
      return successfulSummary();
    },
    log: () => {},
    err: () => {},
  });
  assert.equal(code, 2);
  assert.equal(backfillCalls, 0);
  assert.deepEqual(confirmation.issueNumbers, [1027, 1028]);
  assert.equal(confirmation.yes, false);
});

test('main passes --yes to confirmation and preserves audit-by-default', async () => {
  const calls = [];
  const deps = {
    loadConfig: () => ({ repo: 'o/r' }),
    fetchClosedIssues: async () => issues.slice(0, 2),
    confirmBlastRadius: async (input) => {
      calls.push({ type: 'confirm', yes: input.yes });
      return { proceed: true, reason: 'yes-flag', count: 2 };
    },
    runBackfill: async (input) => {
      calls.push({ type: 'backfill', apply: input.apply });
      return successfulSummary({ apply: input.apply });
    },
    log: () => {},
    err: () => {},
  };

  assert.equal(await main(['--apply', '--yes'], deps), 0);
  assert.deepEqual(calls, [
    { type: 'confirm', yes: true },
    { type: 'backfill', apply: true },
  ]);

  calls.length = 0;
  assert.equal(await main([], deps), 0);
  assert.deepEqual(calls, [{ type: 'backfill', apply: false }]);
});

test('main distinguishes isolated item failures from orchestration failures', async () => {
  const base = {
    loadConfig: () => ({ repo: 'o/r' }),
    fetchClosedIssues: async () => issues.slice(0, 1),
    confirmBlastRadius: async () => ({ proceed: true }),
    log: () => {},
    err: () => {},
  };
  assert.equal(
    await main(['--apply'], {
      ...base,
      runBackfill: async () =>
        successfulSummary({
          failed: 1,
          items: [{ number: 1027, disposition: 'Delivered', status: 'failed' }],
        }),
    }),
    1
  );
  const errors = [];
  assert.equal(
    await main([], {
      ...base,
      loadConfig: () => {
        throw new Error('cfg.repo is required');
      },
      err: (line) => errors.push(line),
    }),
    2
  );
  assert.match(errors.join('\n'), /cfg\.repo is required/);
});
