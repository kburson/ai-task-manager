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
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { mkdtempProjectIsolated } from '../../lib/scratch-dir.mjs';
import { readCache, writeCache, cacheFilePath, CACHE_TTL_MS } from '../../source-edit-gate.mjs';

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
