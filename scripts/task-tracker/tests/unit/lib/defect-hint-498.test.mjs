#!/usr/bin/env node
// @story #498
// Proof for the proactive defect-report loop: the `aitm-defect-hint:` trailer
// grammar (formatDefectHint/appendDefectHint), its emission on the gh-edit-guard
// `--body` refusal, and its presence on a named error class (MarkerLossError).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatDefectHint, appendDefectHint } from '../../../lib/defect-hint.mjs';
import { evaluateGhEdit } from '../../../lib/gh-edit-guard.mjs';
import { MarkerLossError } from '../../../lib/issue-body-mutate.mjs';
import { SeederMarkerMissingError } from '../../../lib/seed-kanban-cache.mjs';

describe('#498 formatDefectHint', () => {
  it('formats `aitm-defect-hint: <verb> <reason>`', () => {
    assert.equal(
      formatDefectHint('task promote', 'gate refused'),
      'aitm-defect-hint: task promote gate refused'
    );
  });

  it('collapses a multi-line reason to one line', () => {
    const out = formatDefectHint('verb', 'line one\n  line two\t\ttabbed');
    assert.equal(out, 'aitm-defect-hint: verb line one line two tabbed');
    assert.ok(!out.includes('\n'));
  });

  it('returns empty string when verb is empty or blank', () => {
    assert.equal(formatDefectHint('', 'reason'), '');
    assert.equal(formatDefectHint('   ', 'reason'), '');
    assert.equal(formatDefectHint(null, 'reason'), '');
  });

  it('omits the reason when blank, keeping just the verb', () => {
    assert.equal(formatDefectHint('verb', ''), 'aitm-defect-hint: verb');
  });

  it('length-caps an overlong reason with an ellipsis', () => {
    const out = formatDefectHint('v', 'x'.repeat(500), { maxLen: 10 });
    assert.ok(out.length < 60);
    assert.match(out, /…$/);
  });
});

describe('#498 appendDefectHint', () => {
  it('appends exactly one trailer line to existing text', () => {
    const out = appendDefectHint('refusal reason', 'verb', 'why');
    assert.equal(out, 'refusal reason\naitm-defect-hint: verb why');
    assert.equal(out.match(/aitm-defect-hint:/g).length, 1);
  });

  it('returns the text unchanged when the trailer would be empty', () => {
    assert.equal(appendDefectHint('text', '', 'why'), 'text');
  });
});

describe('#498 emission sites', () => {
  it('gh-edit-guard --body refusal carries the trailer', () => {
    const r = evaluateGhEdit({
      command: 'gh issue edit 42 --body "hello"',
      fetchCurrentBody: () => '',
    });
    assert.equal(r.block, true);
    assert.match(r.reason, /aitm-defect-hint: gh issue edit --body/);
  });

  it('gh-edit-guard --body-file refusal carries the trailer', () => {
    const r = evaluateGhEdit({
      command: 'gh issue edit 42 --body-file /tmp/x.md',
      fetchCurrentBody: () => '',
    });
    assert.equal(r.block, true);
    assert.match(r.reason, /aitm-defect-hint: gh issue edit --body/);
  });

  it('MarkerLossError exposes a defectHint matching the grammar', () => {
    const err = new MarkerLossError(42, ['aitm-fields', 'aitm-body-version']);
    assert.match(err.defectHint, /^aitm-defect-hint: mutateIssueBody /);
    assert.match(err.defectHint, /aitm-fields/);
  });

  it('SeederMarkerMissingError exposes a defectHint matching the grammar', () => {
    const err = new SeederMarkerMissingError(42);
    assert.match(err.defectHint, /^aitm-defect-hint: seed-kanban-cache /);
  });
});
