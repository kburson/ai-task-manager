// @story #949
// Unit tests for scripts/task-tracker/lib/git-provenance.mjs.
//
// The precedence order is the whole contract, so each row is pinned
// individually — including the one that must NOT be swallowed by the shallow
// escape hatch. A `skip` that ate a genuine `fail` would turn CI green while
// silently never checking rename provenance again, which is worse than the red
// it replaces.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { provenanceVerdict, isShallowRepository } from '../../../lib/git-provenance.mjs';

test('a multi-commit follow history proves provenance', () => {
  const v = provenanceVerdict({ followCount: 4 });
  assert.equal(v.status, 'ok');
  assert.match(v.reason, /4 commits/);
});

test('a staged rename target proves provenance with a single-commit history', () => {
  // Pre-commit `git mv` (e.g. under verify-develop): the rename exists in the
  // index, the history that would carry it does not exist yet.
  const v = provenanceVerdict({ followCount: 1, stagedRename: true });
  assert.equal(v.status, 'ok');
  assert.match(v.reason, /staged rename/);
});

test('a shallow repository yields skip, not a false failure (#949 — the CI case)', () => {
  const v = provenanceVerdict({ followCount: 1, stagedRename: false, shallow: true });
  assert.equal(v.status, 'skip');
  assert.match(v.reason, /shallow/i);
  assert.match(v.reason, /fetch-depth: 0/, 'the reason must name the remedy');
});

test('full history with no rename chain still fails — the hatch introduces no false green', () => {
  const v = provenanceVerdict({ followCount: 1, stagedRename: false, shallow: false });
  assert.equal(v.status, 'fail');
  assert.match(v.reason, /no git-mv provenance/);
  assert.match(v.reason, /follow-history=1/);
});

test('a rename chain wins over shallowness — evidence counts wherever it is found', () => {
  // `ok` is checked BEFORE `shallow` on purpose: a shallow clone that
  // nonetheless carries a chain has answered the question.
  const v = provenanceVerdict({ followCount: 3, shallow: true });
  assert.equal(v.status, 'ok');
});

test('a staged rename also wins over shallowness', () => {
  const v = provenanceVerdict({ followCount: 1, stagedRename: true, shallow: true });
  assert.equal(v.status, 'ok');
});

test('a zero or missing follow count is treated as no history, not as a crash', () => {
  assert.equal(provenanceVerdict({ followCount: 0 }).status, 'fail');
  assert.equal(provenanceVerdict({}).status, 'fail');
  assert.equal(provenanceVerdict().status, 'fail');
  assert.equal(provenanceVerdict({ followCount: NaN }).status, 'fail');
});

test('isShallowRepository reads git rather than inferring from the follow count', () => {
  const calls = [];
  const git = (args) => {
    calls.push(args.join(' '));
    return 'true\n';
  };
  assert.equal(isShallowRepository(git), true);
  assert.deepEqual(calls, ['rev-parse --is-shallow-repository']);
  assert.equal(
    isShallowRepository(() => 'false\n'),
    false
  );
});

test('isShallowRepository fails closed — an erroring git reports full history', () => {
  // Fail-closed means the provenance assertion still runs and can still fail
  // loudly. Failing open would silently skip it forever.
  const v = isShallowRepository(() => {
    throw new Error('not a git repository');
  });
  assert.equal(v, false);
});
