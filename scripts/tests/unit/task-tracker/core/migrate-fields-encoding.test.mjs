// @story #86
import assert from 'node:assert/strict';
import { transformBody } from '../../../../task-tracker/migrate-fields-encoding.mjs';
import { FIELD_DB_START, FIELD_DB_END } from '../../../../task-tracker/issue-field-db.mjs';

// 1. No-op when already exactly one new-encoding block and no legacy.
{
  const body = 'Body text.\n\n<!-- aitm-fields: {"schema":1,"values":{"priority":"P1"}} -->\n';
  const out = transformBody(body);
  assert.equal(out.changed, false);
  assert.equal(out.body, body);
  assert.equal(out.legacyCount, 0);
  assert.equal(out.newCount, 1);
}

// 2. Legacy → migrated to new encoding.
{
  const body = [
    'Scope.',
    '',
    FIELD_DB_START,
    '```json',
    '{"schema":1,"values":{"priority":"P0","estimate":2}}',
    '```',
    FIELD_DB_END,
  ].join('\n');
  const out = transformBody(body);
  assert.equal(out.changed, true);
  assert.ok(!out.body.includes(FIELD_DB_START));
  assert.ok(out.body.includes('<!-- aitm-fields:'));
  assert.equal((out.body.match(/<!--\s*aitm-fields:/g) || []).length, 1);
}

// 3. Stacked blocks (legacy x2 + new x2 with intervening plan-approved marker) — collapsed, newest wins.
{
  const v1 = JSON.stringify({ schema: 1, values: { priority: 'P2', estimate: 1 } });
  const v2 = JSON.stringify({ schema: 1, values: { priority: 'P2', estimate: 1, sessionTime: 5 } });
  const v3 = JSON.stringify({
    schema: 1,
    values: { priority: 'P1', estimate: 2, sessionTime: 11 },
  });
  const v4 = JSON.stringify({
    schema: 1,
    values: { priority: 'P1', estimate: 2, sessionTime: 13 },
  });
  const body = [
    '# Header',
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
    `<!-- aitm-fields: ${v3} -->`,
    '',
    `<!-- aitm-fields: ${v4} -->`,
  ].join('\n');
  const out = transformBody(body);
  assert.equal(out.changed, true);
  assert.equal((out.body.match(new RegExp(FIELD_DB_START, 'g')) || []).length, 0);
  assert.equal((out.body.match(/<!--\s*aitm-fields:/g) || []).length, 1);
  assert.ok(out.body.includes('aitm-plan-approved'), 'plan-approved marker preserved');
  assert.equal(out.values.sessionTime, 13, 'newest wins');
}

// 4. Idempotent — running transform twice yields identical body.
{
  const body = [
    '# Header',
    '',
    FIELD_DB_START,
    '```json',
    '{"schema":1,"values":{"priority":"P1"}}',
    '```',
    FIELD_DB_END,
  ].join('\n');
  const first = transformBody(body);
  const second = transformBody(first.body);
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(second.body, first.body);
}

// 5. Body with no fields-block at all — no-op.
{
  const body = 'Just markdown, no fields.\n';
  const out = transformBody(body);
  assert.equal(out.changed, false);
  assert.equal(out.body, body);
}

console.log('migrate-fields-encoding.test.mjs: all passed');
