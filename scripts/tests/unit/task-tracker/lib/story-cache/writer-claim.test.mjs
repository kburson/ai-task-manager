// @story #2039 #2042
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as ownership from '../../../../../task-tracker/lib/ownership-policy.mjs';
import { assertStoryWriter } from '../../../../../task-tracker/lib/story-cache/writer-claim.mjs';
const claim = () => ({
  schema: 'aitm.story-writer-claim/v1',
  claimId: 'claim-A',
  identityKey: 'a'.repeat(64),
  human: 'tester',
  sessionId: 'author-A',
  worktree: '/project',
  cachePath: '/project/.tmp/gh/github.com/repo/2039',
  status: 'owned',
  transfer: null,
});
const context = () => ({ sessionId: 'author-A', worktree: '/project' });
test('the exact local claim owner is admitted', () =>
  assert.doesNotThrow(() => assertStoryWriter(claim(), context())));
for (const override of [{ sessionId: 'author-B' }, { worktree: '/other' }])
  test(`another local owner is refused: ${JSON.stringify(override)}`, () => {
    assert.throws(() => assertStoryWriter(claim(), { ...context(), ...override }), {
      code: 'STORY_WRITER_OWNED',
    });
  });
for (const [field, value] of [
  ['schema', 'other'],
  ['claimId', ''],
  ['identityKey', 'bad'],
  ['human', ''],
  ['sessionId', ''],
  ['worktree', 'relative'],
  ['worktree', '/project/../project'],
  ['cachePath', '/elsewhere/.tmp/gh/2039'],
  ['cachePath', '/project/.tmp/gh/../outside'],
  ['status', 'expired'],
  ['status', 'released'],
  ['transfer', { target: 'other' }],
])
  test(`malformed or inactive claim refuses ${field}=${JSON.stringify(value)}`, () => {
    assert.throws(() => assertStoryWriter({ ...claim(), [field]: value }, context()), {
      code: 'STORY_WRITER_UNAVAILABLE',
    });
  });
for (const invalid of [undefined, null, {}, []])
  test(`missing claim is unavailable: ${JSON.stringify(invalid)}`, () => {
    assert.throws(() => assertStoryWriter(invalid, context()), {
      code: 'STORY_WRITER_UNAVAILABLE',
    });
  });
for (const [assignment, kind] of [
  [[], 'assignment-required'],
  [['tester', 'other'], 'multiple-owners'],
  [['tester', 'tester'], 'multiple-owners'],
  [['other'], 'foreign-owner'],
  [null, 'ownership-unverifiable'],
  [[''], 'ownership-unverifiable'],
  [[{}], 'ownership-unverifiable'],
  [[{ login: 'tester' }, {}], 'ownership-unverifiable'],
])
  test(`cache writer refuses ${JSON.stringify(assignment)}`, () => {
    const result = ownership.cacheWriterOwnershipDecision({
      assignees: assignment,
      currentUser: 'tester',
    });
    assert.equal(result.ok, false);
    assert.equal(result.kind, kind);
    assert.throws(() => assertStoryWriter(claim(), { ...context(), assignment }), {
      code: 'STORY_WRITER_ASSIGNMENT',
    });
  });
test('one matching live human is admitted with canonical login comparison', () => {
  assert.equal(
    ownership.cacheWriterOwnershipDecision({
      assignees: [{ login: 'Tester' }],
      currentUser: 'TESTER',
    }).ok,
    true
  );
  assert.doesNotThrow(() => assertStoryWriter(claim(), { ...context(), assignment: ['tester'] }));
});
test('cache writer does not change existing team-unassigned read admission', () => {
  assert.equal(
    ownership.ownershipDecision({ state: 'plan', assignees: [], currentUser: 'tester' }).kind,
    'team-unassigned'
  );
  assert.equal(
    ownership.ownershipDecision({ state: 'plan', assignees: [], currentUser: 'tester' }).ok,
    true
  );
});
for (const human of ['not/a/login', 'bad user', 'UPPER'])
  test(`malformed stored human ${human} is unavailable`, () => {
    assert.throws(() => assertStoryWriter({ ...claim(), human }, context()), {
      code: 'STORY_WRITER_UNAVAILABLE',
    });
  });
test('unknown claim fields cannot introduce lease or process takeover authority', () => {
  assert.throws(() => assertStoryWriter({ ...claim(), pid: -1 }, context()), {
    code: 'STORY_WRITER_UNAVAILABLE',
  });
});
