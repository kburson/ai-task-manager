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
} from '../lib/gh-edit-guard.mjs';

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
