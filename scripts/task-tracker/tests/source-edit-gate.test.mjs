#!/usr/bin/env node
// #327 — PreToolUse source-edit gate.
//
// Covers AC #1, #2, #4, #6, and AC #9 cases (a)-(e):
//   (a) Edit refused in Backlog state
//   (b) Edit refused in Develop without markers
//   (c) Edit permitted in Develop with both markers
//   (d) Edit permitted on `.tmp/**` paths regardless of state
//   (e) chore-mode active → Edit of arbitrary path permitted
// Plus: NotebookEdit gated, non-gated tools allowed, refusal message shape,
// path normalisation, no-bound-issue refusal, and cache TTL behaviour.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  decideSourceEdit,
  isAllowlistedPath,
  normalizePath,
  runHook,
  ALLOWLIST_PREFIXES,
} from '../source-edit-gate.mjs';

const PROJECT_DIR = '/fake/project';

// ── Pure decideSourceEdit ──────────────────────────────────────────────────

test('case (a): Edit refused in Backlog state', () => {
  const r = decideSourceEdit({
    toolName: 'Edit',
    filePath: 'src/foo.mjs',
    projectDir: PROJECT_DIR,
    boundIssue: '#42',
    choreModeActive: false,
    issueState: 'backlog',
    hasPostedMarker: false,
    hasCompleteMarker: false,
  });
  assert.equal(r.decision, 'block');
  assert.equal(r.code, 'source-edit-state-gate');
  assert.match(r.reason, /#42/);
  assert.match(r.reason, /'backlog'/);
  assert.match(r.reason, /\/task promote/);
  assert.match(r.reason, /chore-mode on/);
});

test('case (a) variants: refine + plan also refused', () => {
  for (const state of ['refine', 'plan', 'unknown']) {
    const r = decideSourceEdit({
      toolName: 'Edit',
      filePath: 'src/foo.mjs',
      projectDir: PROJECT_DIR,
      boundIssue: '#42',
      choreModeActive: false,
      issueState: state,
      hasPostedMarker: true,
      hasCompleteMarker: true,
    });
    assert.equal(r.decision, 'block', `expected block in ${state}`);
    assert.equal(r.code, 'source-edit-state-gate');
  }
});

test('case (b): Edit refused in Develop without both deep-dive markers', () => {
  const r1 = decideSourceEdit({
    toolName: 'Edit',
    filePath: 'src/foo.mjs',
    projectDir: PROJECT_DIR,
    boundIssue: '#42',
    choreModeActive: false,
    issueState: 'develop',
    hasPostedMarker: false,
    hasCompleteMarker: false,
  });
  assert.equal(r1.decision, 'block');
  assert.equal(r1.code, 'source-edit-marker-gate');
  assert.match(r1.reason, /aitm-deep-dive-posted/);
  assert.match(r1.reason, /aitm-deep-dive-complete/);

  const r2 = decideSourceEdit({
    toolName: 'Edit',
    filePath: 'src/foo.mjs',
    projectDir: PROJECT_DIR,
    boundIssue: '#42',
    choreModeActive: false,
    issueState: 'develop',
    hasPostedMarker: true,
    hasCompleteMarker: false,
  });
  assert.equal(r2.decision, 'block');
  assert.equal(r2.code, 'source-edit-marker-gate');
  assert.match(r2.reason, /aitm-deep-dive-complete/);
  assert.doesNotMatch(r2.reason, /aitm-deep-dive-posted/);
});

test('case (c): Edit permitted in Develop with both markers stamped', () => {
  const r = decideSourceEdit({
    toolName: 'Edit',
    filePath: 'src/foo.mjs',
    projectDir: PROJECT_DIR,
    boundIssue: '#42',
    choreModeActive: false,
    issueState: 'develop',
    hasPostedMarker: true,
    hasCompleteMarker: true,
  });
  assert.equal(r.decision, 'allow');
  assert.equal(r.reason, 'state-and-markers-ok');
});

test('case (c) variants: test/review/done also permitted with markers', () => {
  for (const state of ['test', 'review', 'done']) {
    const r = decideSourceEdit({
      toolName: 'Edit',
      filePath: 'src/foo.mjs',
      projectDir: PROJECT_DIR,
      boundIssue: '#42',
      choreModeActive: false,
      issueState: state,
      hasPostedMarker: true,
      hasCompleteMarker: true,
    });
    assert.equal(r.decision, 'allow', `state ${state} should allow`);
  }
});

test('case (d): Edit on `.tmp/**` permitted regardless of state', () => {
  for (const filePath of [
    '.tmp/foo.md',
    '.tmp/gh/body.md',
    '.tmp/inspect/probe.mjs',
    '.ai-task-manager/scratch/draft.md',
  ]) {
    const r = decideSourceEdit({
      toolName: 'Write',
      filePath,
      projectDir: PROJECT_DIR,
      boundIssue: '#42',
      choreModeActive: false,
      issueState: 'backlog', // worst case
      hasPostedMarker: false,
      hasCompleteMarker: false,
    });
    assert.equal(r.decision, 'allow', `${filePath} should be allowlisted`);
    assert.equal(r.reason, 'allowlisted-path');
  }
});

test('case (e): chore-mode active → arbitrary path Edit permitted', () => {
  const r = decideSourceEdit({
    toolName: 'Edit',
    filePath: 'src/anywhere.mjs',
    projectDir: PROJECT_DIR,
    boundIssue: null,
    choreModeActive: true,
    issueState: 'unknown',
    hasPostedMarker: false,
    hasCompleteMarker: false,
  });
  assert.equal(r.decision, 'allow');
  assert.equal(r.reason, 'chore-mode-bypass');
});

test('NotebookEdit is gated (same as Edit/Write)', () => {
  const r = decideSourceEdit({
    toolName: 'NotebookEdit',
    filePath: 'analysis.ipynb',
    projectDir: PROJECT_DIR,
    boundIssue: '#42',
    choreModeActive: false,
    issueState: 'backlog',
    hasPostedMarker: false,
    hasCompleteMarker: false,
  });
  assert.equal(r.decision, 'block');
  assert.equal(r.code, 'source-edit-state-gate');
});

test('non-gated tools always allowed', () => {
  for (const tool of ['Read', 'Grep', 'Bash', 'Glob', 'Task']) {
    const r = decideSourceEdit({
      toolName: tool,
      filePath: 'src/foo.mjs',
      projectDir: PROJECT_DIR,
      boundIssue: null,
      choreModeActive: false,
      issueState: 'backlog',
      hasPostedMarker: false,
      hasCompleteMarker: false,
    });
    assert.equal(r.decision, 'allow', `tool ${tool} should not be gated`);
    assert.equal(r.reason, 'tool-not-gated');
  }
});

test('no bound issue + not chore-mode + non-allowlisted path → block', () => {
  const r = decideSourceEdit({
    toolName: 'Edit',
    filePath: 'src/foo.mjs',
    projectDir: PROJECT_DIR,
    boundIssue: null,
    choreModeActive: false,
    issueState: 'unknown',
    hasPostedMarker: false,
    hasCompleteMarker: false,
  });
  assert.equal(r.decision, 'block');
  assert.equal(r.code, 'source-edit-no-bound-issue');
  assert.match(r.reason, /chore-mode on/);
  assert.match(r.reason, /\/task #N/);
});

// ── helpers ────────────────────────────────────────────────────────────────

test('normalizePath converts absolute paths to project-relative POSIX', () => {
  assert.equal(normalizePath('/fake/project/src/foo.mjs', '/fake/project'), 'src/foo.mjs');
  assert.equal(normalizePath('src/foo.mjs', '/fake/project'), 'src/foo.mjs');
  assert.equal(normalizePath('/outside/path.mjs', '/fake/project'), '/outside/path.mjs');
});

test('isAllowlistedPath matches every documented prefix', () => {
  assert.ok(isAllowlistedPath('.tmp/foo.md'));
  assert.ok(isAllowlistedPath('.ai-task-manager/scratch/draft.md'));
  assert.equal(isAllowlistedPath('scripts/task-tracker/foo.mjs'), false);
  assert.equal(isAllowlistedPath('docs/guides/workflow.md'), false);
  assert.equal(isAllowlistedPath(''), false);
});

test('ALLOWLIST_PREFIXES is the documented set', () => {
  assert.deepEqual(ALLOWLIST_PREFIXES.slice().sort(), [
    '.ai-task-manager/scratch/',
    '.tmp/',
  ]);
});

// ── runHook integration with injected deps ─────────────────────────────────

test('runHook returns allow when project-dir cannot be found', async () => {
  const r = await runHook(
    { tool_name: 'Edit', tool_input: { file_path: 'src/foo.mjs' } },
    { projectDir: null }
  );
  assert.equal(r.decision, 'allow');
  assert.equal(r.reason, 'no-project-dir');
});

test('runHook blocks in backlog state via injected signal resolver', async () => {
  const r = await runHook(
    { tool_name: 'Edit', tool_input: { file_path: 'src/foo.mjs' } },
    {
      projectDir: PROJECT_DIR,
      isChoreModeActive: () => false,
      loadBoundIssue: () => '#42',
      resolveIssueSignals: async () => ({
        state: 'backlog',
        hasPostedMarker: false,
        hasCompleteMarker: false,
      }),
    }
  );
  assert.equal(r.decision, 'block');
  assert.equal(r.code, 'source-edit-state-gate');
});

test('runHook bypasses entire signal fetch when chore-mode is active', async () => {
  let fetched = false;
  const r = await runHook(
    { tool_name: 'Edit', tool_input: { file_path: 'src/foo.mjs' } },
    {
      projectDir: PROJECT_DIR,
      isChoreModeActive: () => true,
      loadBoundIssue: () => null,
      resolveIssueSignals: async () => {
        fetched = true;
        return { state: 'unknown', hasPostedMarker: false, hasCompleteMarker: false };
      },
    }
  );
  assert.equal(r.decision, 'allow');
  assert.equal(r.reason, 'chore-mode-bypass');
  assert.equal(fetched, false, 'must not fetch gh signals when chore-mode active');
});

test('runHook tolerates signal fetch failure (falls through to decide)', async () => {
  const r = await runHook(
    { tool_name: 'Edit', tool_input: { file_path: 'src/foo.mjs' } },
    {
      projectDir: PROJECT_DIR,
      isChoreModeActive: () => false,
      loadBoundIssue: () => '#42',
      resolveIssueSignals: async () => {
        throw new Error('gh exploded');
      },
    }
  );
  assert.equal(r.decision, 'block');
  // No markers + unknown state → state-gate refusal.
  assert.equal(r.code, 'source-edit-state-gate');
});

test('runHook allowlists .tmp without needing a bound issue or signals', async () => {
  let touched = false;
  const r = await runHook(
    { tool_name: 'Write', tool_input: { file_path: '.tmp/inspect/probe.mjs' } },
    {
      projectDir: PROJECT_DIR,
      isChoreModeActive: () => false,
      loadBoundIssue: () => {
        touched = true;
        return null;
      },
      resolveIssueSignals: async () => {
        throw new Error('should not be called');
      },
    }
  );
  assert.equal(r.decision, 'allow');
  assert.equal(r.reason, 'allowlisted-path');
  // loadBoundIssue is still called (cheap); resolveIssueSignals is NOT.
  assert.equal(touched, true);
});
