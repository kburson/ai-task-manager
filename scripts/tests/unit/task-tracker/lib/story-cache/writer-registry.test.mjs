// @story #2039 #2056
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  registerStoryWriter,
  resolveStoryWriter,
} from '../../../../../task-tracker/lib/story-cache/writer-registry.mjs';
const identity = {
  host: 'github.com',
  repository: 'owner/repo',
  issueNumber: 2056,
  issueNodeId: 'I_test',
  projectId: 'P_test',
  projectItemId: 'PI_test',
};
const claim = {
  schema: 'aitm.story-writer-claim/v1',
  claimId: 'claim-A',
  identityKey: 'a'.repeat(64),
  human: 'tester',
  sessionId: 'author-A',
  worktree: '/project',
  cachePath: '/project/.tmp/gh/github.com/repo/2056',
  status: 'owned',
  transfer: null,
  registryKey: 'b'.repeat(64),
};
for (const registry of [
  undefined,
  null,
  {},
  {
    path: '/project/.git/aitm/story-writers',
    identityPath: '/project/.git/aitm/story-writers.identity.json',
  },
]) {
  test(`copied or unavailable capability cannot resolve a pointer: ${JSON.stringify(registry)}`, () =>
    assert.throws(() => resolveStoryWriter({ identity, registry }), {
      code: 'STORY_WRITER_UNAVAILABLE',
    }));
  test(`copied or unavailable capability cannot register a pointer: ${JSON.stringify(registry)}`, () =>
    assert.throws(() => registerStoryWriter({ claim, registry }), {
      code: 'STORY_WRITER_UNAVAILABLE',
    }));
}
for (const bad of [
  undefined,
  null,
  {},
  { ...claim, status: 'released' },
  { ...claim, transfer: { target: 'other' } },
  { ...claim, body: 'unpublished' },
  { ...claim, pid: 0 },
  { ...claim, registryKey: undefined },
  { ...claim, worktree: '/project/../project' },
  { ...claim, cachePath: '/elsewhere' },
])
  test(`malformed or content-bearing claim refuses: ${JSON.stringify(bad)}`, () =>
    assert.throws(() => registerStoryWriter({ claim: bad, registry: {} }), {
      code: 'STORY_WRITER_UNAVAILABLE',
    }));
for (const bad of [
  undefined,
  null,
  {},
  { ...identity, issueNumber: 0 },
  { ...identity, repository: 'bad' },
  { ...identity, projectItemId: '' },
  { ...identity, extra: 'field' },
])
  test(`malformed identity refuses: ${JSON.stringify(bad)}`, () =>
    assert.throws(() => resolveStoryWriter({ identity: bad, registry: {} }), {
      code: 'STORY_WRITER_UNAVAILABLE',
    }));
