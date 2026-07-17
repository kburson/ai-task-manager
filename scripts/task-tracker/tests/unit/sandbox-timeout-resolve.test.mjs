// @story #858
// #858 — the Test-stage sandbox per-command timeout was a hardcoded 15-minute
// module constant in `verbs/test.mjs`, sized (per its own comment) for a suite
// that "runs ~100 files". The suite is now 615 files / ~18 min, so the cap
// SIGTERM'd a green suite and no issue could pass Test.
//
// These are pure assertions against the resolver surface — no process is spawned
// and no env var is mutated globally (every case injects its own env object).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveTimeoutMs,
  sandboxTimeoutMs,
  SANDBOX_TIMEOUT_ENV,
  SANDBOX_TIMEOUT_DEFAULT_MS,
} from '../../lib/process-timeouts.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// Collect warnings instead of writing to stderr.
function captureWarn() {
  const calls = [];
  return { warn: (msg) => calls.push(msg), calls };
}

// ---- AC1: the override exists and is honored ------------------------------

test('AC1: a valid override is honored', () => {
  const ms = sandboxTimeoutMs({ [SANDBOX_TIMEOUT_ENV]: '1800000' });
  assert.equal(ms, 1_800_000);
});

test('AC1: the env var is named AITM_SANDBOX_TIMEOUT_MS', () => {
  assert.equal(SANDBOX_TIMEOUT_ENV, 'AITM_SANDBOX_TIMEOUT_MS');
});

test('AC1: exponential notation resolves to its integer value', () => {
  assert.equal(sandboxTimeoutMs({ [SANDBOX_TIMEOUT_ENV]: '1e6' }), 1_000_000);
});

// ---- AC2: the default is raised, with headroom ----------------------------

test('AC2: the default is raised above the old 15-minute cap', () => {
  assert.ok(
    SANDBOX_TIMEOUT_DEFAULT_MS > 900_000,
    `default must exceed the old 900_000 cap, got ${SANDBOX_TIMEOUT_DEFAULT_MS}`
  );
});

test('AC2: the default clears the observed ~18-min suite with real headroom', () => {
  // Observed at e1f8691: 615 files, ~17.8 min (1_068_000 ms). A cap that merely
  // squeaks past today's number would re-fire on a slower machine or once #860
  // adds its ~28 undiscovered files, so require a genuine multiple, not +1ms.
  const observedMs = 1_068_000;
  assert.ok(
    SANDBOX_TIMEOUT_DEFAULT_MS >= observedMs * 2,
    `default ${SANDBOX_TIMEOUT_DEFAULT_MS} must be >= 2x the observed ${observedMs}`
  );
});

test('AC2: an absent override yields the default', () => {
  assert.equal(sandboxTimeoutMs({}), SANDBOX_TIMEOUT_DEFAULT_MS);
});

// ---- AC3: a bad override must never disable the timeout -------------------
//
// This is the sharp edge. Node's `execFile` treats `timeout: 0` as "no timeout",
// and a NaN timeout never arms the timer either — so a typo'd env var would
// convert a 15-minute over-run into an unbounded hang. That is strictly worse
// than the bug being fixed, so every rejection path is asserted explicitly.

const BAD_OVERRIDES = [
  ['non-numeric', 'abc'],
  ['empty string', ''],
  ['whitespace only', '   '],
  ['zero', '0'],
  ['negative', '-5'],
  ['negative float', '-0.5'],
  ['fractional', '1.5'],
  ['NaN literal', 'NaN'],
  ['Infinity literal', 'Infinity'],
  ['numeric with suffix', '900000ms'],
];

for (const [label, raw] of BAD_OVERRIDES) {
  test(`AC3: ${label} override falls back to the default`, () => {
    const { warn } = captureWarn();
    const ms = sandboxTimeoutMs({ [SANDBOX_TIMEOUT_ENV]: raw }, { warn });
    assert.equal(ms, SANDBOX_TIMEOUT_DEFAULT_MS);
  });

  test(`AC3: ${label} override never yields a timeout-disabling value`, () => {
    const { warn } = captureWarn();
    const ms = sandboxTimeoutMs({ [SANDBOX_TIMEOUT_ENV]: raw }, { warn });
    assert.ok(Number.isInteger(ms), `must be an integer, got ${ms}`);
    assert.ok(ms > 0, `must be > 0 (0 and NaN disable the timeout), got ${ms}`);
    assert.ok(!Number.isNaN(ms), 'must never be NaN');
  });
}

test('AC3: resolveTimeoutMs is generic over env name and default', () => {
  const { warn } = captureWarn();
  assert.equal(resolveTimeoutMs('SOME_VAR', 42, { SOME_VAR: '99' }, { warn }), 99);
  assert.equal(resolveTimeoutMs('SOME_VAR', 42, { SOME_VAR: 'junk' }, { warn }), 42);
  assert.equal(resolveTimeoutMs('SOME_VAR', 42, {}, { warn }), 42);
});

// ---- AC4: a rejected override is visible ---------------------------------

test('AC4: a rejected override warns, naming the variable and the value', () => {
  const { warn, calls } = captureWarn();
  sandboxTimeoutMs({ [SANDBOX_TIMEOUT_ENV]: 'abc' }, { warn });
  assert.equal(calls.length, 1, 'exactly one warning');
  assert.match(calls[0], /AITM_SANDBOX_TIMEOUT_MS/, 'warning names the variable');
  assert.match(calls[0], /abc/, 'warning quotes the offending value');
  assert.match(String(SANDBOX_TIMEOUT_DEFAULT_MS), /\d/);
  assert.match(
    calls[0],
    new RegExp(String(SANDBOX_TIMEOUT_DEFAULT_MS)),
    'warning names the fallback'
  );
});

test('AC4: a valid override is silent', () => {
  const { warn, calls } = captureWarn();
  sandboxTimeoutMs({ [SANDBOX_TIMEOUT_ENV]: '1800000' }, { warn });
  assert.deepEqual(calls, [], 'a good value must not warn');
});

test('AC4: an absent override is silent', () => {
  const { warn, calls } = captureWarn();
  sandboxTimeoutMs({}, { warn });
  assert.deepEqual(calls, [], 'an unset var is normal, not a misconfiguration');
});

// ---- AC5: the constant lives in process-timeouts.mjs ----------------------

test('AC5: verbs/test.mjs no longer defines its own SANDBOX_TIMEOUT_MS', () => {
  const src = readFileSync(path.resolve(__dir, '../../verbs/test.mjs'), 'utf8');
  assert.ok(
    !/^const SANDBOX_TIMEOUT_MS\s*=/m.test(src),
    'the constant must not be re-declared locally — it belongs to lib/process-timeouts.mjs'
  );
});

test('AC5: verbs/test.mjs sources the timeout from process-timeouts.mjs', () => {
  const src = readFileSync(path.resolve(__dir, '../../verbs/test.mjs'), 'utf8');
  assert.match(
    src,
    /import\s*\{[^}]*sandboxTimeoutMs[^}]*\}\s*from\s*'\.\.\/lib\/process-timeouts\.mjs'/,
    'verbs/test.mjs must import the resolver rather than mirror the value'
  );
});

test('AC5: the stale "~100 files" comment is gone from the constant', () => {
  const timeoutsSrc = readFileSync(path.resolve(__dir, '../../lib/process-timeouts.mjs'), 'utf8');
  const testSrc = readFileSync(path.resolve(__dir, '../../verbs/test.mjs'), 'utf8');
  assert.ok(
    !/~100 files/.test(timeoutsSrc) && !/~100 files/.test(testSrc),
    'the comment claiming the suite runs ~100 files is what let this drift for 6x'
  );
});
