#!/usr/bin/env node
// @story #23
// Unit test for bin/cli.mjs colorize helper + ANSI wrappers.
// Asserts TTY gate: when process.stdout.isTTY is false, helpers return input
// unchanged (no \x1b[ escape sequences). When TTY, escape codes are present.

import { strict as assert } from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const cliPath = path.resolve(__dir, '..', '..', '..', '..', 'bin', 'cli.mjs');

const originalIsTTY = process.stdout.isTTY;

// --- Non-TTY: helpers must return input unchanged ---
Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

const mod = await import(cliPath);

const wrappers = [
  'bold',
  'dim',
  'green',
  'red',
  'yellow',
  'cyan',
  'magenta',
  'bgBlue',
  'bgGreen',
  'bgYellow',
];

for (const name of wrappers) {
  const fn = mod[name];
  assert.equal(typeof fn, 'function', `${name} should be exported function`);
  const out = fn('hello');
  assert.equal(
    out,
    'hello',
    `${name} should pass through input when not TTY (got: ${JSON.stringify(out)})`
  );
  assert.ok(!out.includes('\x1b['), `${name} must not emit ANSI when not TTY`);
}

// colorize itself
assert.equal(mod.colorize('\x1b[1m', 'abc'), 'abc', 'colorize should pass through when not TTY');
assert.equal(mod.colorize('\x1b[1m', 123), '123', 'colorize should stringify non-strings');

// --- TTY: helpers must emit ANSI ---
Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
assert.ok(mod.bold('x').includes('\x1b['), 'bold should emit ANSI when TTY');
assert.ok(mod.bgBlue('x').includes('\x1b[44m'), 'bgBlue should emit background ANSI when TTY');
assert.equal(mod.colorize('\x1b[31m', 'x'), '\x1b[31mx\x1b[0m', 'colorize default close is reset');

// restore
Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });

console.log('cli-colorize.test.mjs: OK');
