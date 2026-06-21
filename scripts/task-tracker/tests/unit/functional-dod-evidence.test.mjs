// @story #259
import assert from 'node:assert/strict';

import {
  KEY_CLASSIFICATION,
  STAMPABLE_KEYS,
  DERIVED_KEYS,
  parseFunctionalDodKeys,
  findEvidenceMarker,
  stampEvidenceMarker,
  deriveAcsStatus,
  deriveCheckboxesStatus,
} from '../../lib/functional-dod-evidence.mjs';

function bodyWithKeys() {
  return [
    '## Acceptance Criteria',
    '',
    '- [x] AC one',
    '- [x] AC two',
    '',
    '## Definition of Done',
    '',
    '#### Functional (verified at Test)',
    '',
    '- [ ] All automated tests pass <!-- aitm-verified cmd="`npm test`" --> <!-- dod:functional:tests -->',
    '- [ ] Lint and format checks pass <!-- aitm-verified cmd="`npm run lint`" --> <!-- dod:functional:lint -->',
    '- [ ] All changes committed <!-- aitm-verified cmd="`git log --grep #303`" --> <!-- dod:functional:commits -->',
    '- [ ] Acceptance criteria met <!-- dod:functional:acs -->',
    '- [ ] Issue body checkboxes ticked <!-- dod:functional:checkboxes -->',
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '',
    '- [ ] Passed final human review',
    '- [ ] Story closed and moved to Done',
    '- [ ] Timing data flushed to issue',
    '',
  ].join('\n');
}

// --- key classification ---
assert.equal(KEY_CLASSIFICATION.tests, 'stampable');
assert.equal(KEY_CLASSIFICATION.lint, 'stampable');
assert.equal(KEY_CLASSIFICATION.commits, 'stampable');
assert.equal(KEY_CLASSIFICATION.acs, 'derived');
assert.equal(KEY_CLASSIFICATION.checkboxes, 'derived');
assert.deepEqual([...STAMPABLE_KEYS].sort(), ['commits', 'lint', 'tests']);
assert.deepEqual([...DERIVED_KEYS].sort(), ['acs', 'checkboxes']);

// --- parseFunctionalDodKeys ---
{
  const items = parseFunctionalDodKeys(bodyWithKeys());
  assert.equal(items.length, 5, 'all 5 keyed items parsed');
  const byKey = Object.fromEntries(items.map((it) => [it.key, it]));
  assert.equal(byKey.tests.checked, false);
  assert.deepEqual(byKey.tests.evidenceCommands, ['npm test']);
  assert.deepEqual(byKey.lint.evidenceCommands, ['npm run lint']);
  assert.deepEqual(byKey.commits.evidenceCommands, ['git log --grep #303']);
  assert.equal(byKey.acs.evidenceMarker, null);
  assert.equal(byKey.tests.classification, 'stampable');
  assert.equal(byKey.acs.classification, 'derived');
}

// --- #481 — findEvidenceMarker / stampEvidenceMarker upsert the single marker ---
{
  let body = bodyWithKeys();
  assert.equal(findEvidenceMarker(body, 'tests'), null);
  body = stampEvidenceMarker(body, 'tests', {
    cmd: 'npm test',
    sha: 'abc123',
    ts: '2026-06-05T00:00:00Z',
    exit: 0,
  });
  const ev = findEvidenceMarker(body, 'tests');
  assert.ok(ev, 'marker stamped');
  // #481 — cmd reflects the line's persistent DECLARATION (backtick form), not
  // the bare cmd passed in; the run is proven by exit/sha/ts.
  assert.equal(ev.cmd, '`npm test`');
  assert.equal(ev.exit, 0);
  assert.equal(ev.sha, 'abc123');
  // Idempotent / replace-in-place: re-stamp with different sha replaces.
  body = stampEvidenceMarker(body, 'tests', {
    cmd: 'npm test',
    sha: 'def456',
    ts: '2026-06-05T01:00:00Z',
    exit: 0,
  });
  const ev2 = findEvidenceMarker(body, 'tests');
  assert.equal(ev2.sha, 'def456');
  // #481 — single marker: no aitm-dod-evidence sibling, exactly one aitm-verified.
  const testsLine = body.split('\n').find((l) => l.includes('All automated tests pass'));
  assert.equal(
    (testsLine.match(/aitm-dod-evidence\b/g) || []).length,
    0,
    'no sibling evidence marker'
  );
  assert.equal(
    (testsLine.match(/aitm-verified/g) || []).length,
    1,
    'exactly one aitm-verified marker, run-props merged in place'
  );
}

// --- #481 — stamp upserts run-props onto the line's single aitm-verified marker ---
{
  const body = stampEvidenceMarker(bodyWithKeys(), 'tests', {
    cmd: 'npm test',
    sha: 'abc123',
    ts: '2026-06-05T00:00:00Z',
    exit: 0,
  });
  const line = body.split('\n').find((l) => l.includes('All automated tests pass'));
  // Declaration cmd preserved; run-props appended in canonical order; the
  // dod:functional locator tag stays separate (the key is NOT folded in).
  assert.match(
    line,
    /<!-- aitm-verified cmd="`npm test`" exit="0" sha="abc123" ts="2026-06-05T00:00:00Z" --> <!-- dod:functional:tests -->/,
    'run-props upserted onto the declaration marker; dod:functional tag separate'
  );
  assert.ok(!/aitm-dod-evidence/.test(line), 'no sibling evidence marker emitted');
  assert.ok(!/aitm-verified[^>]*key=/.test(line), 'no functional key folded into the marker');
}

// --- #481 — parser reads run-props from the single aitm-verified marker ---
{
  const body = bodyWithKeys().replace(
    '<!-- aitm-verified cmd="`npm test`" --> <!-- dod:functional:tests -->',
    '<!-- aitm-verified cmd="`npm test`" exit="0" sha="abc123" ts="2026-06-05T00:00:00Z" --> <!-- dod:functional:tests -->'
  );
  const ev = findEvidenceMarker(body, 'tests');
  assert.ok(ev, 'single-marker run-props parsed');
  assert.equal(ev.cmd, '`npm test`');
  assert.equal(ev.exit, 0);
  assert.equal(ev.sha, 'abc123');
  assert.equal(ev.ts, '2026-06-05T00:00:00Z');
}

// --- #481 — back-compat: parser still reads the legacy fully-quoted sibling ---
{
  const body = bodyWithKeys().replace(
    '<!-- dod:functional:tests -->',
    '<!-- dod:functional:tests --> <!-- aitm-dod-evidence key="tests" cmd="npm test" exit="0" sha="abc123" ts="2026-06-05T00:00:00Z" -->'
  );
  const ev = findEvidenceMarker(body, 'tests');
  assert.ok(ev, 'legacy new-form sibling still parsed (read-only back-compat)');
  // The aitm-verified declaration carries proof too here; the line's own
  // declaration cmd wins on read.
  assert.equal(ev.exit, 0);
  assert.equal(ev.sha, 'abc123');
  assert.equal(ev.ts, '2026-06-05T00:00:00Z');
}

// --- #379 — parser still reads the legacy half-quoted colon form (back-compat) ---
{
  const body = bodyWithKeys().replace(
    '<!-- dod:functional:lint -->',
    '<!-- dod:functional:lint --> <!-- aitm-dod-evidence:lint cmd="npm run lint" exit=1 sha=deadbeef ts=2026-06-05T00:00:00Z -->'
  );
  const ev = findEvidenceMarker(body, 'lint');
  assert.ok(ev, 'legacy-form marker parsed');
  assert.equal(ev.cmd, 'npm run lint');
  assert.equal(ev.exit, 1);
  assert.equal(ev.sha, 'deadbeef');
}

// --- #481 — embedded double-quote in a SEEDED cmd round-trips serialize→parse.
// Uses a derived key (`acs`) whose line has no declaration, so the upsert seeds
// `cmd` from the evidence (a declared line would preserve its backtick cmd).
{
  const cmd = 'grep "needle" file';
  const body = stampEvidenceMarker(bodyWithKeys(), 'acs', {
    cmd,
    sha: 'abc123',
    ts: '2026-06-05T00:00:00Z',
    exit: 0,
  });
  const line = body.split('\n').find((l) => l.includes('Acceptance criteria met'));
  assert.match(line, /cmd="grep &quot;needle&quot; file"/, 'embedded quote escaped as &quot;');
  assert.equal(findEvidenceMarker(body, 'acs').cmd, cmd, 'round-trips back to original cmd');
}

// --- #481 — re-stamping a line carrying a legacy sibling strips the sibling and
// records the run on the single `aitm-verified` marker (declaration preserved) ---
{
  const seeded = bodyWithKeys().replace(
    '<!-- dod:functional:commits -->',
    '<!-- dod:functional:commits --> <!-- aitm-dod-evidence:commits cmd="git log" exit=0 sha=old123 ts=2026-06-04T00:00:00Z -->'
  );
  const restamped = stampEvidenceMarker(seeded, 'commits', {
    cmd: 'git log',
    sha: 'new456',
    ts: '2026-06-05T00:00:00Z',
    exit: 0,
  });
  const line = restamped.split('\n').find((l) => l.includes('All changes committed'));
  assert.equal(
    (line.match(/aitm-dod-evidence\b/g) || []).length,
    0,
    'legacy sibling stripped on restamp'
  );
  assert.equal(
    (line.match(/aitm-verified/g) || []).length,
    1,
    'run recorded on the single aitm-verified marker'
  );
  // Declaration cmd preserved; run sha taken from the new stamp.
  assert.match(line, /aitm-verified cmd="`git log --grep #303`"/, 'declaration cmd preserved');
  assert.equal(findEvidenceMarker(restamped, 'commits').sha, 'new456');
}

// --- stampEvidenceMarker rejects unknown key / bad evidence shape ---
assert.throws(
  () => stampEvidenceMarker(bodyWithKeys(), 'bogus', { cmd: 'x', sha: 'y', ts: 'z', exit: 0 }),
  /unknown functional DoD key/
);
assert.throws(
  () => stampEvidenceMarker(bodyWithKeys(), 'tests', { cmd: 'x' }),
  /requires \{ cmd, sha, ts, exit \}/
);

// --- stampEvidenceMarker rejects missing keyed line ---
assert.throws(
  () =>
    stampEvidenceMarker('## DoD\n\nno keys here\n', 'tests', {
      cmd: 'x',
      sha: 'y',
      ts: 'z',
      exit: 0,
    }),
  /no dod:functional:tests line found/
);

// --- deriveAcsStatus ---
{
  const status = deriveAcsStatus(bodyWithKeys());
  assert.equal(status.sectionPresent, true);
  assert.equal(status.total, 2);
  assert.equal(status.ticked, 2);
  assert.equal(status.allTicked, true);

  const partial = bodyWithKeys().replace('- [x] AC two', '- [ ] AC two');
  const ps = deriveAcsStatus(partial);
  assert.equal(ps.allTicked, false);
  assert.equal(ps.ticked, 1);

  const none = deriveAcsStatus('## Other\n\n- [x] not an AC\n');
  assert.equal(none.sectionPresent, false);
}

// --- deriveCheckboxesStatus excludes self/derived and lifecycle ---
{
  // Start with a body where every non-derived non-lifecycle box is ticked.
  let body = bodyWithKeys();
  // Tick the three stampable Functional boxes (acs/checkboxes excluded by derivation).
  body = body
    .replace('- [ ] All automated tests pass', '- [x] All automated tests pass')
    .replace('- [ ] Lint and format checks pass', '- [x] Lint and format checks pass')
    .replace('- [ ] All changes committed', '- [x] All changes committed');
  const status = deriveCheckboxesStatus(body, { lifecyclePresent: true });
  // Tally = AC(2) + Functional stampable(3) = 5; derived two and lifecycle three excluded.
  assert.equal(status.total, 5);
  assert.equal(status.ticked, 5);
  assert.equal(status.allTicked, true);

  // Untick one AC — should fail derivation.
  const partial = body.replace('- [x] AC two', '- [ ] AC two');
  const ps = deriveCheckboxesStatus(partial, { lifecyclePresent: true });
  assert.equal(ps.allTicked, false);
}

// --- #393 — migrated consolidated `aitm-verified cmd="..."` DECLARATION is
// read by extractCommands (mirror of #391 for the Functional-DoD reader). The
// #369 corpus migration rewrote DoD verifier declarations from the legacy
// `aitm-verified-by:` name to the consolidated form; the reader must still
// surface the declared command so dod-stamp keeps gating the line.
{
  const migrated = bodyWithKeys()
    .replace(
      '<!-- aitm-verified cmd="`npm test`" --> <!-- dod:functional:tests -->',
      '<!-- aitm-verified cmd="`npm test`" --> <!-- dod:functional:tests -->'
    )
    .replace(
      '<!-- aitm-verified cmd="`npm run lint`" --> <!-- dod:functional:lint -->',
      '<!-- dod:functional:lint -->'
    );
  const items = parseFunctionalDodKeys(migrated);
  const byKey = Object.fromEntries(items.map((it) => [it.key, it]));
  assert.deepEqual(
    byKey.tests.evidenceCommands,
    ['npm test'],
    'migrated consolidated declaration read by Functional-DoD reader'
  );
  // No legacy and no consolidated declaration → no commands, no double-count.
  assert.deepEqual(byKey.lint.evidenceCommands, [], 'declaration-less line yields no commands');
}

// --- #481 — `cmd` is the PERSISTENT declaration component, read regardless of
// run-props. Once run-props (ts+sha) are upserted onto the same `aitm-verified`
// marker, the declared command MUST still surface so the line keeps gating
// (inverts the pre-#481 hasExecutionProof guard, which would have hidden it).
{
  const proofStamped = bodyWithKeys().replace(
    '<!-- aitm-verified cmd="`npm test`" --> <!-- dod:functional:tests -->',
    '<!-- aitm-verified cmd="`npm test`" sha="abc1234" ts="2026-06-12T00:00:00Z" --> <!-- dod:functional:tests -->'
  );
  const byKey = Object.fromEntries(parseFunctionalDodKeys(proofStamped).map((it) => [it.key, it]));
  assert.deepEqual(
    byKey.tests.evidenceCommands,
    ['npm test'],
    'declared cmd still read after run-props are merged into the marker'
  );
  // The same marker is now also a record-of-run: evidenceMarker reads the proof.
  assert.equal(byKey.tests.evidenceMarker.sha, 'abc1234');
  assert.equal(byKey.tests.evidenceMarker.ts, '2026-06-12T00:00:00Z');
}

// --- #393/#468 — consolidated declarations are read correctly. ---------------
{
  const items = parseFunctionalDodKeys(bodyWithKeys());
  const byKey = Object.fromEntries(items.map((it) => [it.key, it]));
  assert.deepEqual(
    byKey.tests.evidenceCommands,
    ['npm test'],
    'consolidated aitm-verified cmd declaration read by parseFunctionalDodKeys'
  );
}

// --- #481 (AC8, routed from #480) — deriveCheckboxesStatus strips fenced code
// blocks before tallying, so example checkboxes shown inside a ```fence``` no
// longer false-count toward the derived `checkboxes` total. ----------------
{
  const body = [
    '## Acceptance Criteria',
    '',
    '- [x] AC one',
    '- [x] AC two',
    '',
    '## Notes',
    '',
    'The body might illustrate the checkbox grammar in a fenced example:',
    '',
    '```md',
    '- [ ] not a real task, just documentation',
    '- [x] also illustrative only',
    '```',
    '',
    '~~~',
    '- [ ] tilde-fenced example, also ignored',
    '~~~',
    '',
  ].join('\n');
  const status = deriveCheckboxesStatus(body, { lifecyclePresent: false });
  // Only the two real ACs count; the three fenced example boxes are excluded.
  assert.equal(status.total, 2, 'fenced example checkboxes excluded from tally');
  assert.equal(status.ticked, 2);
  assert.equal(status.allTicked, true);
}

console.log('ok functional-dod-evidence');
