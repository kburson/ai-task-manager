#!/usr/bin/env node
// @story #514
// Current (non-archive) user-facing documentation must not teach raw
// `gh issue create`. The sanctioned path is `scripts/gh/create-issue.mjs
// --shape <epic|sub-issue|solo>` (enforced by AGENTS.md, CLAUDE.md,
// skill/shared/router.md, and the bash-guard). A fenced shell example that runs
// `gh issue create` trains readers and agents into the exact bypass the wrapper
// and the guard exist to stop (issue #103) — the documentation arm of the #508
// fail-open family.
//
// The tripwire keys strictly on a *runnable command line* — a line that starts
// with `gh issue create` — so it catches fenced teaching examples while leaving
// untouched (a) inline prose that FORBIDS the command and (b) the
// `Bash(gh issue create*)` settings allow-rule, neither of which is a bare
// command line. Archived historical docs under docs/archive/ are out of scope:
// they are excluded from current workflow guidance by path (AC2's "excluded"
// branch), and the exclusion itself is pinned below.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
// scripts/task-tracker/tests/unit → repo root is four levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// Directories excluded from the "current docs" scan. docs/archive holds frozen
// historical material that is excluded from current workflow guidance (AC2).
// `worktrees` covers .claude/worktrees — sandbox/worktree copies of the repo,
// not canonical current docs.
const IGNORED_DIRS = new Set(['node_modules', '.git', '.tmp', 'archive', 'worktrees']);
const IGNORED_REL = new Set([path.join('docs', 'archive')]);

// A runnable raw-create command line: the line *starts* with `gh issue create`
// (after optional indentation). Inline mentions and `Bash(gh issue create*)`
// allow-rules never start a line with the bare command, so they don't match.
const RAW_CREATE_CMD = /^\s*gh issue create\b/m;

function isIgnoredDir(absDir) {
  const rel = path.relative(REPO_ROOT, absDir);
  if (IGNORED_REL.has(rel)) return true;
  return rel.split(path.sep).some((seg) => IGNORED_DIRS.has(seg));
}

function collectCurrentMarkdown(dir = REPO_ROOT, acc = []) {
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (IGNORED_DIRS.has(entry) || isIgnoredDir(abs)) continue;
      collectCurrentMarkdown(abs, acc);
    } else if (entry.endsWith('.md')) {
      acc.push(abs);
    }
  }
  return acc;
}

// ── AC1 / AC3: no current doc teaches raw `gh issue create` ────────────────────

test('current docs carry no fenced raw `gh issue create` command line', () => {
  const offenders = [];
  for (const file of collectCurrentMarkdown()) {
    const src = readFileSync(file, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (/^\s*gh issue create\b/.test(line)) {
        offenders.push(`${path.relative(REPO_ROOT, file)}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `current docs must not teach raw \`gh issue create\` — use ` +
      `\`scripts/gh/create-issue.mjs --shape …\`. Offending lines:\n  ${offenders.join('\n  ')}`
  );
});

// ── AC2: archived historical docs are excluded from the current-docs scan ──────

test('docs/archive is excluded from the current-docs scan', () => {
  const scanned = collectCurrentMarkdown().map((f) => path.relative(REPO_ROOT, f));
  assert.ok(scanned.length > 0, 'sanity: the walker must find at least one current markdown file');
  assert.ok(
    scanned.every((rel) => !rel.startsWith(`docs${path.sep}archive${path.sep}`)),
    'no docs/archive file may appear in the current-docs scan set'
  );
  // A known archived file that still contains a raw-create example must NOT be
  // scanned — proving AC2's "excluded from current workflow guidance" branch.
  const archivedRaw = path.join(
    'docs',
    'archive',
    'superpowers',
    'history',
    'plans',
    '2026-04-27-plan-mode-backlog-creation.md'
  );
  const archivedAbs = path.join(REPO_ROOT, archivedRaw);
  assert.ok(
    RAW_CREATE_CMD.test(readFileSync(archivedAbs, 'utf8')),
    'fixture check: the archived doc is expected to still contain a raw-create example'
  );
  assert.ok(
    !scanned.includes(archivedRaw),
    'the archived raw-create doc must be excluded from the scan, not flagged'
  );
});

// ── Guard precision: prohibition mentions are not false-positives ──────────────

test('inline prohibition mentions are preserved and never flagged', () => {
  for (const rel of ['AGENTS.md', 'CLAUDE.md']) {
    const src = readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assert.match(
      src,
      /gh issue create/,
      `${rel} must still carry the inline gh-issue-create prohibition text`
    );
    assert.ok(
      !src.split('\n').some((line) => /^\s*gh issue create\b/.test(line)),
      `${rel}'s inline prohibition must not be mistaken for a runnable command line`
    );
  }
});
