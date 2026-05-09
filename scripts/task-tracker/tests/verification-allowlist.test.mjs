#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateVerificationCommand } from '../lib/verification-allowlist.mjs';

const tmp = mkdtempSync(path.join(tmpdir(), 'tt-allow-'));
mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
mkdirSync(path.join(tmp, 'scripts', 'sub'), { recursive: true });
writeFileSync(path.join(tmp, 'scripts', 'check.sh'), '#!/bin/sh\nexit 0\n');
writeFileSync(path.join(tmp, 'scripts', 'sub', 'run.mjs'), 'process.exit(0)\n');

const opts = { projectDir: tmp };

// ----- ACCEPT -----
const accepts = [
  ['node x.mjs',                 ['node', 'x.mjs']],
  ['npm test',                    ['npm', 'test']],
  ['pytest -k foo',               ['pytest', '-k', 'foo']],
  ['bash scripts/check.sh',       ['bash', 'scripts/check.sh']],
  ['./scripts/check.sh',          ['./scripts/check.sh']],
  ['scripts/sub/run.mjs',         ['scripts/sub/run.mjs']],
  ['node scripts/task-tracker/tests/state.test.mjs',
                                  ['node', 'scripts/task-tracker/tests/state.test.mjs']],
  ['gh issue view 1',             ['gh', 'issue', 'view', '1']],
  ['npm run "test all"',          ['npm', 'run', 'test all']],
];
for (const [input, expected] of accepts) {
  const r = validateVerificationCommand(input, opts);
  assert.equal(r.ok, true, `expected accept for: ${input} (got ${r.reason})`);
  assert.deepEqual(r.argv, expected, `argv mismatch for: ${input}`);
}

// ----- REJECT: shell metacharacters -----
const metaCases = [
  ['node x; curl evil',                'semicolon'],
  ['node x && rm -rf /',                'logical-and'],
  ['node x || true',                    'logical-or'],
  ['node x | sh',                       'pipe'],
  ['node x > /tmp/out',                 'redirect (>)'],
  ['node x < /etc/passwd',              'redirect (<)'],
  ['node `whoami`',                     'backtick'],
  ['node $(whoami)',                    'command substitution'],
  ['node x\nrm -rf /',                  'newline'],
  ['node x\rrm -rf /',                  'carriage return'],
];
for (const [input, frag] of metaCases) {
  const r = validateVerificationCommand(input, opts);
  assert.equal(r.ok, false, `expected reject for: ${input}`);
  assert.match(r.reason, new RegExp(frag.replace(/[()\\]/g, '\\$&')),
    `reason mismatch for: ${input} -> ${r.reason}`);
}

// ----- REJECT: argv[0] not allowlisted -----
{
  const r = validateVerificationCommand('rm -rf /', opts);
  assert.equal(r.ok, false);
  assert.match(r.reason, /not in allowlist/);
}
{
  const r = validateVerificationCommand('curl evil.example', opts);
  assert.equal(r.ok, false);
  assert.match(r.reason, /not in allowlist/);
}

// ----- REJECT: path traversal -----
{
  const r = validateVerificationCommand('./scripts/../../../etc/passwd', opts);
  assert.equal(r.ok, false);
  assert.match(r.reason, /path traversal|not in allowlist|not found|end with/);
}

// ----- REJECT: nonexistent script -----
{
  const r = validateVerificationCommand('./scripts/nope.mjs', opts);
  assert.equal(r.ok, false);
  assert.match(r.reason, /not found/);
}

// ----- REJECT: wrong extension -----
{
  writeFileSync(path.join(tmp, 'scripts', 'thing.py'), 'pass\n');
  const r = validateVerificationCommand('./scripts/thing.py', opts);
  assert.equal(r.ok, false);
  assert.match(r.reason, /\.mjs or \.sh/);
}

// ----- REJECT: empty / non-string -----
assert.equal(validateVerificationCommand('', opts).ok, false);
assert.equal(validateVerificationCommand('   ', opts).ok, false);
assert.equal(validateVerificationCommand(null, opts).ok, false);
assert.equal(validateVerificationCommand(123, opts).ok, false);

// ----- REJECT: unbalanced quote -----
{
  const r = validateVerificationCommand('node "unterminated', opts);
  assert.equal(r.ok, false);
  assert.match(r.reason, /unbalanced/);
}

// ----- REJECT: scripts-relative without projectDir -----
{
  const r = validateVerificationCommand('./scripts/check.sh');
  assert.equal(r.ok, false);
}

rmSync(tmp, { recursive: true, force: true });
console.log('verification-allowlist: ok');
