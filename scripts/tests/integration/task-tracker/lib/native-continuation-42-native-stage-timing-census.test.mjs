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

for (const variant of [
  'pages',
  'unused',
  'partial',
  'duplicate',
  'repeated-cursor',
  'changed-total',
  'foreign',
  'missing',
  'failed-legacy',
  'drift',
])
  test(`native stage timing census ${variant} preserves native completeness and held scope`, async () => {
    const s = createSandbox();
    try {
      const f = await fixture('baseline', { worktree: s.context.sourceRoot });
      const comments = [
        { id: 'IC_other', body: 'Unrelated audit' },
        { id: 'IC_timing', body: '## ⏱ Timing Log\nExact second-page bytes\n' },
      ];
      const snapshot = f.backend.snapshot;
      snapshot.lifecycleSources = rawLifecycleSources(snapshot.observation);
      const timing = nativeTimingSources(f.context, comments);
      const second = structuredClone(timing.pages[0]);
      timing.pages[0].response.data.repository.issue.comments.nodes = [comments[0]];
      timing.pages[0].response.data.repository.issue.comments.pageInfo = {
        hasNextPage: true,
        endCursor: 'next-page',
      };
      second.request.after = 'next-page';
      second.response.data.repository.issue.comments.nodes = [comments[1]];
      timing.pages.push(second);
      if (variant === 'unused') {
        const extra = structuredClone(second);
        extra.request.after = 'unused-page';
        timing.pages.push(extra);
      }
      if (variant === 'partial') second.response.data.repository.issue.comments.nodes = [];
      if (variant === 'duplicate')
        second.response.data.repository.issue.comments.nodes = [comments[0]];
      if (variant === 'repeated-cursor')
        second.response.data.repository.issue.comments.pageInfo = {
          hasNextPage: true,
          endCursor: 'next-page',
        };
      if (variant === 'changed-total')
        second.response.data.repository.issue.comments.totalCount = 3;
      if (variant === 'foreign')
        second.response.data.repository.nameWithOwner = 'foreign/repository';
      if (variant === 'failed-legacy') timing.legacy.response.exitCode = 1;
      if (variant !== 'missing') snapshot.lifecycleSources.remote.timing = timing;
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
          const promise =
            variant === 'failed-legacy'
              ? nativeReadTimingBody({ repo: f.context.repository, issueNumber: f.context.issue })
              : nativeReadTimingCensus({
                  repo: f.context.repository,
                  issueNumber: f.context.issue,
                });
          if (variant === 'drift')
            queueMicrotask(() => {
              const changed = backend.observation;
              changed.stage = 'test';
              backend.replaceAuthority(changed);
            });
          const result = await promise;
          const { readNativeTimingSourceData } =
            await import('../../../../task-tracker/gh-timing-comment.mjs');
          if (variant === 'pages') {
            assert.equal(result.status, 'found');
            assert.equal(result.source.body, comments[1].body);
            assert.deepEqual(readNativeTimingSourceData(result).reads, timing.pages);
          } else {
            assert.equal(result.status, 'error');
            assert.equal(readNativeTimingSourceData(result), null);
          }
        }
      );
      if (variant !== 'drift') assert.deepEqual(backend.snapshot, before);
    } finally {
      s.dispose();
    }
  });
