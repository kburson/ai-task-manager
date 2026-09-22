// @story #1673
import { gql } from '../scripts/gh/lib/github-projects.mjs';
import { withIssueLock } from '../scripts/task-tracker/issue-mutator-lock.mjs';
import { listIssueComments } from '../scripts/task-tracker/lib/owned-comment.mjs';
import { PROJECT_GUIDANCE_PATH } from './source.mjs';

const MARKER_PREFIX = '<!-- aitm-guidance-override:v1 ';
const CREATE_MUTATION = `
  mutation AitmGuidanceOverrideAnnotation($subjectId: ID!, $body: String!) {
    addComment(input: { subjectId: $subjectId, body: $body }) {
      commentEdge { node { id } }
    }
  }
`;

function annotationBody(digest) {
  return (
    `AITM is operating on this issue with a project-modified guidance catalog at ` +
    `\`${PROJECT_GUIDANCE_PATH}\`. Executable workflow guards remain authoritative.\n\n` +
    `${MARKER_PREFIX}source="${PROJECT_GUIDANCE_PATH}" digest="${digest}" -->`
  );
}

async function defaultPostComment({ issueId, body }) {
  const result = await gql(CREATE_MUTATION, { subjectId: issueId, body });
  const id = result?.addComment?.commentEdge?.node?.id;
  if (typeof id !== 'string' || !id) throw new Error('guidance-annotation-write-unverified');
  return { id };
}

/**
 * Post-success audit only. The issue lock serializes lookup and write; it is
 * not a distributed compare-and-swap against a concurrent remote writer.
 */
export async function annotateSuccessfulGuidanceMutation({
  admission,
  issue,
  repository,
  projectDir,
  mutationSucceeded = false,
  deps = {},
} = {}) {
  if (!mutationSucceeded || admission?.trust !== 'project-owned-diverged') {
    return { status: 'skipped' };
  }
  const digest = admission.validation?.source?.catalogFileDigest;
  if (
    !Number.isInteger(Number(issue)) ||
    Number(issue) <= 0 ||
    !/^sha256:[a-f0-9]{64}$/.test(digest ?? '')
  ) {
    return { status: 'warning', code: 'guidance-annotation-failed' };
  }
  const withLock = deps.withLock || withIssueLock;
  const listComments = deps.listComments || listIssueComments;
  const postComment = deps.postComment || defaultPostComment;
  try {
    return await withLock(
      { issue: Number(issue), verb: 'guidance-annotation', projDir: projectDir },
      async () => {
        const listed = await listComments({ repository, issue: Number(issue) });
        if (typeof listed?.issueId !== 'string' || !Array.isArray(listed.comments)) {
          throw new Error('guidance-annotation-lookup-unverified');
        }
        const prior = listed.comments.filter(
          (comment) => typeof comment?.body === 'string' && comment.body.includes(MARKER_PREFIX)
        );
        if (prior.length > 1) throw new Error('guidance-annotation-duplicate-marker');
        if (prior.length === 1) return { status: 'existing' };
        await postComment({
          issueId: listed.issueId,
          issue: Number(issue),
          repository,
          body: annotationBody(digest),
        });
        return { status: 'posted' };
      }
    );
  } catch {
    // A successful lifecycle mutation is already durable. Audit failure cannot
    // claim to roll it back, but must be visible to the caller.
    return { status: 'warning', code: 'guidance-annotation-failed' };
  }
}
