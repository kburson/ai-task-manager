// @story #405 #479
// Unit tests for the `{discuss}` marker convention (#405) and the #479
// detection-rule narrowing: a TRUE marker is a line whose trimmed content is
// exactly the token `{discuss}` and nothing else. Inline / prose / backticked /
// prefixed mentions are NOT markers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  hasDiscussMarker,
  markDiscussed,
  finalizeDiscussion,
  hasDiscussRequest,
  hasDiscussedMarker,
  isDiscussPending,
  convergeDiscuss,
} from '../../../lib/discuss-marker.mjs';
import { governedEffectDeps } from '../../helpers/governed-effect.mjs';
import { findLostMarkers } from '../../../lib/body-invariants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url)) + '/..';
const repoRoot = resolve(__dirname, '..', '../../..');

// --- hasDiscussMarker: TRUE cases (#479 ACs 1) ------------------------------
test('hasDiscussMarker: bare token alone on a line → true', () => {
  assert.equal(hasDiscussMarker('{discuss}'), true, 'sole line → true');
  assert.equal(
    hasDiscussMarker('Raw idea\n\n{discuss}\n'),
    true,
    'bare token line among prose → true'
  );
  assert.equal(hasDiscussMarker('{discuss}\n{discuss}'), true, 'multiple bare lines → true');
});

test('hasDiscussMarker: whitespace-padded bare token → true (#479 AC1)', () => {
  assert.equal(hasDiscussMarker('   {discuss}   '), true, 'leading/trailing spaces tolerated');
  assert.equal(hasDiscussMarker('before\n\t{discuss}\t\nafter'), true, 'tab-padded line → true');
});

// --- hasDiscussMarker: FALSE cases (#479 ACs 2,3,4,5) -----------------------
test('hasDiscussMarker: inline prose mention → false (#479 AC2)', () => {
  assert.equal(hasDiscussMarker('please {discuss} this'), false, 'inline mention not detected');
  assert.equal(
    hasDiscussMarker('the {discuss} fix must land'),
    false,
    'inline mention not detected'
  );
});

test('hasDiscussMarker: backticked mention, even alone on a line → false (#479 AC3)', () => {
  assert.equal(hasDiscussMarker('`{discuss}`'), false, 'backticked-alone not detected');
  assert.equal(
    hasDiscussMarker('use the `{discuss}` token'),
    false,
    'inline backticked not detected'
  );
});

test('hasDiscussMarker: prefixed / quoted lines → false (#479 AC4)', () => {
  assert.equal(hasDiscussMarker('- {discuss}'), false, 'list item not detected');
  assert.equal(hasDiscussMarker('> {discuss}'), false, 'blockquote not detected');
  assert.equal(hasDiscussMarker('marker: {discuss}'), false, 'key:value not detected');
});

test('hasDiscussMarker: trivial / no-bare-token bodies → false (#479 AC5)', () => {
  assert.equal(hasDiscussMarker('nothing here'), false, 'absent → false');
  assert.equal(hasDiscussMarker(''), false, 'empty → false');
  assert.equal(hasDiscussMarker(null), false, 'null → false');
  assert.equal(
    hasDiscussMarker('a body\nthat mentions {discuss} only inline\nand `{discuss}` in code'),
    false,
    'multi-line body with no bare-token line → false'
  );
});

// --- markDiscussed: strips ONLY line-alone markers (#479 AC6) ----------------
test('markDiscussed: strips the bare line-alone marker + stamps audit marker', () => {
  const out = markDiscussed('Raw idea\n\n{discuss}\n', { ts: '2026-06-15T00:00:00Z' });
  assert.ok(!hasDiscussMarker(out), 'bare marker gone');
  assert.ok(out.includes('Raw idea'), 'surrounding prose preserved');
  assert.ok(
    out.includes('<!-- aitm-discussed ts="2026-06-15T00:00:00Z" -->'),
    'marker stamped with ts'
  );
});

test('markDiscussed: leaves inline / prose / backticked mentions untouched (#479 AC6)', () => {
  const src = 'the {discuss} fix\nand `{discuss}` in code\n\n{discuss}\n';
  const out = markDiscussed(src, { ts: 'T' });
  assert.ok(out.includes('the {discuss} fix'), 'inline prose mention preserved verbatim');
  assert.ok(out.includes('`{discuss}` in code'), 'backticked mention preserved verbatim');
  assert.ok(!hasDiscussMarker(out), 'the only bare-token line was removed');
});

test('markDiscussed: removes the whole bare-token line (no stray blank line)', () => {
  const out = markDiscussed('a\n{discuss}\nb', { ts: 'T' });
  const body = out.split('\n\n')[0]; // before the appended marker block
  assert.equal(body, 'a\nb', 'bare-token line collapsed, neighbors join directly');
});

// --- markDiscussed: idempotent, exactly one audit marker (#479 AC7) ----------
test('markDiscussed: idempotent on second call, single audit marker', () => {
  const once = markDiscussed('idea\n{discuss}', { ts: 'T' });
  const twice = markDiscussed(once, { ts: 'T' });
  assert.equal(twice, once, 'second call is a no-op');
  const markerCount = (twice.match(/aitm-discussed/g) || []).length;
  assert.equal(markerCount, 1, 'exactly one aitm-discussed marker');
});

test('markDiscussed: a body with only inline mentions still stamps once, strips nothing', () => {
  const src = 'mentions {discuss} inline only';
  const out = markDiscussed(src, { ts: 'T' });
  assert.ok(out.includes('mentions {discuss} inline only'), 'inline mention untouched');
  assert.equal((out.match(/aitm-discussed/g) || []).length, 1, 'audit marker stamped once');
});

// --- markDiscussed: preserves invariant markers -----------------------------
test('markDiscussed: preserves invariant markers', () => {
  const base = [
    '<!-- aitm-last-known-state state="develop" ts="2026-06-15T00:00:00Z" -->',
    '',
    '## Scope',
    '',
    'Do the thing.',
    '',
    '{discuss}',
    '',
    '<!-- aitm-fields: size=M -->',
    '<!-- aitm-plan-approved ts="2026-06-15T00:00:00Z" -->',
  ].join('\n');
  const out = markDiscussed(base, { ts: 'T' });
  assert.deepEqual(findLostMarkers(base, out), [], 'no invariant markers lost');
  assert.ok(!hasDiscussMarker(out), 'bare marker consumed');
});

// --- round-trip: detect → resolve → no longer detected ----------------------
test('round-trip: a bare marker is detected, then resolved, then not detected', () => {
  const src = 'flesh me out\n\n{discuss}\n';
  assert.equal(hasDiscussMarker(src), true, 'detected before resolution');
  const resolved = markDiscussed(src, { ts: 'T' });
  assert.equal(hasDiscussMarker(resolved), false, 'not detected after resolution');
});

// --- finalizeDiscussion: scope splice + token consume, single write ---------
test('finalizeDiscussion: scope splice + token consume in one write; prose mention survives', () => {
  return (async () => {
    const base = [
      '<!-- aitm-last-known-state state="refine" ts="2026-06-15T00:00:00Z" -->',
      '',
      '## Scope',
      '',
      'sparse',
      '',
      '{discuss}',
      '',
      '## Acceptance Criteria',
      '',
      '- [ ] tbd',
      '',
      '## Notes',
      '',
      'keep this {discuss} mention in prose',
      '',
      '## Verification Commands',
      '',
      '- [ ] `npm test`',
    ].join('\n');

    let calls = 0;
    let current = base;
    const deps = {
      ...governedEffectDeps,
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
    assert.ok(!hasDiscussMarker(current), 'bare marker consumed');
    assert.ok(
      current.includes('keep this {discuss} mention in prose'),
      'inline prose mention survives resolution'
    );
    assert.ok(current.includes('aitm-discussed'), 'audit marker stamped');
    assert.ok(current.includes('## Verification Commands'), 'untouched section preserved');
    assert.deepEqual(findLostMarkers(base, current), [], 'no invariant markers lost');
  })();
});

// #495 banner formatters + finalizeDiscussion end-banner emission live in
// discuss-banner-format.test.mjs (kept separate so this file stays under cap).

// --- finalizeDiscussion: requires scope -------------------------------------
test('finalizeDiscussion: rejects empty scope', () =>
  assert.rejects(
    () => finalizeDiscussion({ issueNumber: 1, repo: 'o/r', scope: '' }),
    /scope` is required/,
    'empty scope rejected'
  ));

// --- #486: durable request marker + convergence -----------------------------
const REQUEST_MARKER = '<!-- aitm-discuss-requested -->';

test('hasDiscussRequest: detects the durable request marker; disjoint from aitm-discussed', () => {
  assert.equal(hasDiscussRequest(`x\n${REQUEST_MARKER}\n`), true, 'bare request marker → true');
  assert.equal(
    hasDiscussRequest('<!-- aitm-discuss-requested ts="T" -->'),
    true,
    'request marker with ts → true'
  );
  assert.equal(hasDiscussRequest('<!-- aitm-discussed -->'), false, 'discussed is NOT a request');
  assert.equal(hasDiscussRequest('no markers'), false, 'absent → false');
});

test('hasDiscussedMarker: detects completion; disjoint from request', () => {
  assert.equal(hasDiscussedMarker('<!-- aitm-discussed ts="T" -->'), true, 'discussed → true');
  assert.equal(hasDiscussedMarker(REQUEST_MARKER), false, 'request marker is NOT discussed');
  assert.equal(hasDiscussedMarker(''), false, 'empty → false');
});

test('isDiscussPending: token OR request marker while not yet discussed', () => {
  assert.equal(isDiscussPending('idea\n{discuss}\n'), true, 'token-only → pending');
  assert.equal(isDiscussPending(`idea\n${REQUEST_MARKER}\n`), true, 'marker-only → pending');
  assert.equal(isDiscussPending(`{discuss}\n${REQUEST_MARKER}`), true, 'both → pending');
  assert.equal(
    isDiscussPending(`{discuss}\n${REQUEST_MARKER}\n<!-- aitm-discussed -->`),
    false,
    'discussed short-circuits even with token + marker present'
  );
  assert.equal(isDiscussPending('plain body'), false, 'no signal → not pending');
});

test('convergeDiscuss: strips token, ensures exactly one request marker', () => {
  const out = convergeDiscuss('idea\n\n{discuss}\n', { ts: 'T' });
  assert.ok(!hasDiscussMarker(out), 'visible token stripped');
  assert.ok(out.includes('<!-- aitm-discuss-requested ts="T" -->'), 'request marker stamped');
  assert.ok(out.includes('idea'), 'surrounding prose preserved');
  assert.equal(
    (out.match(/aitm-discuss-requested/g) || []).length,
    1,
    'exactly one request marker'
  );
});

test('convergeDiscuss: idempotent — byte-stable fixed point on re-run', () => {
  const once = convergeDiscuss('idea\n{discuss}', { ts: 'T' });
  const twice = convergeDiscuss(once, { ts: 'T' });
  assert.equal(twice, once, 'second convergence is a no-op');
  assert.equal((twice.match(/aitm-discuss-requested/g) || []).length, 1, 'still one marker');
});

test('convergeDiscuss: collapses duplicate request markers to one', () => {
  const dup = `idea\n${REQUEST_MARKER}\n${REQUEST_MARKER}\n{discuss}\n`;
  const out = convergeDiscuss(dup, { ts: 'T' });
  assert.equal((out.match(/aitm-discuss-requested/g) || []).length, 1, 'collapsed to one marker');
  assert.ok(!hasDiscussMarker(out), 'token stripped');
});

test('convergeDiscuss: marker-only body keeps the marker, stays pending', () => {
  const out = convergeDiscuss(`idea\n${REQUEST_MARKER}\n`, { ts: 'T' });
  assert.ok(hasDiscussRequest(out), 'request marker preserved');
  assert.ok(isDiscussPending(out), 'still pending');
});

test('convergeDiscuss: already-discussed body is returned unchanged', () => {
  const done = `idea\n{discuss}\n<!-- aitm-discussed ts="T" -->`;
  assert.equal(convergeDiscuss(done, { ts: 'T2' }), done, 'completed issue never re-converges');
});

test('convergeDiscuss: no signal → unchanged', () => {
  const plain = '## Scope\n\nplain body';
  assert.equal(convergeDiscuss(plain, { ts: 'T' }), plain, 'nothing to converge');
});

test('markDiscussed: also strips the durable request marker on completion', () => {
  const src = `idea\n{discuss}\n${REQUEST_MARKER}\n`;
  const out = markDiscussed(src, { ts: 'T' });
  assert.ok(!hasDiscussMarker(out), 'token stripped');
  assert.ok(!hasDiscussRequest(out), 'request marker stripped');
  assert.ok(hasDiscussedMarker(out), 'aitm-discussed stamped');
  assert.equal(isDiscussPending(out), false, 'no longer pending after completion');
});

test('markDiscussed: converge → complete round-trip strips both carriers', () => {
  const converged = convergeDiscuss('idea\n{discuss}', { ts: 'T' });
  assert.ok(hasDiscussRequest(converged) && !hasDiscussMarker(converged), 'converged state');
  const done = markDiscussed(converged, { ts: 'T' });
  assert.ok(!hasDiscussRequest(done) && !hasDiscussMarker(done), 'both carriers gone');
  assert.ok(hasDiscussedMarker(done), 'discussed stamped');
});

test('convergeDiscuss: preserves invariant markers', () => {
  const base = [
    '<!-- aitm-last-known-state state="backlog" ts="T" -->',
    '',
    '## Scope',
    '',
    'sparse',
    '',
    '{discuss}',
    '',
    '<!-- aitm-fields: size=M -->',
  ].join('\n');
  const out = convergeDiscuss(base, { ts: 'T' });
  assert.deepEqual(findLostMarkers(base, out), [], 'no invariant markers lost');
});

// --- template parity --------------------------------------------------------
test('template parity: user-request.yml hardcodes the token; task/bug do not', () => {
  const tplPath = resolve(repoRoot, '.github/ISSUE_TEMPLATE/user-request.yml');
  const raw = readFileSync(tplPath, 'utf8');
  assert.ok(/^name:\s*User Request\s*$/m.test(raw), 'name is "User Request"');
  assert.ok(raw.includes('{discuss}'), 'hardcodes {discuss} token');
  const requiredCount = (raw.match(/required:\s*true/g) || []).length;
  assert.equal(requiredCount, 1, 'exactly one required field');
  assert.ok(/id:\s*description/.test(raw), 'has a Description field');

  for (const name of ['task.yml', 'bug.yml']) {
    const other = readFileSync(resolve(repoRoot, '.github/ISSUE_TEMPLATE', name), 'utf8');
    assert.ok(!other.includes('{discuss}'), `${name} does not carry {discuss}`);
  }
});
