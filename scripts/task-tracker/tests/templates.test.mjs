#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dir, '../../..');
const body = readFileSync(path.join(root, 'templates', 'definition-of-done.md'), 'utf8');
const taskIssueForm = readFileSync(path.join(root, '.github', 'ISSUE_TEMPLATE', 'task.yml'), 'utf8');
const bugIssueForm = readFileSync(path.join(root, '.github', 'ISSUE_TEMPLATE', 'bug.yml'), 'utf8');
const preflightBlock = execFileSync(
  'node',
  [path.join(root, 'scripts', 'task-tracker', 'preflight-issue.mjs')],
  { cwd: root, encoding: 'utf8' }
);

for (const line of [
  '- [ ] Acceptance criteria met (including test additions from deep dive)',
  '- [ ] Tests pass; new coverage committed',
  '- [ ] Pre-commit hooks pass',
  '- [ ] Issue body checkboxes ticked',
]) {
  assert.ok(body.includes(line), `template includes ${line}`);
}

assert.ok(!body.includes('Issue moved to Done'), 'template does not include close-action Done checkbox');
assert.ok(!body.includes('/task close` run'), 'template does not include close-action task close checkbox');
assert.ok(!body.includes('close parent if all siblings Done'), 'template does not include automatic parent close checkbox');

for (const form of [taskIssueForm, bugIssueForm]) {
  assert.ok(form.includes('id: acceptance-criteria'), 'manual issue form includes acceptance criteria');
  assert.ok(form.includes('label: Estimate'), 'manual issue form exposes Estimate section for DB healing');
  assert.ok(form.includes('label: Sequence'), 'manual issue form exposes Sequence section for DB healing');
  assert.ok(!form.includes('Engaged Time'), 'manual issue form does not ask for task-event managed Engaged Time');
  assert.ok(!form.includes('Session Time'), 'manual issue form does not ask for task-event managed Session Time');
  assert.ok(!form.includes('Context Length'), 'manual issue form does not ask for task-event managed Context Length');
  assert.ok(!form.includes('ai-task-manager:fields:start'), 'manual issue form leaves hidden field DB to AITM healer');
}

const dodIdx = preflightBlock.indexOf('### Definition of Done');
const pickupIdx = preflightBlock.indexOf('## Pickup Directive');
assert.ok(dodIdx !== -1, 'preflight block includes Definition of Done');
assert.ok(pickupIdx !== -1, 'preflight block includes Pickup Directive after DoD');
assert.ok(dodIdx < pickupIdx, 'Definition of Done appears before Pickup Directive');
assert.ok(preflightBlock.includes('- [ ] Deep dive complete'), 'preflight block includes deep dive checkbox');

console.log('templates.test.mjs: all passed');
