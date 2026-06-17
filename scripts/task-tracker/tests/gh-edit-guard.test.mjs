#!/usr/bin/env node
// @story #309
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
// #361 — `gh issue edit --body` / `--body-file` are hard-refused regardless
// of diff content. Diff-based protection still applies to body writes that
// flow through `mutateIssueBody` (covered by checkBodyChange unit tests
// above); the bash-level refusal forbids the direct path entirely.
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

  // --body-file is hard-refused regardless of file content
  let r = evaluateGhEdit({
    command: 'gh issue edit 65 --body-file /tmp/good.md',
    readBodyFile,
    fetchCurrentBody,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /direct body writes from Bash are forbidden/i);
  assert.match(r.reason, /mutateIssueBody/);

  // --body-file is hard-refused even when the file would not exist
  r = evaluateGhEdit({
    command: 'gh issue edit 65 --body-file /tmp/missing.md',
    readBodyFile,
    fetchCurrentBody,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /direct body writes from Bash are forbidden/i);

  // --body inline is hard-refused regardless of content
  r = evaluateGhEdit({
    command: `gh issue edit 65 --body "harmless content"`,
    readBodyFile,
    fetchCurrentBody,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /direct body writes from Bash are forbidden/i);

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

  // Edit with title/milestone/assignee → pass
  r = evaluateGhEdit({
    command: 'gh issue edit 64 --title "new" --add-assignee @me --milestone v2',
    readBodyFile,
    fetchCurrentBody,
  });
  assert.equal(r.block, false);
}

// ── checkBodyChange: aitm-body-version / aitm-stage-rollup marker protection (#361)
{
  // aitm-body-version drop → block
  let r = checkBodyChange({
    newBody: '## AC\n- [ ] x\n',
    currentBody: '## AC\n- [ ] x\n<!-- aitm-body-version: 7 -->\n',
    issueNumber: 361,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-body-version/);

  // aitm-stage-rollup drop → block
  r = checkBodyChange({
    newBody: '## AC\n- [ ] x\n',
    currentBody: '## AC\n- [ ] x\n<!-- aitm-stage-rollup: refine=1 -->\n',
    issueNumber: 361,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-stage-rollup/);

  // both preserved → pass
  r = checkBodyChange({
    newBody:
      '## AC\n- [ ] x\n<!-- aitm-body-version: 8 -->\n<!-- aitm-stage-rollup: refine=2 -->\n',
    currentBody:
      '## AC\n- [ ] x\n<!-- aitm-body-version: 7 -->\n<!-- aitm-stage-rollup: refine=1 -->\n',
    issueNumber: 361,
  });
  assert.equal(r.block, false);
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

// ── checkBodyChange: aitm-last-known-state marker protection (#258) ───────────
{
  const STATE = '<!-- aitm-last-known-state: develop -->';
  const STATE_TS = '<!-- aitm-last-known-state-ts: 2026-06-01T10:00:00Z -->';

  // Dropping aitm-last-known-state → block (distinct from the -ts variant)
  let r = checkBodyChange({
    newBody: `## Scope\ntext\n${STATE_TS}\n`,
    currentBody: `## Scope\ntext\n${STATE}\n${STATE_TS}\n`,
    issueNumber: 258,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-last-known-state\b/);

  // Preserving it (value may change forward) → pass
  r = checkBodyChange({
    newBody: `## Scope\n${STATE.replace('develop', 'test')}\n${STATE_TS}\n`,
    currentBody: `## Scope\n${STATE}\n${STATE_TS}\n`,
    issueNumber: 258,
  });
  assert.equal(r.block, false);
}

// ── checkBodyChange: aitm-entered-<stage> set-diff drop (#258) ────────────────
{
  const ENTER_PLAN = '<!-- aitm-entered-plan: 2026-06-01T09:00:00Z -->';
  const ENTER_DEV = '<!-- aitm-entered-develop: 2026-06-01T10:00:00Z -->';

  // Dropping aitm-entered-develop while plan stays → block, names the stage
  let r = checkBodyChange({
    newBody: `## Scope\n${ENTER_PLAN}\n`,
    currentBody: `## Scope\n${ENTER_PLAN}\n${ENTER_DEV}\n`,
    issueNumber: 258,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-entered-develop/);

  // Preserving both entered markers → pass
  r = checkBodyChange({
    newBody: `## Scope\nrevised\n${ENTER_PLAN}\n${ENTER_DEV}\n`,
    currentBody: `## Scope\norig\n${ENTER_PLAN}\n${ENTER_DEV}\n`,
    issueNumber: 258,
  });
  assert.equal(r.block, false);

  // Adding a new entered marker (forward transition) → pass (not a drop)
  r = checkBodyChange({
    newBody: `## Scope\n${ENTER_PLAN}\n${ENTER_DEV}\n`,
    currentBody: `## Scope\n${ENTER_PLAN}\n`,
    issueNumber: 258,
  });
  assert.equal(r.block, false);
}

// ── checkBodyChange: ts-staleness (the #257 clobber) (#258) ───────────────────
{
  // The exact #257 sequence: a scratch frozen at an OLD ts is re-pushed after a
  // mutator advanced the live body's ts. Vector-agnostic — blocks regardless of
  // which marker values differ.
  const live = [
    '## Scope',
    'text',
    '<!-- aitm-last-known-state: test -->',
    '<!-- aitm-last-known-state-ts: 2026-06-01T12:00:00Z -->',
    '<!-- aitm-entered-test: 2026-06-01T12:00:00Z -->',
  ].join('\n');
  // Stale scratch: older ts, missing the entered-test marker, reverted state.
  const stale = [
    '## Scope',
    'text',
    '<!-- aitm-last-known-state: develop -->',
    '<!-- aitm-last-known-state-ts: 2026-06-01T10:00:00Z -->',
    '<!-- aitm-entered-test: 2026-06-01T12:00:00Z -->',
  ].join('\n');

  let r = checkBodyChange({ newBody: stale, currentBody: live, issueNumber: 257 });
  assert.equal(r.block, true);
  assert.match(r.reason, /stale snapshot/i);
  assert.match(r.reason, /2026-06-01T10:00:00Z/);
  assert.match(r.reason, /2026-06-01T12:00:00Z/);

  // Forward push (newer ts) → pass
  const forward = [
    '## Scope',
    'text',
    '<!-- aitm-last-known-state: review -->',
    '<!-- aitm-last-known-state-ts: 2026-06-01T14:00:00Z -->',
    '<!-- aitm-entered-test: 2026-06-01T12:00:00Z -->',
    '<!-- aitm-entered-review: 2026-06-01T14:00:00Z -->',
  ].join('\n');
  r = checkBodyChange({ newBody: forward, currentBody: live, issueNumber: 257 });
  assert.equal(r.block, false);

  // Equal ts → pass (idempotent re-push of the same snapshot)
  r = checkBodyChange({ newBody: live, currentBody: live, issueNumber: 257 });
  assert.equal(r.block, false);

  // Only one side carries a ts → staleness check needs both, so it abstains.
  // (`aitm-last-known-state-ts` is deliberately NOT in MARKER_PATTERNS — the
  // `aitm-last-known-state` regex requires a literal `:` after `state`, which
  // `-ts:` does not satisfy — so a lone -ts drop is not a marker-drop block
  // either. In practice the -ts marker is always co-written with the state
  // marker, whose drop IS caught.) Here, with no other markers, this passes.
  r = checkBodyChange({
    newBody: '## Scope\ntext\n',
    currentBody: '## Scope\ntext\n<!-- aitm-last-known-state-ts: 2026-06-01T12:00:00Z -->\n',
    issueNumber: 257,
  });
  assert.equal(r.block, false);
}

// ── checkBodyChange: NEW single-marker grammar protection (#378) ─────────────
{
  const NEW = (state, ts) => `<!-- aitm-last-known-state state="${state}" ts="${ts}" -->`;

  // Dropping the new single marker → block (drop-detector widened to new form).
  let r = checkBodyChange({
    newBody: '## Scope\ntext\n',
    currentBody: `## Scope\ntext\n${NEW('develop', '2026-06-01T10:00:00Z')}\n`,
    issueNumber: 378,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-last-known-state\b/);

  // Preserving (value may advance forward) → pass.
  r = checkBodyChange({
    newBody: `## Scope\n${NEW('test', '2026-06-01T10:00:00Z')}\n`,
    currentBody: `## Scope\n${NEW('develop', '2026-06-01T10:00:00Z')}\n`,
    issueNumber: 378,
  });
  assert.equal(r.block, false);

  // Stale snapshot in the NEW grammar (older ts) → block.
  r = checkBodyChange({
    newBody: `## Scope\n${NEW('develop', '2026-06-01T10:00:00Z')}\n`,
    currentBody: `## Scope\n${NEW('test', '2026-06-01T12:00:00Z')}\n`,
    issueNumber: 378,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /stale snapshot/i);

  // MIXED grammar staleness — live in new form, stale push in legacy form
  // (older ts). The widened ts reader must compare across grammars and block.
  r = checkBodyChange({
    newBody:
      '## Scope\n<!-- aitm-last-known-state: develop -->\n' +
      '<!-- aitm-last-known-state-ts: 2026-06-01T10:00:00Z -->\n',
    currentBody: `## Scope\n${NEW('test', '2026-06-01T12:00:00Z')}\n`,
    issueNumber: 378,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /stale snapshot/i);

  // MIXED grammar staleness — live in legacy form, stale push in new form.
  r = checkBodyChange({
    newBody: `## Scope\n${NEW('develop', '2026-06-01T10:00:00Z')}\n`,
    currentBody:
      '## Scope\n<!-- aitm-last-known-state: test -->\n' +
      '<!-- aitm-last-known-state-ts: 2026-06-01T12:00:00Z -->\n',
    issueNumber: 378,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /stale snapshot/i);

  // Forward push across grammars (legacy live → new, newer ts) → pass.
  r = checkBodyChange({
    newBody: `## Scope\n${NEW('review', '2026-06-01T14:00:00Z')}\n`,
    currentBody:
      '## Scope\n<!-- aitm-last-known-state: test -->\n' +
      '<!-- aitm-last-known-state-ts: 2026-06-01T12:00:00Z -->\n',
    issueNumber: 378,
  });
  assert.equal(r.block, false);
}

// ── #281 stage-bound: Refine refuses Deep-Dive introduction (AC1, AC6) ──────
{
  const cur = '## AC\n\n- [ ] do thing\n';
  const newWithHeading =
    '## AC\n\n- [ ] do thing\n## Deep-Dive Analysis\nfindings\n' +
    '<!-- aitm-deep-dive-complete: 2026-06-04T00:00:00.000Z -->\n';

  // No currentState → stage-bound gate inactive (forward-compat). The
  // newBody already carries the deep-dive marker, so the legacy
  // heading-without-marker branch doesn't fire either → passes.
  let r = checkBodyChange({ newBody: newWithHeading, currentBody: cur, issueNumber: 281 });
  assert.equal(r.block, false);

  // currentState='refine' → stage-bound refusal names state/action/next.
  r = checkBodyChange({
    newBody: newWithHeading,
    currentBody: cur,
    issueNumber: 281,
    currentState: 'refine',
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /stage-bound refusal/);
  assert.match(r.reason, /state `refine`/);
  assert.match(r.reason, /Deep-Dive Analysis/);
  assert.match(r.reason, /\/task promote/);
  assert.match(r.reason, /plan/);

  // currentState='plan' → gate inactive; legacy heading-without-marker check
  // still passes when the marker is included.
  r = checkBodyChange({
    newBody: newWithHeading,
    currentBody: cur,
    issueNumber: 281,
    currentState: 'plan',
  });
  assert.equal(r.block, false);

  // AC6 grandfather: live body carries the marker → bypass even in refine.
  const curGrandfathered = cur + '<!-- aitm-stage-bound-grandfather -->\n';
  r = checkBodyChange({
    newBody: newWithHeading + '<!-- aitm-stage-bound-grandfather -->\n',
    currentBody: curGrandfathered,
    issueNumber: 281,
    currentState: 'refine',
  });
  assert.equal(r.block, false);

  // Adding only the marker (no heading) in refine → still refused, but with
  // the marker-flavored action message.
  r = checkBodyChange({
    newBody: cur + '<!-- aitm-deep-dive-complete: 2026-06-04T00:00:00.000Z -->\n',
    currentBody: cur,
    issueNumber: 281,
    currentState: 'refine',
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-deep-dive-complete/);
}

// ── #301 deep-dive-embedded-checkbox-section refusal ────────────────────────
{
  // Detector: banned heading inside `<details>` → hit with heading + line.
  const body =
    '## Deep-Dive Analysis (2026-06-08)\n\n<details>\n<summary>x</summary>\n\nprose\n\n### Acceptance Criteria\n\n- [x] foo\n\n</details>\n';
  const hit = findDeepDiveEmbeddedCheckboxHeading(body);
  assert.ok(hit, 'detector should fire on banned heading inside <details>');
  assert.equal(hit.heading, 'Acceptance Criteria');
  assert.equal(hit.line, 8);

  // All three banned headings detected.
  for (const name of ['Acceptance Criteria', 'Verification Commands', 'Definition of Done']) {
    const b = `<details>\n## ${name}\n- [ ] x\n</details>\n`;
    const h = findDeepDiveEmbeddedCheckboxHeading(b);
    assert.ok(h, `should detect ${name}`);
    assert.equal(h.heading, name);
  }

  // False positive: same heading at root level (NOT inside <details>) → allow.
  assert.equal(findDeepDiveEmbeddedCheckboxHeading('## Acceptance Criteria\n\n- [ ] foo\n'), null);

  // False positive: heading text inside a fenced code block inside <details> → allow.
  const fencedBody =
    '<details>\n\n```md\n### Acceptance Criteria\n- [ ] in code\n```\n\n</details>\n';
  assert.equal(findDeepDiveEmbeddedCheckboxHeading(fencedBody), null);

  // False positive: empty <details> → allow.
  assert.equal(findDeepDiveEmbeddedCheckboxHeading('<details>\n</details>\n'), null);

  // checkNewBody (create path): refuses with refusal-code name.
  const cn = checkNewBody({
    newBody:
      '## Deep-Dive Analysis (2026-06-08)\n<!-- aitm-deep-dive-complete: 2026-06-08T00:00:00Z -->\n<details>\n### Verification Commands\n- [ ] x\n</details>\n',
  });
  assert.equal(cn.block, true);
  assert.match(cn.reason, /deep-dive-embedded-checkbox-section/);
  assert.match(cn.reason, /Verification Commands/);

  // checkBodyChange (edit path): refuses on NEW embedding, names #N + line.
  const cur = '## Scope\n\nplain body\n';
  const r = checkBodyChange({
    newBody: cur + '\n<details>\n### Definition of Done\n- [ ] x\n</details>\n',
    currentBody: cur,
    issueNumber: 301,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /deep-dive-embedded-checkbox-section/);
  assert.match(r.reason, /Definition of Done/);
  assert.match(r.reason, /#301/);
  assert.match(r.reason, /line \d+/);

  // Grandfather: same banned heading already in live body → allow (don't
  // wedge legacy issues; operator strips on next intentional edit).
  const grand = cur + '\n<details>\n### Acceptance Criteria\n- [ ] legacy\n</details>\n';
  const r2 = checkBodyChange({ newBody: grand, currentBody: grand, issueNumber: 301 });
  assert.equal(r2.block, false);
}

console.log('gh-edit-guard.test.mjs: all passed');
