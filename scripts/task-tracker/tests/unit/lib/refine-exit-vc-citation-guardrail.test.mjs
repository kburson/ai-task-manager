#!/usr/bin/env node
// @story #773
// @story #804
// Unit tests for the VC-citation id-scheme Refine→Plan exit guardrail
// (`findAcsWithLegacyVerificationForm` wired into `gateRefineToPlan`). The
// guardrail forbids the three legacy AC verification forms so new work binds
// its Acceptance-Criteria markers through the `vc-list="vc:N"` id-citation form.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { gateRefineToPlan } from '../../../lib/refine-to-plan-gate.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };
const PICKUP = '## Pickup Directive — MANDATORY, DO NOT SKIP\n';

// A `## Verification Commands` block with three id-stamped entries; ids 1 and 2
// are cited by the pass-case ACs, id 3 stays an uncited orphan.
const VC_SECTION = [
  '## Verification Commands',
  '',
  '- [ ] `node --test a.test.mjs` <!-- id=1 -->',
  '- [ ] `node --test b.test.mjs` <!-- id=2 -->',
  '- [ ] `node --test orphan.test.mjs` <!-- id=3 -->',
  '',
].join('\n');

function bodyWithAcs(acLines) {
  return [PICKUP, '', '## Acceptance Criteria', '', ...acLines, '', VC_SECTION].join('\n');
}

function makeDeps(acLines) {
  return {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({ rank: 1, startTime: '2026-07-10 10:00 -07' }),
    fetchLabels: async () => ['vc-scheme'],
    fetchBody: async () => bodyWithAcs(acLines),
  };
}

test('reject: backtick-embedded `cmd` literal command → refine-exit-vc-citation', async () => {
  const deps = makeDeps(['- [ ] AC one. <!-- aitm-verified cmd="`node --test a.test.mjs`" -->']);
  const r = await gateRefineToPlan({ cfg, issueNumber: 773, deps });
  assert.equal(r.ok, false);
  const b = r.blockers.find((x) => /refine-exit-vc-citation/.test(x));
  assert.ok(b, 'a refine-exit-vc-citation blocker is raised');
  assert.ok(/literal `cmd/.test(b), 'message names the literal cmd form');
});

test('reject: interim ordinal `cmd="vc:N"` citation → refine-exit-vc-citation', async () => {
  const deps = makeDeps(['- [ ] AC two. <!-- aitm-verified cmd="vc:1" -->']);
  const r = await gateRefineToPlan({ cfg, issueNumber: 773, deps });
  assert.equal(r.ok, false);
  const b = r.blockers.find((x) => /refine-exit-vc-citation/.test(x));
  assert.ok(b, 'a refine-exit-vc-citation blocker is raised');
  assert.ok(/deprecated `cmd` attribute/.test(b), 'message names the deprecated cmd attribute');
  // #804 — with the ordinal `cmd="vc:N"` resolution fallback RETIRED, `cmd="vc:1"`
  // no longer resolves to any command, so the demonstrable gate now ALSO flags it
  // as `no-verifier`. The ordinal citation is doubly-invalid: forbidden form AND
  // non-demonstrable. (Pre-#804 it resolved via the fallback and only the
  // citation-form blocker fired.)
  assert.ok(
    r.blockers.some((x) => /refine-exit-demonstrable/.test(x)),
    'ordinal cmd citation no longer resolves post-#804, so the demonstrable gate also fires'
  );
});

test('reject: dangling `vc-list` citation naming a missing id → refine-exit-vc-citation', async () => {
  const deps = makeDeps(['- [ ] AC three. <!-- aitm-verified vc-list="vc:9" -->']);
  const r = await gateRefineToPlan({ cfg, issueNumber: 773, deps });
  assert.equal(r.ok, false);
  const b = r.blockers.find((x) => /refine-exit-vc-citation/.test(x));
  assert.ok(b, 'a refine-exit-vc-citation blocker is raised');
  assert.ok(/no matching/.test(b), 'message explains the id does not exist');
});

test('pass: every AC cites existing ids via `vc-list`; an uncited VC entry does not block', async () => {
  const deps = makeDeps([
    '- [ ] AC one. <!-- aitm-verified vc-list="vc:1" -->',
    '- [ ] AC two. <!-- aitm-verified vc-list="vc:2" -->',
  ]);
  const r = await gateRefineToPlan({ cfg, issueNumber: 773, deps });
  assert.equal(r.ok, true, JSON.stringify(r.blockers));
  assert.deepEqual(r.blockers, []);
});

test('multi-id `vc-list` citation resolves and passes', async () => {
  const deps = makeDeps(['- [ ] AC. <!-- aitm-verified vc-list="vc:1 vc:2" -->']);
  const r = await gateRefineToPlan({ cfg, issueNumber: 773, deps });
  assert.equal(r.ok, true, JSON.stringify(r.blockers));
  assert.ok(!r.blockers.some((x) => /refine-exit-vc-citation/.test(x)));
});

test('reject: empty `vc-list=""` on a verified AC → refine-exit-vc-citation (#804 no silent green)', async () => {
  const deps = makeDeps(['- [ ] AC empty. <!-- aitm-verified vc-list="" -->']);
  const r = await gateRefineToPlan({ cfg, issueNumber: 804, deps });
  assert.equal(r.ok, false);
  const b = r.blockers.find((x) => /refine-exit-vc-citation/.test(x));
  assert.ok(b, 'an empty vc-list raises a refine-exit-vc-citation blocker');
  assert.ok(/present but empty/.test(b), 'message names the empty-vc-list case');
});

test('reject: verified marker with no citation attribute → refine-exit-vc-citation (#804 missing)', async () => {
  const deps = makeDeps(['- [ ] AC bare. <!-- aitm-verified sha=abc123 exit=0 -->']);
  const r = await gateRefineToPlan({ cfg, issueNumber: 804, deps });
  assert.equal(r.ok, false);
  const b = r.blockers.find((x) => /refine-exit-vc-citation/.test(x));
  assert.ok(b, 'a citation-less verified marker raises a refine-exit-vc-citation blocker');
  assert.ok(/no `vc-list` citation/.test(b), 'message names the missing-vc-list case');
});

test('guardrail is scoped to the AC section — a `## Verification Commands` entry is never flagged', async () => {
  // The VC entries themselves carry backtick commands; they must not be read as
  // legacy AC markers.
  const deps = makeDeps(['- [ ] AC. <!-- aitm-verified vc-list="vc:1" -->']);
  const r = await gateRefineToPlan({ cfg, issueNumber: 773, deps });
  assert.ok(!r.blockers.some((x) => /refine-exit-vc-citation/.test(x)));
});
