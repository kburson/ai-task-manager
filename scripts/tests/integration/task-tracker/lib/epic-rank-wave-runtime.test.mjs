// @story #1872
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import {
  createRankWaveRuntime,
  rankWaveRepositoryAt,
} from '../../../../task-tracker/lib/epic-rank-wave-runtime.mjs';
import {
  discoverRankWavePhysical,
  nativeRankWaveTranscript,
  observeRankWaveNative,
} from '../../../../task-tracker/lib/epic-rank-wave-bindings.mjs';
import { sealRankWaveRecord } from '../../../../task-tracker/lib/epic-rank-wave-authority.mjs';
import {
  freezeRankGraph,
  rankWaveDigest,
} from '../../../../task-tracker/lib/epic-rank-wave-policy.mjs';

function fixtureWave(root) {
  const physical = discoverRankWavePhysical(root);
  const parent = {
    issue: 107,
    ...physical,
    provider: 'codex',
    sessionId: 'fixture-parent',
    generation: 'fixture-parent-generation',
  };
  const binding = {
    ...parent,
    issue: 140,
    worktree: path.join(root, 'child'),
    branch: 'child',
    sessionId: 'fixture-child',
    generation: 'fixture-child-generation',
  };
  const graph = freezeRankGraph([
    {
      number: 140,
      rank: 2,
      refinementDigest: 'a'.repeat(64),
      hasCurrentRefinement: true,
      blockedBy: [],
      dependencyReadiness: 'ready',
    },
  ]);
  const proposal = {
    schema: 'aitm.rank-wave-proposal/v1',
    operationId: 'fixture-op',
    repository: 'o/r',
    epic: 107,
    rank: 2,
    members: [140],
    graph,
    bindings: [binding],
    parent,
    expiresAt: null,
  };
  return sealRankWaveRecord({
    schema: 'aitm.epic-rank-wave/v1',
    id: proposal.operationId,
    revision: 1,
    action: 'authorize',
    previousDigest: null,
    repository: 'o/r',
    epic: 107,
    rank: 2,
    members: [140],
    graph,
    bindings: [binding],
    parent,
    proposalDigest: rankWaveDigest(proposal),
    source: {
      schema: 'aitm.rank-wave-source/v1',
      sessionId: 'fixture-human',
      messages: [{ messageId: 'fixture-message', statementHash: 'sha256:' + 'a'.repeat(64) }],
    },
    recordingActor: 'codex/session:fixture-parent',
    createdAt: '2026-10-04T01:00:00.000Z',
    expiresAt: null,
    continuation: null,
  });
}
test('production runtime verifies REST-to-GraphQL comment identity and immutable provenance, and persists the real common-dir operation journal', async () => {
  const root = createRuntimeRootFixture('rank-wave-runtime-');
  try {
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/o/r.git'], { cwd: root });
    assert.equal(await rankWaveRepositoryAt(root), 'o/r');
    const wave = fixtureWave(root);
    let stored = null;
    const runtime = createRankWaveRuntime(
      { cfg: { repo: 'o/r' }, projectDir: root, waveEpic: 107 },
      {
        ports: {
          run: async (command, args) => {
            assert.equal(command, 'gh');
            assert.ok(args.includes('POST'));
            stored = {
              __typename: 'IssueComment',
              id: 'C1',
              body: args.at(-1).slice(5),
              author: { login: 'fixture-author' },
              createdAt: wave.record.createdAt,
              updatedAt: wave.record.createdAt,
              issue: { number: 107, repository: { nameWithOwner: 'o/r' } },
            };
            return { stdout: JSON.stringify({ node_id: 'C1' }) };
          },
          graphql: async ({ query }) =>
            query.includes('AitmCommentsByNodeIds')
              ? { data: { nodes: [stored] } }
              : {
                  data: {
                    repository: {
                      issue: {
                        number: 107,
                        repository: { nameWithOwner: 'o/r' },
                        comments: {
                          nodes: [stored],
                          pageInfo: { hasNextPage: false, endCursor: null },
                        },
                      },
                    },
                  },
                },
        },
      }
    );
    assert.equal(await runtime.reserveOperation('fixture-op', wave), true);
    assert.equal(await runtime.reserveOperation('fixture-op', wave), false);
    const changed = structuredClone(wave);
    changed.record.parent.sessionId = 'other-parent';
    await assert.rejects(runtime.reserveOperation('fixture-op', changed), /operation conflict/);
    const published = await runtime.createRecord(wave, 107);
    assert.deepEqual(published.wave, wave);
    assert.equal(published.commentNodeId, 'C1');
    assert.equal((await runtime.listRecords(107)).length, 1);
    stored.updatedAt = '2026-10-04T02:00:00.000Z';
    await assert.rejects(runtime.listRecords(107), /immutable comment provenance invalid/);
    stored.updatedAt = wave.record.createdAt;
    stored.issue.repository.nameWithOwner = 'other/repo';
    await assert.rejects(runtime.listRecords(107), /correlation/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('real Claude fixture transcript under a dotted worktree verifies exact native identity and physical repository', async () => {
  const root = createRuntimeRootFixture('rank-wave-native.');
  try {
    const home = path.join(root, 'home');
    const binding = {
      issue: 140,
      ...discoverRankWavePhysical(root),
      provider: 'claude',
      sessionId: 'fixture-native',
      generation: 'fixture-generation',
    };
    const file = nativeRankWaveTranscript(binding, { home });
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      JSON.stringify({ sessionId: binding.sessionId, cwd: root, isSidechain: false }) + '\n'
    );
    assert.deepEqual(await observeRankWaveNative(binding, { home }), {
      verified: true,
      sessionId: binding.sessionId,
    });
    writeFileSync(
      file,
      JSON.stringify({ sessionId: 'different-native', cwd: root, isSidechain: false }) + '\n'
    );
    await assert.rejects(observeRankWaveNative(binding, { home }), /native identity unavailable/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
