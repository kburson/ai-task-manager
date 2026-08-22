#!/usr/bin/env node
// @story #1096

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  applyShapeDefaults,
  buildIssueTitle,
  buildShapeFlags,
} from '../../../../gh/create-issue.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { BUG_TEMPLATE } from '../../../../task-tracker/lib/config-init/issue-templates.mjs';
import {
  normalizeWebDefectIssue,
  parseIssueFormSections,
} from '../../../../task-tracker/lib/defect-web-intake.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const scratch = path.join(projectScratchDir('test'), 'defect-shape-1096');
mkdirSync(scratch, { recursive: true });

function fragment(name, body) {
  const target = path.join(scratch, name);
  writeFileSync(target, body);
  return target;
}

function defectArgs(overrides = {}) {
  return {
    shape: 'defect',
    title: 'resume invents idle time',
    label: [],
    'user-story-file': fragment(
      'user-story.md',
      'As an AITM operator\nI want active work to remain active\nSo that timing records stay truthful'
    ),
    'scope-file': fragment('scope.md', 'Resume classifies active issue work as idle.'),
    'ac-file': fragment(
      'acs.md',
      '- [ ] Active work is never synthesized as idle. <!-- aitm-non-demonstrable -->'
    ),
    'story-origin-file': fragment(
      'story-origin.md',
      '- kind: code\n- discovered-during: local-work'
    ),
    ...overrides,
  };
}

test('defect shape applies bug taxonomy exactly once and leaves legacy shapes unchanged', () => {
  const defect = applyShapeDefaults(defectArgs({ label: ['triage', 'bug'] }));
  assert.deepEqual(defect.label, ['triage', 'bug']);
  assert.equal(buildIssueTitle(defect), '🐞 [BUG] resume invents idle time');

  const solo = applyShapeDefaults({ shape: 'solo', title: 'ordinary work', label: [] });
  assert.deepEqual(solo.label, []);
  assert.equal(buildIssueTitle(solo), 'ordinary work');
});

test('defect shape forwards the governed solo inputs plus defect-specific renderer inputs', () => {
  const args = defectArgs({
    'reproduction-file': '/repo/repro.md',
    'root-cause-file': '/repo/cause.md',
    'fix-direction-file': '/repo/fix.md',
    'out-of-scope-file': '/repo/out.md',
  });
  const flags = buildShapeFlags(args);
  assert.deepEqual(flags.slice(0, 2), ['--shape', 'defect']);
  for (const [flag, value] of [
    ['--title', args.title],
    ['--user-story-file', args['user-story-file']],
    ['--scope-file', args['scope-file']],
    ['--ac-file', args['ac-file']],
    ['--story-origin-file', args['story-origin-file']],
    ['--reproduction-file', '/repo/repro.md'],
    ['--root-cause-file', '/repo/cause.md'],
    ['--fix-direction-file', '/repo/fix.md'],
    ['--out-of-scope-file', '/repo/out.md'],
  ]) {
    const index = flags.indexOf(flag);
    assert.ok(index >= 0, `${flag} must be forwarded`);
    assert.equal(flags[index + 1], value);
  }
});

test('defect dry-run renders a real User Story, diagnostic sections, and governed lifecycle tail', () => {
  const args = defectArgs();
  const rendered = execFileSync(
    process.execPath,
    [
      'scripts/gh/create-issue.mjs',
      '--shape',
      'defect',
      '--title',
      args.title,
      '--user-story-file',
      args['user-story-file'],
      '--scope-file',
      args['scope-file'],
      '--ac-file',
      args['ac-file'],
      '--story-origin-file',
      args['story-origin-file'],
      '--dry-run',
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );

  assert.match(rendered, /## User Story\n\nAs an AITM operator/);
  assert.match(rendered, /I want active work to remain active/);
  assert.doesNotMatch(rendered, /\[who wants|\[what they want|TBD/);
  for (const heading of [
    '## Scope',
    '## Reproduction',
    '## Root Cause',
    '## Fix Direction',
    '## Out of Scope',
    '## Story Origin',
    '## Plan Metadata',
    '## Pickup Directive — MANDATORY, DO NOT SKIP',
    '## Acceptance Criteria',
    '## Verification Commands',
    '## Definition of Done',
  ]) {
    assert.ok(rendered.includes(heading), `missing ${heading}`);
  }
  assert.match(rendered, /aitm-body-version version="1"/);
});

test('creator and preflight public help advertise the defect shape', () => {
  for (const script of [
    'scripts/gh/create-issue.mjs',
    'scripts/task-tracker/preflight-issue.mjs',
  ]) {
    const help = execFileSync(process.execPath, [script, '--help'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.match(help, /--shape[^\n]*defect/, script);
    for (const flag of [
      '--reproduction-file',
      '--root-cause-file',
      '--fix-direction-file',
      '--out-of-scope-file',
    ]) {
      assert.match(help, new RegExp(flag), `${script}: ${flag}`);
    }
  }
});

test('generated bug form and label workflow use the canonical prefix authority', () => {
  assert.match(BUG_TEMPLATE, /title: "🐞 \[BUG\] "/);
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/label-beta-report.yml'), 'utf8');
  assert.match(workflow, /reconcileIssueTitle/);
  assert.match(workflow, /effectiveLabels/);
  assert.doesNotMatch(workflow, /wantEmoji/);
});

test('label workflow normalizes internal bug forms through the defect intake adapter', () => {
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/label-beta-report.yml'), 'utf8');
  assert.match(workflow, /normalizeWebDefectIssue/);
  assert.match(workflow, /normalized\.status === 'normalized'/);
  assert.match(workflow, /changes\.body = normalized\.body/);
});

const WEB_FORM_BODY = `### What happened?

Resume classifies active issue work as idle.

### Steps to reproduce

1. Leave an active timing span open.
2. Resume after eight hours.

### Acceptance Criteria

- [ ] Active work remains active.

### Priority

P1 - High / this sprint

### Size

S - 3-4 hours

### Estimate

4

### Rank

2`;

test('web form parser returns normalized named sections', () => {
  const sections = parseIssueFormSections(WEB_FORM_BODY);
  assert.equal(sections.get('what happened?'), 'Resume classifies active issue work as idle.');
  assert.match(sections.get('steps to reproduce'), /Leave an active timing span open/);
  assert.equal(sections.get('priority'), 'P1 - High / this sprint');
});

test('web defect normalization maps form fields through the same renderer and stamps Backlog', async () => {
  let captured;
  const result = await normalizeWebDefectIssue({
    issue: {
      title: '🐞 [BUG] resume invents idle time',
      body: WEB_FORM_BODY,
      labels: [{ name: 'bug' }],
      created_at: '2026-08-04T12:00:00Z',
    },
    projectDir: ROOT,
    renderDefect: async (input) => {
      captured = input;
      return '## User Story\n\ncanonical\n\n## Definition of Done\n\nbody\n\n<!-- aitm-body-version version="1" -->\n';
    },
  });

  assert.equal(result.status, 'normalized');
  assert.equal(captured.title, 'resume invents idle time');
  assert.match(captured.userStory, /As an AITM operator affected by a confirmed defect/);
  assert.equal(captured.scope, 'Resume classifies active issue work as idle.');
  assert.match(captured.reproduction, /Leave an active timing span open/);
  assert.equal(
    captured.acceptanceCriteria,
    '- [ ] Active work remains active. <!-- aitm-non-demonstrable -->'
  );
  assert.equal(captured.priority, 'P1');
  assert.equal(captured.size, 'S');
  assert.equal(captured.estimate, '4');
  assert.equal(captured.rank, '2');
  assert.match(result.body, /aitm-entered-backlog ts="2026-08-04T12:00:00Z"/);
  assert.ok(Object.isFrozen(result));
});

test('web defect normalization default path renders the canonical defect body', async () => {
  const result = await normalizeWebDefectIssue({
    issue: {
      title: '🐞 [BUG] resume invents idle time',
      body: WEB_FORM_BODY,
      labels: ['bug'],
      created_at: '2026-08-04T12:00:00Z',
    },
    projectDir: ROOT,
  });
  assert.equal(result.status, 'normalized');
  assert.match(result.body, /## Reproduction/);
  assert.match(result.body, /## Definition of Done/);
  assert.match(result.body, /aitm-body-version version="1"/);
});

test('web normalization is a fixed point and excludes non-bug and beta-report issues', async () => {
  const canonical = `${WEB_FORM_BODY}\n\n## User Story\n\ncanonical\n\n## Definition of Done\n\nbody\n<!-- aitm-body-version version="1" -->`;
  for (const issue of [
    { body: canonical, labels: ['bug'] },
    { body: WEB_FORM_BODY, labels: [] },
    { body: WEB_FORM_BODY, labels: ['beta-defect'] },
  ]) {
    const result = await normalizeWebDefectIssue({
      issue: { title: 'failure', created_at: '2026-08-04T12:00:00Z', ...issue },
      projectDir: ROOT,
      renderDefect: async () => assert.fail('renderer must not run for a skipped issue'),
    });
    assert.equal(result.status, 'skip');
  }
});

function repoText(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('shared creation rule maps conversational defect intent to the defect shape', () => {
  const rule = repoText('skill/shared/rules/create-issue.md');
  assert.match(rule, /create,? generate,? or file/i);
  assert.match(rule, /defect or bug story/i);
  assert.match(rule, /--shape defect/);
});

test('full-auto local defects are created before the parent blocker protocol', () => {
  const rule = repoText('skill/shared/rules/block.md');
  const create = rule.indexOf('--shape defect');
  const block = rule.indexOf('npx aitm block');
  assert.ok(create >= 0, 'blocking rule must create through the defect shape');
  assert.ok(block > create, 'create must be documented before block');
  assert.match(rule, /full-auto/i);

  const report = repoText('skill/shared/rules/report-on-block.md');
  assert.match(report, /upstream external-product/i);
  assert.match(report, /local defect stor/i);
});

test('all sanctioned-shape instruction and guard surfaces include defect', () => {
  for (const file of [
    'AGENTS.md',
    'skill/shared/router.md',
    'skill/shared/rules/bind.md',
    'skill/shared/rules/plan-mode-backlog.md',
    'skill/adapters/codex/SKILL.md',
    'skill/adapters/claude/SKILL.md',
    'scripts/task-tracker/codex-superpowers.mjs',
    'scripts/task-tracker/bash-guard.mjs',
    'scripts/task-tracker/lib/gh-edit-guard.mjs',
  ]) {
    const text = repoText(file);
    assert.match(
      text,
      /shape[^\n]*(?:epic|stub)[^\n]*defect|shape[^\n]*defect[^\n]*(?:epic|stub)/i,
      file
    );
  }
});

test('workflow guide documents defect as a sanctioned local shape', () => {
  const guide = repoText('docs/guides/workflow.md');
  assert.match(guide, /--shape defect/);
  assert.match(guide, /GitHub web form/i);
  assert.match(guide, /\/task report[^\n]*upstream/i);
});

test.after(() => rmSync(scratch, { recursive: true, force: true }));
