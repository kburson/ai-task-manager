// @story #403
import assert from 'node:assert/strict';

import {
  CANONICAL_KEYS,
  classifyLabel,
  detectMissingKeys,
  healFunctionalSection,
} from '../../heal-functional-dod.mjs';
import { parseFunctionalDodKeys } from '../../lib/functional-dod-evidence.mjs';

// Canonical (keyed) Functional section — the post-#303 shape.
function canonicalBody() {
  return [
    '## Acceptance Criteria',
    '',
    '- [x] AC one',
    '',
    '## Definition of Done',
    '',
    '#### Functional (verified at Test)',
    '',
    '- [ ] All automated tests pass <!-- aitm-verified cmd="`npm test` `npm run test:slow`" --> <!-- dod:functional:tests -->', // #934: canonical tests line is the two-lane split
    '- [ ] Lint and format checks pass <!-- aitm-verified cmd="`npm run lint` `npm run format:check`" --> <!-- dod:functional:lint -->',
    '- [ ] All changes committed; commit messages follow project convention <!-- aitm-verified cmd="`git log --oneline -1`" --> <!-- dod:functional:commits -->',
    '- [ ] Acceptance criteria met (including additions from deep dive) <!-- dod:functional:acs -->',
    '- [ ] Issue body checkboxes ticked <!-- dod:functional:checkboxes -->',
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '',
    '- [ ] Passed final human review',
    '',
    '<!-- aitm-fields: {"schema":1,"values":{}} -->',
  ].join('\n');
}

// Stale (unkeyed, pre-#303) Functional section — five lines, no key markers,
// order differs (tests, lint, acs, commits, checkboxes), with one box ticked.
function staleBody() {
  return [
    '## Acceptance Criteria',
    '',
    '- [x] AC one',
    '',
    '## Definition of Done',
    '',
    '#### Functional (verified at Test)',
    '',
    '- [x] All automated tests pass',
    '- [ ] Lint and format checks pass',
    '- [ ] Acceptance criteria met',
    '- [ ] All changes committed',
    '- [ ] Issue body checkboxes ticked',
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '',
    '- [ ] Passed final human review',
    '',
    '<!-- aitm-fields: {"schema":1,"values":{}} -->',
  ].join('\n');
}

// --- classifyLabel ---
assert.equal(classifyLabel('All automated tests pass'), 'tests');
assert.equal(classifyLabel('Lint and format checks pass'), 'lint');
assert.equal(classifyLabel('All changes committed; commit messages follow convention'), 'commits');
assert.equal(classifyLabel('Acceptance criteria met'), 'acs');
assert.equal(classifyLabel('Issue body checkboxes ticked'), 'checkboxes');
assert.equal(classifyLabel('something unrelated'), null);

// --- detectMissingKeys: stale body → all five missing, affected ---
{
  const det = detectMissingKeys(staleBody());
  assert.equal(det.sectionPresent, true);
  assert.equal(det.affected, true);
  assert.deepEqual([...det.missingKeys].sort(), [...CANONICAL_KEYS].sort());
  assert.deepEqual(det.presentKeys, []);
}

// --- detectMissingKeys: canonical body → none missing, not affected ---
{
  const det = detectMissingKeys(canonicalBody());
  assert.equal(det.sectionPresent, true);
  assert.equal(det.affected, false);
  assert.deepEqual(det.missingKeys, []);
  assert.deepEqual([...det.presentKeys].sort(), [...CANONICAL_KEYS].sort());
}

// --- detectMissingKeys: no Functional section ---
{
  const det = detectMissingKeys('## Acceptance Criteria\n\n- [ ] AC');
  assert.equal(det.sectionPresent, false);
  assert.equal(det.affected, false);
}

// --- healFunctionalSection: stale → canonical, five keyed lines, tick preserved ---
{
  const { body, changed } = healFunctionalSection(staleBody());
  assert.equal(changed, true);
  const items = parseFunctionalDodKeys(body);
  assert.equal(items.length, 5, 'all five keyed lines present after heal');
  const byKey = Object.fromEntries(items.map((it) => [it.key, it]));
  for (const k of CANONICAL_KEYS) assert.ok(byKey[k], `key ${k} present`);
  // The ticked stale line ("tests") keeps its tick; the rest stay unchecked.
  assert.equal(byKey.tests.checked, true, 'tests tick preserved');
  assert.equal(byKey.lint.checked, false);
  assert.equal(byKey.commits.checked, false);
  // Surrounding content preserved.
  assert.ok(body.includes('#### Lifecycle (auto-ticked at Review/Close)'));
  assert.ok(body.includes('<!-- aitm-fields:'));
  assert.ok(body.includes('## Acceptance Criteria'));
}

// --- healFunctionalSection: preserves an existing execution-proof marker ---
{
  const withEvidence = staleBody().replace(
    '- [x] All automated tests pass',
    '- [x] All automated tests pass <!-- aitm-dod-evidence key="tests" cmd="npm run test:all" exit="0" sha="abc123" ts="2026-06-01T00:00:00Z" -->'
  );
  const { body } = healFunctionalSection(withEvidence);
  assert.ok(
    /dod:functional:tests/.test(body) && /aitm-dod-evidence/.test(body),
    'evidence marker preserved on the healed tests line'
  );
}

// --- healFunctionalSection: idempotent (heal of a healed body is a no-op) ---
{
  const once = healFunctionalSection(staleBody()).body;
  const twice = healFunctionalSection(once);
  assert.equal(twice.changed, false, 'second heal is a no-op');
  assert.equal(twice.body, once);
}

// --- healFunctionalSection: canonical body is a no-op ---
{
  const res = healFunctionalSection(canonicalBody());
  assert.equal(res.changed, false, 'already-canonical body unchanged');
}

console.log('heal-functional-dod.test.mjs: all assertions passed');
