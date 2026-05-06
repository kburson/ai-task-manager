import assert from 'node:assert/strict';
import {
  ensureIssueFieldDb,
  parseIssueFieldDb,
  FIELD_DB_START,
  FIELD_DB_END,
} from '../issue-field-db.mjs';

const defs = [
  { key: 'priority', name: 'Priority', type: 'single_select' },
  { key: 'estimate', name: 'Estimate', type: 'number' },
  { key: 'sessionTime', name: 'Session Time', aliases: ['Actual Session Time'], type: 'number' },
  { key: 'startDate', name: 'Start date', type: 'date' },
];

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
  assert.ok(healed.body.includes(FIELD_DB_START));
  assert.ok(healed.body.trim().endsWith(FIELD_DB_END));
}

{
  const body = [
    'Body',
    '',
    FIELD_DB_START,
    '```json',
    '{"schema":1,"values":{"priority":"P2","estimate":3,"sessionTime":12,"startDate":null}}',
    '```',
    FIELD_DB_END,
  ].join('\n');
  const parsed = parseIssueFieldDb(body);
  assert.equal(parsed.ok, true);
  const ensured = ensureIssueFieldDb(body, defs, { sessionTime: 20 });
  assert.equal(ensured.healed, false);
  assert.equal(ensured.values.sessionTime, 12, 'valid DB wins over project value');
}

{
  const body = [
    'Body',
    '',
    FIELD_DB_START,
    '```json',
    '{nope',
    '```',
    FIELD_DB_END,
  ].join('\n');
  const ensured = ensureIssueFieldDb(body, defs, { priority: 'P0' });
  assert.equal(ensured.healed, true);
  assert.equal(ensured.values.priority, 'P0');
  assert.equal((ensured.body.match(new RegExp(FIELD_DB_START, 'g')) || []).length, 1);
}

console.log('issue-field-db.test.mjs: all passed');

