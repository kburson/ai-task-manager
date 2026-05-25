#!/usr/bin/env node
// Tests for bin/cli.mjs ensureGitignoreEntry (#212). Validates that the
// installer writes `.ai-task-manager/sessions/` inside a managed block and
// that re-running is idempotent (no duplicates, block markers not repeated).

import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ensureGitignoreEntry,
  MANAGED_BLOCK_OPEN,
  MANAGED_BLOCK_CLOSE,
} from '../../../bin/cli.mjs';

const tmp = mkdtempSync(path.join(tmpdir(), 'tt-install-gitignore-'));
const gitignorePath = path.join(tmp, '.gitignore');

// Case 1: no pre-existing .gitignore — entry is written inside a managed block.
let written = ensureGitignoreEntry(tmp, '.ai-task-manager/sessions/');
assert.equal(written, true, 'first call must write the entry');
let content = readFileSync(gitignorePath, 'utf8');
assert.ok(content.includes(MANAGED_BLOCK_OPEN), 'open marker present');
assert.ok(content.includes(MANAGED_BLOCK_CLOSE), 'close marker present');
assert.ok(content.includes('.ai-task-manager/sessions/'), 'sessions entry present inside block');

// Case 2: re-run is idempotent — no duplicate entry, no duplicate block.
written = ensureGitignoreEntry(tmp, '.ai-task-manager/sessions/');
assert.equal(written, false, 're-run must report no-op');
content = readFileSync(gitignorePath, 'utf8');
const openMatches = content.match(new RegExp(MANAGED_BLOCK_OPEN, 'g')) || [];
const closeMatches = content.match(new RegExp(MANAGED_BLOCK_CLOSE, 'g')) || [];
assert.equal(openMatches.length, 1, 'open marker not duplicated');
assert.equal(closeMatches.length, 1, 'close marker not duplicated');
const entryMatches = content.match(/\.ai-task-manager\/sessions\//g) || [];
assert.equal(entryMatches.length, 1, 'entry not duplicated on re-run');

// Case 3: pre-existing user .gitignore is preserved; managed block appended.
rmSync(gitignorePath);
writeFileSync(gitignorePath, 'node_modules/\ndist/\n');
ensureGitignoreEntry(tmp, '.ai-task-manager/sessions/');
content = readFileSync(gitignorePath, 'utf8');
assert.ok(content.startsWith('node_modules/\ndist/\n'), 'user entries preserved at top');
assert.ok(content.includes(MANAGED_BLOCK_OPEN), 'open marker appended');
assert.ok(
  content.includes('.ai-task-manager/sessions/'),
  'sessions entry written below user content'
);

// Case 4: adding a second managed entry (e.g. EPIC #207 future sub-issues)
// nests it inside the existing block without re-opening one.
ensureGitignoreEntry(tmp, '.ai-task-manager/sessions/.lock');
content = readFileSync(gitignorePath, 'utf8');
const open2 = content.match(new RegExp(MANAGED_BLOCK_OPEN, 'g')) || [];
assert.equal(open2.length, 1, 'second entry must reuse existing block, not open a new one');
assert.ok(content.includes('.ai-task-manager/sessions/.lock'), 'second entry written');
assert.ok(content.includes('.ai-task-manager/sessions/'), 'first entry still present');

rmSync(tmp, { recursive: true });
console.log('install-gitignore.test.mjs: all passed');
