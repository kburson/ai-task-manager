#!/usr/bin/env node
// @story #523
// Gate-wiring tests: the Refine→Plan exit gate must refuse promotion when any
// Acceptance-Criteria line is non-demonstrable, emitting one
// `refine-exit-demonstrable:` BLOCKED line per offending AC. Honestly-tagged
// `invalid — non-demonstrable` ACs pass; `npm run test:all` does not satisfy
// the verifier requirement.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { gateRefineToPlan } from '../../../lib/refine-to-plan-gate.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function makeDeps({ body = '' } = {}) {
  return {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({
      rank: 1,
      startTime: '2026-06-23 10:00 -07',
    }),
    fetchLabels: async () => ['reliability'],
    fetchBody: async () => body,
  };
}

test('AC lacking a verifier blocks Refine→Plan with one refine-exit-demonstrable line', async () => {
  const deps = makeDeps({
    body: `## Acceptance Criteria

- [ ] An assertion with no verifier and no tag
`,
  });
  const r = await gateRefineToPlan({ cfg, issueNumber: 523, deps });
  assert.equal(r.ok, false);
  const dem = r.blockers.filter((b) => /^refine-exit-demonstrable:/.test(b));
  assert.equal(dem.length, 1);
});

test('one BLOCKED line per offending AC', async () => {
  const deps = makeDeps({
    body: `## Acceptance Criteria

- [ ] First gap
- [ ] Good <!-- aitm-verified cmd="\`node --test ok.test.mjs\`" -->
- [ ] Second gap
`,
  });
  const r = await gateRefineToPlan({ cfg, issueNumber: 523, deps });
  const dem = r.blockers.filter((b) => /^refine-exit-demonstrable:/.test(b));
  assert.equal(dem.length, 2);
});

test('AC tagged invalid — non-demonstrable passes the demonstrable check', async () => {
  const deps = makeDeps({
    body: `## Acceptance Criteria

- [ ] Subjective goal — invalid — non-demonstrable
- [ ] Concrete <!-- aitm-verified cmd="\`node --test x.test.mjs\`" -->
`,
  });
  const r = await gateRefineToPlan({ cfg, issueNumber: 523, deps });
  assert.ok(!r.blockers.some((b) => /^refine-exit-demonstrable:/.test(b)));
});

test('npm run test:all as the sole verifier is rejected as non-demonstrable', async () => {
  const deps = makeDeps({
    body: `## Acceptance Criteria

- [ ] Floor masquerade <!-- aitm-verified cmd="\`npm run test:all\`" -->
`,
  });
  const r = await gateRefineToPlan({ cfg, issueNumber: 523, deps });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /^refine-exit-demonstrable:/.test(b) && /test:all/.test(b)));
});
