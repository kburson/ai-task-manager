// @story #1988 — complete current provider observations for estimation integration.
import { createTargetFixtureGraphql } from './refinement-target-fixture.mjs';
import { after } from 'node:test';
import { mkdirSync, rmSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import { projectScratchDir } from '../../task-tracker/lib/scratch-dir.mjs';
import { canonicalDecompositionJson } from '../../task-tracker/lib/decomposition-assessment.mjs';
import { formatIssueFieldDb } from '../../task-tracker/issue-field-db.mjs';

// @story #2163 — complete transport evidence for real inflation projection reads.
export function estimationProjectionGraphql({
  cfg,
  issueNumber,
  itemId,
  getBody,
  getProject,
  getComments,
}) {
  return async ({ query, variables }) => {
    const [owner, name] = cfg.repo.split('/');
    assert.match(query, /query AitmEstimationProjection\(/);
    assert.deepEqual(variables, { owner, name, issue: issueNumber });
    const board = getProject();
    return {
      data: {
        repository: {
          issue: {
            number: issueNumber,
            repository: { nameWithOwner: cfg.repo },
            body: getBody(),
            comments: {
              nodes: getComments().map((comment) => ({
                __typename: 'IssueComment',
                id: comment.node_id,
                databaseId: comment.id,
                body: comment.body,
                createdAt: '2026-11-05T00:00:00Z',
                updatedAt: '2026-11-05T00:00:00Z',
                author: { login: 'fixture' },
                issue: { number: issueNumber, repository: { nameWithOwner: cfg.repo } },
              })),
              pageInfo: { hasNextPage: false, endCursor: null },
            },
            projectItems: {
              nodes: [
                {
                  id: itemId,
                  project: { id: cfg.projectId },
                  fieldValues: {
                    nodes: [
                      { number: board.estimate, field: { id: cfg.fieldIds.estimate } },
                      { name: board.size, field: { id: cfg.fieldIds.size } },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    };
  };
}

export const estimationObservation = (value) => ({
  status: 'observed',
  value,
  digest: createHash('sha256').update(canonicalDecompositionJson(value)).digest('hex'),
});
export function estimationIssueBody(fields) {
  return (
    '## User Story\nAs a delivery owner\nI want truthful estimates because partial publication can hide growth\nSo that incomplete revisions cannot permit continued delivery\n\n## Scope\nPublish and confirm revised estimates.\n\n## Acceptance Criteria\n- [ ] Current estimates agree. <!-- aitm-verified vc-list="vc:1" -->\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## AITM Progress Markers\n' +
    formatIssueFieldDb(fields) +
    '\n'
  );
}
export function estimationPublicationFixture({
  cfg,
  issueNumber,
  getBody,
  setBody,
  getProject,
  graphql,
  getForecast,
}) {
  const dir = path.join(projectScratchDir('test'), 'estimation-publication-' + randomUUID());
  mkdirSync(dir, { recursive: true });
  after(() => rmSync(dir, { recursive: true, force: true }));
  const decomposition = {
    findMainWorktreePath: () => dir,
    readIssue: async () => estimationObservation({ number: issueNumber, body: getBody() }),
    readBackIssue: async () => estimationObservation({ number: issueNumber, body: getBody() }),
    readProject: async () =>
      estimationObservation({
        projectId: cfg.projectId,
        projectItemId: `ITEM_${issueNumber}`,
        ...getProject(),
        children: [],
      }),
    fetchBody: async () => getBody(),
    pushBody: async (_repo, _issue, next) => setBody(next),
  };
  if (graphql) decomposition.forecast = { graphql };
  if (getForecast) decomposition.readForecast = async () => getForecast();
  return {
    projectDir: dir,
    targetGraphql: createTargetFixtureGraphql({
      cfg,
      issueNumber,
      itemId: `ITEM_${issueNumber}`,
      getBody,
      getProject,
    }).graphql,
    decomposition,
    projectItemForIssue: async () => ({ itemId: `ITEM_${issueNumber}` }),
  };
}
