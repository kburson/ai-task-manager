// @story #722
// AC1/AC2: `--help` prints usage and exits without any write or listing; the
// no-flag default is a safe audit-only run (no writes without `--apply`).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { main } from '../../../backfill-vc-sections.mjs';

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

// #878 tightened this from "an unrecognized flag falls through to audit-only"
// to an outright refusal. Silently degrading to audit was safe only because this
// script has no other flags; when the ignored token was meant to *narrow* an
// `--apply` run (`--apply --scope 877`), tolerance produced a repo-wide write.
test('an unrecognized flag is refused outright, not degraded to audit-only', async () => {
  let mutated = 0;
  let listed = 0;
  await assert.rejects(
    () =>
      main(['--bogus-flag'], {
        listOpenIssues: async () => {
          listed += 1;
          return [{ number: 1, body: ['# Title', '', 'no VC section here', ''].join('\n') }];
        },
        mutateIssueBody: async () => {
          mutated += 1;
          return { status: 'ok' };
        },
        log: () => {},
        err: () => {},
      }),
    (err) => {
      assert.equal(err.name, 'StrictArgvError');
      assert.match(err.message, /unrecognized argument: --bogus-flag/);
      return true;
    }
  );
  assert.equal(mutated, 0, 'unrecognized flag must never fall through to a live write');
  assert.equal(listed, 0, 'refusal must precede the gh issue list call');
});

console.log('backfill-vc-sections-help.test.mjs: all assertions passed');
