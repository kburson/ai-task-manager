// @story #722
// AC1/AC2: `--help` prints usage and exits without any write or listing; the
// no-flag default is a safe audit-only run (no writes without `--apply`).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { main } from '../../backfill-vc-sections.mjs';

test('--help prints usage, never calls listOpenIssues or mutateIssueBody', async () => {
  const logs = [];
  let listed = false;
  let mutated = false;
  await main(['--help'], {
    listOpenIssues: async () => {
      listed = true;
      return [];
    },
    mutateIssueBody: async () => {
      mutated = true;
      return { status: 'ok' };
    },
    log: (s) => logs.push(s),
    err: () => {},
  });
  assert.match(logs.join('\n'), /Usage: backfill-vc-sections\.mjs/);
  assert.equal(listed, false, '--help must never enumerate issues');
  assert.equal(mutated, false, '--help must never write');
});

test('-h is a recognized alias for --help', async () => {
  const logs = [];
  let listed = false;
  await main(['-h'], {
    listOpenIssues: async () => {
      listed = true;
      return [];
    },
    mutateIssueBody: async () => ({ status: 'ok' }),
    log: (s) => logs.push(s),
    err: () => {},
  });
  assert.match(logs.join('\n'), /Usage: backfill-vc-sections\.mjs/);
  assert.equal(listed, false);
});

test('no flags defaults to audit-only — no writes without --apply', async () => {
  const logs = [];
  let mutated = 0;
  await main([], {
    listOpenIssues: async () => [
      { number: 1, body: ['# Title', '', 'no VC section here', ''].join('\n') },
    ],
    mutateIssueBody: async () => {
      mutated += 1;
      return { status: 'ok' };
    },
    log: (s) => logs.push(s),
    err: () => {},
  });
  assert.equal(mutated, 0, 'default run must never write');
  assert.match(logs.join('\n'), /audit — no writes; pass --apply to write/);
});

test('an unrecognized flag also defaults to audit-only, not live-write', async () => {
  const logs = [];
  let mutated = 0;
  await main(['--bogus-flag'], {
    listOpenIssues: async () => [
      { number: 1, body: ['# Title', '', 'no VC section here', ''].join('\n') },
    ],
    mutateIssueBody: async () => {
      mutated += 1;
      return { status: 'ok' };
    },
    log: (s) => logs.push(s),
    err: () => {},
  });
  assert.equal(mutated, 0, 'unrecognized flag must never fall through to a live write');
});

console.log('backfill-vc-sections-help.test.mjs: all assertions passed');
