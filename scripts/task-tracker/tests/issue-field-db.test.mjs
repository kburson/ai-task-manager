// @story #309
import assert from 'node:assert/strict';
import {
  ensureIssueFieldDb,
  parseIssueFieldDb,
  stripIssueFieldDb,
  formatIssueFieldDb,
  FIELD_DB_START,
  FIELD_DB_END,
  FIELDS_COMMENT_PREFIX,
} from '../issue-field-db.mjs';

const defs = [
  { key: 'priority', name: 'Priority', type: 'single_select' },
  { key: 'size', name: 'Size', type: 'single_select' },
  { key: 'estimate', name: 'Estimate', type: 'number' },
  { key: 'sequence', name: 'Sequence', type: 'number' },
  { key: 'sessionTime', name: 'Session Time', aliases: ['Actual Session Time'], type: 'number' },
  { key: 'startTime', name: 'Start time', type: 'text' },
];

// 1. Visible-field heal (no DB block) — append new-encoding comment.
{
  const body = [
    '# Work item',
    '',
    'Useful issue text.',
    '',
    '**Priority:** P1',
    '**Estimate:** 6h',
  ].join('\n');
  const healed = ensureIssueFieldDb(body, defs, { sessionTime: 10 });
  assert.equal(healed.healed, true);
  assert.equal(healed.values.priority, 'P1');
  assert.equal(healed.values.estimate, 6);
  assert.equal(healed.values.sessionTime, 10);
  assert.ok(healed.body.includes(FIELDS_COMMENT_PREFIX), 'new encoding present');
  assert.ok(!healed.body.includes(FIELD_DB_START), 'no legacy markers introduced');
}

// 2. Legacy fenced block — round-trip via ensureIssueFieldDb migrates to new encoding.
{
  const body = [
    'Body',
    '',
    FIELD_DB_START,
    '```json',
    '{"schema":1,"values":{"priority":"P2","estimate":3,"sessionTime":12,"startDate":"2026-05-08","endDate":null,"startTime":null}}',
    '```',
    FIELD_DB_END,
  ].join('\n');
  const parsed = parseIssueFieldDb(body);
  assert.equal(parsed.ok, true, 'legacy block parses');
  assert.equal(parsed.values.priority, 'P2');
  const ensured = ensureIssueFieldDb(body, defs, { sessionTime: 20 });
  assert.equal(ensured.healed, false);
  assert.equal(ensured.values.sessionTime, 12, 'valid DB wins over project value');
  assert.equal(ensured.values.startDate, undefined, 'legacy startDate dropped on round-trip');
  assert.equal(ensured.values.endDate, undefined, 'legacy endDate dropped on round-trip');
  assert.ok('startTime' in ensured.values, 'new startTime key present');
  assert.ok(!ensured.body.includes(FIELD_DB_START), 'legacy block migrated away');
  assert.ok(ensured.body.includes(FIELDS_COMMENT_PREFIX), 'new encoding emitted');
}

// 3. Invalid JSON in legacy block — heals from visible fields, exactly one new-encoding block.
{
  const body = ['Body', '', FIELD_DB_START, '```json', '{nope', '```', FIELD_DB_END].join('\n');
  const ensured = ensureIssueFieldDb(body, defs, { priority: 'P0' });
  assert.equal(ensured.healed, true);
  assert.equal(ensured.values.priority, 'P0');
  assert.equal((ensured.body.match(/<!--\s*aitm-fields:/g) || []).length, 1);
  assert.equal(
    (ensured.body.match(new RegExp(FIELD_DB_START, 'g')) || []).length,
    0,
    'legacy block stripped'
  );
}

// 4. Form-style body inference still works.
{
  const body = [
    '### Description',
    '',
    'Manual task created from the GitHub issue form.',
    '',
    '### Acceptance Criteria',
    '',
    '- [ ] It works',
    '',
    '### Priority',
    '',
    'P1 - High / this sprint',
    '',
    '### Size',
    '',
    'M - 6-10 hours',
    '',
    '### Estimate',
    '',
    '4h',
    '',
    '### Sequence',
    '',
    '2',
  ].join('\n');
  const ensured = ensureIssueFieldDb(body, defs);
  assert.equal(ensured.healed, true);
  assert.equal(ensured.values.priority, 'P1');
  assert.equal(ensured.values.size, 'M');
  assert.equal(ensured.values.estimate, 4);
  assert.equal(ensured.values.sequence, 2);
}

// 5. New encoding round-trip — parse, ensure (no change), strip.
{
  const inner = JSON.stringify({
    schema: 1,
    values: {
      priority: 'P0',
      size: 'S',
      estimate: 2,
      sessionTime: 5,
      startTime: '2026-05-11T10:00Z',
      sequence: 1,
    },
  });
  const body = `Hello.\n\n<!-- aitm-fields: ${inner} -->\n`;
  const parsed = parseIssueFieldDb(body);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.values.priority, 'P0');
  const ensured = ensureIssueFieldDb(body, defs);
  assert.equal(ensured.healed, false);
  assert.equal((ensured.body.match(/<!--\s*aitm-fields:/g) || []).length, 1);
  assert.equal(stripIssueFieldDb(body).trim(), 'Hello.');
}

// 6. Stacked blocks (legacy + legacy + new + new) — parse returns LAST, strip removes ALL,
//    surrounding content (incl. aitm-plan-approved marker) preserved.
{
  const v1 = JSON.stringify({ schema: 1, values: { priority: 'P2', estimate: 1, sessionTime: 0 } });
  const v2 = JSON.stringify({
    schema: 1,
    values: { priority: 'P2', estimate: 1, sessionTime: 11, startTime: '2026-05-11 07:00 -05:00' },
  });
  const v3New = JSON.stringify({
    schema: 1,
    values: { priority: 'P1', estimate: 2, sessionTime: 11, startTime: '2026-05-11 07:10 -05:00' },
  });
  const v4New = JSON.stringify({
    schema: 1,
    values: { priority: 'P1', estimate: 2, sessionTime: 13 },
  });
  const body = [
    '# Title',
    '',
    'Scope text.',
    '',
    FIELD_DB_START,
    '```json',
    v1,
    '```',
    FIELD_DB_END,
    '',
    FIELD_DB_START,
    '```json',
    v2,
    '```',
    FIELD_DB_END,
    '',
    '<!-- aitm-plan-approved: 2026-05-11T07:05:00Z -->',
    '',
    `<!-- aitm-fields: ${v3New} -->`,
    '',
    `<!-- aitm-fields: ${v4New} -->`,
  ].join('\n');

  const parsed = parseIssueFieldDb(body);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.values.sessionTime, 13, 'newest (last) wins on parse');

  const stripped = stripIssueFieldDb(body);
  assert.equal(
    (stripped.match(new RegExp(FIELD_DB_START, 'g')) || []).length,
    0,
    'all legacy blocks stripped'
  );
  assert.equal((stripped.match(/<!--\s*aitm-fields:/g) || []).length, 0, 'all new blocks stripped');
  assert.ok(stripped.includes('aitm-plan-approved'), 'plan-approved marker preserved');
  assert.ok(stripped.includes('Scope text.'), 'scope preserved');
  assert.ok(!/\n{3,}/.test(stripped), 'no triple newlines after strip');

  const ensured = ensureIssueFieldDb(body, defs);
  assert.equal(
    (ensured.body.match(/<!--\s*aitm-fields:/g) || []).length,
    1,
    'exactly one new-encoding block after ensure'
  );
  assert.equal(
    (ensured.body.match(new RegExp(FIELD_DB_START, 'g')) || []).length,
    0,
    'no legacy blocks after ensure'
  );
  assert.equal(ensured.values.sessionTime, 13, 'ensure preserved latest values');
  assert.ok(
    ensured.body.includes('aitm-plan-approved'),
    'plan-approved marker still present after ensure'
  );
}

// 7. formatIssueFieldDb shape — single-line HTML comment, parseable.
{
  const formatted = formatIssueFieldDb({ priority: 'P0', estimate: 1 });
  assert.ok(formatted.startsWith('<!-- aitm-fields:'));
  assert.ok(formatted.endsWith('-->'));
  assert.equal(formatted.split('\n').length, 1, 'single line');
  const parsed = parseIssueFieldDb(`prefix\n\n${formatted}\n`);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.values.priority, 'P0');
}

// 8. Empty body — no-op parse, ensure produces single new-encoding block.
{
  const parsed = parseIssueFieldDb('');
  assert.equal(parsed.ok, false);
  const ensured = ensureIssueFieldDb('Just text\n', defs, { priority: 'P1' });
  assert.equal(ensured.values.priority, 'P1');
  assert.equal((ensured.body.match(/<!--\s*aitm-fields:/g) || []).length, 1);
}

console.log('issue-field-db.test.mjs: all passed');
