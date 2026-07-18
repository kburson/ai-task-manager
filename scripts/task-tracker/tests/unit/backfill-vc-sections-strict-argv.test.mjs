// @story #878
// #878 — the incident, reproduced.
//
// `backfill-vc-sections.mjs --apply --scope 877` silently dropped `--scope`,
// honored `--apply`, and wrote a VC section to all 11 open issues that needed
// one. The assertion that matters is not the exit code — it is that NOTHING was
// written and NO issue enumeration happened.
import test from 'node:test';
import assert from 'node:assert/strict';

import { main } from '../../backfill-vc-sections.mjs';
import { StrictArgvError } from '../../lib/argv-strict.mjs';

function spyDeps() {
  const calls = { listOpenIssues: 0, mutateIssueBody: 0, log: [], err: [] };
  return {
    calls,
    deps: {
      log: (s) => calls.log.push(s),
      err: (s) => calls.err.push(s),
      listOpenIssues: async () => {
        calls.listOpenIssues += 1;
        return [];
      },
      mutateIssueBody: async () => {
        calls.mutateIssueBody += 1;
        return { status: 'updated' };
      },
    },
  };
}

test('--apply --scope 877 refuses and writes nothing', async () => {
  const { calls, deps } = spyDeps();

  await assert.rejects(
    () => main(['--apply', '--scope', '877'], deps),
    (err) => {
      assert.ok(err instanceof StrictArgvError);
      assert.match(err.message, /unrecognized argument: --scope/);
      return true;
    }
  );

  assert.equal(calls.mutateIssueBody, 0, 'no issue body may be written');
  assert.equal(calls.listOpenIssues, 0, 'refusal must precede the gh issue list call');
});

test('the thrown error carries the usage text for the direct-invocation footer', async () => {
  const { deps } = spyDeps();
  await assert.rejects(
    () => main(['--bogus'], deps),
    (err) => {
      assert.ok(err instanceof StrictArgvError);
      assert.match(err.usage, /Usage: backfill-vc-sections\.mjs/);
      assert.match(err.usage, /--apply/);
      return true;
    }
  );
});

test('--help still short-circuits before any enumeration', async () => {
  const { calls, deps } = spyDeps();
  await main(['--help'], deps);
  assert.equal(calls.listOpenIssues, 0);
  assert.equal(calls.mutateIssueBody, 0);
  assert.match(calls.log.join('\n'), /Usage: backfill-vc-sections\.mjs/);
});

test('declared flags still work — audit default enumerates but never writes', async () => {
  const { calls, deps } = spyDeps();
  await main(['--dry-run'], deps);
  assert.equal(calls.listOpenIssues, 1);
  assert.equal(calls.mutateIssueBody, 0);
});
