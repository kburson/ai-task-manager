// @story #1855
// Synthetic native read responses only; no execution or production provenance.
import { hashBytes } from '../../task-tracker/lib/criteria-revision/schema.mjs';

export function rawLifecycleSources(observation) {
  const { repository, issue, body } = observation;
  const [owner, repo] = repository.split('/');
  const request = { owner, repo, issue };
  const empty = { totalCount: 0, nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
  return { schema: 'aitm.memory-lifecycle/v1', repository, issue, bodyHash: hashBytes(body.bytes), remote: {
    dependencies: [{ request: { repo: repository, issueNumber: issue, includeBlocking: false }, response: { blockedBy: structuredClone(empty) } }],
    assignments: { pages: [], final: [] },
    parent: [{ request, response: { repository: { issue: { parent: null } } } }],
    children: { pages: [{ request: { ...request, after: null }, response: { repository: { issue: { subIssues: structuredClone(empty) } } } }],
      identities: [{ request: { ...request, after: null }, response: { repository: { issue: { subIssues: structuredClone(empty) } } } }], membership: [], fields: [] },
    comments: { commit: [{ request: { repo: repository, issueNumber: issue }, response: [] }],
      workflow: [{ request: { owner, name: repo, issue, after: null }, response: { data: { repository: { issue: {
        number: issue, repository: { nameWithOwner: repository }, comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      } } } } }] },
    disposition: [{ request, response: { repository: { issue: { projectItems: { nodes: [{ project: { id: 'PVT_fixture' }, fieldValues: { nodes: [] } }] } } } } }],
  } };
}

