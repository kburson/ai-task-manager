#!/usr/bin/env node
// @story #546
// #546 — unit + integration coverage for the shell-aware `splitCmd` tokenizer
// in `lib/evidence-runner.mjs` and its effect on `runVerifiers`.
//
// Background: the prior `splitCmd` split on whitespace, which shattered any
// verifier carrying a quoted multi-word argument
// (`grep -n -A3 'Verification Commands' file` → grep got the wrong pattern and a
// non-existent file, exiting non-zero). The `bash -c '<script>'` escape hatch
// the old comment recommended also failed (the `-c` script was itself split).
//
// Coverage:
//   - AC1: a quoted multi-word grep pattern survives as one argv element.
//   - AC2: `bash -c '<script>'` delivers the whole single-quoted script as one
//     `-c` argument.
//   - AC3 (regression): a `runVerifiers` run whose verifier contains a quoted
//     multi-word argument reaches `pexec` with the correct argv and exits 0.
//   - guard cases: simple unquoted commands unchanged, double-quoted args,
//     collapsed whitespace, empty/nullish input, unterminated-quote throws.

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { runVerifiers, splitCmd } from '../../lib/evidence-runner.mjs';

test('AC1: quoted multi-word argument survives as one argv element', () => {
  assert.deepEqual(
    splitCmd("grep -n -A3 'Verification Commands' templates/references/deep-dive-procedure.md"),
    ['grep', '-n', '-A3', 'Verification Commands', 'templates/references/deep-dive-procedure.md']
  );
});

test("AC2: bash -c '<script>' delivers the script as one -c argument", () => {
  const script = 'grep -n "foo bar" file && echo ok';
  assert.deepEqual(splitCmd(`bash -c '${script}'`), ['bash', '-c', script]);
});

test('simple unquoted commands tokenize exactly as before', () => {
  assert.deepEqual(splitCmd('npm test'), ['npm', 'test']);
  assert.deepEqual(splitCmd('npm run lint'), ['npm', 'run', 'lint']);
  assert.deepEqual(splitCmd('git log --grep #303'), ['git', 'log', '--grep', '#303']);
});

test('double-quoted multi-word argument survives, escapes honored', () => {
  assert.deepEqual(splitCmd('node --test "a b/c.test.mjs"'), ['node', '--test', 'a b/c.test.mjs']);
  // backslash-escaped double quote inside a double-quoted run
  assert.deepEqual(splitCmd('echo "say \\"hi\\""'), ['echo', 'say "hi"']);
});

test('runs of whitespace collapse; leading/trailing trimmed', () => {
  assert.deepEqual(splitCmd('  spaced   out  '), ['spaced', 'out']);
  assert.deepEqual(splitCmd('\tta\tb\n'), ['ta', 'b']);
});

test('empty / nullish input yields no tokens', () => {
  assert.deepEqual(splitCmd(''), []);
  assert.deepEqual(splitCmd(null), []);
  assert.deepEqual(splitCmd(undefined), []);
});

test('unterminated quotes throw', () => {
  assert.throws(() => splitCmd("grep 'unclosed"), /unterminated single quote/);
  assert.throws(() => splitCmd('grep "unclosed'), /unterminated double quote/);
});

test('AC3 regression: runVerifiers passes the correct argv and exits 0', async () => {
  const seen = [];
  // Fake pexec: records (bin, args) for the verifier and resolves 0. Any non-zero
  // would set firstFailure; we assert it stays clean.
  async function pexec(bin, args = []) {
    seen.push([bin, args]);
    return { stdout: '' };
  }
  const verifier =
    "grep -n -A3 'Verification Commands' templates/references/deep-dive-procedure.md";
  const res = await runVerifiers({ commands: [verifier], pexec, cwd: '/tmp' });

  assert.equal(res.allPassed, true, 'run passes');
  assert.equal(res.firstFailure, null, 'no failure recorded');
  assert.equal(res.ran.length, 1, 'one command ran');
  assert.equal(res.ran[0].exit, 0, 'exit 0');

  assert.equal(seen.length, 1, 'pexec invoked once');
  const [bin, args] = seen[0];
  assert.equal(bin, 'grep', 'binary is grep');
  assert.deepEqual(
    args,
    ['-n', '-A3', 'Verification Commands', 'templates/references/deep-dive-procedure.md'],
    'pattern reaches grep as a single argv element, not shattered'
  );
});
