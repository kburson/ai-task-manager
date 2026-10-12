// @story #1988 — actual compatibility writer with production forecast parsing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { fixture, observed, freshUnitDir } from './decomposition-authority-fixtures.mjs';
import { readDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import { buildAuditCommentBody } from '../../../../task-tracker/lib/reevaluate-estimate.mjs';
import { appendPlannedEstimate } from '../../../../task-tracker/lib/refine-estimate-comment.mjs';
export function registerProposalPublicationCases() {
  for (const [before, hours, other] of [
    [10, 23],
    [10, 24],
    [10, 25],
    [25, 23],
    [10, 23, 25],
    [10, 23.5],
  ])
    test(
      'actual compatibility proposal ' +
        `${before}→${hours}, other ${other ?? 'none'}` +
        ' is fenced before patch and does not claim board publication',
      async () => {
        const f = fixture(before),
          dir = freshUnitDir('compat-publication-');
        let comment = {
            id: 99,
            node_id: 'IC_refine',
            body: '<!-- aitm-refined-estimate: 1987 -->\n### Refine estimate\n',
          },
          patches = 0;
        const comments = () => [
          comment,
          ...(other
            ? [
                {
                  id: 100,
                  node_id: 'IC_human',
                  body: buildAuditCommentBody({
                    current: { size: 'M', estimate: before },
                    size: 'M',
                    estimate: other,
                    requiresHuman: true,
                    signals: { files: 8, steps: 8, risks: 3, deps: 3 },
                    score: 12,
                  }),
                },
              ]
            : []),
        ];
        const cfg = {
          repo: 'o/r',
          projectId: 'PVT_a',
          fieldIds: { estimate: 'EST', size: 'SIZE' },
        };
        const decomposition = { ...f.deps };
        delete decomposition.readForecast;
        decomposition.forecast = {
          graphql: async () => ({
            data: {
              repository: {
                issue: {
                  number: 1987,
                  repository: { nameWithOwner: 'o/r' },
                  body: f.body,
                  projectItems: {
                    nodes: [
                      {
                        id: 'PVTI_a',
                        project: { id: 'PVT_a' },
                        fieldValues: {
                          nodes: [
                            { number: before, field: { id: 'EST' } },
                            { name: 'M', field: { id: 'SIZE' } },
                          ],
                          pageInfo: { hasNextPage: false },
                        },
                      },
                    ],
                    pageInfo: { hasNextPage: false },
                  },
                  comments: {
                    nodes: comments().map((c) => ({
                      __typename: 'IssueComment',
                      id: c.node_id,
                      body: c.body,
                      createdAt: '2026-10-11T12:00:00Z',
                      updatedAt: '2026-10-11T12:00:00Z',
                      author: { login: 'fixture-owner' },
                      issue: { number: 1987, repository: { nameWithOwner: 'o/r' } },
                    })),
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              },
            },
          }),
        };
        const deps = {
          projectDir: dir,
          decomposition,
          projectItemForIssue: async () => ({ itemId: 'PVTI_a' }),
          listComments: async () => comments(),
          patchComment: async ({ body }) => {
            assert.equal(
              readDecompositionRecords(f.body).publication?.status,
              'pending',
              'proposal intent must precede patch'
            );
            patches++;
            comment = { ...comment, body };
          },
        };
        try {
          const result = await appendPlannedEstimate({
            cfg,
            issueNumber: 1987,
            planned: { estimate: hours, size: 'M' },
            current: { estimate: before, size: 'M' },
            rationale: 'More discovered work',
            deps,
          });
          assert.equal(
            result.status,
            'appended',
            result.reason ?? result.error ?? 'proposal was not confirmed'
          );
          const records = readDecompositionRecords(f.body);
          assert.equal(records.publication.status, 'complete');
          assert.equal(
            records.assessment.estimate.basis,
            before > hours && !other ? 'published' : 'proposed'
          );
          assert.equal(records.publication.proposal.estimate.hours, Math.ceil(hours));
          assert.equal(records.publication.proposal.estimate.basis, 'proposed');
          assert.equal(
            records.assessment.estimate.hours,
            Math.ceil(Math.max(before, hours, other ?? 0))
          );
          assert.equal(
            records.assessment.status,
            hours === 23 && before === 10 && !other
              ? 'needs-decomposition-review'
              : 'must-decompose'
          );
          assert.equal(f.values.project.estimate, before);
          assert.match(f.body, new RegExp('"estimate":' + before));
          assert.equal(patches, 1);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }
    );
}
