// @story #644
// Offline coverage-lift for source-edit-gate.mjs. Exercises the pure decision
// helper (decideSourceEdit), the path-normalize helpers, the state/cache helpers
// (loadBoundIssue, readCache/writeCache, cacheFilePath), the gh-backed
// fetchIssueSignals + resolveIssueSignals through an injected `gh`, and the
// runHook PreToolUse orchestration through injected deps — no gh, no network.
// A throwaway temp project dir backs the fs-touching helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';

import {
  normalizePath,
  isAllowlistedPath,
  decideSourceEdit,
  loadBoundIssue,
  cacheFilePath,
  readCache,
  writeCache,
  fetchIssueSignals,
  resolveIssueSignals,
  runHook,
  ALLOWLIST_PREFIXES,
  CACHE_TTL_MS,
} from '../../../source-edit-gate.mjs';
import { statePath } from '../../../paths.mjs';

// ── temp project scaffold ─────────────────────────────────────────────────────
const KANBAN = {
  repo: 'o/r',
  kanbanOptionBacklog: 'opt-backlog',
  kanbanOptionRefine: 'opt-refine',
  kanbanOptionPlan: 'opt-plan',
  kanbanOptionDevelop: 'opt-develop',
  kanbanOptionTest: 'opt-test',
  kanbanOptionReview: 'opt-review',
  kanbanOptionDone: 'opt-done',
};

function makeProject({ active, config = KANBAN } = {}) {
  const dir = mkdtempProjectIsolated('aitm-seg-');
  mkdirSync(path.join(dir, '.ai-task-manager'), { recursive: true });
  writeFileSync(path.join(dir, '.ai-task-manager', 'task-tracker.json'), JSON.stringify(config));
  if (active !== undefined) {
    const sp = statePath(dir);
    mkdirSync(path.dirname(sp), { recursive: true });
    writeFileSync(sp, JSON.stringify({ active }));
  }
  return dir;
}
const cleanups = [];
function project(opts) {
  const d = makeProject(opts);
  cleanups.push(d);
  return d;
}
test.after(() => {
  for (const d of cleanups) rmSync(d, { recursive: true, force: true });
});

const DEV_BODY =
  'body\n<!-- aitm-deep-dive-posted ts="x" -->\n<!-- aitm-deep-dive-complete ts="y" -->\n';

// ── normalizePath / isAllowlistedPath ─────────────────────────────────────────
test('normalizePath: empty → empty, relative → posix, outside → abs', () => {
  assert.equal(normalizePath('', '/proj'), '');
  assert.equal(normalizePath('a/b.mjs', '/proj'), 'a/b.mjs');
  assert.equal(normalizePath('/proj/a/b.mjs', '/proj'), 'a/b.mjs');
  assert.ok(path.isAbsolute(normalizePath('/other/x.mjs', '/proj')));
});

test('isAllowlistedPath: empty false, .tmp/ true, scratch true, src false', () => {
  assert.equal(isAllowlistedPath(''), false);
  assert.equal(isAllowlistedPath('.tmp/x'), true);
  assert.equal(isAllowlistedPath(ALLOWLIST_PREFIXES[1] + 'y'), true);
  assert.equal(isAllowlistedPath('scripts/task-tracker/x.mjs'), false);
});

// ── decideSourceEdit branches ─────────────────────────────────────────────────
const base = { projectDir: '/proj', filePath: 'scripts/x.mjs' };

test('decide: non-gated tool → allow', () => {
  assert.equal(decideSourceEdit({ ...base, toolName: 'Read' }).decision, 'allow');
});
test('decide: chore-mode → allow bypass', () => {
  const r = decideSourceEdit({ ...base, toolName: 'Edit', choreModeActive: true });
  assert.equal(r.reason, 'chore-mode-bypass');
});
test('decide: allowlisted path → allow', () => {
  const r = decideSourceEdit({ ...base, toolName: 'Edit', filePath: '.tmp/scratch.mjs' });
  assert.equal(r.reason, 'allowlisted-path');
});
test('decide: no bound issue → block', () => {
  const r = decideSourceEdit({ ...base, toolName: 'Write', boundIssue: null });
  assert.equal(r.decision, 'block');
  assert.equal(r.code, 'source-edit-no-bound-issue');
});
test('decide: pre-develop state → block state-gate', () => {
  const r = decideSourceEdit({ ...base, toolName: 'Edit', boundIssue: '#1', issueState: 'refine' });
  assert.equal(r.code, 'source-edit-state-gate');
});
test('decide: develop but markers missing → block marker-gate', () => {
  const r = decideSourceEdit({
    ...base,
    toolName: 'Edit',
    boundIssue: '#1',
    issueState: 'develop',
    hasPostedMarker: true,
    hasCompleteMarker: false,
  });
  assert.equal(r.code, 'source-edit-marker-gate');
  assert.match(r.reason, /aitm-deep-dive-complete/);
});
test('decide: develop + both markers → allow', () => {
  const r = decideSourceEdit({
    ...base,
    toolName: 'Edit',
    boundIssue: '#1',
    issueState: 'develop',
    hasPostedMarker: true,
    hasCompleteMarker: true,
  });
  assert.equal(r.reason, 'state-and-markers-ok');
});

// ── loadBoundIssue ────────────────────────────────────────────────────────────
test('loadBoundIssue: no state file → null', () => {
  assert.equal(loadBoundIssue(project()), null);
});
test('loadBoundIssue: numeric active → #N', () => {
  assert.equal(loadBoundIssue(project({ active: '644' })), '#644');
});
test('loadBoundIssue: discover/plan sentinels → null', () => {
  assert.equal(loadBoundIssue(project({ active: 'discover' })), null);
  assert.equal(loadBoundIssue(project({ active: 'plan' })), null);
});

// ── cache helpers ─────────────────────────────────────────────────────────────
test('cacheFilePath: lands under .ai-task-manager/.cache', () => {
  assert.match(cacheFilePath('/proj'), /\.ai-task-manager\/\.cache\/active-issue\.json$/);
});
test('readCache: missing file → null; write then read → hit', () => {
  const dir = project();
  assert.equal(readCache(dir, '#5'), null);
  writeCache(dir, {
    issue: '#5',
    state: 'develop',
    hasPostedMarker: true,
    hasCompleteMarker: true,
  });
  const c = readCache(dir, '#5');
  assert.equal(c.state, 'develop');
});
test('readCache: wrong issue → null', () => {
  const dir = project();
  writeCache(dir, { issue: '#5', state: 'develop' });
  assert.equal(readCache(dir, '#9'), null);
});
test('readCache: stale entry → null', () => {
  const dir = project();
  const p = cacheFilePath(dir);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(
    p,
    JSON.stringify({ issue: '#5', state: 'develop', fetchedAt: Date.now() - CACHE_TTL_MS - 1000 })
  );
  assert.equal(readCache(dir, '#5'), null);
});

// ── fetchIssueSignals / resolveIssueSignals (injected gh) ─────────────────────
test('fetchIssueSignals: optionId shape → mapped state + markers', async () => {
  const dir = project();
  const gh = async () =>
    JSON.stringify({ body: DEV_BODY, projectItems: [{ status: { optionId: 'opt-develop' } }] });
  const s = await fetchIssueSignals('#644', dir, { gh });
  assert.equal(s.state, 'develop');
  assert.equal(s.hasPostedMarker, true);
  assert.equal(s.hasCompleteMarker, true);
});
test('fetchIssueSignals: name shape → lowercased state', async () => {
  const dir = project();
  const gh = async () =>
    JSON.stringify({ body: '', projectItems: [{ status: { name: 'Review' } }] });
  const s = await fetchIssueSignals('#644', dir, { gh });
  assert.equal(s.state, 'review');
});
test('resolveIssueSignals: cache miss fetches then warms cache', async () => {
  const dir = project();
  let calls = 0;
  const gh = async () => {
    calls += 1;
    return JSON.stringify({
      body: DEV_BODY,
      projectItems: [{ status: { optionId: 'opt-develop' } }],
    });
  };
  const first = await resolveIssueSignals('#644', dir, { gh });
  assert.equal(first.source, 'fetch');
  const second = await resolveIssueSignals('#644', dir, { gh });
  assert.equal(second.source, 'cache');
  assert.equal(calls, 1);
});

// ── runHook orchestration ─────────────────────────────────────────────────────
test('runHook: non-gated tool → allow', async () => {
  const r = await runHook({ tool_name: 'Read' });
  assert.equal(r.reason, 'tool-not-gated');
});
test('runHook: no project dir → allow', async () => {
  const r = await runHook({ tool_name: 'Edit' }, { projectDir: null });
  assert.equal(r.reason, 'no-project-dir');
});
test('runHook: chore-mode bypass', async () => {
  const r = await runHook(
    { tool_name: 'Edit', tool_input: { file_path: 'scripts/x.mjs' } },
    { projectDir: '/proj', isChoreModeActive: () => true, loadBoundIssue: () => null }
  );
  assert.equal(r.reason, 'chore-mode-bypass');
});
test('runHook: bound + develop + markers via injected resolve → allow', async () => {
  const r = await runHook(
    { tool_name: 'Edit', tool_input: { file_path: 'scripts/x.mjs' } },
    {
      projectDir: '/proj',
      isChoreModeActive: () => false,
      loadBoundIssue: () => '#644',
      resolveIssueSignals: async () => ({
        state: 'develop',
        hasPostedMarker: true,
        hasCompleteMarker: true,
      }),
      withGovernedEffect: async (_options, callback) => callback({ reverify: async () => {} }),
    }
  );
  assert.equal(r.reason, 'state-and-markers-ok');
});
test('runHook: resolve throws → falls through to refuse pre-develop default', async () => {
  const r = await runHook(
    { tool_name: 'Write', tool_input: { file_path: 'scripts/x.mjs' } },
    {
      projectDir: '/proj',
      isChoreModeActive: () => false,
      loadBoundIssue: () => '#644',
      resolveIssueSignals: async () => {
        throw new Error('gh down');
      },
    }
  );
  assert.equal(r.decision, 'block');
  assert.equal(r.code, 'source-edit-state-gate');
});
test('runHook: findProjectDir honours env override', async () => {
  const dir = project({ active: 'discover' });
  const prev = process.env.AI_TASK_MANAGER_PROJECT_DIR;
  process.env.AI_TASK_MANAGER_PROJECT_DIR = dir;
  try {
    const r = await runHook({ tool_name: 'Edit', tool_input: { file_path: '.tmp/x.mjs' } });
    // allowlisted path short-circuits before any gh work
    assert.equal(r.reason, 'allowlisted-path');
  } finally {
    if (prev === undefined) delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
    else process.env.AI_TASK_MANAGER_PROJECT_DIR = prev;
  }
});

console.log('coverage-source-edit-gate.test.mjs: ok');
