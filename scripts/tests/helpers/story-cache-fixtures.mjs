// @story #2052
// Offline provider boundary: no network, clocks or mutable shared fixture state.
export function createStoryFixture({ comments = [], assignees = [], fields = [] } = {}) {
  const identity = {
    host: 'github.com',
    repository: 'owner/repo',
    issueNumber: 2039,
    issueNodeId: 'I_test',
    projectId: 'P_test',
    projectItemId: 'PI_test',
  };
  const history = () => ({
    lastEditedAt: null,
    includesCreatedEdit: false,
    userContentEdits: { totalCount: 0, nodes: [], pageInfo: { hasNextPage: false } },
  });
  const content = (comment, index) => ({
    __typename: 'IssueComment',
    id: `IC_${index}`,
    body: '',
    ...history(),
    author: { login: 'foreign' },
    createdAt: '2026-10-19T00:00:00Z',
    updatedAt: '2026-10-19T00:00:00Z',
    url: `https://github.com/owner/repo/issues/2039#issuecomment-${index}`,
    issue: { id: identity.issueNodeId },
    ...comment,
  });
  const connection = (nodes) => ({
    totalCount: nodes.length,
    nodes,
    pageInfo: { hasNextPage: false, endCursor: null },
  });
  const data = {
    issue: {
      __typename: 'Issue',
      id: identity.issueNodeId,
      number: 2039,
      url: 'https://github.com/owner/repo/issues/2039',
      repository: { nameWithOwner: 'owner/repo' },
      body: 'A',
      title: 'Current story',
      ...history(),
      comments: connection(comments.map(content)),
      assignees: connection(assignees.map((login, i) => ({ id: `U_${i}`, login }))),
    },
    item: {
      __typename: 'ProjectV2Item',
      id: identity.projectItemId,
      isArchived: false,
      project: { id: identity.projectId },
      content: { __typename: 'Issue', id: identity.issueNodeId },
      fieldValues: connection(fields),
    },
  };
  const dispatches = [];
  const transport = {
    fields: [],
    query: async (request) => {
      dispatches.push(structuredClone(request));
      return JSON.stringify({ data });
    },
  };
  return { identity, data, transport, dispatches, connection, content };
}
