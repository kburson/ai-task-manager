// Unit tests for the `{discuss}` marker convention (#405).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { hasDiscussMarker, markDiscussed, finalizeDiscussion } from '../lib/discuss-marker.mjs';
import { findLostMarkers } from '../lib/body-invariants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

// --- hasDiscussMarker -------------------------------------------------------
{
  assert.equal(hasDiscussMarker('please {discuss} this'), true, 'present → true');
  assert.equal(hasDiscussMarker('nothing here'), false, 'absent → false');
  assert.equal(hasDiscussMarker(''), false, 'empty → false');
  assert.equal(hasDiscussMarker(null), false, 'null → false');
  assert.equal(hasDiscussMarker('{discuss}\n{discuss}'), true, 'multiple → true');
  // After consume the token is gone, so detection is false.
  assert.equal(
    hasDiscussMarker(markDiscussed('flesh me {discuss}', { ts: 'T' })),
    false,
    'after consume → false'
  );
}

// --- markDiscussed: strips token + stamps marker ----------------------------
{
  const out = markDiscussed('Raw idea\n\n{discuss}\n', { ts: '2026-06-15T00:00:00Z' });
  assert.ok(!out.includes('{discuss}'), 'token stripped');
  assert.ok(
    out.includes('<!-- aitm-discussed ts="2026-06-15T00:00:00Z" -->'),
    'marker stamped with ts'
  );
}

// --- markDiscussed: strips multiple tokens ----------------------------------
{
  const out = markDiscussed('{discuss} a {discuss} b\n{discuss}', { ts: 'T' });
  assert.ok(!out.includes('{discuss}'), 'all tokens stripped');
}

// --- markDiscussed: idempotent on second call -------------------------------
{
  const once = markDiscussed('idea {discuss}', { ts: 'T' });
  const twice = markDiscussed(once, { ts: 'T' });
  assert.equal(twice, once, 'second call is a no-op');
  const markerCount = (twice.match(/aitm-discussed/g) || []).length;
  assert.equal(markerCount, 1, 'exactly one aitm-discussed marker');
}

// --- markDiscussed: preserves invariant markers -----------------------------
{
  const base = [
    '<!-- aitm-last-known-state state="develop" ts="2026-06-15T00:00:00Z" -->',
    '',
    '## Scope',
    '',
    'Do the thing. {discuss}',
    '',
    '<!-- aitm-fields: size=M -->',
    '<!-- aitm-plan-approved ts="2026-06-15T00:00:00Z" -->',
  ].join('\n');
  const out = markDiscussed(base, { ts: 'T' });
  assert.deepEqual(findLostMarkers(base, out), [], 'no invariant markers lost');
  assert.ok(!out.includes('{discuss}'), 'token consumed');
}

// --- finalizeDiscussion: scope splice + token consume, single write ---------
{
  const base = [
    '<!-- aitm-last-known-state state="refine" ts="2026-06-15T00:00:00Z" -->',
    '',
    '## Scope',
    '',
    'sparse {discuss}',
    '',
    '## Acceptance Criteria',
    '',
    '- [ ] tbd',
    '',
    '## Verification Commands',
    '',
    '- [ ] `npm test`',
  ].join('\n');

  let calls = 0;
  let current = base;
  const deps = {
    fetchBody: async () => current,
    pushBody: async (_repo, _n, body) => {
      calls += 1;
      current = body;
    },
  };

  const res = await finalizeDiscussion({
    issueNumber: 405,
    repo: 'o/r',
    scope: 'A fully fleshed scope paragraph.',
    acs: ['First criterion', 'Second criterion'],
    ts: '2026-06-15T01:00:00Z',
    deps,
  });

  assert.equal(res.status, 'ok', 'write succeeded');
  assert.equal(calls, 1, 'exactly one body write');
  assert.ok(current.includes('A fully fleshed scope paragraph.'), 'scope rewritten');
  assert.ok(!current.includes('sparse'), 'old scope replaced');
  assert.ok(current.includes('- [ ] First criterion'), 'AC 1 written');
  assert.ok(current.includes('- [ ] Second criterion'), 'AC 2 written');
  assert.ok(!current.includes('{discuss}'), 'token consumed');
  assert.ok(current.includes('aitm-discussed'), 'audit marker stamped');
  assert.ok(current.includes('## Verification Commands'), 'untouched section preserved');
  assert.deepEqual(findLostMarkers(base, current), [], 'no invariant markers lost');
}

// --- finalizeDiscussion: requires scope -------------------------------------
{
  await assert.rejects(
    () => finalizeDiscussion({ issueNumber: 1, repo: 'o/r', scope: '' }),
    /scope` is required/,
    'empty scope rejected'
  );
}

// --- template parity --------------------------------------------------------
{
  const tplPath = resolve(repoRoot, '.github/ISSUE_TEMPLATE/user-request.yml');
  const raw = readFileSync(tplPath, 'utf8');
  assert.ok(/^name:\s*User Request\s*$/m.test(raw), 'name is "User Request"');
  assert.ok(raw.includes('{discuss}'), 'hardcodes {discuss} token');
  // Exactly one field marked required: true (the Description field).
  const requiredCount = (raw.match(/required:\s*true/g) || []).length;
  assert.equal(requiredCount, 1, 'exactly one required field');
  assert.ok(/id:\s*description/.test(raw), 'has a Description field');

  // Task / Bug forms must be unchanged: assert they still parse with their
  // own required fields and do NOT carry the {discuss} token.
  for (const name of ['task.yml', 'bug.yml']) {
    const other = readFileSync(resolve(repoRoot, '.github/ISSUE_TEMPLATE', name), 'utf8');
    assert.ok(!other.includes('{discuss}'), `${name} does not carry {discuss}`);
  }
}

console.log('discuss-marker.test.mjs: all assertions passed');
