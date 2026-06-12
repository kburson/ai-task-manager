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
} from '../lib/functional-dod-evidence.mjs';

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
    '- [ ] All automated tests pass <!-- aitm-verified-by: `npm test` --> <!-- dod:functional:tests -->',
    '- [ ] Lint and format checks pass <!-- aitm-verified-by: `npm run lint` --> <!-- dod:functional:lint -->',
    '- [ ] All changes committed <!-- aitm-verified-by: `git log --grep #303` --> <!-- dod:functional:commits -->',
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

// --- findEvidenceMarker / stampEvidenceMarker ---
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
  assert.equal(ev.cmd, 'npm test');
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
  // Marker count stays at 1. `\b` matches BOTH legacy `aitm-dod-evidence:` and
  // the new `aitm-dod-evidence key="..."` grammar, so the count is form-agnostic.
  const occurrences = (body.match(/aitm-dod-evidence\b/g) || []).length;
  assert.equal(occurrences, 1, 'marker replaced in place, not duplicated');
}

// --- #379 — writer emits the new fully-quoted property grammar ---
{
  const body = stampEvidenceMarker(bodyWithKeys(), 'tests', {
    cmd: 'npm test',
    sha: 'abc123',
    ts: '2026-06-05T00:00:00Z',
    exit: 0,
  });
  const line = body.split('\n').find((l) => l.includes('All automated tests pass'));
  assert.match(
    line,
    /<!-- aitm-dod-evidence key="tests" cmd="npm test" exit="0" sha="abc123" ts="2026-06-05T00:00:00Z" -->/,
    'new fully-quoted form emitted'
  );
  assert.ok(!/aitm-dod-evidence:/.test(line), 'no legacy colon form emitted');
}

// --- #379 — parser reads the new fully-quoted form ---
{
  const body = bodyWithKeys().replace(
    '<!-- dod:functional:tests -->',
    '<!-- dod:functional:tests --> <!-- aitm-dod-evidence key="tests" cmd="npm test" exit="0" sha="abc123" ts="2026-06-05T00:00:00Z" -->'
  );
  const ev = findEvidenceMarker(body, 'tests');
  assert.ok(ev, 'new-form marker parsed');
  assert.equal(ev.cmd, 'npm test');
  assert.equal(ev.exit, 0);
  assert.equal(ev.sha, 'abc123');
  assert.equal(ev.ts, '2026-06-05T00:00:00Z');
}

// --- #379 — parser still reads the legacy half-quoted colon form (back-compat) ---
{
  const body = bodyWithKeys().replace(
    '<!-- dod:functional:lint -->',
    '<!-- dod:functional:lint --> <!-- aitm-dod-evidence:lint cmd="npm run lint" exit=1 sha=deadbee ts=2026-06-05T00:00:00Z -->'
  );
  const ev = findEvidenceMarker(body, 'lint');
  assert.ok(ev, 'legacy-form marker parsed');
  assert.equal(ev.cmd, 'npm run lint');
  assert.equal(ev.exit, 1);
  assert.equal(ev.sha, 'deadbee');
}

// --- #379 — embedded double-quote in cmd round-trips serialize→parse ---
{
  const cmd = 'grep "needle" file';
  const body = stampEvidenceMarker(bodyWithKeys(), 'tests', {
    cmd,
    sha: 'abc123',
    ts: '2026-06-05T00:00:00Z',
    exit: 0,
  });
  const line = body.split('\n').find((l) => l.includes('All automated tests pass'));
  assert.match(line, /cmd="grep &quot;needle&quot; file"/, 'embedded quote escaped as &quot;');
  assert.equal(findEvidenceMarker(body, 'tests').cmd, cmd, 'round-trips back to original cmd');
}

// --- #379 — re-stamping a legacy-form marker replaces it in place with the new form ---
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
    1,
    'legacy marker replaced, not duplicated'
  );
  assert.ok(!/aitm-dod-evidence:/.test(line), 'legacy form replaced with new form');
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

console.log('ok functional-dod-evidence');
