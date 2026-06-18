// @story #200
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  chmodSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { spawnSync } from 'node:child_process';
import { verifyIssueBody, REQUIRED_SECTIONS } from '../../../gh/lib/issue-body-verifier.mjs';

const repoRoot = new URL('../../../..', import.meta.url).pathname;
const createIssueScript = join(repoRoot, 'scripts/gh/create-issue.mjs');
const preflightScript = join(repoRoot, 'scripts/task-tracker/preflight-issue.mjs');

const CANONICAL_BODY = [
  '## Scope',
  '',
  'Some scope text.',
  '',
  '## Acceptance Criteria',
  '',
  '- [ ] Something works',
  '',
  '## Plan Metadata',
  '',
  '**Size:** S',
  '',
  '### Definition of Done',
  '',
  '#### Functional (verified at Test)',
  '',
  '- [ ] npm test passes',
  '',
  '#### Lifecycle (auto-ticked at Review/Close)',
  '',
  '- [ ] Story closed and moved to Done',
  '',
  '## Pickup Directive — MANDATORY, DO NOT SKIP',
  '> Follow: `.ai-task-manager/pickup-directive.md`',
  '',
].join('\n');

// ── pure verifier tests ────────────────────────────────────────────────────

test('verifyIssueBody: canonical body passes', () => {
  const res = verifyIssueBody(CANONICAL_BODY);
  assert.equal(res.ok, true, `unexpected missing: ${JSON.stringify(res.missing)}`);
  assert.deepEqual(res.missing, []);
});

test('verifyIssueBody: missing Scope', () => {
  const body = CANONICAL_BODY.replace('## Scope', '## Other');
  const res = verifyIssueBody(body);
  assert.equal(res.ok, false);
  assert.ok(res.missing.includes('## Scope (or ## Problem)'));
});

test('verifyIssueBody: ## Problem accepted in place of ## Scope', () => {
  const body = CANONICAL_BODY.replace('## Scope', '## Problem');
  const res = verifyIssueBody(body);
  assert.equal(res.ok, true, `unexpected missing: ${JSON.stringify(res.missing)}`);
});

test('verifyIssueBody: DoD present but missing #### Functional subheader', () => {
  const body = CANONICAL_BODY.replace('#### Functional (verified at Test)', '#### Foo');
  const res = verifyIssueBody(body);
  assert.equal(res.ok, false);
  assert.ok(res.missing.some((m) => /Functional/.test(m)));
});

test('verifyIssueBody: DoD present but missing #### Lifecycle subheader', () => {
  const body = CANONICAL_BODY.replace('#### Lifecycle (auto-ticked at Review/Close)', '#### Bar');
  const res = verifyIssueBody(body);
  assert.equal(res.ok, false);
  assert.ok(res.missing.some((m) => /Lifecycle/.test(m)));
});

test('verifyIssueBody: missing Acceptance Criteria', () => {
  const body = CANONICAL_BODY.replace('## Acceptance Criteria', '## Acceptances');
  const res = verifyIssueBody(body);
  assert.equal(res.ok, false);
  assert.ok(res.missing.includes('## Acceptance Criteria'));
});

test('verifyIssueBody: missing Definition of Done', () => {
  const body = CANONICAL_BODY.replace('### Definition of Done', '### DoD');
  const res = verifyIssueBody(body);
  assert.equal(res.ok, false);
  assert.ok(res.missing.includes('### Definition of Done'));
});

test('verifyIssueBody: missing Pickup Directive heading', () => {
  const body = CANONICAL_BODY.replace(
    '## Pickup Directive — MANDATORY, DO NOT SKIP',
    '## Pickup Stuff'
  );
  const res = verifyIssueBody(body);
  assert.equal(res.ok, false);
  assert.ok(res.missing.includes('## Pickup Directive — MANDATORY, DO NOT SKIP'));
});

test('verifyIssueBody: malformed Pickup Directive (heading present, Follow line missing)', () => {
  const body = CANONICAL_BODY.replace(
    '> Follow: `.ai-task-manager/pickup-directive.md`',
    '> See the pickup directive file.'
  );
  const res = verifyIssueBody(body);
  assert.equal(res.ok, false);
  assert.ok(
    res.missing.some((m) => /malformed|Follow/i.test(m)),
    `expected Follow-line warning, got: ${JSON.stringify(res.missing)}`
  );
});

test('verifyIssueBody: empty body lists every required section', () => {
  const res = verifyIssueBody('');
  assert.equal(res.ok, false);
  for (const sec of REQUIRED_SECTIONS) assert.ok(res.missing.includes(sec));
});

test('verifyIssueBody: tolerates lifecycle marker blocks between sections', () => {
  const body =
    '<!-- aitm-last-known-state: develop -->\n' +
    '<!-- aitm-last-known-state-ts: 2026-05-21T00:00:00Z -->\n' +
    CANONICAL_BODY +
    '\n<!-- aitm-fields: {"schema":1,"values":{}} -->\n';
  const res = verifyIssueBody(body);
  assert.equal(res.ok, true, `missing: ${JSON.stringify(res.missing)}`);
});

// ── round-trip: preflight fragment path output passes verifier ─────────────

test('round-trip: preflight --shape sub-issue output passes verifyIssueBody', () => {
  const tmp = mkdtempSync(join(projectScratchDir('test'), 'aitm-rt-'));
  const scopeFile = join(tmp, 'scope.md');
  const acFile = join(tmp, 'ac.md');
  const pmFile = join(tmp, 'pm.md');
  writeFileSync(scopeFile, 'Scope text here.\n');
  writeFileSync(acFile, '- [ ] Something works\n');
  writeFileSync(
    pmFile,
    '**Size:** S\n**Estimate:** 2h\n**Priority:** P1\n**Rank:** 1\n**Parent:** #1\n'
  );

  const res = spawnSync(
    'node',
    [
      preflightScript,
      '--shape',
      'sub-issue',
      '--scope-file',
      scopeFile,
      '--ac-file',
      acFile,
      '--plan-metadata-file',
      pmFile,
      '--parent',
      '1',
    ],
    { encoding: 'utf8' }
  );
  assert.equal(res.status, 0, `preflight failed: ${res.stderr}`);
  const verdict = verifyIssueBody(res.stdout);
  assert.equal(
    verdict.ok,
    true,
    `fragment output should pass verifier, missing: ${JSON.stringify(verdict.missing)}\nbody:\n${res.stdout}`
  );
});

// ── CLI integration: create-issue.mjs --body-file refuses bad bodies ───────

function ghStubScript() {
  return `
if [[ "$1 $2" == "issue create" ]]; then
  echo "https://github.com/kburson/ai-task-manager/issues/9999"
  exit 0
fi
if [[ "$1" == "api" && "$3" == "PATCH" ]]; then
  cat >/dev/null
  echo '{}'
  exit 0
fi
echo "unexpected gh call: $*" >&2
exit 1
`;
}

function setupSandbox() {
  const temp = mkdtempSync(join(projectScratchDir('test'), 'aitm-vci-'));
  const binDir = join(temp, 'bin');
  mkdirSync(binDir, { recursive: true });
  mkdirSync(join(temp, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    join(temp, '.ai-task-manager/task-tracker.json'),
    JSON.stringify({ repo: 'kburson/ai-task-manager', projectId: 'PVT_TEST', assignee: '@me' })
  );
  const ghCallsLog = join(temp, 'gh-calls.log');
  const tetherLog = join(temp, 'tether-calls.log');
  const ghMock = join(binDir, 'gh');
  writeFileSync(
    ghMock,
    `#!/bin/bash
set -euo pipefail
echo "$@" >> "${ghCallsLog}"
${ghStubScript()}
`
  );
  chmodSync(ghMock, 0o755);
  const tetherStub = join(temp, 'tether-stub.mjs');
  writeFileSync(
    tetherStub,
    `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(tetherLog)}, process.argv.slice(2).join(' ') + '\\n');
process.exit(0);
`
  );
  chmodSync(tetherStub, 0o755);
  return { temp, binDir, ghCallsLog, tetherLog, tetherStub };
}

function readLines(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
}

test('create-issue --body-file: refuses non-canonical body with exit 4', () => {
  const ctx = setupSandbox();
  const bodyFile = join(ctx.temp, 'body.md');
  writeFileSync(bodyFile, '## Scope\njust a scope, missing the rest\n');

  const result = spawnSync(
    'node',
    [createIssueScript, '--title', 'test', '--body-file', bodyFile],
    {
      encoding: 'utf8',
      cwd: ctx.temp,
      env: {
        ...process.env,
        PATH: `${ctx.binDir}:${process.env.PATH}`,
        CREATE_ISSUE_TETHER_SCRIPT: ctx.tetherStub,
        // Ensure env-gate is NOT set
        AITM_CREATE_ISSUE_INTERNAL: '',
      },
    }
  );

  assert.equal(result.status, 4, `expected exit 4, got ${result.status}\n${result.stderr}`);
  assert.match(result.stderr, /canonical issue-body verifier/);
  assert.match(result.stderr, /Acceptance Criteria/);
  assert.equal(readLines(ctx.ghCallsLog).length, 0, 'gh must NOT be called when verifier refuses');
});

test('create-issue --body-file --internal + env: bypasses verifier', () => {
  const ctx = setupSandbox();
  const bodyFile = join(ctx.temp, 'body.md');
  writeFileSync(bodyFile, '## Scope\nminimal\n');

  const result = spawnSync(
    'node',
    [createIssueScript, '--title', 'test', '--body-file', bodyFile, '--internal'],
    {
      encoding: 'utf8',
      cwd: ctx.temp,
      env: {
        ...process.env,
        PATH: `${ctx.binDir}:${process.env.PATH}`,
        CREATE_ISSUE_TETHER_SCRIPT: ctx.tetherStub,
        AITM_CREATE_ISSUE_INTERNAL: '1',
      },
    }
  );

  assert.equal(result.status, 0, `expected exit 0, got ${result.status}\n${result.stderr}`);
  assert.match(result.stdout, /issues\/9999/);
});

test('create-issue --body-file --internal without env: still refused', () => {
  const ctx = setupSandbox();
  const bodyFile = join(ctx.temp, 'body.md');
  writeFileSync(bodyFile, '## Scope\nminimal\n');

  const result = spawnSync(
    'node',
    [createIssueScript, '--title', 'test', '--body-file', bodyFile, '--internal'],
    {
      encoding: 'utf8',
      cwd: ctx.temp,
      env: {
        ...process.env,
        PATH: `${ctx.binDir}:${process.env.PATH}`,
        CREATE_ISSUE_TETHER_SCRIPT: ctx.tetherStub,
        AITM_CREATE_ISSUE_INTERNAL: '',
      },
    }
  );

  assert.equal(result.status, 4, `expected exit 4 (env gate not set), got ${result.status}`);
});

test('create-issue --body-file: canonical body passes verifier and creates issue', () => {
  const ctx = setupSandbox();
  const bodyFile = join(ctx.temp, 'body.md');
  writeFileSync(bodyFile, CANONICAL_BODY);

  const result = spawnSync(
    'node',
    [createIssueScript, '--title', 'test', '--body-file', bodyFile],
    {
      encoding: 'utf8',
      cwd: ctx.temp,
      env: {
        ...process.env,
        PATH: `${ctx.binDir}:${process.env.PATH}`,
        CREATE_ISSUE_TETHER_SCRIPT: ctx.tetherStub,
        AITM_CREATE_ISSUE_INTERNAL: '',
      },
    }
  );

  assert.equal(result.status, 0, `expected exit 0, got ${result.status}\n${result.stderr}`);
  assert.match(result.stdout, /issues\/9999/);
});
