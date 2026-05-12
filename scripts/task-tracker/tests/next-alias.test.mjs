#!/usr/bin/env node
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

const here = dirname(fileURLToPath(import.meta.url));
const dispatch = readFileSync(join(here, '..', 'task-tracker.mjs'), 'utf8');
const runtime = readFileSync(join(here, '..', 'runtime.mjs'), 'utf8');
const helpSrc = readFileSync(join(here, '..', 'verbs', 'help.mjs'), 'utf8');

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
  assert.ok(
    /\/task next.*Alias of \/task promote/.test(helpSrc),
    'help text (verbs/help.mjs) should call out /task next as an alias of /task promote'
  );
});
