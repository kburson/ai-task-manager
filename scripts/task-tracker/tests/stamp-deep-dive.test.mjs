#!/usr/bin/env node
// #294 — unit tests for `stampDeepDive` (lib/deep-dive.mjs). Validates the
// posted-marker write, appendix placement after the Pickup Directive block,
// idempotence, and the planDeepDiveGate round-trip.
//
// Hermetic: injects a fake `mutateIssueBody` via `deps.mutateIssueBody` to
// avoid touching the GH remote. The fake captures the (base) → next mutation
// so each case can assert on the resulting body shape.
import { strict as assert } from 'node:assert';
import {
  buildDeepDiveBlock,
  DeepDiveSectionMissingError,
  findInsertOffset,
  insertDeepDiveBlock,
  stampDeepDive,
  stampDeepDivePostedOnly,
} from '../lib/deep-dive.mjs';
import { planDeepDiveGate } from '../lib/deep-dive-gate.mjs';

const TS = '2026-06-05T05:30:00.000Z';
const APPENDIX = 'Here is the deep dive prose.\n\n### Current state\n\nproblem.';

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

const BODY_WITH_DIRECTIVE = [
  '## Scope',
  'do thing',
  '',
  '## Pickup Directive — MANDATORY, DO NOT SKIP',
  '> Follow: `.ai-task-manager/pickup-directive.md`',
  '',
  '---',
  '',
  '<!-- aitm-entered-plan: 2026-06-05T05:00:00Z -->',
  '',
  '<!-- aitm-fields: {"schema":1,"values":{}} -->',
  '',
  '<!-- aitm-body-version: 4 -->',
  '',
].join('\n');

const BODY_NO_DIRECTIVE = [
  '## Scope',
  'do thing',
  '',
  '<!-- aitm-fields: {"schema":1,"values":{}} -->',
  '',
  '<!-- aitm-body-version: 1 -->',
  '',
].join('\n');

// buildDeepDiveBlock — shape + marker
{
  const block = buildDeepDiveBlock({ ts: TS, appendix: APPENDIX });
  assert.ok(block.includes(`<!-- aitm-deep-dive-posted: ${TS} -->`), 'marker present');
  assert.ok(block.includes('## Deep-Dive Analysis (2026-06-05)'), 'H2 with date');
  assert.ok(block.includes('Here is the deep dive prose.'), 'appendix prose present');
  // marker must appear above heading
  const mi = block.indexOf('aitm-deep-dive-posted');
  const hi = block.indexOf('## Deep-Dive Analysis');
  assert.ok(mi < hi && mi !== -1, 'marker above heading');
}

// buildDeepDiveBlock — arg validation
{
  assert.throws(() => buildDeepDiveBlock({ appendix: 'x' }), /ts is required/);
  assert.throws(() => buildDeepDiveBlock({ ts: TS }), /appendix must be a non-empty string/);
  assert.throws(
    () => buildDeepDiveBlock({ ts: TS, appendix: '' }),
    /appendix must be a non-empty string/
  );
}

// findInsertOffset — Pickup Directive present → after `---` separator
{
  const off = findInsertOffset(BODY_WITH_DIRECTIVE);
  const after = BODY_WITH_DIRECTIVE.slice(off);
  assert.ok(after.includes('aitm-entered-plan'), 'insertion point precedes entered-plan marker');
  const before = BODY_WITH_DIRECTIVE.slice(0, off);
  assert.ok(before.includes('---'), 'insertion point is after the --- separator');
}

// findInsertOffset — no Pickup Directive → before aitm-fields trailer
{
  const off = findInsertOffset(BODY_NO_DIRECTIVE);
  const after = BODY_NO_DIRECTIVE.slice(off);
  assert.ok(after.startsWith('<!-- aitm-fields:'), 'insertion just before fields trailer');
}

// insertDeepDiveBlock — splice preserves both sides
{
  const block = buildDeepDiveBlock({ ts: TS, appendix: APPENDIX });
  const next = insertDeepDiveBlock(BODY_WITH_DIRECTIVE, block);
  assert.ok(next.includes('## Scope'), 'pre-pickup content preserved');
  assert.ok(next.includes('aitm-entered-plan'), 'post-pickup markers preserved');
  assert.ok(next.includes('aitm-fields'), 'fields trailer preserved');
  assert.ok(next.includes('## Deep-Dive Analysis'), 'block injected');
  // Order: pickup heading < section heading < entered-plan marker
  const ip = next.indexOf('Pickup Directive');
  const id = next.indexOf('## Deep-Dive Analysis');
  const ie = next.indexOf('aitm-entered-plan');
  assert.ok(ip < id && id < ie, `order pickup<deepdive<entered-plan; got ${ip},${id},${ie}`);
}

// stampDeepDive — first stamp on a body without markers → status 'ok'
{
  const { fn, log } = fakeMutateFactory(BODY_WITH_DIRECTIVE);
  const res = await stampDeepDive({
    issueNumber: 999,
    repo: 'fake/repo',
    appendix: APPENDIX,
    ts: TS,
    deps: { mutateIssueBody: fn },
  });
  assert.equal(res.status, 'ok');
  assert.equal(log.calls, 1);
  assert.equal(log.opts.issueNumber, 999);
  assert.equal(log.opts.repo, 'fake/repo');
  assert.ok(log.next.includes(`<!-- aitm-deep-dive-posted: ${TS} -->`));
  assert.ok(log.next.includes('## Deep-Dive Analysis (2026-06-05)'));
}

// stampDeepDive — re-stamp on a body that already has the posted marker → no-op
{
  const seeded = BODY_WITH_DIRECTIVE + '\n\n<!-- aitm-deep-dive-posted: 2026-06-04T00:00:00Z -->\n';
  const { fn, log } = fakeMutateFactory(seeded);
  const res = await stampDeepDive({
    issueNumber: 999,
    repo: 'fake/repo',
    appendix: APPENDIX,
    ts: TS,
    deps: { mutateIssueBody: fn },
  });
  assert.equal(res.status, 'no-op');
  assert.equal(log.next, log.base, 'byte-identical');
}

// stampDeepDive — round-trip through planDeepDiveGate clears posted+section blockers
{
  const { fn, log } = fakeMutateFactory(BODY_WITH_DIRECTIVE);
  await stampDeepDive({
    issueNumber: 999,
    repo: 'fake/repo',
    appendix: APPENDIX,
    ts: TS,
    deps: { mutateIssueBody: fn },
  });
  const gate = planDeepDiveGate({ body: log.next });
  // The complete marker is still owned by `/task check`, so it remains a blocker.
  assert.equal(gate.ok, false);
  assert.equal(gate.blockers.length, 1, JSON.stringify(gate.blockers));
  assert.ok(
    gate.blockers[0].startsWith('plan-develop-deep-dive-complete-marker-missing'),
    `only complete-marker blocker should remain: ${JSON.stringify(gate.blockers)}`
  );
}

// stampDeepDive — placement when Pickup Directive heading is absent
{
  const { fn, log } = fakeMutateFactory(BODY_NO_DIRECTIVE);
  await stampDeepDive({
    issueNumber: 999,
    repo: 'fake/repo',
    appendix: APPENDIX,
    ts: TS,
    deps: { mutateIssueBody: fn },
  });
  const ifIdx = log.next.indexOf('## Deep-Dive Analysis');
  const ffIdx = log.next.indexOf('aitm-fields');
  assert.ok(ifIdx !== -1 && ifIdx < ffIdx, 'deep-dive before fields trailer');
}

// stampDeepDive — argument validation
{
  await assert.rejects(
    () => stampDeepDive({ repo: 'x', appendix: 'y' }),
    /issueNumber is required/
  );
  await assert.rejects(() => stampDeepDive({ issueNumber: 1, appendix: 'y' }), /repo is required/);
  await assert.rejects(
    () => stampDeepDive({ issueNumber: 1, repo: 'x' }),
    /appendix must be a non-empty string/
  );
  await assert.rejects(
    () => stampDeepDive({ issueNumber: 1, repo: 'x', appendix: 123 }),
    /appendix must be a non-empty string/
  );
}

// #324 — stampDeepDivePostedOnly: writes ONLY the posted marker above an
// existing `## Deep-Dive Analysis` heading.
const BODY_WITH_SECTION_NO_MARKER = [
  '## Scope',
  'do thing',
  '',
  '## Deep-Dive Analysis',
  '',
  'undated section authored at refine.',
  '',
  '<!-- aitm-fields: {"schema":1,"values":{}} -->',
  '',
].join('\n');

// stampDeepDivePostedOnly — section present, marker missing → inserts marker above heading
{
  const { fn, log } = fakeMutateFactory(BODY_WITH_SECTION_NO_MARKER);
  const res = await stampDeepDivePostedOnly({
    issueNumber: 999,
    repo: 'fake/repo',
    ts: TS,
    deps: { mutateIssueBody: fn },
  });
  assert.equal(res.status, 'ok');
  assert.ok(log.next.includes(`<!-- aitm-deep-dive-posted: ${TS} -->`), 'posted marker injected');
  // No dated heading authored
  assert.ok(!log.next.includes('Deep-Dive Analysis (2026'), 'no dated heading injected');
  // Only one `## Deep-Dive Analysis` heading present (no duplication)
  const headingMatches = log.next.match(/^##\s+Deep-Dive Analysis/gm) || [];
  assert.equal(headingMatches.length, 1, `single heading; got ${headingMatches.length}`);
  // Marker precedes heading
  const mi = log.next.indexOf('aitm-deep-dive-posted');
  const hi = log.next.indexOf('## Deep-Dive Analysis');
  assert.ok(mi !== -1 && mi < hi, 'marker above heading');
}

// stampDeepDivePostedOnly — diff is a single marker insertion
{
  const { fn, log } = fakeMutateFactory(BODY_WITH_SECTION_NO_MARKER);
  await stampDeepDivePostedOnly({
    issueNumber: 999,
    repo: 'fake/repo',
    ts: TS,
    deps: { mutateIssueBody: fn },
  });
  // Removing the inserted marker (plus the two trailing newlines) from `next`
  // must reproduce `base` byte-for-byte. Proves no other bytes changed.
  const insertion = `<!-- aitm-deep-dive-posted: ${TS} -->\n\n`;
  assert.ok(log.next.includes(insertion), 'insertion present');
  assert.equal(
    log.next.replace(insertion, ''),
    log.base,
    'removing the single insertion reproduces base'
  );
}

// stampDeepDivePostedOnly — idempotent: marker already present → no-op
{
  const seeded = BODY_WITH_SECTION_NO_MARKER.replace(
    '## Deep-Dive Analysis',
    `<!-- aitm-deep-dive-posted: 2026-06-04T00:00:00Z -->\n\n## Deep-Dive Analysis`
  );
  const { fn, log } = fakeMutateFactory(seeded);
  const res = await stampDeepDivePostedOnly({
    issueNumber: 999,
    repo: 'fake/repo',
    ts: TS,
    deps: { mutateIssueBody: fn },
  });
  assert.equal(res.status, 'no-op');
  assert.equal(log.next, log.base, 'byte-identical');
}

// stampDeepDivePostedOnly — refuses (throws) when body has no section
{
  const { fn } = fakeMutateFactory(BODY_NO_DIRECTIVE);
  await assert.rejects(
    () =>
      stampDeepDivePostedOnly({
        issueNumber: 999,
        repo: 'fake/repo',
        ts: TS,
        deps: { mutateIssueBody: fn },
      }),
    (err) =>
      err instanceof DeepDiveSectionMissingError &&
      /no `## Deep-Dive Analysis` heading/.test(err.message)
  );
}

// stampDeepDivePostedOnly — argument validation
{
  await assert.rejects(() => stampDeepDivePostedOnly({ repo: 'x' }), /issueNumber is required/);
  await assert.rejects(() => stampDeepDivePostedOnly({ issueNumber: 1 }), /repo is required/);
}

console.log('stamp-deep-dive.test.mjs — all assertions passed');
