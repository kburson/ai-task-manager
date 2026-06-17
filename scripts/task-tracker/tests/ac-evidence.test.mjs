#!/usr/bin/env node
// @story #345
// #345 — unit tests for the Acceptance Criteria evidence surface
// (`lib/ac-evidence.mjs`) and the generalized `gateEvidenceTick` in
// `verbs/check.mjs`.
//
// Coverage:
//   - acKeyForLabel: stable across stamping (strips aitm-verified-by AND
//     aitm-ac-evidence before hashing), deterministic, 8 hex chars.
//   - parseEvidenceAcs: only AC-section checkbox lines carrying aitm-verified-by;
//     reports checked state, commands, key, and any existing evidence marker.
//   - stampAcEvidenceMarker: append + idempotent replace; throws on no match.
//   - gateEvidenceTick: refuses unticked evidence-AC without stamp; passes once
//     stamped, once already ticked, and leaves the Functional DoD path intact.

import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  acKeyForLabel,
  parseEvidenceAcs,
  parseAcEvidence,
  findEvidenceAc,
  stampAcEvidenceMarker,
  stampAcEvidenceAndReconcile,
} from '../lib/ac-evidence.mjs';
import { auditEvidenceMarkers } from '../lib/evidence-markers.mjs';
import { gateEvidenceTick } from '../verbs/check.mjs';

const AC_BODY = [
  '## Acceptance Criteria',
  '',
  '- [ ] check.mjs refuses to tick verified lines <!-- aitm-verified-by: `npm test` -->',
  '- [ ] An ac-stamp capability runs the verifier <!-- aitm-verified-by: `npm run lint` -->',
  '- [ ] A plain criterion with no verifier',
  '',
  '## Definition of Done',
  '',
].join('\n');

test('acKeyForLabel is 8 hex chars and deterministic', () => {
  const k = acKeyForLabel('check.mjs refuses to tick verified lines');
  assert.match(k, /^[0-9a-f]{8}$/);
  assert.equal(k, acKeyForLabel('check.mjs refuses to tick verified lines'));
});

test('acKeyForLabel strips aitm-verified-by and aitm-ac-evidence before hashing', () => {
  const bare = acKeyForLabel('All tests pass');
  const withVerify = acKeyForLabel('All tests pass <!-- aitm-verified-by: `npm test` -->');
  const withStamp = acKeyForLabel(
    'All tests pass <!-- aitm-verified-by: `npm test` --> <!-- aitm-ac-evidence:deadbeef cmd="npm test" exit=0 sha=abc ts=2026-01-01T00:00:00Z -->'
  );
  assert.equal(withVerify, bare);
  assert.equal(withStamp, bare);
});

test('parseEvidenceAcs returns only verified AC lines with commands + key', () => {
  const acs = parseEvidenceAcs(AC_BODY);
  assert.equal(acs.length, 2);
  assert.equal(acs[0].label, 'check.mjs refuses to tick verified lines');
  assert.deepEqual(acs[0].evidenceCommands, ['npm test']);
  assert.equal(acs[0].checked, false);
  assert.equal(acs[0].evidenceMarker, null);
  assert.equal(acs[0].key, acKeyForLabel(acs[0].label));
  assert.deepEqual(acs[1].evidenceCommands, ['npm run lint']);
});

test('parseEvidenceAcs ignores plain criteria with no aitm-verified-by', () => {
  const labels = parseEvidenceAcs(AC_BODY).map((a) => a.label);
  assert.ok(!labels.includes('A plain criterion with no verifier'));
});

// #391 — after the #369 corpus migration a verifier declaration becomes the
// consolidated `aitm-verified cmd="..."` form. The evidence reader must still
// recognize that AC as evidence-gated (extract the cmd, surface a key) so
// findEvidenceAc/gateEvidenceTick keep gating it exactly as the pre-migration
// `aitm-verified-by` form.
test('parseEvidenceAcs recognizes a migrated consolidated aitm-verified declaration (#391)', () => {
  const body = [
    '## Acceptance Criteria',
    '',
    '- [ ] migrated AC declares a verifier <!-- aitm-verified cmd="`npm test`" -->',
    '',
    '## Definition of Done',
    '',
  ].join('\n');
  const acs = parseEvidenceAcs(body);
  assert.equal(acs.length, 1);
  assert.equal(acs[0].label, 'migrated AC declares a verifier');
  assert.deepEqual(acs[0].evidenceCommands, ['npm test']);
  const found = findEvidenceAc(body, 'migrated AC declares a verifier');
  assert.ok(found, 'findEvidenceAc locates the migrated declaration');
  const r = gateEvidenceTick(body, 'migrated AC declares a verifier');
  assert.equal(r.kind, 'refuse-ac-evidence', 'unstamped migrated AC is still gated');
});

// #391 no-regression — a consolidated `aitm-verified` carrying a record-of-run
// key (a PROOF stamp, not a declaration) must NOT be treated as a verifier
// declaration by the evidence reader; only cmd-only declarations gate.
test('parseEvidenceAcs ignores a consolidated aitm-verified PROOF stamp (#391)', () => {
  const body = [
    '## Acceptance Criteria',
    '',
    '- [ ] proof-stamped line <!-- aitm-verified cmd="`npm test`" sha="abc1234" ts="2026-06-12T00:00:00Z" -->',
    '',
    '## Definition of Done',
    '',
  ].join('\n');
  assert.equal(parseEvidenceAcs(body).length, 0);
});

test('stampAcEvidenceMarker appends then idempotently replaces', () => {
  const label = 'check.mjs refuses to tick verified lines';
  const ev = { cmd: 'npm test', sha: 'abc1234', ts: '2026-06-10T00:00:00.000Z', exit: 0 };
  const once = stampAcEvidenceMarker(AC_BODY, label, ev);
  const parsedAc = findEvidenceAc(once, label);
  assert.ok(parsedAc.evidenceMarker, 'marker present after stamp');
  assert.equal(parsedAc.evidenceMarker.key, acKeyForLabel(label));
  assert.equal(parsedAc.evidenceMarker.exit, 0);

  // Re-stamp with a new sha → replaces in place, does not duplicate.
  const twice = stampAcEvidenceMarker(once, label, { ...ev, sha: 'def5678' });
  // `\b` matches BOTH the legacy `aitm-ac-evidence:` and the new
  // `aitm-ac-evidence key="..."` grammars so the count is form-agnostic.
  const markers = [...twice.matchAll(/aitm-ac-evidence\b/g)];
  // one per stamped line — only the first AC stamped here
  assert.equal(markers.length, 1);
  assert.equal(findEvidenceAc(twice, label).evidenceMarker.sha, 'def5678');
});

// #379 — writer emits the new fully-quoted property grammar, with the key
// folded into a `key="..."` property and every value double-quoted.
test('stampAcEvidenceMarker serializes the new fully-quoted property form (#379)', () => {
  const label = 'check.mjs refuses to tick verified lines';
  const body = stampAcEvidenceMarker(AC_BODY, label, {
    cmd: 'npm test',
    sha: 'abc1234',
    ts: '2026-06-10T00:00:00.000Z',
    exit: 0,
  });
  const line = body.split('\n').find((l) => l.includes(label));
  const key = acKeyForLabel(label);
  assert.match(
    line,
    new RegExp(
      `<!-- aitm-ac-evidence key="${key}" cmd="npm test" exit="0" sha="abc1234" ts="2026-06-10T00:00:00.000Z" -->`
    )
  );
  // No legacy half-quoted colon form is emitted.
  assert.ok(!/aitm-ac-evidence:/.test(line), 'no legacy colon form emitted');
});

// #379 — parser reads BOTH the new fully-quoted form and the legacy
// half-quoted colon form (back-compat until the #369 corpus sweep).
test('parseAcEvidence reads the new fully-quoted form (#379)', () => {
  const m = parseAcEvidence(
    'foo <!-- aitm-ac-evidence key="abcd1234" cmd="npm test" exit="0" sha="abc1234" ts="2026-06-10T00:00:00.000Z" -->'
  );
  assert.equal(m.key, 'abcd1234');
  assert.equal(m.cmd, 'npm test');
  assert.equal(m.exit, 0);
  assert.equal(m.sha, 'abc1234');
  assert.equal(m.ts, '2026-06-10T00:00:00.000Z');
});

test('parseAcEvidence still reads the legacy half-quoted colon form (#379 back-compat)', () => {
  const m = parseAcEvidence(
    'foo <!-- aitm-ac-evidence:abcd1234 cmd="npm run lint" exit=1 sha=deadbeef ts=2026-06-10T00:00:00.000Z -->'
  );
  assert.equal(m.key, 'abcd1234');
  assert.equal(m.cmd, 'npm run lint');
  assert.equal(m.exit, 1);
  assert.equal(m.sha, 'deadbeef');
});

// #379 — a cmd carrying an embedded double-quote round-trips through
// serialize (`"` → `&quot;`) and parse (`&quot;` → `"`).
test('stampAcEvidenceMarker round-trips an embedded double-quote in cmd (#379)', () => {
  const label = 'check.mjs refuses to tick verified lines';
  const cmd = 'grep "needle" file';
  const body = stampAcEvidenceMarker(AC_BODY, label, {
    cmd,
    sha: 'abc1234',
    ts: '2026-06-10T00:00:00.000Z',
    exit: 0,
  });
  const line = body.split('\n').find((l) => l.includes(label));
  // Serialized form escapes the quote as &quot; (no raw `"` inside the value).
  assert.match(line, /cmd="grep &quot;needle&quot; file"/);
  // And it parses back to the original cmd.
  assert.equal(parseAcEvidence(line).cmd, cmd);
});

// #379 — re-stamping a line that already carries a LEGACY-form marker replaces
// it in place with the new form (no duplication, idempotent across grammars).
test('stampAcEvidenceMarker replaces a legacy-form marker in place (#379)', () => {
  const label = 'check.mjs refuses to tick verified lines';
  const key = acKeyForLabel(label);
  const seeded = AC_BODY.replace(
    `- [ ] ${label} <!-- aitm-verified-by: \`npm test\` -->`,
    `- [ ] ${label} <!-- aitm-verified-by: \`npm test\` --> <!-- aitm-ac-evidence:${key} cmd="npm test" exit=0 sha=old1234 ts=2026-06-09T00:00:00.000Z -->`
  );
  const restamped = stampAcEvidenceMarker(seeded, label, {
    cmd: 'npm test',
    sha: 'new5678',
    ts: '2026-06-10T00:00:00.000Z',
    exit: 0,
  });
  const line = restamped.split('\n').find((l) => l.includes(label));
  // Exactly one ac-evidence marker remains, now in the new form, new sha.
  assert.equal([...line.matchAll(/aitm-ac-evidence\b/g)].length, 1);
  assert.ok(!/aitm-ac-evidence:/.test(line), 'legacy form replaced, not retained');
  assert.equal(parseAcEvidence(line).sha, 'new5678');
});

test('stampAcEvidenceMarker throws when label has no evidence-bearing AC', () => {
  assert.throws(
    () =>
      stampAcEvidenceMarker(AC_BODY, 'A plain criterion with no verifier', {
        cmd: 'x',
        sha: 'y',
        ts: 'z',
        exit: 0,
      }),
    /no evidence-bearing AC line/
  );
});

test('parseAcEvidence reads back a stamped marker', () => {
  const m = parseAcEvidence(
    'foo <!-- aitm-ac-evidence:abcd1234 cmd="npm test" exit=0 sha=abc1234 ts=2026-06-10T00:00:00.000Z -->'
  );
  assert.equal(m.key, 'abcd1234');
  assert.equal(m.cmd, 'npm test');
  assert.equal(m.exit, 0);
  assert.equal(m.sha, 'abc1234');
});

test('gateEvidenceTick refuses unticked verified AC with no stamp', () => {
  const r = gateEvidenceTick(AC_BODY, 'check.mjs refuses to tick verified lines');
  assert.equal(r.kind, 'refuse-ac-evidence');
  assert.equal(r.key, acKeyForLabel('check.mjs refuses to tick verified lines'));
  assert.deepEqual(r.commands, ['npm test']);
});

test('gateEvidenceTick passes once the AC is stamped', () => {
  const stamped = stampAcEvidenceMarker(AC_BODY, 'check.mjs refuses to tick verified lines', {
    cmd: 'npm test',
    sha: 'abc',
    ts: '2026-06-10T00:00:00.000Z',
    exit: 0,
  });
  const r = gateEvidenceTick(stamped, 'check.mjs refuses to tick verified lines');
  assert.equal(r.kind, 'pass');
});

test('gateEvidenceTick passes an already-ticked verified AC (unticking allowed)', () => {
  const ticked = AC_BODY.replace(
    '- [ ] check.mjs refuses to tick verified lines',
    '- [x] check.mjs refuses to tick verified lines'
  );
  const r = gateEvidenceTick(ticked, 'check.mjs refuses to tick verified lines');
  assert.equal(r.kind, 'pass');
});

test('gateEvidenceTick passes a plain AC with no verifier', () => {
  const r = gateEvidenceTick(AC_BODY, 'A plain criterion with no verifier');
  assert.equal(r.kind, 'pass');
});

test('gateEvidenceTick leaves the Functional DoD path intact (regression)', () => {
  const dodBody = [
    '## Definition of Done',
    '',
    '#### Functional (verified at Test)',
    '',
    '- [ ] All automated tests pass <!-- aitm-verified-by: `npm test` --> <!-- dod:functional:tests -->',
    '',
  ].join('\n');
  const r = gateEvidenceTick(dodBody, 'All automated tests pass');
  assert.equal(r.kind, 'refuse-missing-evidence');
  assert.equal(r.key, 'tests');
});

// #443 — an AC declaring a non-standard verifier that is NOT mirrored into
// `## Verification Commands` triggers the exact `review-preflight` refusal that
// blocked #429: `auditEvidenceMarkers(body).missingVerificationCommands` is
// non-empty even after `ac-stamp` records the inline evidence proof marker.
const SPIKE_BODY = [
  '## Acceptance Criteria',
  '',
  '- [ ] spike probe passes <!-- aitm-verified-by: `grep -qF needle file` -->',
  '',
  '## Definition of Done',
  '',
  '## Verification Commands',
  '',
  '## Pickup Directive',
  '',
].join('\n');

test('#443 reproduces the #429 refusal — non-standard AC command missing from Verification Commands', () => {
  // Pre-fix behavior: stamping only the inline marker leaves the command
  // unlisted, so the audit still reports it missing → preflight refuses.
  const stamped = stampAcEvidenceMarker(SPIKE_BODY, 'spike probe passes', {
    cmd: 'grep -qF needle file',
    sha: 'abc1234',
    ts: '2026-06-16T00:00:00.000Z',
    exit: 0,
  });
  const audit = auditEvidenceMarkers(stamped);
  assert.deepEqual(audit.missingVerificationCommands, ['grep -qF needle file']);
  assert.equal(audit.ok, false);
});

test('#443 stampAcEvidenceAndReconcile clears the refusal and keeps the AC marker', () => {
  const out = stampAcEvidenceAndReconcile(SPIKE_BODY, 'spike probe passes', {
    cmd: 'grep -qF needle file',
    sha: 'abc1234',
    ts: '2026-06-16T00:00:00.000Z',
    exit: 0,
  });
  // The inline evidence proof marker is present…
  const ac = findEvidenceAc(out, 'spike probe passes');
  assert.ok(ac.evidenceMarker, 'AC evidence marker stamped');
  assert.equal(ac.evidenceMarker.cmd, 'grep -qF needle file');
  // …and the declared command is now reconciled into Verification Commands, so
  // the audit passes and preflight would no longer refuse.
  const audit = auditEvidenceMarkers(out);
  assert.deepEqual(audit.missingVerificationCommands, []);
  assert.ok(out.includes('- [ ] `grep -qF needle file`'), 'command listed under VC');
});

test('#443 stampAcEvidenceAndReconcile is idempotent — no duplicate VC entry on re-run', () => {
  const ev = {
    cmd: 'grep -qF needle file',
    sha: 'abc1234',
    ts: '2026-06-16T00:00:00.000Z',
    exit: 0,
  };
  const once = stampAcEvidenceAndReconcile(SPIKE_BODY, 'spike probe passes', ev);
  const twice = stampAcEvidenceAndReconcile(once, 'spike probe passes', { ...ev, sha: 'def5678' });
  const vcCount = [...twice.matchAll(/- \[ \] `grep -qF needle file`/g)].length;
  assert.equal(vcCount, 1, 'command appears exactly once in Verification Commands');
  assert.equal(auditEvidenceMarkers(twice).missingVerificationCommands.length, 0);
});

test('#443 reconcile scopes to the stamped AC — an unrelated AC gap is left untouched', () => {
  const twoAcBody = [
    '## Acceptance Criteria',
    '',
    '- [ ] first probe <!-- aitm-verified-by: `grep -qF one file` -->',
    '- [ ] second probe <!-- aitm-verified-by: `grep -qF two file` -->',
    '',
    '## Definition of Done',
    '',
    '## Verification Commands',
    '',
    '## Pickup Directive',
    '',
  ].join('\n');
  const out = stampAcEvidenceAndReconcile(twoAcBody, 'first probe', {
    cmd: 'grep -qF one file',
    sha: 'abc1234',
    ts: '2026-06-16T00:00:00.000Z',
    exit: 0,
  });
  assert.ok(out.includes('- [ ] `grep -qF one file`'), 'stamped AC command reconciled');
  assert.ok(
    !out.includes('- [ ] `grep -qF two file`'),
    'unrelated AC command NOT dragged into this transaction'
  );
});
