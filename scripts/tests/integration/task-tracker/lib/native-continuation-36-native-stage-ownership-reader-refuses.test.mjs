// @story #1855
import { assert, evaluateNativeRevisionStageGuards, nativeAssignmentPairs, nativeFinalFixture, path, rawLifecycleSources, test, withRevisionConsumer, writeFileSync } from './native-continuation-fixtures.mjs';

for (const [name, alter, schema] of [
  ['foreign owner', remote => { remote.identity.response.stdout = 'foreign-owner\n'; }, false],
  ['multiple owners', remote => { for (const entry of remote.assignments.pages) entry.response.repository.issue.assignees.nodes.push({ login: 'other-owner' }); }, false],
  ['unassigned in-flight issue', remote => { for (const entry of remote.assignments.pages) entry.response.repository.issue.assignees.nodes = []; }, false],
  ['failed identity transport', remote => { remote.identity.response.exitCode = 1; }, false],
  ['partial identity diagnostic', remote => { remote.identity.response.stderr = 'partial response'; }, false],
  ['malformed identity', remote => { remote.identity.response.stdout = '@invalid\n'; }, false],
  ['identity without complete membership', remote => { remote.assignments = { pages: [], final: [] }; }, false],
  ['foreign identity request', remote => { remote.identity.request.args = ['api', 'users/foreign', '--jq', '.login']; }, true],
  ['identity result scalar', remote => { remote.identity.response.ready = true; }, true],
]) test(`native stage ownership reader refuses ${name} without effects`, async () => {
  const f = await nativeFinalFixture();
  try {
    const cfg = { repo: f.context.repository, projectId: 'PVT_fixture', fieldDisposition: 'PVTF_disposition' };
    writeFileSync(path.join(f.projectDir, '.ai-task-manager/task-tracker.json'), JSON.stringify(cfg));
    const enrich = snapshot => {
      snapshot.lifecycleSources = rawLifecycleSources(snapshot.observation);
      snapshot.lifecycleSources.remote.assignments = nativeAssignmentPairs(f.context, false);
      snapshot.lifecycleSources.remote.identity = { request: { file: 'gh', args: ['api', 'user', '--jq', '.login'] },
        response: { stdout: 'native-fixture-owner\n', stderr: '', exitCode: 0 } };
      alter(snapshot.lifecycleSources.remote);
    };
    if (schema) {
      const before = f.backend.snapshot;
      assert.throws(() => f.restart(enrich), /lifecycle-source/);
      assert.deepEqual(f.backend.snapshot, before);
    } else {
      f.restart(enrich);
      const before = f.backend.snapshot;
      await assert.rejects(withRevisionConsumer({ repository: f.context.repository, issue: f.context.issue,
        activity: 'stage-write', backend: f.backend, projectDir: f.projectDir }, () => evaluateNativeRevisionStageGuards({
        cfg, projectDir: f.projectDir, issueArg: String(f.context.issue), stateArg: 'test',
        resolvedFromState: 'develop', plan: { runGuardPipeline: true },
      })), error => error.code === 'revision-authority-unavailable');
      assert.deepEqual(f.backend.snapshot, before);
    }
  } finally { f.dispose(); }
});
