// @story #1497
import { randomUUID } from 'node:crypto';
import { openProvider } from './provider.mjs';
export function journalPorts(context, { fault = null, checkpoint = null } = {}) {
  const provider = openProvider(context);
  return {
    listCommentsPage: async ({ issueNumber, after }) =>
      provider.commentPage(issueNumber, { first: 2, after }),
    createComment: async ({ issueNumber, body }) =>
      provider.apply({
        kind: 'comment',
        issueNumber,
        operationId: randomUUID(),
        payload: { body },
        fault,
      }),
    readComment: async ({ issueNumber, id }) =>
      provider.comments(issueNumber).find((c) => c.id === id),
    checkpoint,
  };
}
