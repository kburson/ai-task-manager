// @story #1855
import {
  assert,
  createRevisionMemory,
  createSandbox,
  fixture,
  nativeReadTimingBody,
  nativeReadTimingCensus,
  nativeTimingSources,
  rawLifecycleSources,
  test,
  withRevisionConsumer,
} from './native-continuation-fixtures.mjs';

for (const populated of [false, true])
  test(`native stage timing readers use fixed raw ${populated ? 'found' : 'absent'} sources without native transport`, async () => {
    const s = createSandbox();
    try {
      const f = await fixture('baseline', { worktree: s.context.sourceRoot });
      const comments = populated
        ? [
            {
              id: 'IC_timing',
              url: 'https://github.com/example/criteria/issues/124#issuecomment-10',
              body: '## ⏱ Timing Log\nOriginal timing bytes\n',
            },
          ]
        : [];
      const snapshot = f.backend.snapshot;
      snapshot.lifecycleSources = rawLifecycleSources(snapshot.observation);
      snapshot.lifecycleSources.remote.timing = nativeTimingSources(f.context, comments);
      const backend = createRevisionMemory(snapshot),
        before = structuredClone(backend.snapshot);
      await withRevisionConsumer(
        {
          repository: f.context.repository,
          issue: f.context.issue,
          activity: 'stage-write',
          backend,
          projectDir: s.context.sourceRoot,
        },
        async () => {
          const legacy = await nativeReadTimingBody({
            repo: f.context.repository,
            issueNumber: f.context.issue,
          });
          const census = await nativeReadTimingCensus({
            repo: f.context.repository,
            issueNumber: f.context.issue,
          });
          assert.equal(legacy.status, populated ? 'found' : 'absent');
          assert.equal(census.status, populated ? 'found' : 'absent');
          assert.equal(legacy.body, comments[0]?.body ?? '');
          assert.equal(census.source?.body ?? '', comments[0]?.body ?? '');
          const { readNativeTimingSourceData } =
            await import('../../../../task-tracker/gh-timing-comment.mjs');
          const legacyRead = readNativeTimingSourceData(legacy),
            censusRead = readNativeTimingSourceData(census);
          assert.deepEqual(legacyRead.reads, [snapshot.lifecycleSources.remote.timing.legacy]);
          assert.deepEqual(censusRead.reads, snapshot.lifecycleSources.remote.timing.pages);
          assert.equal(readNativeTimingSourceData({ ...legacy }), null);
          assert.equal(readNativeTimingSourceData({ ...census }), null);
          assert.ok(Object.isFrozen(legacyRead.reads[0].response));
          assert.ok(Object.isFrozen(censusRead.reads[0].response.data));
        }
      );
      assert.deepEqual(backend.snapshot, before);
    } finally {
      s.dispose();
    }
  });
