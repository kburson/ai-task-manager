// @story #2069
// Complete offline provider projection shared by native fixture source checks.
import assert from 'node:assert/strict';
import { hydrateJournalSnapshot } from '../../task-tracker/lib/story-cache/journal.mjs';
import { createDecompositionRuntime } from '../../task-tracker/lib/decomposition-authority.mjs';
import { observed, hash } from '../unit/task-tracker/lib/decomposition-authority-fixtures.mjs';
import { context, changeGeneration } from './story-timing-candidate-fixture.mjs';
import { setIssue } from './story-batch-fixture.mjs';
import { projectNativePlanChildren } from '../../task-tracker/lib/plan-child-inventory.mjs';

export async function createNativePlanPublishedFixture({
  f,
  identity,
  cfg,
  configured,
  epicFixture = null,
  trunkState,
  omitVc,
  initialBody,
}) {
  let base = initialBody;
  const publishedComments = async () => {
    const record = await f.store.readGeneration();
    const snapshot = hydrateJournalSnapshot(record.generation.baseSnapshot, record.payloads);
    return snapshot.inventory.map((id, index) => ({
      id,
      body: snapshot.resources['comment:' + id].body,
      __typename: 'IssueComment',
      databaseId: index + 123,
      createdAt: '2026-10-19T00:00:00.000Z',
      updatedAt: '2026-10-19T00:00:00.000Z',
      url: 'https://github.com/owner/repo/issues/2057#issuecomment-' + (index + 123),
      author: { login: 'fixture' },
      issue: { number: identity.issueNumber, repository: { nameWithOwner: identity.repository } },
    }));
  };
  let graphCalls = 0;
  const planSource = configured ?? epicFixture;
  const deps = {
    resolveTrunkSha: async () => trunkState.value,
    fetchEpicChildren: async () => (epicFixture ? epicFixture.mappedChildren() : []),
    nowIso: () => '2026-10-19T01:00:00Z',
    fetchParentIssue: async () => null,
    fetchCurrentUser: async () => 'tester',
    runGithubRead: async (_binary, args) => {
      assert.equal(args.at(-1), 'blockedBy');
      return {
        stdout: JSON.stringify({
          blockedBy: { nodes: [], totalCount: 0, pageInfo: { hasNextPage: false } },
        }),
      };
    },
    readPlanAtCommit: planSource
      ? async ({ planCommit, planPath }) => {
          assert.equal(planCommit, planSource.plan.commit);
          assert.equal(planPath, planSource.plan.path);
          return planSource.planBytes.toString();
        }
      : undefined,
    graphql: async () => {
      graphCalls++;
      return {
        data: {
          viewer: { login: 'tester' },
          repository: {
            issue: {
              id: identity.issueNodeId,
              number: identity.issueNumber,
              repository: { nameWithOwner: identity.repository },
              body: base,
              assignees: { nodes: [{ login: 'tester' }] },
              subIssues: {
                nodes: epicFixture?.rawChildren ?? [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
              comments: {
                nodes: await publishedComments(),
                pageInfo: { hasNextPage: false, endCursor: null },
              },
              projectItems: {
                nodes: [
                  {
                    id: identity.projectItemId,
                    project: { id: identity.projectId },
                    fieldValueByName: { name: 'Plan' },
                    fieldValues: {
                      nodes: [
                        {
                          number: configured?.forecast.plan.humanHours ?? 3,
                          field: { id: 'F_estimate', name: 'Estimate' },
                        },
                        {
                          name: configured?.forecast.plan.size ?? 'M',
                          field: { id: 'F_size', name: 'Size' },
                        },
                        { name: 'Plan', field: { id: 'F_status', name: 'Status' } },
                      ],
                      pageInfo: { hasNextPage: false, endCursor: null },
                    },
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      };
    },
  };
  // Seed genuinely current published assessment from the same complete offline
  // provider comments/fields the native guard will independently observe.
  const { collectHookDecompositionSnapshot } =
    await import('../../task-tracker/lib/decomposition-hook-authority.mjs');
  const seed = await context(f.root, () =>
    collectHookDecompositionSnapshot({ issue: identity.issueNumber, cfg, projectDir: f.root, deps })
  );
  const runtime = createDecompositionRuntime({
    cfg,
    projectDir: f.root,
    deps: {
      readPlanAtCommit: deps.readPlanAtCommit,
      ...Object.fromEntries(
        Object.entries(seed.current.sourceObservations).map(([key, value]) => [
          key,
          async () => value,
        ])
      ),
      readIssue: async () => observed({ number: identity.issueNumber, body: base }),
      readBackIssue: async () => observed({ number: identity.issueNumber, body: base }),
      mutateIssueBody: async ({ mutate, validateFreshBaseAsync }) => {
        await validateFreshBaseAsync(base);
        base = mutate(base);
        return { status: 'ok', body: base };
      },
    },
  });
  const refreshed = await context(f.root, () => runtime.refresh(seed.current.input.subject));
  assert.equal(refreshed.status, 'confirmed');
  if (omitVc) base = base.replace(/## Verification Commands\n[\s\S]*?(?=\n## )/, '');
  await changeGeneration(f, (generation, payloads) => setIssue(generation, payloads, base, base));
  if (epicFixture) {
    const { derivePlanDecompositionProjection, planProjectionResources } =
      await import('../../task-tracker/lib/plan-decomposition-projection.mjs');
    const current = await context(f.root, () =>
      collectHookDecompositionSnapshot({
        issue: identity.issueNumber,
        cfg,
        projectDir: f.root,
        deps,
      })
    );
    const record = await f.store.readGeneration();
    const preview = await derivePlanDecompositionProjection({
      source: current.current,
      identity,
      cfg,
      projectDir: f.root,
      ...planProjectionResources({ record, body: base }),
      deps: { readPlanAtCommit: deps.readPlanAtCommit },
    });
    assert.deepEqual(preview.input, current.current.input);
    assert.deepEqual(current.current.input, seed.current.input);
    assert.equal(current.current.projection.status, 'current');
  }
  deps.nativeChildInventory = {
    schema: 'aitm.native-plan-children/v1',
    identity,
    issueDigest: hash(base),
    complete: true,
    children: projectNativePlanChildren(seed.current.sourceObservations.readProject.value.children),
  };
  return { base, deps, graphCalls: () => graphCalls };
}
