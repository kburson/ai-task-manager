#!/usr/bin/env node
// @story #231
// #231 — Closes Hole 1 (standard-command exemption) and the AC-only parse
// scope. `auditEvidenceMarkers` must require every `aitm-verified-by` command
// — including the previously-exempt standard set — to appear in
// `## Verification Commands`, and it must see Functional DoD items the same
// way it sees ACs.
import { strict as assert } from 'node:assert';
import { auditEvidenceMarkers, parseEvidenceChecklist } from '../lib/evidence-markers.mjs';

// AC attested only with `npm test` and no VC entry → audit blocks.
{
  const body = [
    '## Acceptance Criteria',
    '- [ ] Tests cover the new behavior <!-- aitm-verified-by: `npm test` -->',
    '',
    '### Verification Commands',
    '',
  ].join('\n');
  const a = auditEvidenceMarkers(body);
  assert.equal(a.ok, false, 'expected missingVerificationCommands to block');
  assert.deepEqual(a.missingVerificationCommands, ['npm test']);
  console.log('PASS: AC `npm test` without VC blocks audit');
}

// AC with `npm test` AND VC listing `npm test` → audit passes.
{
  const body = [
    '## Acceptance Criteria',
    '- [ ] Tests cover the new behavior <!-- aitm-verified-by: `npm test` -->',
    '',
    '### Verification Commands',
    '- [ ] `npm test`',
  ].join('\n');
  const a = auditEvidenceMarkers(body);
  assert.equal(a.ok, true, a.missingVerificationCommands.join(','));
  console.log('PASS: AC `npm test` with matching VC passes audit');
}

// Same shape repeated for `npm run lint` and `npm run format:check`.
for (const cmd of ['npm run lint', 'npm run format:check']) {
  const missing = [
    '## Acceptance Criteria',
    `- [ ] Quality bar holds <!-- aitm-verified-by: \`${cmd}\` -->`,
    '',
    '### Verification Commands',
    '',
  ].join('\n');
  const a = auditEvidenceMarkers(missing);
  assert.equal(a.ok, false);
  assert.deepEqual(a.missingVerificationCommands, [cmd]);

  const matched = missing.replace(
    '### Verification Commands\n',
    `### Verification Commands\n- [ ] \`${cmd}\`\n`
  );
  const b = auditEvidenceMarkers(matched);
  assert.equal(b.ok, true);
  console.log(`PASS: \`${cmd}\` no longer exempt`);
}

// Functional DoD item with marker but no VC entry → audit blocks.
{
  const body = [
    '## Acceptance Criteria',
    '- [ ] Behavior change <!-- aitm-verified-by: `node --test tests/a.mjs` -->',
    '',
    '### Verification Commands',
    '- [ ] `node --test tests/a.mjs`',
    '',
    '## Definition of Done',
    '',
    '#### Functional (verified at Test)',
    '',
    '- [ ] All automated tests pass <!-- aitm-verified-by: `npm test` -->',
  ].join('\n');
  const a = auditEvidenceMarkers(body);
  assert.equal(a.ok, false, 'functional DoD npm test must force VC entry');
  assert.deepEqual(a.missingVerificationCommands, ['npm test']);
  // The parser now exposes functional items the audit can see.
  const parsed = parseEvidenceChecklist(body);
  assert.equal(parsed.functionalDodItems.length, 1);
  assert.deepEqual(parsed.functionalDodItems[0].evidenceCommands, ['npm test']);
  console.log('PASS: Functional DoD with marker but no VC blocks audit');
}

// Functional DoD item with marker AND VC entry → audit passes.
{
  const body = [
    '## Acceptance Criteria',
    '- [ ] Behavior change <!-- aitm-verified-by: `node --test tests/a.mjs` -->',
    '',
    '### Verification Commands',
    '- [ ] `node --test tests/a.mjs`',
    '- [ ] `npm test`',
    '',
    '## Definition of Done',
    '',
    '#### Functional (verified at Test)',
    '',
    '- [ ] All automated tests pass <!-- aitm-verified-by: `npm test` -->',
  ].join('\n');
  const a = auditEvidenceMarkers(body);
  assert.equal(a.ok, true, a.missingVerificationCommands.join(','));
  console.log('PASS: Functional DoD with marker and matching VC passes audit');
}

// Judgment items in Functional DoD (no marker) are not parsed as command-backed.
{
  const body = [
    '## Acceptance Criteria',
    '- [ ] AC has its own evidence <!-- aitm-verified-by: `node --test tests/a.mjs` -->',
    '',
    '### Verification Commands',
    '- [ ] `node --test tests/a.mjs`',
    '',
    '## Definition of Done',
    '',
    '#### Functional (verified at Test)',
    '',
    '- [ ] Acceptance criteria met (including additions from deep dive)',
    '- [ ] All changes committed; commit messages follow project convention',
  ].join('\n');
  const a = auditEvidenceMarkers(body);
  assert.equal(a.ok, true);
  const parsed = parseEvidenceChecklist(body);
  assert.equal(parsed.functionalDodItems.length, 0, 'judgment items are not collected');
  console.log('PASS: Functional DoD judgment items untouched');
}

console.log('evidence-markers.test.mjs: all passed');
