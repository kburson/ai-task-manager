// @story #1988 — a stateful provider model below the real publication transaction.
import {
  estimationIssueBody,
  estimationPublicationFixture,
} from '../../../fixtures/estimation-publication.mjs';
export function publicationCommentDeps({ cfg, issueNumber, current, deps }) {
  let body = estimationIssueBody({ estimate: current.estimate ?? 8, size: current.size ?? 'M' }),
    comments = null;
  const board = { estimate: current.estimate ?? 8, size: current.size ?? 'M' };
  const listComments = async () => {
    comments ??= (await deps.listComments()).map((c) => ({
      ...c,
      node_id: c.node_id ?? `IC_unit_${c.id}`,
    }));
    return comments;
  };
  const graphql = async () => ({
    data: {
      repository: {
        issue: {
          number: issueNumber,
          repository: { nameWithOwner: cfg.repo },
          body,
          projectItems: {
            nodes: [
              {
                id: `ITEM_${issueNumber}`,
                project: { id: cfg.projectId },
                fieldValues: {
                  nodes: [
                    { number: board.estimate, field: { id: cfg.fieldIds.estimate } },
                    { name: board.size, field: { id: cfg.fieldIds.size } },
                  ],
                  pageInfo: { hasNextPage: false },
                },
              },
            ],
            pageInfo: { hasNextPage: false },
          },
          comments: {
            nodes: (await listComments()).map((c) => ({
              __typename: 'IssueComment',
              id: c.node_id,
              body: c.body,
              updatedAt: '2026-10-11T12:00:00Z',
              issue: { number: issueNumber, repository: { nameWithOwner: cfg.repo } },
            })),
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    },
  });
  const fixture = estimationPublicationFixture({
    cfg,
    issueNumber,
    getBody: () => body,
    setBody: (next) => {
      body = next;
    },
    getProject: () => board,
    graphql,
  });
  return {
    ...deps,
    ...fixture,
    listComments,
    patchComment: async (args) => {
      await deps.patchComment(args);
      comments = comments.map((c) => (c.id === args.commentId ? { ...c, body: args.body } : c));
    },
  };
}
