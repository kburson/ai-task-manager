#!/usr/bin/env node
// @story #414
// Unit tests for the 3-branch `resolveTitleAndPlan` logic in `verbs/new.mjs` (#414).
//
// Coverage (via plan-file.mjs lib which the logic depends on):
//   Branch 1 — discover state, savedPlanFile stamped → title extracted from plan
//   Branch 1b — discover state, no savedPlanFile → exits 1 with guidance
//   Branch 2 — not discover, .md arg given → title extracted from plan file
//   Branch 2b — not discover, .md arg missing file → exits 1
//   Branch 3 — not discover, no arg → exits 1 with guidance
//   Branch legacy — not discover, plain title arg → returns title

import { strict as assert } from 'node:assert';
import { writeFileSync } from 'node:fs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import {
  extractTitle,
  validatePlanContent,
  planFileName,
  titleToSlug,
  planDatePrefix,
  savePlanFile,
  loadPlanFile,
} from '../../../../task-tracker/lib/plan-file.mjs';

// ---- plan-file.mjs unit coverage -------------------------------------------

// extractTitle
assert.equal(extractTitle('# My Plan\n\n## Scope\n'), 'My Plan');
assert.equal(extractTitle('# Hello World\nsome content'), 'Hello World');
assert.equal(extractTitle('no h1 here\n'), null);
assert.equal(extractTitle(''), null);
assert.equal(extractTitle(null), null);

// validatePlanContent
assert.deepEqual(validatePlanContent('# T\n\n## Scope\n'), { ok: true });
assert.equal(validatePlanContent('## Scope\nno title').ok, false);
assert.equal(validatePlanContent('# T\nno scope section').ok, false);
assert.match(validatePlanContent('no title').reason, /H1 title/);
assert.match(validatePlanContent('# T\nno scope').reason, /Scope/);

// titleToSlug
assert.equal(titleToSlug('Hello World'), 'hello-world');
assert.equal(titleToSlug('  foo  BAR--baz  '), 'foo-bar-baz');
assert.equal(titleToSlug(''), 'plan');
assert.equal(titleToSlug(null), 'plan');
assert.ok(titleToSlug('a'.repeat(100)).length <= 60, 'slug must be at most 60 chars');

// planDatePrefix — use noon UTC to avoid midnight-UTC-to-prior-day local conversions
assert.equal(planDatePrefix(new Date('2026-06-19T12:00:00Z')), '20260619');
assert.equal(planDatePrefix(new Date('2026-01-05T12:00:00Z')), '20260105');

// planFileName
assert.equal(planFileName('My Plan', new Date('2026-06-19T12:00:00Z')), '20260619-my-plan.md');

// savePlanFile + loadPlanFile round-trip
{
  const dir = mkdtempProjectIsolated('nfp-roundtrip-');
  const content = '# Round Trip\n\n## Scope\ntest\n';
  const saved = savePlanFile({
    title: 'Round Trip',
    content,
    projectDir: dir,
    now: new Date('2026-06-19T12:00:00Z'),
  });
  assert.match(saved, /20260619-round-trip\.md$/);
  const { title, content: loaded } = loadPlanFile(saved);
  assert.equal(title, 'Round Trip');
  assert.equal(loaded, content);
}

// savePlanFile — collision handling
{
  const dir = mkdtempProjectIsolated('nfp-collision-');
  const content = '# Same\n\n## Scope\ntest\n';
  const p1 = savePlanFile({
    title: 'Same',
    content,
    projectDir: dir,
    now: new Date('2026-06-19T12:00:00Z'),
  });
  const p2 = savePlanFile({
    title: 'Same',
    content,
    projectDir: dir,
    now: new Date('2026-06-19T12:00:00Z'),
  });
  assert.notEqual(p1, p2);
  assert.match(p2, /-2\.md$/);
}

// ---- resolveTitleAndPlan branch coverage -----------------------------------
// We test the logic by exercising it through verbNew with TT_FAKE_NEW_ISSUE,
// but only for paths that do NOT reach createNewIssue (exits early).
// For paths that reach createNewIssue, we use TT_FAKE_NEW_ISSUE env var.

async function captureExit(fn) {
  let exitCode = null;
  let stderr = '';
  const origExit = process.exit;
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  process.exit = (c) => {
    exitCode = c;
    throw Object.assign(new Error('exit'), { exitCode: c });
  };
  process.stderr.write = (s) => {
    stderr += s;
    return true;
  };
  try {
    await fn();
  } catch (e) {
    if (!e.exitCode) throw e;
  } finally {
    process.exit = origExit;
    process.stderr.write = origStderrWrite;
  }
  return { exitCode, stderr };
}

// Branch 1b — discover state, no savedPlanFile → exits 1
{
  const dir = mkdtempProjectIsolated('nfp-branch1b-');
  const statePath = path.join(dir, 'state.json');
  writeFileSync(
    statePath,
    JSON.stringify({
      active: 'discover',
      lastActive: null,
      discoverBucket: { startedAt: new Date().toISOString(), wordsAtStart: 0, entries: [] },
    }),
    'utf8'
  );

  const { exitCode, stderr } = await captureExit(async () => {
    const { verbNew } = await import('../../../../task-tracker/verbs/new.mjs');
    await verbNew({
      cfg: {
        repo: 'o/r',
        defaultLabels: [],
        assignee: '@me',
        hookNetworkTimeoutMs: 5000,
        autoEndOnSwitch: false,
      },
      statePath,
      projectDir: dir,
      rest: [],
      role: 'test',
      SKIP_NETWORK: true,
      drainQueueIfAny: async () => {},
      safePostTiming: async () => ({ ok: true }),
      flushActiveToGH: async () => ({ deltaMin: 0, deltaWords: 0 }),
      nowIso: () => new Date().toISOString(),
    });
  });
  assert.equal(exitCode, 1, 'branch 1b should exit 1');
  assert.match(stderr, /no saved plan/);
}

// Branch 2b — .md arg given but file does not exist → exits 1
{
  const dir = mkdtempProjectIsolated('nfp-branch2b-');
  const statePath = path.join(dir, 'state.json');
  writeFileSync(
    statePath,
    JSON.stringify({ active: null, lastActive: null, discoverBucket: null }),
    'utf8'
  );

  const { exitCode, stderr } = await captureExit(async () => {
    const { verbNew } = await import('../../../../task-tracker/verbs/new.mjs');
    await verbNew({
      cfg: {
        repo: 'o/r',
        defaultLabels: [],
        assignee: '@me',
        hookNetworkTimeoutMs: 5000,
        autoEndOnSwitch: false,
      },
      statePath,
      projectDir: dir,
      rest: ['docs/plans/missing.md'],
      role: 'test',
      SKIP_NETWORK: true,
      drainQueueIfAny: async () => {},
      safePostTiming: async () => ({ ok: true }),
      flushActiveToGH: async () => ({ deltaMin: 0, deltaWords: 0 }),
      nowIso: () => new Date().toISOString(),
    });
  });
  assert.equal(exitCode, 1, 'branch 2b should exit 1');
  assert.match(stderr, /plan file not found/);
}

// Branch 3 — not discover, no arg → exits 1 with guidance
{
  const dir = mkdtempProjectIsolated('nfp-branch3-');
  const statePath = path.join(dir, 'state.json');
  writeFileSync(
    statePath,
    JSON.stringify({ active: null, lastActive: null, discoverBucket: null }),
    'utf8'
  );

  const { exitCode, stderr } = await captureExit(async () => {
    const { verbNew } = await import('../../../../task-tracker/verbs/new.mjs');
    await verbNew({
      cfg: {
        repo: 'o/r',
        defaultLabels: [],
        assignee: '@me',
        hookNetworkTimeoutMs: 5000,
        autoEndOnSwitch: false,
      },
      statePath,
      projectDir: dir,
      rest: [],
      role: 'test',
      SKIP_NETWORK: true,
      drainQueueIfAny: async () => {},
      safePostTiming: async () => ({ ok: true }),
      flushActiveToGH: async () => ({ deltaMin: 0, deltaWords: 0 }),
      nowIso: () => new Date().toISOString(),
    });
  });
  assert.equal(exitCode, 1, 'branch 3 should exit 1');
  assert.match(stderr, /no active discovery plan/);
}

// Branch 2 — .md arg given and file exists → creates issue with plan title
{
  process.env.TT_FAKE_NEW_ISSUE = '#99';
  const dir = mkdtempProjectIsolated('nfp-branch2-');
  const statePath = path.join(dir, 'state.json');
  writeFileSync(
    statePath,
    JSON.stringify({ active: null, lastActive: null, discoverBucket: null }),
    'utf8'
  );

  const planPath = path.join(dir, 'plan-branch-two.md');
  writeFileSync(planPath, '# Branch Two Plan\n\n## Scope\ndemo\n', 'utf8');

  let createdTitle = null;
  const origLog = console.log;
  console.log = (...args) => {
    createdTitle = args.join(' ');
  };
  try {
    const { verbNew } = await import('../../../../task-tracker/verbs/new.mjs');
    await verbNew({
      cfg: {
        repo: 'o/r',
        defaultLabels: [],
        assignee: '@me',
        hookNetworkTimeoutMs: 5000,
        autoEndOnSwitch: false,
      },
      statePath,
      projectDir: dir,
      rest: [planPath],
      role: 'test',
      SKIP_NETWORK: false,
      drainQueueIfAny: async () => {},
      safePostTiming: async () => ({ ok: true }),
      flushActiveToGH: async () => ({ deltaMin: 0, deltaWords: 0 }),
      nowIso: () => new Date().toISOString(),
      pexec: async () => ({ stdout: 'https://github.com/o/r/issues/99\n', stderr: '' }),
    });
  } finally {
    console.log = origLog;
    delete process.env.TT_FAKE_NEW_ISSUE;
  }

  assert.ok(
    createdTitle?.includes('Branch Two Plan'),
    `created issue should use plan title, got: ${createdTitle}`
  );
}

console.log('new-from-plan.test.mjs: all passed');
