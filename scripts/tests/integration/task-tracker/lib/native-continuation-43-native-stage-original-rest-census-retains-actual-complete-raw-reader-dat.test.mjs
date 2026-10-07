// @story #1855
import { assert, nativeFinalFixture, path, rawLifecycleSources, readFileSync, test, withRevisionConsumer, writeFileSync } from './native-continuation-fixtures.mjs';

test('native stage original REST census retains actual complete raw reader data and all prior record bytes', async () => {
  const module = await import('../../../../task-tracker/lib/move-state/transition-commit.mjs');
  const f = await nativeFinalFixture();
  try {
    const retained = f.backend.comments;
    const comments = retained.map((comment, index) => ({ id: index + 101, node_id: comment.id,
      body: comment.body, issue_url: `https://api.github.com/repos/${f.context.repository}/issues/${f.context.issue}`,
      user: { login: 'fixture-original-author' }, created_at: '2026-10-06T09:00:00Z' }));
    const pair = { request: { file: 'gh', args: ['api', '--paginate', '--slurp',
      `repos/${f.context.repository}/issues/${f.context.issue}/comments`] },
      response: { stdout: JSON.stringify([comments.slice(0, 1), comments.slice(1)]), stderr: '', exitCode: 0 } };
    f.restart(snapshot => { snapshot.lifecycleSources = rawLifecycleSources(snapshot.observation);
      snapshot.lifecycleSources.remote.stageComments = pair; });
    const before = f.backend.snapshot;
    const input = { repository: f.context.repository, issue: f.context.issue, projectDir: f.projectDir };
    const result = await withRevisionConsumer({ repository: f.context.repository, issue: f.context.issue,
      backend: f.backend, activity: 'stage-write' }, () => module.readNativeStageCommentCensus(input));
    assert.deepEqual(result, comments);
    assert.deepEqual(module.readNativeStageCommentCensusData(result), pair);
    const { canonicalRecordJson } = await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
    const recordedFile = path.join(f.projectDir, 'recorded-stage-comments.json');
    writeFileSync(recordedFile, canonicalRecordJson({ observation: f.backend.observation,
      lifecycleSources: f.backend.snapshot.lifecycleSources, retained: f.backend.comments }));
    const recordedInput = JSON.parse(readFileSync(recordedFile, 'utf8'));
    const recorded = await module.deriveRecordedStageCommentCensus(recordedInput);
    assert.deepEqual(recorded, comments);
    assert.equal(module.readNativeStageCommentCensusData(recorded), null);
    await assert.rejects(module.deriveRecordedStageCommentCensus({ ...recordedInput, ready: true }));
    assert.equal(module.readNativeStageCommentCensusData(structuredClone(result)), null);
    assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result[0].user));
    assert.deepEqual(f.backend.snapshot, before); assert.deepEqual(f.effects, []);
    for (const [name, change] of [
      ['failed raw read', p => { p.response.exitCode = 1; }],
      ['partial raw read', p => { p.response.stderr = 'partial'; }],
      ['malformed pages', p => { p.response.stdout = '{}'; }],
      ['duplicate identity', p => { p.response.stdout = JSON.stringify([[comments[0], comments[0]]]); }],
      ['foreign subject', p => { const c = structuredClone(comments); c[0].issue_url += '5'; p.response.stdout = JSON.stringify([c]); }],
      ['missing old record', p => { p.response.stdout = '[]'; }],
      ['changed old record', p => { const c = structuredClone(comments); c[0].body += 'changed'; p.response.stdout = JSON.stringify([c]); }],
    ]) {
      const altered = structuredClone(pair); change(altered);
      f.restart(snapshot => { snapshot.lifecycleSources.remote.stageComments = altered; });
      await assert.rejects(withRevisionConsumer({ repository: f.context.repository, issue: f.context.issue,
        backend: f.backend, activity: 'stage-write' }, () => module.readNativeStageCommentCensus(input)),
      error => error.code === 'revision-authority-unavailable', name);
      await assert.rejects(module.deriveRecordedStageCommentCensus({ observation: f.backend.observation,
        lifecycleSources: f.backend.snapshot.lifecycleSources, retained: f.backend.comments }),
        error => error.message.includes('criteria-revision:native-stage-comment-data'), name);
      assert.deepEqual(f.effects, []);
    }
  } finally { f.dispose(); }
});
