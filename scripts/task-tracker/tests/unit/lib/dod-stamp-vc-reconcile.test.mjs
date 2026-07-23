#!/usr/bin/env node
// @story #902
// #902 — `verbs/dod-stamp.mjs` stamps a Functional DoD item's evidence marker but,
// before this fix, never reconciled the *cited* command into `## Verification
// Commands`. review-preflight's #231 invariant (auditEvidenceMarkers) refuses
// Test→Review when an evidence command is absent from that list, so ticking such a
// DoD item stranded an orphan. The fix routes the verb's mutate through
// `stampEvidenceAndReconcile` (the sibling of ac-stamp's
// `stampAcEvidenceAndReconcile`). These cases exercise that shared helper directly
// — the exact function the verb calls — and assert against the real invariant,
// including the legacy body with NO Verification Commands section (which the first
// implementation, via `appendVcCommands`, threw on).

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { parseVerificationCommands } from '../../../lib/verification-commands.mjs';
import { auditEvidenceMarkers } from '../../../lib/evidence-markers.mjs';
import { stampEvidenceAndReconcile } from '../../../lib/functional-dod-evidence.mjs';

// `cmd` is the canonical (first) executed command; the real verb passes
// `ran[0].cmd`. stampEvidenceMarker requires it even when the DoD line already
// carries a `cmd=` declaration (it is only written when no declaration exists).
const evidenceFor = (cmd) => ({ cmd, sha: '0ab12cd', ts: '2026-07-20T00:00:00.000Z', exit: 0 });

// A body whose Verification Commands list holds ONLY the AC's verifier (vc:1),
// while two Functional DoD items cite commands that are NOT yet listed — the exact
// #231-orphan shape a fresh dod-stamp would tick.
function bodyWithVcSection() {
  return [
    '## Acceptance Criteria',
    '',
    '- [x] behavior holds <!-- aitm-verified vc-list="vc:1" -->',
    '',
    '## Verification Commands',
    '',
    '- [ ] `node --test a.test.mjs` <!-- id=1 -->',
    '',
    '## Definition of Done',
    '',
    '### Functional (verified at Test)',
    '',
    '- [ ] Lint and format checks pass <!-- dod:functional:lint --> <!-- aitm-verified cmd="`npm run lint` `npm run format:check`" -->',
    '- [ ] All changes committed <!-- dod:functional:commits --> <!-- aitm-verified cmd="`git log --oneline -1`" -->',
    '',
  ].join('\n');
}

// The legacy shape that broke the first implementation: no `## Verification
// Commands` section at all. `appendVcCommands` threw here; `insertVerificationCommands`
// (which the fix uses) must create the section.
function bodyWithNoVcSection() {
  return [
    '## Definition of Done',
    '',
    '### Functional (verified at Test)',
    '',
    '- [ ] All changes committed <!-- dod:functional:commits --> <!-- aitm-verified cmd="`git log --oneline -1`" -->',
    '',
  ].join('\n');
}

const listed = (b) => parseVerificationCommands(b).map((it) => it.command);
const count = (b, cmd) => listed(b).filter((c) => c === cmd).length;

test('#902 baseline: DoD-cited commands absent from VC are #231 orphans', () => {
  const audit = auditEvidenceMarkers(bodyWithVcSection());
  assert.deepEqual(
    audit.missingVerificationCommands.slice().sort(),
    ['git log --oneline -1', 'npm run format:check', 'npm run lint'].sort(),
    'all three DoD-cited commands start as orphans'
  );
});

test('#902 AC1: stamping a single-command key reconciles it into Verification Commands', () => {
  const next = stampEvidenceAndReconcile(
    bodyWithVcSection(),
    'commits',
    evidenceFor('git log --oneline -1'),
    ['git log --oneline -1']
  );
  assert.ok(listed(next).includes('git log --oneline -1'), 'the commits command is now listed');
  assert.ok(
    !auditEvidenceMarkers(next).missingVerificationCommands.includes('git log --oneline -1'),
    'the commits command is no longer a #231 orphan'
  );
});

test('#902 AC2: a multi-command key reconciles every cited command', () => {
  const next = stampEvidenceAndReconcile(bodyWithVcSection(), 'lint', evidenceFor('npm run lint'), [
    'npm run lint',
    'npm run format:check',
  ]);
  assert.ok(listed(next).includes('npm run lint'), 'lint command listed');
  assert.ok(listed(next).includes('npm run format:check'), 'format:check command listed');
  const missing = auditEvidenceMarkers(next).missingVerificationCommands;
  assert.ok(!missing.includes('npm run lint') && !missing.includes('npm run format:check'));
});

test('#902 AC3: after stamping lint + commits, review-preflight finds no orphan', () => {
  let body = bodyWithVcSection();
  body = stampEvidenceAndReconcile(body, 'lint', evidenceFor('npm run lint'), [
    'npm run lint',
    'npm run format:check',
  ]);
  body = stampEvidenceAndReconcile(body, 'commits', evidenceFor('git log --oneline -1'), [
    'git log --oneline -1',
  ]);
  assert.deepEqual(
    auditEvidenceMarkers(body).missingVerificationCommands,
    [],
    'no evidence command is missing from Verification Commands'
  );
});

test('#902 AC4: reconciliation is idempotent — re-stamping does not duplicate the VC entry', () => {
  const once = stampEvidenceAndReconcile(bodyWithVcSection(), 'lint', evidenceFor('npm run lint'), [
    'npm run lint',
    'npm run format:check',
  ]);
  const twice = stampEvidenceAndReconcile(once, 'lint', evidenceFor('npm run lint'), [
    'npm run lint',
    'npm run format:check',
  ]);
  assert.equal(count(twice, 'npm run lint'), 1, 'lint listed exactly once after re-stamp');
  assert.equal(count(twice, 'npm run format:check'), 1, 'format:check listed exactly once');
  assert.equal(
    listed(twice).length,
    listed(once).length,
    'no net VC lines added on the idempotent re-run'
  );
});

// The regression the sandbox caught: the first implementation used
// `appendVcCommands`, which THROWS when the body has no `## Verification Commands`
// section. The fix must create the section instead.
test('#902 AC5: a body with no Verification Commands section gets one created, not a throw', () => {
  const next = stampEvidenceAndReconcile(
    bodyWithNoVcSection(),
    'commits',
    evidenceFor('git log --oneline -1'),
    ['git log --oneline -1']
  );
  assert.match(
    next,
    /#{2,3}\s+Verification Commands/,
    'a Verification Commands section now exists'
  );
  assert.ok(listed(next).includes('git log --oneline -1'), 'the cited command is listed in it');
  assert.deepEqual(
    auditEvidenceMarkers(next).missingVerificationCommands,
    [],
    'no #231 orphan remains'
  );
});
