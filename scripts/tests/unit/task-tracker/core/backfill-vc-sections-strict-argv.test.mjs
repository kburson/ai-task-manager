// @story #878 @story #879
// #878 — the incident, reproduced: pre-#879, `backfill-vc-sections.mjs --apply
// --scope 877` silently dropped `--scope`, honored `--apply`, and wrote a VC
// section to all 11 open issues that needed one. #878 closed the silent-ignore
// half (an unknown flag now hard-refuses); #879 closes the underlying gap by
// implementing `--scope` for real. These cases assert the new behavior.
import test from 'node:test';
import assert from 'node:assert/strict';

import { main, buildVcBackfill } from '../../../../task-tracker/backfill-vc-sections.mjs';
import { StrictArgvError } from '../../../../task-tracker/lib/argv-strict.mjs';

const NEEDS_VC_BODY = '## Pickup Directive\n\nsome body with no VC section\n';
const HAS_VC_BODY =
  '## Verification Commands\n\n- [ ] `npm test` <!-- id=1 -->\n\n## Pickup Directive\n';

function spyDeps(issues = []) {
  const calls = { listOpenIssues: 0, mutateIssueBody: 0, log: [], err: [], exit: [] };
  return {
    calls,
    deps: {
      log: (s) => calls.log.push(s),
      err: (s) => calls.err.push(s),
      // Stub `exit` so a refusal path's `deps.exit(2)` records the code here
      // instead of falling through to `process.exitCode = 2`, which would
      // otherwise taint every other test in this same process/file.
      exit: (code) => calls.exit.push(code),
      listOpenIssues: async () => {
        calls.listOpenIssues += 1;
        return issues;
      },
      mutateIssueBody: async ({ issueNumber }) => {
        calls.mutateIssueBody += 1;
        return { status: 'updated', issueNumber };
      },
    },
  };
}

test('(a) --scope alongside --apply performs a filtered write', async () => {
  const { calls, deps } = spyDeps([
    { number: 877, body: NEEDS_VC_BODY },
    { number: 881, body: NEEDS_VC_BODY },
  ]);

  await main(['--apply', '--scope', '877', '--yes'], deps);

  assert.equal(calls.mutateIssueBody, 1, 'only the scoped issue is written');
  assert.ok(
    calls.log.some((l) => l.includes('#877') && l.includes('healed')),
    'scoped issue is reported healed'
  );
  assert.ok(
    !calls.log.some((l) => l.includes('#881')),
    'the out-of-scope issue is never mentioned'
  );
});

test('(b) --scope without --apply performs a filtered audit with no write', async () => {
  const { calls, deps } = spyDeps([
    { number: 877, body: NEEDS_VC_BODY },
    { number: 881, body: NEEDS_VC_BODY },
  ]);

  await main(['--scope', '877'], deps);

  assert.equal(calls.mutateIssueBody, 0, 'audit mode never writes');
  assert.ok(calls.log.some((l) => l.includes('#877')));
  assert.ok(!calls.log.some((l) => l.includes('#881')));
});

test('(c) an unmatched scope number hard-errors with zero writes', async () => {
  const { calls, deps } = spyDeps([{ number: 877, body: NEEDS_VC_BODY }]);

  await main(['--scope', '999', '--apply', '--yes'], deps);

  assert.equal(calls.mutateIssueBody, 0, 'no write may happen once an unmatched number is named');
  assert.ok(
    calls.err.some((l) => l.includes('999') && l.includes('not found')),
    'the unmatched number is named in the error'
  );
});

test('(d) a scope number matching an already-healed issue writes nothing but warns', async () => {
  const { calls, deps } = spyDeps([{ number: 877, body: HAS_VC_BODY }]);

  await main(['--scope', '877', '--apply', '--yes'], deps);

  assert.equal(calls.mutateIssueBody, 0, 'an already-healed scoped issue is never rewritten');
  assert.ok(
    calls.log.some((l) => l.includes('#877') && l.includes('scope-target-already-healed')),
    'the already-healed outcome is visible, not folded into a bare skipped tally'
  );
});

test('buildVcBackfill is unaffected by --scope (pure-core sanity)', () => {
  assert.equal(buildVcBackfill(HAS_VC_BODY).status, 'skip');
  assert.equal(buildVcBackfill(NEEDS_VC_BODY).status, 'healed');
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
