#!/usr/bin/env node
// Preflight check before any `gh issue create` from the task skill.
//
// Verifies that the canonical templates exist in `.ai-task-manager/` and emits
// the Definition of Done + Pickup Directive tail block to stdout for the skill to splice into the issue body.
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
import { execFileSync } from 'node:child_process';
import { existingRuntimePath } from './paths.mjs';

function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
}

const root = repoRoot();
const pickupPath = existingRuntimePath(root, '.ai-task-manager/pickup-directive.md');
const dodPath = existingRuntimePath(root, '.ai-task-manager/definition-of-done.md');

const missing = [];
if (!existsSync(pickupPath)) missing.push('.ai-task-manager/pickup-directive.md');
if (!existsSync(dodPath))    missing.push('.ai-task-manager/definition-of-done.md');

if (missing.length > 0) {
  process.stderr.write([
    '',
    'STOP - ai-task-manager templates are missing:',
    ...missing.map(p => `   - ${p}`),
    '',
    'No GitHub issues will be created until the skill is (re)installed in this',
    'project. Run:',
    '',
    '   npx ai-task-manager install',
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

// Emit the canonical Definition of Done + Pickup Directive tail block. Placeholders `<this-issue-#>` and
// `<parent-epic-#>` are replaced by the caller after `gh issue create` returns the
// real issue number.
const dod = readFileSync(dodPath, 'utf8').replace(/\s+$/, '');

const block = [
  '### Definition of Done',
  dod,
  '',
  '## Pickup Directive — MANDATORY, DO NOT SKIP',
  '> Follow: `.ai-task-manager/pickup-directive.md`',
  '',
  '- [ ] Deep dive complete',
  '',
  '---',
  '',
].join('\n');

process.stdout.write(block);
