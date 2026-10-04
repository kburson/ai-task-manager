// @story #1872
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRankWaveRuntime } from '../../../../task-tracker/lib/epic-rank-wave-runtime.mjs';
import { inspectRankWavePublication } from '../../../../task-tracker/lib/epic-rank-wave-store.mjs';
import { observeRankWaveAdmission } from '../../../../task-tracker/lib/epic-rank-wave-admission.mjs';

function legacyRuntime() {
  const children = [{ number: 140, rank: 2, boardState: 'ready-for-plan', body: '' }];
  return createRankWaveRuntime(
    { cfg: { repo: 'o/r' }, projectDir: process.cwd() },
    {
      ports: {
        run: async () => ({ stdout: '' }),
        children: async () => children,
        rows: () => {
          throw new Error('stale sibling occupancy must not be consulted');
        },
        graphql: async () => ({
          data: {
            repository: {
              issue: {
                number: 107,
                repository: { nameWithOwner: 'o/r' },
                comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
              },
            },
          },
        }),
      },
    }
  );
}
test('production runtime preserves legacy sequential admission without consulting stale native bindings', async () => {
  const runtime = legacyRuntime();
  const publication = await inspectRankWavePublication({
    repository: 'o/r',
    epic: 107,
    rank: 2,
    now: '2026-10-04T01:00:00.000Z',
    runtime,
  });
  assert.equal(publication.status, 'legacy', JSON.stringify(publication));
  const admission = await observeRankWaveAdmission({
    cfg: { repo: 'o/r' },
    parentEpicNumber: 107,
    issueNumber: 140,
    projectDir: process.cwd(),
    deps: { rankWaveRuntime: runtime },
  });
  assert.equal(admission.legacy, true);
  assert.equal(admission.children[0].number, 140);
});
