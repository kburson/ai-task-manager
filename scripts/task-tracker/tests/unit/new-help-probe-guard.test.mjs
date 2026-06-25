#!/usr/bin/env node
// @story #547
// Defect guard: `/task new` must treat a SINGLE-token help probe
// (help | ? | --help | --? | -h, case-insensitive) as a request to print the
// verb's help — exit 0, create no issue, perform no bind mutation. Any other
// single- or multi-word title (including one that merely contains the word
// "help") still creates an issue. The no-arg form is unchanged.
//
// Background: #394's global `hasHelpFlag` already intercepts `?`, `--help`,
// `-h` in any argv position, but the bare word `help` and `--?` fall through
// to junk-issue creation + bind clobber. This verifier pins the verb-local
// single-token guard that closes that gap.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isHelpProbe, verbNew } from '../../verbs/new.mjs';

// --- AC2: every help token, case-insensitive, single-token only -------------
test('AC2: isHelpProbe is true for each help token, case-insensitive', () => {
  for (const tok of ['help', '?', '--help', '--?', '-h']) {
    assert.equal(isHelpProbe([tok]), true, `lower "${tok}" should be a probe`);
    assert.equal(isHelpProbe([tok.toUpperCase()]), true, `upper "${tok}" should be a probe`);
  }
  assert.equal(isHelpProbe(['Help']), true, 'mixed-case Help should be a probe');
  assert.equal(isHelpProbe(['  help  ']), true, 'surrounding whitespace is trimmed');
});

// --- AC3: multi-word title containing "help" still creates ------------------
test('AC3: a title containing a help word is NOT a probe', () => {
  // quoted multi-word title arrives as a single arg
  assert.equal(isHelpProbe(['help text is broken']), false);
  // unquoted multi-word title arrives as several args
  assert.equal(isHelpProbe(['help', 'text', 'is', 'broken']), false);
  // a non-help single token is a real title
  assert.equal(isHelpProbe(['refactor']), false);
});

// --- AC4: no-arg form is unchanged -----------------------------------------
test('AC4: no-arg / empty rest is NOT a probe', () => {
  assert.equal(isHelpProbe([]), false);
  assert.equal(isHelpProbe(undefined), false);
});

// --- AC1: verbNew short-circuits to help, no create, no mutation -----------
test('AC1: verbNew("help") prints help and performs no create/bind mutation', async () => {
  const calls = { pexec: 0, drain: 0, logs: [] };
  const origLog = console.log;
  console.log = (...a) => calls.logs.push(a.join(' '));
  try {
    await verbNew({
      rest: ['help'],
      // Any of these being invoked would mean the guard failed to short-circuit
      // before issue creation / state mutation.
      pexec: async () => {
        calls.pexec++;
        return { stdout: 'https://github.com/x/y/issues/1\n', stderr: '' };
      },
      drainQueueIfAny: async () => {
        calls.drain++;
      },
      cfg: { defaultLabels: [], assignee: '@me', hookNetworkTimeoutMs: 1000 },
    });
  } finally {
    console.log = origLog;
  }
  assert.equal(calls.pexec, 0, 'no subprocess (no gh issue create) on a help probe');
  assert.equal(calls.drain, 0, 'guard returns before any queue/state side effect');
  const out = calls.logs.join('\n');
  assert.match(out, /\/task new/, 'help text mentioning the new verb is emitted');
});
