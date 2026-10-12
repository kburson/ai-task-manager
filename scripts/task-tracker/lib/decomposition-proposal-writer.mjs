// @story #1988 — comment-only proposal intent, exact bytes and current classification.
import { executeEstimateWriter, observedEstimateEffect } from './estimate-writer-publication.mjs';
import { collectDecompositionCommentProposals } from './decomposition-authority.mjs';
import { estimateEffectDigest } from './decomposition-publication.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
export function intendedCommentProposalInput({ initial, comments, subject, body }) {
  const input = structuredClone(initial.input),
    project = initial.sourceObservations.readProject.value;
  const forecast = structuredClone(initial.sourceObservations.readForecast.value),
    bodyFields = parseIssueFieldDb(body).values;
  const parsed = collectDecompositionCommentProposals({
    comments,
    subject,
    body,
    published: forecast?.recordId ? forecast : null,
    board: project,
    bodyFields,
  });
  if (!parsed.available) throw new Error('estimate-publication:proposal-unavailable');
  forecast.proposals = parsed.proposals;
  let hours = project.estimate,
    proposalId = null,
    size = project.size;
  const tiers = ['XS', 'S', 'M', 'L', 'XL'];
  for (const proposal of parsed.proposals) {
    if (proposal.hours !== null && (hours === null || proposal.hours >= hours)) {
      hours = proposal.hours;
      proposalId = proposal.proposalId;
    }
    if (tiers.indexOf(proposal.size) > tiers.indexOf(size)) size = proposal.size;
  }
  input.estimate = {
    basis: proposalId ? 'proposed' : hours === null ? 'unset' : 'published',
    hours,
    proposalId,
  };
  input.size = size;
  input.observations.find((o) => o.resource === 'forecast').digest = estimateEffectDigest(forecast);
  return input;
}
export async function publishPlannedCommentRevision({
  cfg,
  issueNumber,
  comment,
  nextBody,
  planned,
  patchComment,
  findComment,
  listComments,
  deps = {},
}) {
  const nodeId = comment.nodeId ?? String(comment.id),
    proposal = {
      estimate: {
        basis: 'proposed',
        hours: planned.estimate,
        proposalId: `comment:${nodeId}:planned-estimate`,
      },
      size: planned.size,
    };
  const comments = await listComments({ cfg, issueNumber });
  if (comments.filter((c) => c.id === comment.id).length !== 1)
    throw new Error('estimate-publication:comment-identity');
  const intendedComments = comments.map((c) => ({
    id: c.node_id ?? String(c.id),
    body: c.id === comment.id ? nextBody : c.body,
  }));
  const result = await executeEstimateWriter({
    cfg,
    issueNumber,
    writerId: 'plan-estimate-compatibility',
    key: { comment: nodeId, body: estimateEffectDigest(nextBody) },
    proposal,
    deps,
    deriveIntendedInput: (initial) =>
      intendedCommentProposalInput({
        initial,
        subject: initial.input.subject,
        body: initial.sourceObservations.readIssue.value.body,
        comments: intendedComments,
      }),
    effects: async () => [
      {
        id: 'appendix',
        resource: 'comment',
        targetIdentity: `comment:${nodeId}`,
        value: nextBody,
        read: async () => {
          const current = await findComment();
          if (current?.id !== comment.id) throw new Error('estimate-publication:comment-identity');
          return observedEstimateEffect(current.body);
        },
        apply: () => patchComment({ cfg, commentId: comment.id, body: nextBody }),
      },
    ],
  });
  return result;
}
