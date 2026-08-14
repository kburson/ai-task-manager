#!/usr/bin/env node
// @story #595
// Coverage tests for scripts/task-tracker/verbs/auto.mjs.
//
// `runAuto` is a pure DI core: it validates the choice, requires a session id,
// then load→applyChoice→save through injectable deps. The `cli` wrapper resolves
// the real session id, calls `runAuto`, and maps result statuses to exit codes /
// stdout. The core is exercised directly with stub deps; the wrapper's argument
// and status branches are exercised with a `process.exit` that throws a sentinel.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runAuto, cli } from '../../../../task-tracker/verbs/auto.mjs';
import { VALID_CHOICES } from '../../../../task-tracker/lib/session-store.mjs';

class ExitError extends Error {
  constructor(code) {
    super(`exit ${code}`);
    this.code = code;
  }
}

// Run `cli(args)` with process.exit / stdout / stderr trapped.
async function runCli(args) {
  const realExit = process.exit;
  const realOut = process.stdout.write;
  const realErr = process.stderr.write;
  let exitCode = null;
  let out = '';
  let err = '';
  process.exit = (code) => {
    throw new ExitError(code ?? 0);
  };
  process.stdout.write = (s) => {
    out += s;
    return true;
  };
  process.stderr.write = (s) => {
    err += s;
    return true;
  };
  try {
    await cli(args);
    return { exitCode, out, err };
  } catch (e) {
    if (e instanceof ExitError) return { exitCode: e.code, out, err };
    throw e;
  } finally {
    process.exit = realExit;
    process.stdout.write = realOut;
    process.stderr.write = realErr;
  }
}

test('runAuto: invalid choice → status invalid', async () => {
  const r = await runAuto({ choice: 'nonsense', sessionId: 'sid-1' });
  assert.equal(r.status, 'invalid');
  assert.match(r.message, /unknown choice/);
});

test('runAuto: missing sessionId → status no-session', async () => {
  const r = await runAuto({ choice: VALID_CHOICES()[0], sessionId: null });
  assert.equal(r.status, 'no-session');
});

test('runAuto: valid choice → load→apply→save, status ok', async () => {
  let saved = null;
  const r = await runAuto({
    choice: 'both',
    sessionId: 'sid-2',
    deps: {
      loadSession: (id) => ({ id }),
      saveSession: (next) => {
        saved = next;
      },
    },
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.choice, 'both');
  assert.ok(r.summary.length > 0);
  assert.ok(saved, 'saveSession was called with the next state');
});

test('cli: no choice → usage on stderr, exit 2', async () => {
  const r = await runCli([]);
  assert.equal(r.exitCode, 2);
  assert.match(r.err, /usage:/);
});

test('cli: invalid choice → error on stderr, exit 2', async () => {
  const r = await runCli(['totally-bogus']);
  assert.equal(r.exitCode, 2);
  assert.match(r.err, /✗/);
});

console.log('coverage-auto.test.mjs: defined');
