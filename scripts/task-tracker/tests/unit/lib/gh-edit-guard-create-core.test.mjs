// @story #310
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
  findDeepDiveEmbeddedCheckboxHeading,
} from '../../../lib/gh-edit-guard.mjs';

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

// ── checkBodyChange: aitm-fields marker protection ───
{
  const FIELDS_MARKER = '<!-- aitm-fields: {"schema":1,"values":{}} -->';

  // Dropping aitm-fields → block
  let r = checkBodyChange({
    newBody: '## Scope\nsome text\n',
    currentBody: `## Scope\nsome text\n${FIELDS_MARKER}\n`,
    issueNumber: 42,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-fields/);

  // Preserving the marker → pass
  r = checkBodyChange({
    newBody: `## Scope\nupdated\n${FIELDS_MARKER}\n`,
    currentBody: `## Scope\noriginal\n${FIELDS_MARKER}\n`,
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

  // Dropping aitm-refinement-rationale → block (new marker form, #144)
  const REFINEMENT_MARKER =
    '<!-- aitm-refinement-rationale: {"size":"M","estimate":"5h","priority":"P1"} -->';
  r = checkBodyChange({
    newBody: '## Scope\nsome text\n',
    currentBody: `## Scope\nsome text\n${REFINEMENT_MARKER}\n`,
    issueNumber: 42,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-refinement-rationale/);

  // Preserving aitm-refinement-rationale → pass
  r = checkBodyChange({
    newBody: `## Scope\nupdated\n${REFINEMENT_MARKER}\n`,
    currentBody: `## Scope\noriginal\n${REFINEMENT_MARKER}\n`,
    issueNumber: 42,
  });
  assert.equal(r.block, false);
}

// ── checkBodyChange: aitm-blocked-by marker protection (#246) ─────────────────
{
  const BLOCKED_MARKER = '<!-- aitm-blocked-by: #247, #248 -->';

  // Dropping aitm-blocked-by → block
  let r = checkBodyChange({
    newBody: '## Scope\nsome text\n',
    currentBody: `## Scope\nsome text\n${BLOCKED_MARKER}\n`,
    issueNumber: 246,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-blocked-by/);

  // Preserving aitm-blocked-by → pass
  r = checkBodyChange({
    newBody: `## Scope\nupdated\n${BLOCKED_MARKER}\n`,
    currentBody: `## Scope\noriginal\n${BLOCKED_MARKER}\n`,
    issueNumber: 246,
  });
  assert.equal(r.block, false);

  // #381 — new `refs="..."` grammar is protected the same as legacy colon CSV.
  const BLOCKED_MARKER_NEW = '<!-- aitm-blocked-by refs="#247,#248" -->';

  // Dropping the new-form marker → block
  r = checkBodyChange({
    newBody: '## Scope\nsome text\n',
    currentBody: `## Scope\nsome text\n${BLOCKED_MARKER_NEW}\n`,
    issueNumber: 246,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-blocked-by/);

  // Preserving the new-form marker → pass
  r = checkBodyChange({
    newBody: `## Scope\nupdated\n${BLOCKED_MARKER_NEW}\n`,
    currentBody: `## Scope\noriginal\n${BLOCKED_MARKER_NEW}\n`,
    issueNumber: 246,
  });
  assert.equal(r.block, false);
}
