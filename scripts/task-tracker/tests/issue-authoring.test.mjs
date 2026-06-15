// Parity test for issue authoring: every shape produced via
// `create-issue.mjs --shape … --dry-run` must contain the canonical headings
// in canonical order. Locks Codex/Claude to byte-equivalent structure.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../lib/scratch-dir.mjs';
import { spawnSync } from 'node:child_process';

const repoRoot = new URL('../../..', import.meta.url).pathname;
const script = join(repoRoot, 'scripts/gh/create-issue.mjs');
const PACKAGE_TEMPLATES = join(repoRoot, 'templates');

function fixtureDir() {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'aitm-authoring-'));
  mkdirSync(join(dir, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    join(dir, '.ai-task-manager/task-tracker.json'),
    JSON.stringify({ repo: 'kburson/ai-task-manager', assignee: '@me', projectId: 'PVT_X' })
  );
  copyFileSync(
    join(PACKAGE_TEMPLATES, 'pickup-directive.md'),
    join(dir, '.ai-task-manager/pickup-directive.md')
  );
  copyFileSync(
    join(PACKAGE_TEMPLATES, 'definition-of-done.md'),
    join(dir, '.ai-task-manager/definition-of-done.md')
  );
  writeFileSync(join(dir, 'scope.md'), 'A short scope paragraph.\n');
  writeFileSync(join(dir, 'acs.md'), '- [ ] First criterion\n- [ ] Second criterion\n');
  writeFileSync(
    join(dir, 'meta.md'),
    '**Size:** S\n**Estimate:** 2h\n**Priority:** P2\n**Sequence:** 1\n'
  );
  return dir;
}

function runDryRun(shape, extraArgs = [], cwd) {
  const args = [
    script,
    '--title',
    `parity ${shape}`,
    '--shape',
    shape,
    '--scope-file',
    join(cwd, 'scope.md'),
    '--ac-file',
    join(cwd, 'acs.md'),
    '--plan-metadata-file',
    join(cwd, 'meta.md'),
    '--dry-run',
    ...extraArgs,
  ];
  const res = spawnSync('node', args, { cwd, encoding: 'utf8' });
  assert.equal(res.status, 0, `dry-run failed for ${shape}: ${res.stderr}`);
  return res.stdout;
}

// Canonical heading order. Indices in stdout MUST be strictly increasing.
const CANONICAL_MARKERS = [
  /^## Scope\b/m,
  /^## Acceptance Criteria\b/m,
  /- \[ \]/m, // at least one unchecked checkbox in ACs
  /^## Plan Metadata\b/m,
  /^### Definition of Done\b/m,
  /^## Pickup Directive\b/m,
];

function assertCanonicalOrder(body, label) {
  let prev = -1;
  for (const re of CANONICAL_MARKERS) {
    const m = re.exec(body);
    assert.ok(m, `${label}: missing required marker ${re}`);
    assert.ok(m.index > prev, `${label}: marker ${re} out of order (index ${m.index} <= ${prev})`);
    prev = m.index;
  }
}

test('solo shape: canonical structure', () => {
  const dir = fixtureDir();
  const body = runDryRun('solo', [], dir);
  assertCanonicalOrder(body, 'solo');
  assert.doesNotMatch(body, /\*\*Parent epic:\*\*/);
});

test('sub-issue shape: canonical structure + parent line', () => {
  const dir = fixtureDir();
  const body = runDryRun('sub-issue', ['--parent', '42'], dir);
  assertCanonicalOrder(body, 'sub-issue');
  assert.match(body, /\*\*Parent epic:\*\* #42/);
});

test('epic shape: canonical structure', () => {
  const dir = fixtureDir();
  const body = runDryRun('epic', [], dir);
  assertCanonicalOrder(body, 'epic');
});

test('#272: --status flag is rejected on shape-based creation', () => {
  // The legacy `priority-required-at-refine` gate only fired when --status was
  // accepted. With --status removed (#272), the script must refuse the flag
  // outright with the deprecation message.
  const dir = fixtureDir();
  const res = spawnSync(
    'node',
    [
      script,
      '--title',
      'gate test',
      '--shape',
      'solo',
      '--scope-file',
      join(dir, 'scope.md'),
      '--ac-file',
      join(dir, 'acs.md'),
      '--plan-metadata-file',
      join(dir, 'meta.md'),
      '--status',
      'refine',
      '--dry-run',
    ],
    { cwd: dir, encoding: 'utf8' }
  );
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /--status is no longer accepted/);
});

test('stub shape: canonical structure without scope/ac/plan-metadata files', () => {
  // #426 — the stub shape is the lightweight idea-capture path: only a title
  // (and an optional --idea-file) are supplied. It must NOT require the three
  // section files, yet must still render the canonical heading skeleton plus
  // the DoD / Pickup / Verification-Commands tail so it can be refined later.
  const dir = fixtureDir();
  const args = [script, '--title', 'parity stub', '--shape', 'stub', '--dry-run'];
  const res = spawnSync('node', args, { cwd: dir, encoding: 'utf8' });
  assert.equal(res.status, 0, `dry-run failed for stub: ${res.stderr}`);
  const body = res.stdout;
  assertCanonicalOrder(body, 'stub');
  assert.match(body, /^## Verification Commands\s*$/m);
  assert.doesNotMatch(body, /\*\*Parent epic:\*\*/);
  // Placeholders the Refine stage fills in.
  assert.match(body, /Stub — describe the work at Refine\./);
  assert.match(body, /TBD — define acceptance criteria at Refine\./);
  assert.match(body, /TBD — set Size, Estimate, Priority, and Sequence at Refine\./);
});

test('stub shape: --idea-file seeds the Scope section', () => {
  const dir = fixtureDir();
  writeFileSync(join(dir, 'idea.md'), 'A one-line idea seed for the stub.\n');
  const args = [
    script,
    '--title',
    'parity stub idea',
    '--shape',
    'stub',
    '--idea-file',
    join(dir, 'idea.md'),
    '--dry-run',
  ];
  const res = spawnSync('node', args, { cwd: dir, encoding: 'utf8' });
  assert.equal(res.status, 0, `dry-run failed for stub idea: ${res.stderr}`);
  assert.match(res.stdout, /A one-line idea seed for the stub\./);
  assert.doesNotMatch(res.stdout, /Stub — describe the work at Refine\./);
});

test('sub-issue shape requires --parent', () => {
  const dir = fixtureDir();
  const res = spawnSync(
    'node',
    [
      script,
      '--title',
      'no parent',
      '--shape',
      'sub-issue',
      '--scope-file',
      join(dir, 'scope.md'),
      '--ac-file',
      join(dir, 'acs.md'),
      '--plan-metadata-file',
      join(dir, 'meta.md'),
      '--dry-run',
    ],
    { cwd: dir, encoding: 'utf8' }
  );
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /--parent <N> required/);
});
