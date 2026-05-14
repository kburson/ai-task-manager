#!/usr/bin/env node
// Tests for scripts/task-tracker/lib/gh-edit-guard.mjs — the body-write
// chokepoint that protects against legacy-checkbox reintroduction and
// hidden-marker drops on `gh issue edit ... --body-file/--body ...`.

import { strict as assert } from 'node:assert';
import {
  parseGhIssueEdit,
  parseGhIssueCreate,
  checkBodyChange,
  checkNewBody,
  evaluateGhEdit,
  evaluateGhCreate,
} from '../lib/gh-edit-guard.mjs';

// ── parseGhIssueEdit ─────────────────────────────────────────────────────────
{
  // --body-file
  assert.deepEqual(parseGhIssueEdit('gh issue edit 64 --body-file /tmp/foo.md'), {
    issueNumber: 64,
    source: 'file',
    path: '/tmp/foo.md',
  });
  // Hash prefix and -R flag in between
  assert.deepEqual(parseGhIssueEdit('gh issue edit #64 -R owner/repo --body-file /tmp/x.md'), {
    issueNumber: 64,
    source: 'file',
    path: '/tmp/x.md',
  });
  // --body inline (double-quoted)
  assert.deepEqual(parseGhIssueEdit('gh issue edit 7 --body "hello world"'), {
    issueNumber: 7,
    source: 'inline',
    body: 'hello world',
  });
  // --body inline (single-quoted)
  assert.deepEqual(parseGhIssueEdit("gh issue edit 7 --body 'a b'"), {
    issueNumber: 7,
    source: 'inline',
    body: 'a b',
  });
  // No body flag → source: none
  assert.deepEqual(parseGhIssueEdit('gh issue edit 7 --add-label bug'), {
    issueNumber: 7,
    source: 'none',
  });
  // Not an issue edit command
  assert.equal(parseGhIssueEdit('gh issue view 64'), null);
  assert.equal(parseGhIssueEdit('echo hello'), null);
  assert.equal(parseGhIssueEdit(''), null);
}

// ── checkBodyChange: legacy-line introduction ────────────────────────────────
{
  const cur = '## AC\n\n- [ ] do thing\n';

  // Adding "Plan approved by human" → block
  let r = checkBodyChange({
    newBody: '## AC\n\n- [ ] do thing\n- [x] Plan approved by human\n',
    currentBody: cur,
    issueNumber: 64,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /Plan approved by human/);
  assert.match(r.reason, /#64/);

  // Adding "Deep dive complete" → block
  r = checkBodyChange({
    newBody: '## AC\n\n- [ ] do thing\n- [ ] Deep dive complete\n',
    currentBody: cur,
    issueNumber: 65,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /Deep dive complete/);

  // Body already had the legacy line → preservation passes (not adding)
  r = checkBodyChange({
    newBody: '## AC\n- [ ] do thing\n- [x] Plan approved by human\n## More\nstuff\n',
    currentBody: '## AC\n- [ ] do thing\n- [x] Plan approved by human\n',
    issueNumber: 99,
  });
  assert.equal(
    r.block,
    false,
    'preserving an already-present legacy line is OK (heal will normalise later)'
  );

  // Clean body → clean body: passes
  r = checkBodyChange({ newBody: cur, currentBody: cur, issueNumber: 1 });
  assert.equal(r.block, false);
}

// ── checkBodyChange: hidden-marker drop ──────────────────────────────────────
{
  const PLAN = '<!-- aitm-plan-approved: 2026-05-11T20:00:00Z -->';
  const DEEP = '<!-- aitm-deep-dive-complete: 2026-05-11T20:00:00Z -->';
  const REV = '<!-- aitm-review-approved: 2026-05-11T20:00:00Z -->';

  // Drop plan-approved → block
  let r = checkBodyChange({
    newBody: `## AC\n\n${DEEP}\n${REV}\n`,
    currentBody: `## AC\n\n${PLAN}\n${DEEP}\n${REV}\n`,
    issueNumber: 64,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-plan-approved/);

  // Drop deep-dive-complete → block
  r = checkBodyChange({
    newBody: `## AC\n\n${PLAN}\n${REV}\n`,
    currentBody: `## AC\n\n${PLAN}\n${DEEP}\n${REV}\n`,
    issueNumber: 65,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-deep-dive-complete/);

  // Drop review-approved → block
  r = checkBodyChange({
    newBody: `## AC\n\n${PLAN}\n${DEEP}\n`,
    currentBody: `## AC\n\n${PLAN}\n${DEEP}\n${REV}\n`,
    issueNumber: 67,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-review-approved/);

  // Preserve all markers (any ts change is fine — only presence is checked)
  r = checkBodyChange({
    newBody: `## AC\n${PLAN.replace('20:00:00Z', '22:00:00Z')}\n${DEEP}\n${REV}\nappended\n`,
    currentBody: `## AC\n${PLAN}\n${DEEP}\n${REV}\n`,
    issueNumber: 1,
  });
  assert.equal(r.block, false);

  // Add new markers to a body that had none: passes
  r = checkBodyChange({
    newBody: `## AC\n\n${PLAN}\n`,
    currentBody: `## AC\n`,
    issueNumber: 2,
  });
  assert.equal(r.block, false);
}

// ── evaluateGhEdit: end-to-end wiring with injected deps ─────────────────────
{
  const fileBody = {
    '/tmp/good.md': '## AC\n- [ ] x\n',
    '/tmp/with-legacy.md': '## AC\n- [x] Plan approved by human\n',
    '/tmp/drops-marker.md': '## AC\n- [ ] x\n',
  };
  const readBodyFile = (p) => {
    if (!(p in fileBody)) throw new Error(`no such file: ${p}`);
    return fileBody[p];
  };
  const fetchCurrentBody = (n) => {
    if (n === 64) return '## AC\n<!-- aitm-plan-approved: 2026-05-11T20:00:00Z -->\n';
    if (n === 65) return '## AC\n- [ ] x\n';
    return '';
  };

  // File body introduces legacy line → block
  let r = evaluateGhEdit({
    command: 'gh issue edit 65 --body-file /tmp/with-legacy.md',
    readBodyFile,
    fetchCurrentBody,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /Plan approved by human/);

  // File body drops hidden marker → block
  r = evaluateGhEdit({
    command: 'gh issue edit 64 --body-file /tmp/drops-marker.md',
    readBodyFile,
    fetchCurrentBody,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-plan-approved/);

  // Clean file body → pass
  r = evaluateGhEdit({
    command: 'gh issue edit 65 --body-file /tmp/good.md',
    readBodyFile,
    fetchCurrentBody,
  });
  assert.equal(r.block, false);

  // Non-edit command → pass
  r = evaluateGhEdit({
    command: 'gh issue view 64 --json body',
    readBodyFile,
    fetchCurrentBody,
  });
  assert.equal(r.block, false);

  // Edit without body flag (e.g., --add-label only) → pass
  r = evaluateGhEdit({
    command: 'gh issue edit 64 --add-label bug',
    readBodyFile,
    fetchCurrentBody,
  });
  assert.equal(r.block, false);

  // File read error → don't block (defensive: surface as gh CLI error instead)
  r = evaluateGhEdit({
    command: 'gh issue edit 65 --body-file /tmp/missing.md',
    readBodyFile,
    fetchCurrentBody,
  });
  assert.equal(r.block, false);

  // Current-body fetch throws → safe-pass on legacy/marker check
  r = evaluateGhEdit({
    command: 'gh issue edit 65 --body-file /tmp/with-legacy.md',
    readBodyFile,
    fetchCurrentBody: () => {
      throw new Error('network');
    },
  });
  // legacy-line introduction is still caught even when current body is unknown
  // (treated as empty → legacy line is "introduced")
  assert.equal(r.block, true);
}

// ── checkBodyChange: deep-dive heading must come with marker ─────────────────
{
  const MARKER = '<!-- aitm-deep-dive-complete: 2026-05-11T20:00:00Z -->';

  // Adding heading without marker → block
  let r = checkBodyChange({
    newBody: '## AC\n## Deep-Dive Analysis (2026-05-11)\nstuff\n',
    currentBody: '## AC\n',
    issueNumber: 99,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /Deep-Dive Analysis/);
  assert.match(r.reason, /aitm-deep-dive-complete/);

  // Adding heading WITH marker → pass
  r = checkBodyChange({
    newBody: `## AC\n## Deep-Dive Analysis (2026-05-11)\nstuff\n${MARKER}\n`,
    currentBody: '## AC\n',
    issueNumber: 99,
  });
  assert.equal(r.block, false);

  // Heading already present in current → not "introducing", pass even without marker
  r = checkBodyChange({
    newBody: '## AC\n## Deep-Dive Analysis\nrevised\n',
    currentBody: '## AC\n## Deep-Dive Analysis\noriginal\n',
    issueNumber: 99,
  });
  assert.equal(r.block, false);
}

// ── checkNewBody: deep-dive heading must come with marker on create ──────────
{
  const MARKER = '<!-- aitm-deep-dive-complete: 2026-05-11T20:00:00Z -->';

  let r = checkNewBody({ newBody: '## AC\n## Deep-Dive Analysis\nx\n' });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-deep-dive-complete/);

  r = checkNewBody({ newBody: `## AC\n## Deep-Dive Analysis\nx\n${MARKER}\n` });
  assert.equal(r.block, false);
}

// ── parseGhIssueCreate ───────────────────────────────────────────────────────
{
  assert.deepEqual(parseGhIssueCreate('gh issue create --title T --body-file /tmp/x.md'), {
    source: 'file',
    path: '/tmp/x.md',
  });
  assert.deepEqual(parseGhIssueCreate('gh issue create --title T --body "hi"'), {
    source: 'inline',
    body: 'hi',
  });
  assert.deepEqual(parseGhIssueCreate('gh issue create --title T'), { source: 'none' });
  assert.equal(parseGhIssueCreate('gh issue edit 1 --body x'), null);
  assert.equal(parseGhIssueCreate('echo hi'), null);
}

// ── checkNewBody: legacy-line introduction on create ─────────────────────────
{
  let r = checkNewBody({ newBody: '## AC\n- [ ] Plan approved by human\n' });
  assert.equal(r.block, true);
  assert.match(r.reason, /Plan approved by human/);

  r = checkNewBody({ newBody: '## AC\n- [ ] Deep dive complete\n' });
  assert.equal(r.block, true);
  assert.match(r.reason, /Deep dive complete/);

  r = checkNewBody({ newBody: '## AC\n- [ ] do thing\n' });
  assert.equal(r.block, false);
}

// ── evaluateGhCreate: end-to-end ─────────────────────────────────────────────
{
  const fileBody = {
    '/tmp/clean.md': '## AC\n- [ ] x\n',
    '/tmp/legacy.md': '## AC\n- [ ] Deep dive complete\n',
  };
  const readBodyFile = (p) => {
    if (!(p in fileBody)) throw new Error(`no such file: ${p}`);
    return fileBody[p];
  };

  // Legacy line in created body → block
  let r = evaluateGhCreate({
    command: 'gh issue create --title T --body-file /tmp/legacy.md',
    readBodyFile,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /Deep dive complete/);

  // Clean body → pass
  r = evaluateGhCreate({
    command: 'gh issue create --title T --body-file /tmp/clean.md',
    readBodyFile,
  });
  assert.equal(r.block, false);

  // Inline legacy body → block
  r = evaluateGhCreate({
    command: 'gh issue create --title T --body "- [x] Plan approved by human"',
    readBodyFile,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /Plan approved by human/);

  // Non-create command → pass
  r = evaluateGhCreate({
    command: 'gh issue view 1',
    readBodyFile,
  });
  assert.equal(r.block, false);

  // Create without body flag → pass
  r = evaluateGhCreate({
    command: 'gh issue create --title T',
    readBodyFile,
  });
  assert.equal(r.block, false);

  // File read error → don't block (gh CLI will surface it)
  r = evaluateGhCreate({
    command: 'gh issue create --title T --body-file /tmp/missing.md',
    readBodyFile,
  });
  assert.equal(r.block, false);
}

// ── checkBodyChange: aitm-fields and aitm-groom-rationale marker protection ───
{
  const FIELDS_MARKER = '<!-- aitm-fields: {"schema":1,"values":{}} -->';
  const GROOM_MARKER = '<!-- aitm-groom-rationale: {"size":"M","estimate":"5h","priority":"P1"} -->';

  // Dropping aitm-fields → block
  let r = checkBodyChange({
    newBody: '## Scope\nsome text\n',
    currentBody: `## Scope\nsome text\n${FIELDS_MARKER}\n`,
    issueNumber: 42,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-fields/);

  // Dropping aitm-groom-rationale → block
  r = checkBodyChange({
    newBody: '## Scope\nsome text\n',
    currentBody: `## Scope\nsome text\n${GROOM_MARKER}\n`,
    issueNumber: 42,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-groom-rationale/);

  // Preserving both markers → pass
  r = checkBodyChange({
    newBody: `## Scope\nupdated\n${FIELDS_MARKER}\n${GROOM_MARKER}\n`,
    currentBody: `## Scope\noriginal\n${FIELDS_MARKER}\n${GROOM_MARKER}\n`,
    issueNumber: 42,
  });
  assert.equal(r.block, false);

  // Adding aitm-fields to a body that didn't have it → pass (not a drop)
  r = checkBodyChange({
    newBody: `## Scope\ntext\n${FIELDS_MARKER}\n`,
    currentBody: '## Scope\ntext\n',
    issueNumber: 42,
  });
  assert.equal(r.block, false);
}

console.log('gh-edit-guard.test.mjs: all passed');
