// @story #2096
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEAD, NEXT_HEAD, deliver, makeHarness } from './deliver-test-harness.mjs';

test('native delivery uses exact artifact PR and keeps controller observations real', async () => {
  const treeSha = 'd'.repeat(40);
  const artifactSubject = { commitSha: HEAD, treeSha };
  const h = makeHarness({ prSourceEvidence: [{ oid: HEAD, tree: treeSha }] });
  let checks = 0;
  h.deps.assertArtifactDeliveryContext = async (input) => {
    assert.deepEqual(input.artifactSubject, artifactSubject);
    checks++;
  };
  h.deps.getCurrentBranch = async () => 'controller';
  h.deps.getLocalHeadSha = async () => NEXT_HEAD;
  h.deps.listPullRequests = async ({ headSha }) => {
    assert.equal(headSha, HEAD);
    return [{ number: h.data.prNumber }];
  };
  h.deps.listCommitSubjects = async ({ range }) => {
    assert.equal(range, `origin/trunk..${HEAD}`);
    return h.data.commitSubjects;
  };
  const result = await deliver(h, { artifactSubject });
  assert.equal(result.status, 'action-required');
  assert.equal(result.action.expectedHeadSha, HEAD);
  assert.ok(checks >= 2);
  assert.equal(h.data.head, HEAD);
  assert.equal(h.calls.terminalClosure, 0);
});
