#!/usr/bin/env node
// @story #664
// #664 — the source-edit-gate active-issue cache now lives in a gitignored
// sidecar (`.ai-task-manager/.cache/active-issue.json`) instead of under
// `activeIssueCache` in the tracked task-tracker.json. These tests pin the new
// storage location, the byte-stability of the tracked config, and the preserved
// 30s-TTL / bound-issue-match read semantics. Split from source-edit-gate.test.mjs
// to stay under the 400-line ADR §4 cap (audit-line-cap).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
  statSync,
  utimesSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';
import {
  readCache,
  writeCache,
  cacheFilePath,
  CACHE_TTL_MS,
  runHook,
} from '../../../source-edit-gate.mjs';

// Repo root (…/scripts/task-tracker/tests/unit/ → four levels up). Used so the
// gitignore assertion runs against the real worktree the suite executes in
// (works at repo root and inside the Test-stage sandbox worktree alike).
const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../..');

const CONFIG_REL = path.join('.ai-task-manager', 'task-tracker.json');

// Builds a throwaway project dir with a minimal task-tracker.json. Returns { dir, cleanup }.
function makeProjectDir() {
  const dir = mkdtempProjectIsolated('aitm-seg-664-');
  mkdirSync(path.join(dir, '.ai-task-manager'), { recursive: true });
  writeFileSync(path.join(dir, CONFIG_REL), JSON.stringify({ repo: 'owner/repo' }));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('#664: writeCache leaves task-tracker.json byte-identical', () => {
  const { dir, cleanup } = makeProjectDir();
  try {
    const cfgPath = path.join(dir, CONFIG_REL);
    const before = readFileSync(cfgPath, 'utf8');
    writeCache(dir, { issue: '#664' });
    const after = readFileSync(cfgPath, 'utf8');
    assert.equal(after, before, 'tracked config must not be rewritten by writeCache');
    assert.match(readFileSync(cfgPath, 'utf8'), /^(?!.*activeIssueCache)/s);
  } finally {
    cleanup();
  }
});

test('#664: writeCache persists to the .cache sidecar', () => {
  const { dir, cleanup } = makeProjectDir();
  try {
    writeCache(dir, { issue: '#664' });
    const sidecar = cacheFilePath(dir);
    assert.ok(existsSync(sidecar), 'sidecar file must exist after writeCache');
    assert.match(sidecar, /\.ai-task-manager[/\\]\.cache[/\\]active-issue\.json$/);
    const c = JSON.parse(readFileSync(sidecar, 'utf8'));
    assert.equal(c.issue, '#664');
    assert.equal(typeof c.fetchedAt, 'number');
  } finally {
    cleanup();
  }
});

test('#664: readCache returns the entry on a fresh hit', () => {
  const { dir, cleanup } = makeProjectDir();
  try {
    writeCache(dir, { issue: '#664' });
    const c = readCache(dir, '#664');
    assert.ok(c);
    assert.equal(c.issue, '#664');
  } finally {
    cleanup();
  }
});

test('#664: readCache returns null on a miss (no sidecar)', () => {
  const { dir, cleanup } = makeProjectDir();
  try {
    assert.equal(readCache(dir, '#664'), null);
  } finally {
    cleanup();
  }
});

test('#664: readCache returns null when the bound issue differs', () => {
  const { dir, cleanup } = makeProjectDir();
  try {
    writeCache(dir, { issue: '#664' });
    assert.equal(readCache(dir, '#999'), null);
  } finally {
    cleanup();
  }
});

test('#664: readCache returns null when the entry is older than the TTL', () => {
  const { dir, cleanup } = makeProjectDir();
  try {
    const sidecar = cacheFilePath(dir);
    mkdirSync(path.dirname(sidecar), { recursive: true });
    writeFileSync(
      sidecar,
      JSON.stringify({ issue: '#664', fetchedAt: Date.now() - CACHE_TTL_MS - 1_000 })
    );
    assert.equal(readCache(dir, '#664'), null);
  } finally {
    cleanup();
  }
});

test('#664: the .cache sidecar directory is gitignored', () => {
  // `git check-ignore` exits 0 when the path matches an ignore rule, 1 when it
  // does not. Run it in-process (the Test-stage sandbox VC allowlist forbids the
  // `check-ignore` subcommand directly, but a spawned child inside `node --test`
  // is not gated). A non-zero exit throws, failing the assertion.
  const out = execFileSync('git', ['check-ignore', '.ai-task-manager/.cache/active-issue.json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
  assert.equal(out, '.ai-task-manager/.cache/active-issue.json');
});

test('#1049: cold source allow verifies authority before persisting cache', async () => {
  const events = [];
  const result = await runHook(
    { tool_name: 'Edit', tool_input: { file_path: 'src/guarded.mjs' } },
    {
      projectDir: '/fake/project',
      isChoreModeActive: () => false,
      loadBoundIssue: () => '#1049',
      loadPolicy: () => ({}),
      resolveIssueSignals: async () => {
        events.push('fetch');
        return {
          state: 'develop',
          hasPostedMarker: true,
          hasCompleteMarker: true,
          source: 'fetch',
        };
      },
      withGovernedEffect: async (options, callback) => {
        events.push(`verify:${options.issueId}:${options.operation}`);
        return callback({ reverify: async () => {} });
      },
      writeCache: (_projectDir, entry) => {
        events.push(`cache:${entry.issue}`);
      },
    }
  );

  assert.equal(result.decision, 'allow');
  assert.deepEqual(events, ['fetch', 'verify:1049:source-write', 'cache:#1049']);
});

test('#1049: authority refusal leaves an existing cache byte- and mtime-identical', async () => {
  const { dir, cleanup } = makeProjectDir();
  try {
    const sidecar = cacheFilePath(dir);
    mkdirSync(path.dirname(sidecar), { recursive: true });
    const beforeBytes = JSON.stringify({
      issue: '#1049',
      state: 'develop',
      fetchedAt: 1,
      sentinel: 'preserve-me',
    });
    writeFileSync(sidecar, beforeBytes);
    const old = new Date('2020-01-02T03:04:05.000Z');
    utimesSync(sidecar, old, old);
    const beforeMtime = statSync(sidecar).mtimeMs;

    const result = await runHook(
      { tool_name: 'Write', tool_input: { file_path: 'src/guarded.mjs' } },
      {
        projectDir: dir,
        isChoreModeActive: () => false,
        loadBoundIssue: () => '#1049',
        resolveIssueSignals: async () => ({
          state: 'develop',
          hasPostedMarker: true,
          hasCompleteMarker: true,
          source: 'fetch',
        }),
        withGovernedEffect: async () => {
          const error = new Error('lease token is stale');
          error.code = 'fence-stale';
          throw error;
        },
      }
    );

    assert.equal(result.decision, 'block');
    assert.equal(result.code, 'source-edit-authority-refused');
    assert.match(result.reason, /fence-stale/);
    assert.equal(readFileSync(sidecar, 'utf8'), beforeBytes);
    assert.equal(statSync(sidecar).mtimeMs, beforeMtime);
  } finally {
    cleanup();
  }
});
