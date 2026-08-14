#!/usr/bin/env node
// @story #504
// #504 — unit tests for `ensureDeepDive`'s replace-in-place path: when a
// `## Deep-Dive Analysis` heading already exists and fresh `prose` is
// supplied, the section body is REPLACED (not appended). Re-recording revised
// findings must never duplicate the heading, the prose, or the appendix's own
// `## Dependency Map` sub-heading, and every marker (posted / complete /
// fields / entered-*) must survive.
//
// Hermetic: injects a fake `mutateIssueBody` so no GH I/O occurs.
import { strict as assert } from 'node:assert';
import { ensureDeepDive, readDeepDiveSignals } from '../../../../task-tracker/lib/deep-dive.mjs';
import { validate as validateBodySections } from '../../../../task-tracker/lib/agent-review/validators/body-sections.mjs';

const TS = '2026-06-06T10:00:00.000Z';

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

// replace-path (#504): (1,1,0) with prose + existing heading → the section
// body is REPLACED in place, not appended. The old prose disappears, the new
// prose is present, and the heading / posted marker / trailer are preserved.
// The canonical appendix ends with `## Dependency Map`, so a re-post must NOT
// duplicate the heading, the prose, or the Dependency Map sub-heading.
{
  const OLD_PROSE = 'stale first-draft finding that must be superseded.';
  const seeded = [
    '## Scope',
    'do thing',
    '',
    '<!-- aitm-deep-dive-posted: 2026-06-05T00:00:00Z -->',
    '',
    '## Deep-Dive Analysis',
    '',
    OLD_PROSE,
    '',
    '## Dependency Map',
    '',
    '- old/dep.mjs',
    '',
    '<!-- aitm-deep-dive-complete: 2026-06-05T00:00:00Z -->',
    '<!-- aitm-fields: {"schema":1,"values":{"size":"XS"}} -->',
    '',
  ].join('\n');
  const REVISED = [
    'Revised finding text that supersedes the stale draft entirely.',
    '',
    '## Dependency Map',
    '',
    '- new/dep.mjs',
  ].join('\n');
  const { fn, log } = fakeMutateFactory(seeded);
  const res = await ensureDeepDive({
    issueNumber: 10,
    repo: 'fake/repo',
    prose: REVISED,
    ts: TS,
    deps: { mutateIssueBody: fn },
  });
  assert.equal(res.status, 'ok');
  const after = readDeepDiveSignals(log.next);
  assert.equal(after.hasHeading, true);
  // Old prose gone, new prose present.
  assert.ok(!log.next.includes(OLD_PROSE), 'stale prose replaced');
  assert.ok(log.next.includes('Revised finding text'), 'new prose present');
  assert.ok(!log.next.includes('old/dep.mjs'), 'stale dependency replaced');
  assert.ok(log.next.includes('new/dep.mjs'), 'new dependency present');
  // Exactly one of each structural element — no duplication.
  const headings = log.next.match(/^##\s+Deep-Dive Analysis/gm) || [];
  assert.equal(headings.length, 1, 'no duplicate Deep-Dive heading');
  const depMaps = log.next.match(/^##\s+Dependency Map/gm) || [];
  assert.equal(depMaps.length, 1, 'no duplicate Dependency Map');
  // Posted + complete markers survive the replace.
  assert.ok(/aitm-deep-dive-posted/.test(log.next), 'posted marker preserved');
  assert.ok(after.hasComplete, 'complete marker preserved');
}

// re-post idempotency (#504 AC6): replacing with prose identical to what is
// already in the section is a byte-for-byte no-op.
{
  const PROSE_ID = [
    'Identical revised finding for the idempotency check.',
    '',
    '## Dependency Map',
    '',
    '- stable/dep.mjs',
  ].join('\n');
  const seeded = [
    '## Scope',
    'do thing',
    '',
    '<!-- aitm-deep-dive-posted: 2026-06-05T00:00:00Z -->',
    '',
    '## Deep-Dive Analysis',
    '',
    'placeholder to be overwritten on first replace.',
    '',
    '<!-- aitm-deep-dive-complete: 2026-06-05T00:00:00Z -->',
    '<!-- aitm-fields: {"schema":1,"values":{"size":"XS"}} -->',
    '',
  ].join('\n');
  const { fn, log } = fakeMutateFactory(seeded);
  await ensureDeepDive({
    issueNumber: 11,
    repo: 'fake/repo',
    prose: PROSE_ID,
    ts: TS,
    deps: { mutateIssueBody: fn },
  });
  const firstNext = log.next;
  const { fn: fn2, log: log2 } = fakeMutateFactory(firstNext);
  const res2 = await ensureDeepDive({
    issueNumber: 11,
    repo: 'fake/repo',
    prose: PROSE_ID,
    ts: TS,
    deps: { mutateIssueBody: fn2 },
  });
  assert.equal(res2.status, 'no-op', 're-post with identical prose is a no-op');
  assert.equal(log2.next, log2.base, 'second replace byte-identical');
}

// replace-path refuses a banned gate-bearing heading in the new prose.
{
  const seeded = [
    '<!-- aitm-deep-dive-posted: 2026-06-05T00:00:00Z -->',
    '',
    '## Deep-Dive Analysis',
    '',
    'old prose',
    '',
    '<!-- aitm-fields: {"schema":1,"values":{"size":"XS"}} -->',
    '',
  ].join('\n');
  const { fn } = fakeMutateFactory(seeded);
  await assert.rejects(
    () =>
      ensureDeepDive({
        issueNumber: 12,
        repo: 'fake/repo',
        prose: 'new prose\n\n## Acceptance Criteria\n\n- [ ] x',
        ts: TS,
        deps: { mutateIssueBody: fn },
      }),
    /Acceptance Criteria/
  );
}

// #1046 — Plan approval wraps Deep Dive in <details>. Replacing below-floor
// prose after that point must preserve </details>; otherwise every root
// lifecycle section below it becomes hidden and Agent Review cannot proceed.
{
  const seeded = [
    '## User Story',
    'As a maintainer',
    'I want safe replacement',
    'So that review stays possible',
    '',
    '## Scope',
    'Preserve collapsed structure.',
    '',
    '## Story Origin',
    '- **kind**: code',
    '',
    '## Plan Metadata',
    '- **Size:** XS',
    '',
    '## Pickup Directive — MANDATORY, DO NOT SKIP',
    '> Follow the directive.',
    '',
    '<!-- aitm-deep-dive-posted ts="2026-06-05T00:00:00Z" -->',
    '',
    '<details>',
    '<summary>Deep-Dive Analysis (collapsed on plan approval — expand if revisiting scope)</summary>',
    '',
    '## Deep-Dive Analysis (2026-06-05)',
    '',
    'stale below-floor prose',
    '',
    '</details>',
    '',
    '## Acceptance Criteria',
    '- [ ] Root-visible AC.',
    '',
    '## Verification Commands',
    '- [ ] `node --test x.test.mjs` <!-- id=1 -->',
    '',
    '## Definition of Done',
    '- [ ] Root-visible DoD.',
    '',
    '## AITM Progress Markers',
    '<!-- aitm-deep-dive-complete ts="2026-06-05T00:00:00Z" -->',
    '',
  ].join('\n');
  const revised = 'Revised above-floor prose that must stay inside the collapsed wrapper.';
  const { fn, log } = fakeMutateFactory(seeded);

  await ensureDeepDive({
    issueNumber: 1045,
    repo: 'fake/repo',
    prose: revised,
    ts: TS,
    deps: { mutateIssueBody: fn },
  });

  assert.equal((log.next.match(/^<\/details>$/gm) || []).length, 1, 'closing details tag survives');
  assert.ok(log.next.indexOf('</details>') < log.next.indexOf('## Acceptance Criteria'));
  assert.ok(!log.next.includes('stale below-floor prose'));
  assert.ok(log.next.includes(revised));
  assert.deepEqual(validateBodySections({ body: log.next }).failures, []);

  const { fn: fn2, log: log2 } = fakeMutateFactory(log.next);
  const second = await ensureDeepDive({
    issueNumber: 1045,
    repo: 'fake/repo',
    prose: revised,
    ts: TS,
    deps: { mutateIssueBody: fn2 },
  });
  assert.equal(second.status, 'no-op');
  assert.equal(log2.next, log2.base);
}

console.log('ensure-deep-dive-replace.test.mjs — all assertions passed');
