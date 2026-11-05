// @story #2153
// Keep the real record writers and versioned governed body transaction; isolate I/O.
import { mutateIssueBody } from '../../task-tracker/lib/issue-body-mutate.mjs';
import {
  parsePlanTransitionAuthorityComment,
  writePlanTransitionAuthority,
} from '../../task-tracker/lib/plan-transition-authority.mjs';
import {
  parseTransitionCommitComment,
  writeTransitionCommit,
} from '../../task-tracker/lib/move-state/transition-commit.mjs';

export async function installCurrentApprovalProvider(f) {
  const authority = parsePlanTransitionAuthorityComment(f.comments[0].body);
  const completion = parseTransitionCommitComment(f.comments[1].body);
  const observe = (id, body, createdAt) => ({
    id,
    body,
    createdAt,
    updatedAt: createdAt,
    author: { login: 'owner' },
    authorAssociation: 'OWNER',
  });
  f.comments.splice(0, 2);
  const read = async (id) => f.comments.find((c) => c.id === id);
  const authorityResult = await writePlanTransitionAuthority({
    cfg: { repo: 'o/r' },
    issueArg: 2153,
    transitionId: authority.transitionId,
    planTransitionAuthorityInput: {
      scopeIdentity: authority.scopeIdentity,
      recordedAt: authority.recordedAt,
      sessionPolicy: { gates: { analysisToDevelopment: false } },
    },
    deps: {
      createPlanTransitionAuthorityComment: async (body) => {
        const c = observe('1', body, '2026-11-04T01:51:50Z');
        f.comments.push(c);
        return c;
      },
      readPlanTransitionAuthorityComment: read,
      listPlanTransitionAuthorityComments: async () => f.comments,
    },
  });
  const completionResult = await writeTransitionCommit(
    {
      cfg: { repo: 'o/r' },
      issueArg: 2153,
      transitionId: authority.transitionId,
      resolvedFromState: 'plan',
      stateArg: 'develop',
      actor: 'owner',
      deps: {
        createTransitionComment: async (body) => {
          const c = observe('2', body, '2026-11-04T01:52:06Z');
          f.comments.push(c);
          return c;
        },
        readTransitionComment: read,
      },
    },
    {
      visitMarker: completion.visitMarker,
      sentinelMarker: `<!-- aitm-move-complete state=develop ts=2026-11-04T01:52:00Z move=${authority.transitionId} -->`,
    }
  );
  if (!authorityResult.verified || !completionResult.verified)
    throw Error('fixture history writer did not verify');
  f.deps.mutateIssueBody = (input) =>
    mutateIssueBody({
      ...input,
      deps: {
        fetchBody: async () => f.body,
        pushBody: async (_repo, _issue, next) => {
          f.body = next;
          f.calls.writes++;
        },
        warn: () => {},
      },
    });
  return f;
}
