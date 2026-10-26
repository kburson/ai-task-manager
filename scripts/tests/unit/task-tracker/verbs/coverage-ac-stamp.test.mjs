#!/usr/bin/env node
// @story #593
// Coverage tests for scripts/task-tracker/verbs/ac-stamp.mjs.
//
// `verbAcStamp` fetches the issue body (via the injected `pexec`), locates the
// Acceptance-Criteria line whose visible label matches the argument, runs that
// line's declared `aitm-verified` command(s) through `runVerifiers` (also via
// `pexec`), and on all-green stamps the run-props proof marker onto the line via
// `mutateIssueBody`. Body fetch and write both use the injected `pexec`, so the
// happy-path test round-trips write input through a stateful body store. Every
// early-exit branch is driven in-process with a
// fake `pexec` and a `process.exit` that throws a sentinel.

// @story #1857
// Fixture: this fixture owns its actor instead of using ambient session state.
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);

import { strict as assert } from 'node:assert';
import { test, before, after } from 'node:test';
import { saveState } from '../../../../task-tracker/state.mjs';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';

import { verbAcStamp } from '../../../../task-tracker/verbs/ac-stamp.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { pexecGithubBodyStore } from '../../../helpers/pexec-body-store.mjs';

const VERIFIER_CMD =
  'node scripts/task-tracker/tools/coverage-threshold.mjs ' +
  'scripts/task-tracker/verbs/ac-stamp.mjs ' +
  'scripts/tests/unit/task-tracker/verbs/coverage-ac-stamp.test.mjs 80';

const AC_LABEL = 'cover the ac-stamp verb';

function bodyWithAc() {
  return [
    '## Acceptance Criteria',
    '',
    `- [ ] ${AC_LABEL} <!-- aitm-verified cmd="\`${VERIFIER_CMD}\`" -->`,
    '',
    '## Verification Commands',
    '',
    '- [ ] existing entry',
    '',
  ].join('\n');
}

let tmpRoot;
let fakeBin;
let savedPath;

before(() => {
  tmpRoot = mkdtempSync(path.join(projectScratchDir('test'), 'ac-stamp-cov-'));
  fakeBin = path.join(tmpRoot, 'bin');
  mkdirSync(fakeBin, { recursive: true });
  // Stateful fake gh: `view` cats the body store, `edit --body-file -` writes
  // stdin back to it, so versionedWriteBody's push→verify round-trip succeeds
  // offline.
  const ghPath = path.join(fakeBin, 'gh');
  writeFileSync(
    ghPath,
    [
      '#!/usr/bin/env bash',
      'sub="$2"',
      'f="$AITM_FAKE_BODY_FILE"',
      'if [ "$sub" = "view" ]; then cat "$f"; exit 0; fi',
      'if [ "$sub" = "edit" ]; then cat > "$f"; exit 0; fi',
      'exit 0',
    ].join('\n') + '\n'
  );
  chmodSync(ghPath, 0o755);
  savedPath = process.env.PATH;
  process.env.PATH = `${fakeBin}:${process.env.PATH}`;
});

after(() => {
  process.env.PATH = savedPath;
  delete process.env.AITM_FAKE_BODY_FILE;
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

// Write a state file with the given `active` and return its path.
function stateFile(active) {
  const p = path.join(tmpRoot, `state-${Math.abs(hashish(active))}.json`);
  saveState({ active, lastActive: active }, p);
  return p;
}
function hashish(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

// Build a fake pexec. `onVerifier` decides the verifier (node) result:
//   'pass' → resolve, 'fail' → throw {code:1}.
function makePexec({ body, onVerifier = 'pass' } = {}) {
  return async (bin, args = [], options = {}) => {
    const gh = pexecGithubBodyStore({ bin, args, options, fallbackBody: body ?? '' });
    if (gh) return gh;
    if (bin === 'git') {
      if (args.includes('status')) return { stdout: '', stderr: '' };
      return { stdout: 'abc1234\n', stderr: '' }; // rev-parse --short HEAD
    }
    if (bin === 'node') {
      if (onVerifier === 'fail') {
        const err = new Error('verifier failed');
        err.code = 1;
        throw err;
      }
      return { stdout: '', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  };
}

class ExitError extends Error {
  constructor(code) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

// Run verbAcStamp with process.exit trapped. Returns { exitCode, threw }.
async function runVerb(ctx) {
  const realExit = process.exit;
  process.exit = (code) => {
    throw new ExitError(code ?? 0);
  };
  try {
    await verbAcStamp(ctx);
    return { exitCode: null };
  } catch (err) {
    if (err instanceof ExitError) return { exitCode: err.code };
    throw err;
  } finally {
    process.exit = realExit;
  }
}

const baseCtx = (over = {}) => ({
  cfg: { repo: 'o/r' },
  projectDir: tmpRoot,
  ...over,
  deps: {
    now: () => '2026-06-29T00:00:00.000Z',
    getLiveState: async () => 'test',
    ...(over.deps || {}),
  },
});

test('no active task → exit 1', async () => {
  const r = await runVerb(
    baseCtx({ statePath: stateFile(null), rest: [AC_LABEL], pexec: makePexec({}) })
  );
  assert.equal(r.exitCode, 1);
});

test('discover bucket active → exit 1', async () => {
  const r = await runVerb(
    baseCtx({ statePath: stateFile('discover'), rest: [AC_LABEL], pexec: makePexec({}) })
  );
  assert.equal(r.exitCode, 1);
});

test('empty label → exit 1', async () => {
  const r = await runVerb(
    baseCtx({ statePath: stateFile('#777'), rest: [], pexec: makePexec({}) })
  );
  assert.equal(r.exitCode, 1);
});

test('no AC line matching label → exit 1', async () => {
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: ['totally absent label'],
      pexec: makePexec({ body: bodyWithAc() }),
    })
  );
  assert.equal(r.exitCode, 1);
});

test('verifier non-zero exit → refuse, exit 1', async () => {
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: [AC_LABEL],
      pexec: makePexec({ body: bodyWithAc(), onVerifier: 'fail' }),
    })
  );
  assert.equal(r.exitCode, 1);
});

test('happy path: verifier passes → stamps marker, no exit', async () => {
  const body = bodyWithAc();
  const storeFile = path.join(tmpRoot, 'body-store.md');
  writeFileSync(storeFile, body);
  process.env.AITM_FAKE_BODY_FILE = storeFile;
  const r = await runVerb(
    baseCtx({
      statePath: stateFile('#777'),
      rest: [AC_LABEL],
      pexec: makePexec({ body }),
    })
  );
  assert.equal(r.exitCode, null);
});

console.log('coverage-ac-stamp.test.mjs: defined');

// @story #2096 — refuse evidence when the declaration changes after execution.
for (const change of ['replace', 'add']) {
  test(`ac-stamp refuses ${change} verifier declaration at fresh write base`, async () => {
    const original = bodyWithAc();
    const fresh = original.replace(
      VERIFIER_CMD,
      change === 'replace' ? 'npm run lint' : VERIFIER_CMD + '` `npm run lint'
    );
    let reads = 0;
    let writes = 0;
    const delegate = makePexec({ body: original });
    const pexec = async (bin, args = [], options = {}) => {
      if (bin === 'gh' && args[0] === 'issue' && args[1] === 'view')
        return { stdout: ++reads === 1 ? original : fresh, stderr: '' };
      if (bin === 'gh' && args[0] === 'issue' && args[1] === 'edit') ++writes;
      return delegate(bin, args, options);
    };
    await assert.rejects(
      runVerb(
        baseCtx({
          statePath: stateFile('#777'),
          rest: [AC_LABEL],
          pexec,
        })
      ),
      /verifier declaration changed/
    );
    assert.equal(writes, 0, 'no stale proof published');
  });
}

// @story #2096 — real fresh-base receipt authorization.
for (const drift of ['remove', 'replace', 'retire'])
  test(`ac reuse refuses ${drift}d current Test receipt before publication`, async () => {
    const {
      createVerificationReceipt,
      upsertVerificationReceipt,
      canonicalVerificationCommandSet,
    } = await import('../../../../task-tracker/lib/verification-receipt.mjs');
    const { splitCmd } = await import('../../../../task-tracker/lib/evidence-runner.mjs');
    const sha = 'a'.repeat(40),
      command = VERIFIER_CMD;
    const fp = {
      commitSha: sha,
      verificationCommands: canonicalVerificationCommandSet([command]),
      environment: {
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        lockfileHash: 'sha256:' + 'a'.repeat(64),
        configHashes: {},
        sandbox: { kind: 'worktree', identity: tmpRoot, clean: true },
      },
    };
    const receipt = createVerificationReceipt({
      issueNumber: 777,
      stage: 'test',
      fingerprint: fp,
      commands: [
        ...[
          ['lint-full', 'lint'],
          ['format-full', 'format:check'],
          ['test-unit', 'test:unit'],
          ['test-integration', 'test:integration'],
          ['test-slow', 'test:slow'],
        ].map(([classification, script]) => ({
          classification,
          command: 'npm',
          args: ['run', script],
          exitCode: 0,
          durationMs: 1,
        })),
        {
          classification: 'test-targeted-1',
          command: splitCmd(command)[0],
          args: splitCmd(command).slice(1),
          exitCode: 0,
          durationMs: 1,
        },
      ],
      now: () => '2026-10-26T20:00:00.000Z',
    });
    const plain = bodyWithAc().replace(
      '- [ ] existing entry',
      `- [ ] \`${VERIFIER_CMD}\` <!-- id=1 -->`
    );
    const original = upsertVerificationReceipt(plain, receipt);
    const fresh =
      drift === 'remove'
        ? plain
        : drift === 'retire'
          ? original.replace('aitm-verification-receipt', 'aitm-retired-verification-receipt')
          : upsertVerificationReceipt(plain, {
              ...receipt,
              receiptId: '7' + receipt.receiptId.slice(1),
            });
    let reads = 0,
      writes = 0;
    const delegate = makePexec({ body: original });
    const pexec = async (bin, args = [], options = {}) => {
      if (bin === 'git' && args.includes('rev-parse')) return { stdout: sha, stderr: '' };
      if (bin === 'gh' && args[0] === 'issue' && args[1] === 'view')
        return { stdout: ++reads === 1 ? original : fresh, stderr: '' };
      if (bin === 'gh' && args[0] === 'issue' && args[1] === 'edit') writes++;
      return delegate(bin, args, options);
    };
    await assert.rejects(
      runVerb(
        baseCtx({
          statePath: stateFile('#777'),
          rest: [AC_LABEL],
          pexec,
          deps: { getLiveState: async () => 'review', buildFingerprint: () => fp },
        })
      ),
      /proof authority changed|authorizing receipt changed/
    );
    assert.equal(writes, 0);
  });
