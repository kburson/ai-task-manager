// @story #952
// A pre-#864 body's `tests` DoD verifier may still declare the retired single
// `npm run test:all` command. `runVerbTest` must auto-migrate it to the
// two-lane split (`npm test` + `npm run test:slow`) via `migrateTestsLaneSplit`
// BEFORE the sandbox runs — otherwise the sandbox hits
// `npm error Missing script: "test:all"` and the transition fails silently
// (see the #952 deep-dive). All I/O is stubbed; no real worktree, npm, or gh.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

import { runVerbTest } from '../../../../task-tracker/verbs/test.mjs';

const cfg = { repo: 'o/r' };

const LEGACY_BODY = [
  '## Scope',
  'stuff',
  '',
  '## Verification Commands',
  '- [ ] `npm run test:all` <!-- id=1 -->',
  '- [ ] `npm run lint` <!-- id=2 -->',
  '',
  '## Definition of Done',
  '',
  '### Functional (verified at Test)',
  '',
  '- [ ] All automated tests pass <!-- aitm-verified cmd="`npm run test:all`" --> <!-- dod:functional:tests -->',
  '',
].join('\n');

function makeDeps(bodyText) {
  const calls = { bodyWrites: [], sandboxRuns: [], moves: [], comments: [], logs: [] };
  const deps = { fetchBody: async () => bodyText };
  deps.mutateBody = async ({ mutate }) => {
    const base = await deps.fetchBody();
    const next = mutate(base);
    if (next === base) return { status: 'no-op' };
    calls.bodyWrites.push(next);
    return { status: 'ok' };
  };
  Object.assign(deps, {
    postComment: async ({ body }) => calls.comments.push(body),
    getHeadSha: async () => 'abc1234deadbeef',
    createWorktree: async () => {},
    removeWorktree: async () => {},
    npmCi: async () => {},
    execInSandbox: async ({ argv }) => {
      calls.sandboxRuns.push(argv.join(' '));
      return { exit: 0, stdout: '', stderr: '' };
    },
    moveState: async ({ target }) => calls.moves.push(target),
    logIssueTime: async (n) => calls.logs.push(n),
  });
  return { calls, deps };
}

function withTmpDir(fn) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'test-verb-lane-split-'));
  return Promise.resolve(fn(dir)).finally(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  });
}

test('#952: pre-#864 body — sandbox never sees npm run test:all, both lanes run', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps(LEGACY_BODY);
    const r = await runVerbTest({ cfg, issueNumber: 952, projectDir, deps });
    assert.equal(r.status, 'passed');

    assert.ok(
      !calls.sandboxRuns.some((c) => c === 'npm run test:all'),
      `sandbox must never invoke the retired script; ran: ${JSON.stringify(calls.sandboxRuns)}`
    );
    assert.ok(calls.sandboxRuns.includes('npm test'), 'fast lane must run');
    assert.ok(calls.sandboxRuns.includes('npm run test:slow'), 'slow lane must run');
    assert.ok(calls.sandboxRuns.includes('npm run lint'), 'unrelated VC entries stay untouched');

    // The migration write happened (DoD line + VC mirror), distinct from the
    // later aitm-test-started / aitm-dod-verified marker writes. The retired
    // command text legitimately survives in the VC tombstone comment (audit
    // trail), so match on the migrated DoD line itself, not overall absence
    // of the substring.
    const migrationWrite = calls.bodyWrites.find((b) =>
      /cmd="`npm test` `npm run test:slow`"/.test(b)
    );
    assert.ok(migrationWrite, 'expected a body write with the migrated two-lane DoD line');
    assert.match(migrationWrite, /aitm-vc-tombstone id=1 cmd="npm run test:all"/);
  });
});

test('#952: already-migrated body — idempotent, no extra migration write', async () => {
  await withTmpDir(async (projectDir) => {
    const twoLaneBody = [
      '## Scope',
      'stuff',
      '',
      '## Verification Commands',
      '- [ ] `npm test` <!-- id=1 -->',
      '- [ ] `npm run test:slow` <!-- id=2 -->',
      '- [ ] `npm run lint` <!-- id=3 -->',
      '',
      '## Definition of Done',
      '',
      '### Functional (verified at Test)',
      '',
      '- [ ] All automated tests pass <!-- aitm-verified cmd="`npm test` `npm run test:slow`" --> <!-- dod:functional:tests -->',
      '',
    ].join('\n');
    const { deps, calls } = makeDeps(twoLaneBody);
    const r = await runVerbTest({ cfg, issueNumber: 952, projectDir, deps });
    assert.equal(r.status, 'passed');

    assert.ok(!calls.sandboxRuns.some((c) => c === 'npm run test:all'));
    assert.ok(calls.sandboxRuns.includes('npm test'));
    assert.ok(calls.sandboxRuns.includes('npm run test:slow'));

    // No write should contain a still-legacy DoD line — migration is a no-op
    // on an already-two-lane body, so nothing beyond the normal marker
    // stamps (aitm-test-started / aitm-dod-verified) is written.
    assert.ok(
      calls.bodyWrites.every((b) => !/npm run test:all/.test(b)),
      'idempotent: no write should reintroduce or reference the retired script'
    );
  });
});
