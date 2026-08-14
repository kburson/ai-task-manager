#!/usr/bin/env node
// @story #737
// Regression guard for the PreToolUse hooks' stdin read. The three guards must
// read the hook payload from file descriptor 0 (`readFileSync(0, ...)`), NOT
// from the `/dev/stdin` PATH. `/dev/stdin` resolves fine on macOS but is flaky
// on the Linux CI runner when stdin is a spawn pipe: `readFileSync('/dev/stdin')`
// can surface EAGAIN/empty, the guard's fail-open `catch` fires, and it emits
// nothing — which the harness reads as "allow", silently disabling the guard.
// See #737 (surfaced by PR #736 CI run 28911780381).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const GUARDS = ['agent-guard.mjs', 'bash-guard.mjs', 'activity-guard.mjs'];

for (const name of GUARDS) {
  test(`${name} reads hook stdin via fd 0, not the /dev/stdin path`, () => {
    const src = readFileSync(
      fileURLToPath(new URL(`../../../../task-tracker/${name}`, import.meta.url)),
      'utf8'
    );

    // Must not re-open stdin by path — that is the portability bug.
    assert.ok(
      !/readFileSync\(\s*['"]\/dev\/stdin['"]/.test(src),
      `${name} still reads the /dev/stdin path; use readFileSync(0, ...) instead`
    );

    // Must read the stdin file descriptor directly.
    assert.ok(
      /readFileSync\(\s*0\s*,/.test(src),
      `${name} does not read stdin via fd 0 (readFileSync(0, ...))`
    );
  });
}
