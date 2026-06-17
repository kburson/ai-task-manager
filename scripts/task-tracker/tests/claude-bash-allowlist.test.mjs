#!/usr/bin/env node
// @story #199
// Tests for the positive Bash allowlist installed into .claude/settings.json
// (issue #199). Verifies:
//  - The allowlist contains canonical commands.
//  - The allowlist contains no interpreter-payload forms (-c, -e, --eval).
//  - `npx ai-task-manager install` writes the entries to settings.json and
//    does NOT write the prior broad `Bash` allow.
//  - Re-running install removes a pre-existing broad `Bash` entry (migration).

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { projectScratchDir } from '../lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CLAUDE_BASH_ALLOWLIST,
  FORBIDDEN_INTERPRETER_FLAGS,
  findInterpreterPayloadEntry,
} from '../../../bin/lib/claude-bash-allowlist.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..', '..', '..');
const CLI = path.join(ROOT, 'bin', 'cli.mjs');

const target = mkdtempSync(path.join(projectScratchDir('test'), 'allowlist-test-'));
const migrationTarget = mkdtempSync(path.join(projectScratchDir('test'), 'allowlist-migrate-'));

try {
  // -- Allowlist shape ------------------------------------------------------

  assert.ok(CLAUDE_BASH_ALLOWLIST.length > 0, 'allowlist must not be empty');
  assert.ok(
    CLAUDE_BASH_ALLOWLIST.includes('Bash(npm test)'),
    'allowlist must include canonical `npm test`'
  );
  assert.ok(
    CLAUDE_BASH_ALLOWLIST.includes('Bash(npm run lint)'),
    'allowlist must include canonical `npm run lint`'
  );
  assert.ok(
    CLAUDE_BASH_ALLOWLIST.includes('Bash(npm run format:check)'),
    'allowlist must include canonical `npm run format:check`'
  );
  assert.ok(
    CLAUDE_BASH_ALLOWLIST.some((e) => e.startsWith('Bash(node scripts/')),
    'allowlist must include `node scripts/**`'
  );
  assert.ok(
    CLAUDE_BASH_ALLOWLIST.some((e) => e.startsWith('Bash(git commit')),
    'allowlist must include `git commit`'
  );
  assert.ok(
    !CLAUDE_BASH_ALLOWLIST.includes('Bash'),
    'allowlist must NOT include the broad `Bash` token'
  );

  // -- Interpreter-payload rejection ---------------------------------------
  // The allowlist must not contain any entry with `bash -c`, `sh -c`,
  // `node -e`, `python -c`, etc. These bypass lexical classification.

  const violation = findInterpreterPayloadEntry(CLAUDE_BASH_ALLOWLIST);
  assert.equal(
    violation,
    null,
    `allowlist must not contain interpreter-payload flags; offender: ${JSON.stringify(violation)}`
  );

  // Sanity-check the detector itself.
  const detector = findInterpreterPayloadEntry(['Bash(bash -c echo)']);
  assert.ok(detector, 'detector must flag `bash -c` payloads');
  assert.match(detector.entry, /bash -c/);

  // -- Quoted-path bypass attempts in the FORBIDDEN regex set --------------
  // A `node -e '...'` form must trip the detector even with surrounding noise.
  for (const sample of [
    'Bash(node -e "require(\'fs\').writeFileSync()")',
    'Bash(bash -c "cd .. && rm -rf foo")',
    'Bash(python -c \'import os; os.remove(".env")\')',
  ]) {
    const hit = findInterpreterPayloadEntry([sample]);
    assert.ok(hit, `detector must flag interpreter payload: ${sample}`);
  }

  assert.ok(
    FORBIDDEN_INTERPRETER_FLAGS.length > 0,
    'FORBIDDEN_INTERPRETER_FLAGS must be a non-empty list'
  );

  // -- Install end-to-end: fresh target ------------------------------------

  await pexec('node', [CLI, 'install', '--target', target]);
  const settings = JSON.parse(readFileSync(path.join(target, '.claude', 'settings.json'), 'utf8'));
  const allow = settings.permissions?.allow ?? [];

  for (const entry of CLAUDE_BASH_ALLOWLIST) {
    assert.ok(allow.includes(entry), `settings.permissions.allow missing entry: ${entry}`);
  }
  assert.ok(!allow.includes('Bash'), 'fresh install must NOT write the broad `Bash` allow entry');

  // Idempotent: a second install should not change settings.json.
  const before = readFileSync(path.join(target, '.claude', 'settings.json'), 'utf8');
  await pexec('node', [CLI, 'install', '--target', target]);
  const after = readFileSync(path.join(target, '.claude', 'settings.json'), 'utf8');
  assert.equal(after, before, 'second install must be a no-op on settings.json');

  // -- Migration: an older install with broad `Bash` should drop it --------

  mkdirSync(path.join(migrationTarget, '.claude'), { recursive: true });
  writeFileSync(
    path.join(migrationTarget, '.claude', 'settings.json'),
    JSON.stringify({ permissions: { allow: ['Bash'] } }, null, 2) + '\n',
    'utf8'
  );
  await pexec('node', [CLI, 'install', '--target', migrationTarget]);
  const migrated = JSON.parse(
    readFileSync(path.join(migrationTarget, '.claude', 'settings.json'), 'utf8')
  );
  const migratedAllow = migrated.permissions?.allow ?? [];
  assert.ok(
    !migratedAllow.includes('Bash'),
    'install must migrate away from the broad `Bash` allow entry'
  );
  assert.ok(
    migratedAllow.includes('Bash(npm test)'),
    'install must add canonical allowlist entries during migration'
  );

  console.log('claude-bash-allowlist.test.mjs OK');
} finally {
  rmSync(target, { recursive: true, force: true });
  rmSync(migrationTarget, { recursive: true, force: true });
}
