// @story #1988 — keyed audit creation, with read-before-retry and exact confirmation.
import { gh } from '../../gh/lib/github-projects.mjs';
import {
  estimateOperationId,
  executeEstimateWriter,
  observedEstimateEffect,
} from './estimate-writer-publication.mjs';
import { intendedCommentProposalInput } from './decomposition-proposal-writer.mjs';
export async function listEstimateAuditComments({ cfg, issueNumber }) {
  const text = await gh(['api', `repos/${cfg.repo}/issues/${issueNumber}/comments`, '--paginate']);
  return text.trim()
    ? text
        .trim()
        .split(/\n(?=\[)/)
        .flatMap((page) => JSON.parse(page))
    : [];
}
export async function prepareEstimateAudit({
  cfg,
  issueNumber,
  writerId,
  key,
  body,
  postComment,
  deps = {},
}) {
  const operationId = estimateOperationId(writerId, key),
    marker = `<!-- aitm-estimate-operation: ${operationId} -->`;
  let nextBody = body + '\n' + marker;
  const list = () =>
    (deps.listComments ?? listEstimateAuditComments)({ cfg, issueNumber, repo: cfg.repo });
  const comments = await list();
  const matching = comments.filter((c) => c.body.includes(marker));
  if (matching.length > 1) throw new Error('estimate-publication:duplicate-audit');
  if (matching.length === 1) nextBody = matching[0].body;
  const effect = {
    id: 'audit',
    resource: 'comment',
    targetIdentity: `comment:${operationId}`,
    value: nextBody,
    read: async () => {
      const matches = (await list()).filter((c) => c.body.includes(marker));
      if (matches.length > 1) throw new Error('estimate-publication:duplicate-audit');
      return observedEstimateEffect(matches[0]?.body ?? null);
    },
    apply: () => postComment({ issueNumber, repo: cfg.repo, body: nextBody }),
  };
  return { operationId, effect, comments, nextBody };
}
export async function publishEstimateAuditProposal({
  cfg,
  issueNumber,
  writerId,
  key,
  size,
  estimate,
  audit,
  deps = {},
}) {
  return executeEstimateWriter({
    cfg,
    issueNumber,
    writerId,
    key,
    proposal: {
      estimate: {
        basis: 'proposed',
        hours: estimate,
        proposalId: `comment:${audit.operationId}:human-attention`,
      },
      size,
    },
    deps,
    deriveIntendedInput: (initial) =>
      intendedCommentProposalInput({
        initial,
        subject: initial.input.subject,
        body: initial.sourceObservations.readIssue.value.body,
        comments: [
          ...audit.comments
            .filter(
              (c) => !c.body.includes(`<!-- aitm-estimate-operation: ${audit.operationId} -->`)
            )
            .map((c) => ({ id: c.node_id ?? String(c.id), body: c.body })),
          { id: audit.operationId, body: audit.nextBody },
        ],
      }),
    effects: async () => [audit.effect],
  });
}
