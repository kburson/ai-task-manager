// @chore
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const WORKFLOW = '.github/workflows/graduate-frozen-test-retirements.yml';

function workflowText() {
  assert.equal(existsSync(path.join(PROJECT_ROOT, WORKFLOW)), true, `${WORKFLOW} must exist`);
  return readFileSync(path.join(PROJECT_ROOT, WORKFLOW), 'utf8');
}

test('weekly retirement graduation has bounded triggers and permissions', () => {
  const text = workflowText();
  assert.match(text, /schedule:/);
  assert.match(text, /cron: ['"]\d+ \d+ \* \* \d['"]/);
  assert.match(text, /workflow_dispatch:/);
  assert.match(text, /permissions:\n {2}contents: write\n {2}pull-requests: write/);
  assert.doesNotMatch(text, /issues: write|actions: write|checks: write/);
});

test('workflow checks out complete trunk history and installs Node 22 dependencies', () => {
  const text = workflowText();
  assert.match(text, /uses: actions\/checkout@v4/);
  assert.match(text, /ref: trunk/);
  assert.match(text, /fetch-depth: 0/);
  assert.match(text, /node-version: 22/);
  assert.match(text, /run: npm ci/);
});

test('workflow checks before applying and exits before branch creation on an empty batch', () => {
  const text = workflowText();
  const check = text.indexOf('graduate:frozen-tests -- --check --json');
  const noWork = text.indexOf('eligibleCount === 0');
  const branch = text.indexOf('git switch -C automation/graduate-frozen-test-retirements');
  const apply = text.indexOf('graduate:frozen-tests -- --apply --json');
  assert.ok(check >= 0);
  assert.ok(noWork > check);
  assert.ok(branch > noWork);
  assert.ok(apply > branch);
  assert.match(text, /has_work=false/);
  assert.match(text, /if: steps\.check\.outputs\.has_work == 'true'/);
  assert.match(text, /npm run --silent graduate:frozen-tests -- --check --json/);
  assert.match(text, /npm run --silent graduate:frozen-tests -- --apply --json/);
});

test('workflow runs focused guards and the normal quality gate before publishing', () => {
  const text = workflowText();
  for (const required of [
    'frozen-test-retirements.test.mjs',
    'test-corpus-membership.test.mjs',
    'package-test-corpus.test.mjs',
    'test-tree-layout.test.mjs',
    'graduate-frozen-test-retirements.test.mjs',
    'graduate-frozen-test-retirements-workflow.test.mjs',
    'test-impact-selector.test.mjs',
    'npm run quality',
  ]) {
    assert.match(text, new RegExp(required.replaceAll('.', '\\.')));
  }
  assert.ok(text.indexOf('npm run quality') < text.indexOf('git commit'));
});

test('workflow owns one fixed branch and creates or edits one unmerged pull request', () => {
  const text = workflowText();
  assert.match(text, /automation\/graduate-frozen-test-retirements/g);
  assert.match(text, /git ls-remote --heads origin/);
  assert.match(
    text,
    /--force-with-lease=refs\/heads\/automation\/graduate-frozen-test-retirements:/
  );
  assert.match(text, /gh pr create/);
  assert.match(text, /gh pr edit/);
  assert.match(text, /--base trunk/);
  assert.match(text, /--head automation\/graduate-frozen-test-retirements/);
  assert.equal((text.match(/GH_TOKEN:/g) || []).length, 1);
  assert.doesNotMatch(text, /git push origin trunk|gh pr merge|--auto(?:-merge)?/);
});

test('pull request body is generated from the eligibility report with exact audit fields', () => {
  const text = workflowText();
  assert.match(text, /frozen-retirements-check\.json/);
  for (const field of [
    'receiptFile',
    'testPath',
    'lastLiveSha256',
    'evidenceFile',
    'deliveryCommit',
  ]) {
    assert.match(text, new RegExp(field));
  }
  assert.match(text, /Verification commands/);
});
