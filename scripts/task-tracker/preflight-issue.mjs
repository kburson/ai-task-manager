#!/usr/bin/env node
// Preflight check before any `gh issue create` from the task skill.
//
// Verifies that the canonical templates exist in `.claude/task-tracker/` and emits
// the Pickup Directive block to stdout for the skill to splice into the issue body.
//
// Exit codes:
//   0 — both templates present; canonical block written to stdout
//   2 — one or both templates missing; loud warning written to stderr
//
// Usage:
//   node preflight-issue.mjs                    # emit block with placeholders
//   node preflight-issue.mjs --check-only       # verify templates, no stdout output
//
// The skill MUST run this before creating any issue. If it exits non-zero, abort
// the planning session — no issues should be created without the templates.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
}

const root = repoRoot();
const ttDir = join(root, '.claude', 'task-tracker');
const pickupPath = join(ttDir, 'pickup-directive.md');
const dodPath = join(ttDir, 'definition-of-done.md');

const missing = [];
if (!existsSync(pickupPath)) missing.push('.claude/task-tracker/pickup-directive.md');
if (!existsSync(dodPath))    missing.push('.claude/task-tracker/definition-of-done.md');

if (missing.length > 0) {
  process.stderr.write([
    '',
    '⛔ STOP — claude-gh-task-manager templates are missing:',
    ...missing.map(p => `   - ${p}`),
    '',
    'No GitHub issues will be created until the skill is (re)installed in this',
    'project. Run:',
    '',
    '   npx @burson.kendrick/claude-gh-task-manager install',
    '',
    'Then retry. If the install completes but files are still missing, check that',
    'you ran the command from the project root.',
    '',
  ].join('\n'));
  process.exit(2);
}

const checkOnly = process.argv.includes('--check-only');
if (checkOnly) {
  process.stderr.write('[task-tracker] preflight ok — pickup-directive.md and definition-of-done.md present\n');
  process.exit(0);
}

// Emit the canonical Pickup Directive block. Placeholders `<this-issue-#>` and
// `<parent-epic-#>` are replaced by the caller after `gh issue create` returns the
// real issue number.
const dod = readFileSync(dodPath, 'utf8').replace(/\s+$/, '');

const block = [
  '## ⚡ Pickup Directive — MANDATORY, DO NOT SKIP',
  '> Follow: `.claude/task-tracker/pickup-directive.md`',
  '',
  '- [ ] Deep dive complete',
  '',
  '### Definition of Done',
  dod,
  '',
  '---',
  '',
].join('\n');

process.stdout.write(block);
