#!/usr/bin/env node
// @story #394
// #394 — global help-flag interception. A help flag (`--help`, `-h`, or `?`)
// in ANY argument position must be detected so the dispatcher can print help
// and exit, instead of swallowing the flag as positional data (which once
// created a junk issue titled "--help" via `task new --help`).
import { strict as assert } from 'node:assert';
import { hasHelpFlag } from '../task-tracker.mjs';

assert.equal(typeof hasHelpFlag, 'function', 'hasHelpFlag must be exported');
assert.equal(hasHelpFlag(['--help']), true, 'leading --help');
assert.equal(hasHelpFlag(['-h']), true, 'leading -h');
assert.equal(hasHelpFlag(['?']), true, 'leading ?');
assert.equal(hasHelpFlag(['new', '--help']), true, 'new --help');
assert.equal(hasHelpFlag(['new', '-h']), true, 'new -h');
assert.equal(hasHelpFlag(['new', '?']), true, 'new ?');
assert.equal(hasHelpFlag(['promote', '394', '--help']), true, 'flag in third position');
assert.equal(hasHelpFlag(['new', 'Add a thing']), false, 'plain new title');
assert.equal(hasHelpFlag(['status']), false, 'status verb');
assert.equal(hasHelpFlag([]), false, 'empty argv');
assert.equal(hasHelpFlag(undefined), false, 'undefined argv');
assert.equal(hasHelpFlag(['new', 'what now?']), false, 'embedded ? in a title is not the flag');
assert.equal(hasHelpFlag(['new', '--help-me']), false, '--help-me is not --help');

console.log('cli-help-flag.test.mjs: OK');
