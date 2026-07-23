// @story #772
// `vc:N` citations resolve by STABLE ID, not by ordinal position — so
// reordering or deleting OTHER entries never re-points a citation, and a
// citation to a deleted id never silently resolves to a reused slot.
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseVerificationCommands } from '../../../lib/verification-commands.mjs';
import { resolveVcRefCommands, resolveCitedOrLiteralCommands } from '../../../lib/vc-ref.mjs';
import { renderVcSection, deleteVcById, appendVcCommands } from '../../../lib/vc-emit.mjs';

const vcOf = (commands, startId = 1) =>
  parseVerificationCommands(renderVcSection(commands, startId));

// ---- AC3: resolve by id, independent of position ---------------------------

test('vc:N resolves the entry whose id === N, wherever it sits (AC3)', () => {
  const vc = vcOf(['alpha', 'beta', 'gamma']); // ids 1,2,3
  assert.deepEqual(resolveVcRefCommands('vc:2', vc), ['beta']);
  assert.deepEqual(resolveVcRefCommands('vc:1 vc:3', vc), ['alpha', 'gamma']);
});

test('reordering the VC lines does not change what a citation resolves to (AC3)', () => {
  const original = renderVcSection(['alpha', 'beta', 'gamma']); // 1,2,3
  const lines = original.split('\n');
  // Physically swap the alpha (id 1) and gamma (id 3) lines.
  const i1 = lines.findIndex((l) => l.includes('`alpha`'));
  const i3 = lines.findIndex((l) => l.includes('`gamma`'));
  [lines[i1], lines[i3]] = [lines[i3], lines[i1]];
  const reordered = parseVerificationCommands(lines.join('\n'));
  // Position of gamma is now first, but vc:3 still means gamma.
  assert.deepEqual(resolveVcRefCommands('vc:3', reordered), ['gamma']);
  assert.deepEqual(resolveVcRefCommands('vc:1', reordered), ['alpha']);
});

// ---- AC4: deleting other entries never re-points a live citation -----------

test('deleting an EARLIER entry does not shift a later citation (AC4)', () => {
  const body = renderVcSection(['alpha', 'beta', 'gamma']); // 1,2,3
  const afterDelete = deleteVcById(body, 1); // remove alpha (id 1)
  const vc = parseVerificationCommands(afterDelete);
  // Ordinal resolution would now read vc:3 off the end (only 2 live entries);
  // by-id keeps vc:3 pinned to gamma.
  assert.deepEqual(resolveVcRefCommands('vc:3', vc), ['gamma']);
  assert.deepEqual(resolveVcRefCommands('vc:2', vc), ['beta']);
});

test('a citation to a deleted id resolves to nothing, never a reused slot (AC4)', () => {
  let body = renderVcSection(['alpha', 'beta', 'gamma']); // 1,2,3
  body = deleteVcById(body, 3); // tombstone gamma's id 3
  body = appendVcCommands(body, ['delta']); // delta gets id 4, NOT 3
  const vc = parseVerificationCommands(body);
  // vc:3 (the deleted gamma) must not resolve to delta or anything live.
  assert.throws(() => resolveVcRefCommands('vc:3', vc), /vc:3 does not exist/);
  // delta is reachable only at its real id, 4.
  assert.deepEqual(resolveVcRefCommands('vc:4', vc), ['delta']);
});

// ---- backward-compat: legacy id-less bodies keep ordinal resolution --------

test('a legacy id-less VC list still resolves by ordinal (backward-compat)', () => {
  const legacy = [
    { command: 'npm test', label: '`npm test`', checked: false, lineIndex: 2, id: null },
    { command: 'npm run lint', label: '`npm run lint`', checked: false, lineIndex: 3, id: null },
  ];
  assert.deepEqual(resolveVcRefCommands('vc:2', legacy), ['npm run lint']);
});

// ---- resolveCitedOrLiteralCommands: #804 ordinal fallback retired -----------

test('resolveCitedOrLiteralCommands: only backtick literals (ordinal citation retired #804)', () => {
  const vc = vcOf(['node --test a.test.mjs', 'node --test b.test.mjs']); // 1,2
  // #804 — a `vc:N` value is no longer resolved as a citation here; the canonical
  // by-id citation lives on `vc-list` (resolveVcListStrict), so an ordinal `cmd`
  // value carries no backtick literals and yields nothing.
  assert.deepEqual(resolveCitedOrLiteralCommands('vc:2', vc), []);
  // A backtick-embedded literal command still extracts, unchanged (DoD form).
  assert.deepEqual(resolveCitedOrLiteralCommands('`node --test z.test.mjs`', vc), [
    'node --test z.test.mjs',
  ]);
});
