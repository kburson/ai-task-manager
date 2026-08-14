#!/usr/bin/env node
// @story #394 #1023
// Help is recognized only as the top-level token or immediately after a verb;
// later help-shaped values belong to the verb parser.
import { strict as assert } from 'node:assert';
import { earlyHelpTarget, hasHelpFlag } from '../../../../task-tracker/task-tracker.mjs';

assert.equal(typeof hasHelpFlag, 'function', 'hasHelpFlag must be exported');
assert.equal(hasHelpFlag(['--help']), true, 'leading --help');
assert.equal(hasHelpFlag(['-h']), true, 'leading -h');
assert.equal(hasHelpFlag(['?']), true, 'leading ?');
assert.equal(hasHelpFlag(['help']), true, 'leading help');
assert.equal(hasHelpFlag(['help', 'refine']), true, 'help plus target');
assert.equal(hasHelpFlag(['new', '--help']), true, 'new --help');
assert.equal(hasHelpFlag(['new', 'help']), true, 'new help');
assert.equal(hasHelpFlag(['new', '-h']), true, 'new -h');
assert.equal(hasHelpFlag(['new', '?']), true, 'new ?');
assert.equal(hasHelpFlag(['promote', '394', '--help']), false, 'third-position value');
assert.equal(hasHelpFlag(['refine', '394', '--reason', '?']), false, 'option value ?');
assert.equal(hasHelpFlag(['new', '--title', '--help']), false, 'option value --help');
assert.equal(hasHelpFlag(['new', 'Add a thing']), false, 'plain new title');
assert.equal(hasHelpFlag(['status']), false, 'status verb');
assert.equal(hasHelpFlag([]), false, 'empty argv');
assert.equal(hasHelpFlag(undefined), false, 'undefined argv');
assert.equal(hasHelpFlag(['new', 'what now?']), false, 'embedded ? in a title is not the flag');
assert.equal(hasHelpFlag(['new', '--help-me']), false, '--help-me is not --help');
assert.deepEqual(earlyHelpTarget(['help', 'refine']), { matched: true, target: 'refine' });
assert.deepEqual(earlyHelpTarget(['refine', '--help']), { matched: true, target: 'refine' });
assert.deepEqual(earlyHelpTarget(['help']), { matched: true, target: undefined });
assert.equal(earlyHelpTarget(['refine', '394', '--reason', 'help']), null);

console.log('cli-help-flag.test.mjs: OK');
