#!/usr/bin/env node
// @story #325
// #325 — unit tests for the consolidated `ensureDeepDive` resource and the
// `readDeepDiveSignals` introspection helper. Covers the 8 (heading ×
// posted × complete) partial-state combinations + idempotence + the
// refusal contract when `posted: true` is requested without an existing
// section and no prose.
//
// Hermetic: injects a fake `mutateIssueBody` so no GH I/O occurs. Each
// case asserts on the (base → next) mutation captured by the fake.
import { strict as assert } from 'node:assert';
import {
  DeepDiveSectionMissingError,
  ensureDeepDive,
  readDeepDiveSignals,
} from '../../../../task-tracker/lib/deep-dive.mjs';
import { planDeepDiveGate } from '../../../../task-tracker/lib/deep-dive-gate.mjs';

const TS = '2026-06-06T10:00:00.000Z';
const PROSE = [
  'Substantive deep-dive prose long enough to clear the calibrated 2000-char',
  'floor that `body-gates.mjs::deep-dive-complete` enforces post-#325.',
  '',
  '### Failure surface',
  '',
  'A reasonably detailed paragraph describing the failure mode under analysis',
  'so the section measured by `readDeepDiveSignals.sectionChars` lands well',
  'above the 2000 char minimum once HTML comments are stripped from the body.',
  Array.from({ length: 30 })
    .map((_, i) => `Bullet ${i + 1}: a measurable thought that adds substantive bytes.`)
    .join(' '),
].join('\n');

function fakeMutateFactory(initial) {
  const log = { calls: 0, base: null, next: null, opts: null };
  return {
    log,
    fn: async (opts) => {
      log.calls += 1;
      log.opts = opts;
      const base = initial;
      const next = opts.mutate(base);
      log.base = base;
      log.next = next;
      const noop = next === base;
      return { status: noop ? 'no-op' : 'ok', attempts: 1, version: noop ? 1 : 2 };
    },
  };
}

// #700 — Pickup Directive now sits right after Plan Metadata (no trailing
// `---` separator); the deep-dive block lands directly under its contiguous
// blockquote/blank-line block, ahead of the entered-plan/fields markers.
const BODY_WITH_DIRECTIVE = [
  '## Scope',
  'do thing',
  '',
  '## Pickup Directive — MANDATORY, DO NOT SKIP',
  '> Follow: `.ai-task-manager/templates/pickup-directive.md`',
  '',
  '<!-- aitm-entered-plan: 2026-06-06T05:00:00Z -->',
  '',
  '<!-- aitm-fields: {"schema":1,"values":{}} -->',
  '',
  '<!-- aitm-body-version: 4 -->',
  '',
].join('\n');

const BODY_WITH_SECTION_NO_MARKERS = [
  '## Scope',
  'do thing',
  '',
  '## Deep-Dive Analysis',
  '',
  PROSE,
  '',
  '<!-- aitm-fields: {"schema":1,"values":{}} -->',
  '',
].join('\n');

// ---------------------------------------------------------------------------
// readDeepDiveSignals
// ---------------------------------------------------------------------------

// readDeepDiveSignals — empty body returns all-false signals
{
  const s = readDeepDiveSignals('');
  assert.deepEqual(s, { hasHeading: false, hasPosted: false, hasComplete: false, sectionChars: 0 });
}

// readDeepDiveSignals — heading + prose returns chars excluding HTML comments
{
  const body = [
    '## Deep-Dive Analysis (2026-06-06)',
    '',
    '<!-- aitm-deep-dive-posted: 2026-06-06T00:00:00Z -->',
    '',
    'AAAA BBBB CCCC DDDD EEEE FFFF',
    '',
  ].join('\n');
  const s = readDeepDiveSignals(body);
  assert.equal(s.hasHeading, true);
  assert.equal(s.hasPosted, true);
  assert.equal(s.hasComplete, false);
  // Comment + blank lines stripped; only the alpha-soup line counts.
  assert.ok(s.sectionChars >= 29 && s.sectionChars < 60, `sectionChars=${s.sectionChars}`);
}

// readDeepDiveSignals — section bounded by next `## ` heading
{
  const body = [
    '## Deep-Dive Analysis (2026-06-06)',
    '',
    'one two three four five six',
    '',
    '## Verification Commands',
    '',
    '- [x] npm test',
  ].join('\n');
  const s = readDeepDiveSignals(body);
  assert.equal(s.hasHeading, true);
  assert.equal(s.sectionChars, 'one two three four five six'.length);
}

// ---------------------------------------------------------------------------
// ensureDeepDive — 8 partial-state combinations + idempotence
//
// State triplet = (hasHeading, hasPosted, hasComplete). Each row asserts
// the resulting body shape after a call that requests all three signals
// flipped on (prose + posted + complete).
// ---------------------------------------------------------------------------

// (0,0,0) — nothing present → all three written in one txn
{
  const { fn, log } = fakeMutateFactory(BODY_WITH_DIRECTIVE);
  const res = await ensureDeepDive({
    issueNumber: 1,
    repo: 'fake/repo',
    prose: PROSE,
    complete: true,
    ts: TS,
    deps: { mutateIssueBody: fn },
  });
  assert.equal(res.status, 'ok');
  const s = readDeepDiveSignals(log.next);
  assert.equal(s.hasHeading, true, 'heading authored');
  assert.equal(s.hasPosted, true, 'posted stamped');
  assert.equal(s.hasComplete, true, 'complete stamped');
  assert.equal(log.calls, 1, 'single mutateIssueBody call');
  // planDeepDiveGate must clear all three blockers.
  assert.deepEqual(planDeepDiveGate({ body: log.next }), { ok: true });
}

// (1,0,0) — section present, both markers missing → marker(s) injected
{
  const { fn, log } = fakeMutateFactory(BODY_WITH_SECTION_NO_MARKERS);
  const res = await ensureDeepDive({
    issueNumber: 2,
    repo: 'fake/repo',
    posted: true,
    complete: true,
    ts: TS,
    deps: { mutateIssueBody: fn },
  });
  assert.equal(res.status, 'ok');
  const s = readDeepDiveSignals(log.next);
  assert.equal(s.hasHeading, true);
  assert.equal(s.hasPosted, true);
  assert.equal(s.hasComplete, true);
  // Heading not duplicated.
  const headings = log.next.match(/^##\s+Deep-Dive Analysis/gm) || [];
  assert.equal(headings.length, 1, 'no duplicate heading');
}

// (1,1,0) — section + posted, complete missing → only complete added
{
  const seeded = BODY_WITH_SECTION_NO_MARKERS.replace(
    '## Deep-Dive Analysis',
    `<!-- aitm-deep-dive-posted: 2026-06-05T00:00:00Z -->\n\n## Deep-Dive Analysis`
  );
  const { fn, log } = fakeMutateFactory(seeded);
  const res = await ensureDeepDive({
    issueNumber: 3,
    repo: 'fake/repo',
    complete: true,
    ts: TS,
    deps: { mutateIssueBody: fn },
  });
  assert.equal(res.status, 'ok');
  assert.ok(log.next.includes(`aitm-deep-dive-complete ts="${TS}"`));
  // Posted marker preserved (the old one stays; we don't restamp).
  assert.ok(log.next.includes('aitm-deep-dive-posted: 2026-06-05T00:00:00Z'));
}

// (1,0,1) — section + complete, posted missing → only posted added above heading
{
  const seeded = BODY_WITH_SECTION_NO_MARKERS.replace(
    '<!-- aitm-fields',
    '<!-- aitm-deep-dive-complete: 2026-06-05T00:00:00Z -->\n\n<!-- aitm-fields'
  );
  const { fn, log } = fakeMutateFactory(seeded);
  const res = await ensureDeepDive({
    issueNumber: 4,
    repo: 'fake/repo',
    posted: true,
    ts: TS,
    deps: { mutateIssueBody: fn },
  });
  assert.equal(res.status, 'ok');
  assert.ok(log.next.includes(`aitm-deep-dive-posted ts="${TS}"`));
  // Marker ordered above the heading.
  const mi = log.next.indexOf('aitm-deep-dive-posted');
  const hi = log.next.indexOf('## Deep-Dive Analysis');
  assert.ok(mi !== -1 && mi < hi, 'posted marker above heading');
}

// (1,1,1) — all three present → no-op
{
  const seeded = BODY_WITH_SECTION_NO_MARKERS.replace(
    '## Deep-Dive Analysis',
    `<!-- aitm-deep-dive-posted: 2026-06-05T00:00:00Z -->\n\n## Deep-Dive Analysis`
  ).replace(
    '<!-- aitm-fields',
    '<!-- aitm-deep-dive-complete: 2026-06-05T00:00:00Z -->\n\n<!-- aitm-fields'
  );
  const { fn, log } = fakeMutateFactory(seeded);
  const res = await ensureDeepDive({
    issueNumber: 5,
    repo: 'fake/repo',
    prose: PROSE,
    complete: true,
    ts: TS,
    deps: { mutateIssueBody: fn },
  });
  assert.equal(res.status, 'no-op');
  assert.equal(log.next, log.base, 'byte-identical');
}

// (0,1,0) and (0,0,1) — heading absent, but a posted/complete marker
//   present from a prior broken write. Calling with `prose` authors the
//   missing section.
{
  const seeded = BODY_WITH_DIRECTIVE.replace(
    '<!-- aitm-fields',
    '<!-- aitm-deep-dive-posted: 2026-06-05T00:00:00Z -->\n\n<!-- aitm-fields'
  );
  const { fn, log } = fakeMutateFactory(seeded);
  await ensureDeepDive({
    issueNumber: 6,
    repo: 'fake/repo',
    prose: PROSE,
    complete: true,
    ts: TS,
    deps: { mutateIssueBody: fn },
  });
  const s = readDeepDiveSignals(log.next);
  assert.equal(s.hasHeading, true, 'heading authored');
  assert.equal(s.hasComplete, true, 'complete stamped');
}

// (0,0,1) — complete marker only, no section, no prose, posted:true requested → refuses
{
  const seeded = BODY_WITH_DIRECTIVE.replace(
    '<!-- aitm-fields',
    '<!-- aitm-deep-dive-complete: 2026-06-05T00:00:00Z -->\n\n<!-- aitm-fields'
  );
  const { fn } = fakeMutateFactory(seeded);
  await assert.rejects(
    () =>
      ensureDeepDive({
        issueNumber: 7,
        repo: 'fake/repo',
        posted: true,
        ts: TS,
        deps: { mutateIssueBody: fn },
      }),
    (err) =>
      err instanceof DeepDiveSectionMissingError &&
      /no `## Deep-Dive Analysis` heading/.test(err.message)
  );
}

// posted defaults: true when prose supplied, false when prose omitted
{
  const { fn, log } = fakeMutateFactory(BODY_WITH_SECTION_NO_MARKERS);
  await ensureDeepDive({
    issueNumber: 8,
    repo: 'fake/repo',
    complete: true,
    ts: TS,
    deps: { mutateIssueBody: fn },
  });
  // posted defaulted to false (no prose) → no posted marker stamped
  assert.equal(readDeepDiveSignals(log.next).hasPosted, false);
  assert.equal(readDeepDiveSignals(log.next).hasComplete, true);
}

// idempotence (#504): the first-post path authors via `buildDeepDiveBlock`;
// re-posting the same prose now takes the replace path, which canonicalizes
// the section spacing and then reaches a fixed point — a third post against
// the replaced body is a byte-identical no-op. Both posted + complete markers
// survive throughout.
{
  const { fn, log } = fakeMutateFactory(BODY_WITH_DIRECTIVE);
  await ensureDeepDive({
    issueNumber: 9,
    repo: 'fake/repo',
    prose: PROSE,
    complete: true,
    ts: TS,
    deps: { mutateIssueBody: fn },
  });
  const firstNext = log.next;
  // Second post: replace path canonicalizes; markers preserved, no duplication.
  const { fn: fn2, log: log2 } = fakeMutateFactory(firstNext);
  await ensureDeepDive({
    issueNumber: 9,
    repo: 'fake/repo',
    prose: PROSE,
    complete: true,
    ts: TS,
    deps: { mutateIssueBody: fn2 },
  });
  const secondNext = log2.next;
  const sig2 = readDeepDiveSignals(secondNext);
  assert.equal(sig2.hasHeading, true);
  assert.equal(sig2.hasComplete, true);
  assert.equal((secondNext.match(/^##\s+Deep-Dive Analysis/gm) || []).length, 1);
  assert.ok(/aitm-entered-plan/.test(secondNext), 'entered-plan marker preserved');
  assert.ok(/aitm-fields/.test(secondNext), 'fields trailer preserved');
  // Third post: fixed point reached → byte-identical no-op.
  const { fn: fn3, log: log3 } = fakeMutateFactory(secondNext);
  const res3 = await ensureDeepDive({
    issueNumber: 9,
    repo: 'fake/repo',
    prose: PROSE,
    complete: true,
    ts: TS,
    deps: { mutateIssueBody: fn3 },
  });
  assert.equal(res3.status, 'no-op');
  assert.equal(log3.next, log3.base, 'third call byte-identical (fixed point)');
}

// argument validation
{
  await assert.rejects(() => ensureDeepDive({ repo: 'x' }), /issueNumber is required/);
  await assert.rejects(() => ensureDeepDive({ issueNumber: 1 }), /repo is required/);
  await assert.rejects(
    () => ensureDeepDive({ issueNumber: 1, repo: 'x', prose: '' }),
    /prose must be a non-empty string when provided/
  );
}

// NOTE: #504 replace-in-place path tests live in the sibling file
// `ensure-deep-dive-replace.test.mjs` (split out to honor the 400-line cap).

console.log('ensure-deep-dive.test.mjs — all assertions passed');
