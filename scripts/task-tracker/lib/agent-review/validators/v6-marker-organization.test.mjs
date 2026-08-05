// Tests for the V6 marker-organization normalizer (#815).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from './v6-marker-organization.mjs';

// Collect every standalone `aitm-*` marker's full text (order-independent) so a
// test can assert set-equality before/after normalization.
function markerSet(body) {
  return new Set(
    String(body)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^<!--\s*aitm-[a-z0-9-]+\b[\s\S]*?-->$/i.test(l))
  );
}

// A body with markers scattered: state at top, refine-complete + rationale also
// at top (should sink under the anchor), version marker stranded at the bottom
// (should hoist), and the anchor section holding the entered-* / fields markers.
const SCATTERED = `<!-- aitm-last-known-state state="plan" ts="2026-07-20T00:00:00.000Z" -->
<!-- aitm-refine-complete ts="2026-07-14T08:53:28.584Z" -->
<!-- aitm-refinement-rationale: {"size":"M"} -->

## User Story

As a maintainer
I want normalization
So that markers are canonical

## Acceptance Criteria

- [ ] Ships it. <!-- aitm-verified vc-list="vc:5" -->

## Verification Commands

- [ ] \`node --test x.test.mjs\` <!-- id=5 -->

## Definition of Done

- [ ] All automated tests pass <!-- aitm-verified cmd="\`npm run test:all\`" --> <!-- dod:functional:tests -->

## AITM Progress Markers

<!-- aitm-entered-backlog ts="2026-07-14T08:38:01.239Z" -->

<!-- aitm-entered-plan ts="2026-07-20T00:00:00.000Z" -->

<!-- aitm-fields: {"schema":1,"values":{}} -->
<!-- aitm-body-version version="9" -->`;

test('normalizes scattered markers — hoists state/version to top, gathers the rest under the anchor', () => {
  const res = validate({ body: SCATTERED });
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.equal(typeof res.normalized, 'string', 'expected a normalized body');
  const out = res.normalized;

  // Preamble: the very first two non-empty lines are the hoisted state + version
  // markers, in canonical order, before any `##` heading.
  const firstHeadingIdx = out.indexOf('\n## ');
  const preamble = out.slice(0, firstHeadingIdx);
  assert.match(preamble, /aitm-last-known-state/);
  assert.match(preamble, /aitm-body-version/);
  assert.ok(
    preamble.indexOf('aitm-last-known-state') < preamble.indexOf('aitm-body-version'),
    'last-known-state must precede body-version in the preamble'
  );
  // The non-hoist markers must NOT remain in the preamble.
  assert.ok(
    !/aitm-refine-complete/.test(preamble),
    'refine-complete should have sunk under the anchor'
  );
  assert.ok(
    !/aitm-refinement-rationale/.test(preamble),
    'rationale should have sunk under the anchor'
  );

  // Gathered markers live after the anchor heading.
  const anchorIdx = out.indexOf('## AITM Progress Markers');
  const section = out.slice(anchorIdx);
  for (const m of [
    'aitm-refine-complete',
    'aitm-refinement-rationale',
    'aitm-entered-backlog',
    'aitm-entered-plan',
    'aitm-fields',
  ]) {
    assert.match(section, new RegExp(m), `${m} must be gathered under the anchor`);
  }
});

test('preserves every marker — set-equality before and after (no marker lost)', () => {
  const res = validate({ body: SCATTERED });
  const before = markerSet(SCATTERED);
  const after = markerSet(res.normalized);
  assert.deepEqual([...after].sort(), [...before].sort());
});

test('is idempotent — re-running on the normalized body reports a clean pass with no further rewrite', () => {
  const first = validate({ body: SCATTERED });
  assert.equal(typeof first.normalized, 'string');
  const second = validate({ body: first.normalized });
  assert.equal(second.pass, true, JSON.stringify(second.failures));
  assert.equal(second.normalized, undefined, 'a canonical body must not be rewritten again');
});

test('does not move inline markers — AC vc-list, VC id, and DoD dod: stay on their content lines', () => {
  const out = validate({ body: SCATTERED }).normalized;
  assert.match(out, /- \[ \] Ships it\. <!-- aitm-verified vc-list="vc:5" -->/);
  assert.match(out, /- \[ \] `node --test x\.test\.mjs` <!-- id=5 -->/);
  assert.match(
    out,
    /- \[ \] All automated tests pass <!-- aitm-verified cmd="`npm run test:all`" --> <!-- dod:functional:tests -->/
  );
});

test('fails when the AITM Progress Markers anchor heading is absent — names the reason, no normalized', () => {
  const body = `## User Story\n\nAs a\nI want\nSo that\n\n<!-- aitm-last-known-state state="plan" ts="x" -->`;
  const res = validate({ body });
  assert.equal(res.pass, false);
  assert.equal(res.normalized, undefined);
  assert.ok(
    res.failures.some((f) => /anchor heading absent/i.test(f)),
    JSON.stringify(res.failures)
  );
});

test('an already-canonical body is a fixed point (pass, no normalized)', () => {
  const canonical = validate({ body: SCATTERED }).normalized;
  const res = validate({ body: canonical });
  assert.equal(res.pass, true);
  assert.equal(res.normalized, undefined);
});

test('#994 — a bracketed aitm-review-failed block survives normalization intact, so clearReviewFailed removes the whole thing including its prose', async () => {
  const { stampReviewFailed, clearReviewFailed, hasReviewFailed } =
    await import('../review-gate.mjs');
  const base = `<!-- aitm-last-known-state state="review" ts="2026-07-20T00:00:00.000Z" -->

## User Story

As a maintainer
I want normalization
So that markers are canonical

## Acceptance Criteria

- [ ] Ships it. <!-- aitm-verified vc-list="vc:5" -->

## Verification Commands

- [ ] \`node --test x.test.mjs\` <!-- id=5 -->

## AITM Progress Markers

<!-- aitm-entered-review ts="2026-07-20T00:00:00.000Z" -->

<!-- aitm-fields: {"schema":1,"values":{}} -->
<!-- aitm-body-version version="9" -->`;

  // Reproduce #932: a failing gate stamps the bracketed block, then a clean
  // re-review normalizes the body (as the review verb's pass path does) before
  // clearing it.
  const withFailure = stampReviewFailed(base, ['some-validator: objection text'], {
    ts: '2026-07-20T01:00:00.000Z',
  });
  assert.ok(hasReviewFailed(withFailure), 'sanity: block present before normalization');

  const res = validate({ body: withFailure });
  assert.equal(res.pass, true);
  const normalized = typeof res.normalized === 'string' ? res.normalized : withFailure;

  // The block — including its bracketed prose and bullet list — must survive
  // normalization byte-for-byte in place, not just its marker lines.
  assert.ok(
    normalized.includes('**Agent Review Gate failed.**'),
    'bracketed failure prose survives normalization'
  );
  assert.ok(
    normalized.includes('- some-validator: objection text'),
    'bracketed bullet list survives normalization'
  );
  assert.ok(
    hasReviewFailed(normalized),
    'the paired marker block is still detectable post-normalization'
  );

  const cleared = clearReviewFailed(normalized);
  assert.equal(hasReviewFailed(cleared), false);
  assert.ok(
    !cleared.includes('**Agent Review Gate failed.**'),
    'no orphaned failure prose survives a clean pass'
  );
  assert.ok(
    !cleared.includes('some-validator: objection text'),
    'no orphaned bullet list survives a clean pass'
  );
});

test('an unterminated review-failed start keeps every following line opaque through EOF', () => {
  const body = `## AITM Progress Markers

<!-- aitm-review-failed:start -->
**Agent Review Gate failed.**
<!-- aitm-body-version version="9" -->`;

  const res = validate({ body });
  assert.equal(res.pass, true);
  assert.equal(
    res.normalized,
    undefined,
    'the body-version marker must remain inside the opaque span'
  );
});

test('#1111 keeps the #1109 plan-approved reproduction inside its backtick fence', () => {
  const example = '<!-- aitm-plan-approved ts="2026-08-05T04:13:06Z" -->';
  const live = '<!-- aitm-plan-approved ts="2026-08-05T07:26:26Z" -->';
  const fenced = ['```markdown', example, '```'].join('\n');
  const body = `## Reproduction

${fenced}

${live}

## AITM Progress Markers

<!-- aitm-entered-plan ts="2026-08-05T07:20:13Z" -->`;

  const res = validate({ body });
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.equal(typeof res.normalized, 'string');
  assert.ok(res.normalized.includes(fenced), 'the complete fenced example must remain in place');
  assert.equal(
    res.normalized.split(example).length - 1,
    1,
    'the example marker must not be copied into live Progress Markers'
  );
  const progress = res.normalized.slice(res.normalized.indexOf('## AITM Progress Markers'));
  assert.doesNotMatch(progress, /2026-08-05T04:13:06Z/);
  assert.match(progress, /2026-08-05T07:26:26Z/);
});

test('#1111 ignores fenced anchor lookalikes and normalizes live markers after backtick and tilde fences', () => {
  for (const [label, opener, closer] of [
    ['backtick info fence', '````markdown', '`````'],
    ['tilde info fence', '~~~~text', '~~~~'],
  ]) {
    const example = `<!-- aitm-example-${label.replaceAll(' ', '-')} ts="example" -->`;
    const live = `<!-- aitm-entered-test ts="${label}" -->`;
    const fenced = [opener, '## AITM Progress Markers', example, closer].join('\n');
    const body = `## Reproduction

${fenced}

${live}

## AITM Progress Markers

<!-- aitm-fields: {"schema":1,"values":{}} -->`;
    const res = validate({ body });
    assert.equal(res.pass, true, `${label}: ${JSON.stringify(res.failures)}`);
    assert.equal(typeof res.normalized, 'string', label);
    assert.ok(res.normalized.includes(fenced), `${label}: fenced bytes must remain intact`);
    const realAnchor = res.normalized.lastIndexOf('## AITM Progress Markers');
    assert.ok(
      realAnchor > res.normalized.indexOf(fenced),
      `${label}: real anchor must remain last`
    );
    assert.ok(
      res.normalized.indexOf(live) > realAnchor,
      `${label}: live marker after the fence must gather under the real anchor`
    );
  }

  const fencedAnchorOnly = [
    '```markdown',
    '## AITM Progress Markers',
    '<!-- aitm-entered-test ts="example" -->',
    '```',
  ].join('\n');
  const missing = validate({ body: `## Reproduction\n\n${fencedAnchorOnly}` });
  assert.equal(missing.pass, false);
  assert.match(missing.failures[0], /anchor heading absent/i);
});

test('#1111 a fenced unterminated review-failure example cannot suppress later live normalization', () => {
  const fenced = [
    '~~~markdown',
    '<!-- aitm-review-failed:start -->',
    '**example failure prose**',
    '~~~',
  ].join('\n');
  const live = '<!-- aitm-entered-review ts="2026-08-05T08:00:00Z" -->';
  const body = `## Reproduction

${fenced}

${live}

## AITM Progress Markers

<!-- aitm-fields: {"schema":1,"values":{}} -->`;
  const res = validate({ body });
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.equal(typeof res.normalized, 'string');
  assert.ok(res.normalized.includes(fenced));
  assert.ok(
    res.normalized.indexOf(live) > res.normalized.lastIndexOf('## AITM Progress Markers'),
    'the real review marker after the fence must still gather'
  );
});

test('existing marker-organization behavior for standalone (non-paired) aitm-* markers is unchanged', () => {
  const out = validate({ body: SCATTERED }).normalized;
  const before = markerSet(SCATTERED);
  const after = markerSet(out);
  assert.deepEqual(after, before);
});

test('bootstrap registers the validator on the shared singleton', async () => {
  await import('../bootstrap.mjs');
  const { registry } = await import('../registry.mjs');
  assert.ok(
    registry.validators().some((v) => v.id === 'marker-organization'),
    'marker-organization not registered'
  );
});
