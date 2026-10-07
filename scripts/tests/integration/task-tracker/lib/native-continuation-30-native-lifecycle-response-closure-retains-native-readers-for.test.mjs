// @story #1855
import { assert, evaluateNativeRevisionStageGuards, nativeFinalFixture, path, rawLifecycleSources, test, withRevisionConsumer, writeFileSync } from './native-continuation-fixtures.mjs';

for (const [name, alter, refused] of [
  ['native CLI comment metadata', r => { r.comments.commit[0].response = [{ id: 'IC_fixture', body: 'ordinary note',
    author: { login: 'fixture', id: 'U_fixture', name: 'Fixture' }, authorAssociation: 'OWNER',
    createdAt: '2026-10-06T00:00:00Z', includesCreatedEdit: false, isMinimized: false, minimizedReason: null,
    reactionGroups: [{ content: 'THUMBS_UP', users: { totalCount: 1 } }],
    url: 'https://github.com/example/criteria/issues/124#issuecomment-1', viewerDidAuthor: true }]; }, false],
  ['foreign dependency repository', r => { r.dependencies[0].response.blockedBy.nodes = [{ id: 'I_foreign', number: 125,
    title: 'Foreign dependency', url: 'https://github.com/foreign/criteria/issues/125', state: 'OPEN',
    repository: { nameWithOwner: 'foreign/criteria' } }]; r.dependencies[0].response.blockedBy.totalCount = 1; }, true],
  ['foreign workflow issue', r => { r.comments.workflow[0].response.data.repository.issue.number = 125; }, true],
  ['partial GraphQL errors', r => { r.comments.workflow[0].response.errors = [{ message: 'partial native read' }]; }, true],
  ['partial child page', r => { r.children.pages[0].response.repository.issue.subIssues.pageInfo = { hasNextPage: true, endCursor: 'next' }; }, true],
  ['unknown comment author field', r => { r.comments.commit[0].response = [{ id: 'IC_fixture', body: 'ordinary note', author: { login: 'fixture', ready: true } }]; }, true],
  ['nonboolean page completion', r => { r.children.pages[0].response.repository.issue.subIssues.pageInfo.hasNextPage = 'false'; }, true],
]) test(`native lifecycle response closure retains native readers for ${name}`, async () => {
  const f = await nativeFinalFixture();
  try {
    const cfg = { repo: f.context.repository, projectId: 'PVT_fixture', fieldDisposition: 'PVTF_disposition' };
    writeFileSync(path.join(f.projectDir, '.ai-task-manager/task-tracker.json'), JSON.stringify(cfg));
    let error, result;
    try {
      f.restart(snapshot => { snapshot.lifecycleSources = rawLifecycleSources(snapshot.observation); alter(snapshot.lifecycleSources.remote); });
      result = await withRevisionConsumer({ repository: f.context.repository, issue: f.context.issue,
        backend: f.backend, projectDir: f.projectDir, activity: 'stage-write' }, () => evaluateNativeRevisionStageGuards({ cfg,
        projectDir: f.projectDir, issueArg: String(f.context.issue), stateArg: 'test', resolvedFromState: 'develop', plan: { runGuardPipeline: true } }));
    } catch (caught) { error = caught; }
    if (refused) {
      if (name === 'foreign workflow issue') {
        assert.equal(error, undefined);
        assert.ok(result.guardResult.refusals.some(refusal => refusal.code === 'authority-read-failed' &&
          refusal.args?.source === 'workflow-policy' && refusal.args?.subject?.issue === f.context.issue),
        'actual workflow reader must emit its source-specific authority failure, not only unrelated body refusals');
      } else assert.ok(error, `actual source boundary must refuse this input independently of unmet body guards: ${JSON.stringify(result)}`);
    } else {
      assert.equal(error, undefined);
      assert.ok(result?.guardResult, 'native metadata reaches actual guard evaluation as data');
      assert.deepEqual(f.backend.snapshot.lifecycleSources.remote.comments.commit[0].response[0].author,
        { login: 'fixture', id: 'U_fixture', name: 'Fixture' });
    }
    assert.deepEqual(f.effects, []);
  } finally { f.dispose(); }
});
