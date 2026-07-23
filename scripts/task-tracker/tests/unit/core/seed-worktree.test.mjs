#!/usr/bin/env node
// @story #575 — Retire seed-worktree.
//
// History: #27 added `seed-worktree.mjs` to copy the gitignored
// `.ai-task-manager/` runtime config + templates into a fresh `git worktree add`
// checkout. #573 moved transient runtime state under `.tmp/aitm/` (auto-created
// on first write) and #574 made `.ai-task-manager/` config + templates
// first-class git-TRACKED files. Once the tracked set ≡ the worktree-required
// set, a plain checkout already carries every behavioral contract, so seeding
// is structurally unnecessary and the helper was deleted.
//
// This test is the verifier for all four #575 ACs. It no longer exercises a
// seeding helper (there is none) — instead it ASSERTS the seeding path is gone:
//   1. The `seed-worktree.mjs` module no longer exists.
//   2. No live (non-test) script imports or invokes it.
//   3. The required templates are git-tracked, so a checkout carries them with
//      zero seeding — structurally closing the #539 "missing templates" gap.
//   4. Docs no longer present seeding as a live mechanism.

import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const ROOT = path.resolve(__dir, '..', '..', '..', '..');

function walk(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules') continue;
      walk(p, acc);
    } else if (/\.mjs$/.test(ent.name)) {
      acc.push(p);
    }
  }
  return acc;
}

// AC2 — the module is deleted.
{
  const modulePath = path.join(ROOT, 'scripts', 'task-tracker', 'seed-worktree.mjs');
  assert.equal(existsSync(modulePath), false, 'seed-worktree.mjs must be deleted (#575)');
}

// AC2 — no live (non-test) script imports seed-worktree.mjs or calls the
// retired helpers. The test tree may still NAME them while asserting absence
// (this file does), so the live-code scan excludes `tests/`.
{
  const SCRIPTS = path.join(ROOT, 'scripts');
  const offenders = [];
  const FORBIDDEN = [
    /from\s+['"][^'"]*seed-worktree(\.mjs)?['"]/,
    /\bseedMissingTemplates\b/,
    /\bseedWorktreeBackfill\b/,
    /\bseedWorktree\b/,
  ];
  for (const file of walk(SCRIPTS)) {
    const rel = path.relative(SCRIPTS, file);
    if (rel.split(path.sep).includes('tests')) continue;
    const text = readFileSync(file, 'utf8');
    if (FORBIDDEN.some((re) => re.test(text))) offenders.push(rel.split(path.sep).join('/'));
  }
  assert.deepEqual(
    offenders,
    [],
    `no live script may reference the retired seeding helper:\n${offenders.join('\n')}`
  );
}

// AC1 / AC4 — the templates a worktree needs are git-tracked, so a checkout
// carries them with zero seeding. `git ls-files` is the source of truth for
// "present at checkout."
{
  const tracked = execFileSync('git', ['-C', ROOT, 'ls-files', '.ai-task-manager/'], {
    encoding: 'utf8',
  }).split('\n');
  const required = [
    '.ai-task-manager/task-tracker.json',
    '.ai-task-manager/templates/pickup-directive.md',
    '.ai-task-manager/templates/definition-of-done.md',
  ];
  for (const f of required) {
    assert.ok(
      tracked.includes(f),
      `${f} must be git-tracked so a fresh worktree carries it without seeding (#539 closed)`
    );
  }
}

// AC4 — skill + guide docs no longer present seeding as a LIVE mechanism. A
// retirement note ("retired", "deleted", "no seeding", "NOT needed") is allowed;
// an imperative "run the seed helper" instruction is not.
{
  const docs = [
    path.join(ROOT, 'skill', 'shared', 'rules', 'parallel.md'),
    path.join(ROOT, 'docs', 'guides', 'parallel-agents.md'),
  ];
  const liveSeedInstruction =
    /npx aitm seed-worktree|run the seed helper|MANDATORY[\s\S]{0,40}seed/i;
  for (const d of docs) {
    if (!existsSync(d)) continue;
    const text = readFileSync(d, 'utf8');
    assert.equal(
      liveSeedInstruction.test(text),
      false,
      `${path.relative(ROOT, d)} must not instruct a live seeding step (#575)`
    );
  }
}

console.log('seed-worktree.test.mjs: seeding path retired — all assertions passed');
