#!/usr/bin/env node
// @story #79
// #79 — /task next is a dispatch alias of /task promote.
//
// Structural assertion: the verb table maps `next` to the same handler module
// (`verbs/promote.mjs`) so it inherits all gates, drift detection, refusals,
// audit comments, and timing rows verbatim. Tested by reading the source of
// task-tracker.mjs (not by spawning a subprocess) to keep the test offline.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { verbHelp } from '../../../verbs/help.mjs';

const here = dirname(fileURLToPath(import.meta.url)) + '/..';
const dispatch = readFileSync(join(here, '..', '..', 'task-tracker.mjs'), 'utf8');
const runtime = readFileSync(join(here, '..', '..', 'runtime.mjs'), 'utf8');

test('case fall-through: promote and next share verbPromote handler', () => {
  // Regex: case 'promote': <ws> case 'next': <ws> { <ws> ... verbPromote
  const re = /case ['"]promote['"]:\s*case ['"]next['"]:\s*\{[\s\S]*?verbPromote\s*\(/;
  assert.ok(
    re.test(dispatch),
    'expected case-fall-through `promote`→`next` mapping to verbPromote in task-tracker.mjs dispatch'
  );
});

test('ISSUE_ARG_VERBS includes next', () => {
  assert.ok(
    /ISSUE_ARG_VERBS\s*=\s*new Set\(\[[\s\S]*?['"]next['"][\s\S]*?\]\)/.test(runtime),
    '`next` must be in ISSUE_ARG_VERBS (runtime.mjs) so #N parsing works'
  );
});

test('help text documents next as alias of promote', () => {
  // #667 relocated help content from inline strings into help-data.mjs, rendered
  // by verbHelp(). Contract preserved: the rendered reference for `next` resolves
  // to the promote page and documents the alias.
  const lines = [];
  const orig = console.log;
  console.log = (msg) => lines.push(String(msg ?? ''));
  try {
    verbHelp('next');
  } finally {
    console.log = orig;
  }
  const out = lines.join('\n');
  assert.match(out, /\/task promote/, 'help for `next` should render the promote reference');
  assert.match(out, /Alias:\s*next/, 'promote reference should list next as an alias of promote');
});
