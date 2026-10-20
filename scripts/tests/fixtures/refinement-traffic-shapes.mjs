// @story #2073 — exact retained-source documents, frozen before production edits.
export const retainedShapes = [
  {
    query:
      '\n  query AitmEstimationProjection($owner: String!, $name: String!, $issue: Int!) {\n    repository(owner: $owner, name: $name) {\n      issue(number: $issue) {\n        body\n        comments(first: 100) {\n          nodes {\n            __typename id databaseId body author { login } createdAt updatedAt\n            issue { number repository { nameWithOwner } }\n          }\n          pageInfo { hasNextPage endCursor }\n        }\n        projectItems(first: 20) {\n          nodes {\n            id\n            project { id }\n            fieldValues(first: 100) {\n              nodes {\n                ... on ProjectV2ItemFieldNumberValue {\n                  number\n                  field { ... on ProjectV2FieldCommon { id } }\n                }\n                ... on ProjectV2ItemFieldSingleSelectValue {\n                  name\n                  field { ... on ProjectV2FieldCommon { id } }\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n',
    family: 'projection',
  },
  {
    query:
      'query($owner: String!, $repo: String!, $issue: Int!, $after: String) {\n        repository(owner: $owner, name: $repo) {\n          id\n          issue(number: $issue) {\n            id number title url\n            projectItems(first: 50, after: $after) {\n              nodes {\n                id\n                project { id title url }\n                fieldValueByName(name: "Status") {\n                  ... on ProjectV2ItemFieldSingleSelectValue { name optionId }\n                }\n                \n              }\n              pageInfo { hasNextPage endCursor }\n            }\n          }\n        }\n      }',
    family: 'membership',
  },
  {
    query:
      'query($owner: String!, $repo: String!, $issue: Int!, $after: String) {\n        repository(owner: $owner, name: $repo) {\n          id\n          issue(number: $issue) {\n            id number title url\n            projectItems(first: 50, after: $after) {\n              nodes {\n                id\n                project { id title url }\n                fieldValueByName(name: "Status") {\n                  ... on ProjectV2ItemFieldSingleSelectValue { name optionId }\n                }\n                fieldValues(first:100) { nodes { ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2FieldCommon { id } } } ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { id } } } } pageInfo { hasNextPage } }\n              }\n              pageInfo { hasNextPage endCursor }\n            }\n          }\n        }\n      }',
    family: 'membership',
  },
  {
    query:
      '\n      mutation($project: ID!, $item: ID!, $field: ID!, $val: Float!) {\n        updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { number: $val } }) { projectV2Item { id } }\n      }',
    family: 'project-field-write',
  },
  {
    query:
      '\n      mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {\n        updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) { projectV2Item { id } }\n      }',
    family: 'project-field-write',
  },
];

// Hook document inventory copied from the retained collector before production edits.
const fieldIdentity = 'field{... on ProjectV2FieldCommon{id name}}';
const computed = ['Label', 'Milestone', 'PullRequest', 'Repository', 'Reviewer', 'User']
  .map((type) => '... on ProjectV2ItemField' + type + 'Value{' + fieldIdentity + '}')
  .join(' ');
export const hookFields =
  'fieldValues(first:100){nodes{__typename ... on ProjectV2ItemFieldValueCommon{id ' +
  fieldIdentity +
  '} ... on ProjectV2ItemFieldNumberValue{number} ... on ProjectV2ItemFieldSingleSelectValue{name} ' +
  computed +
  ' ... on ProjectV2ItemIssueFieldValue{' +
  fieldIdentity +
  '}} pageInfo{hasNextPage endCursor}}';
export const hookItems =
  'projectItems(first:50){nodes{id project{id} fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}} ' +
  hookFields +
  '} pageInfo{hasNextPage endCursor}}';
export const hookComments =
  'comments(first:100){nodes{__typename id databaseId body createdAt updatedAt url author{login} issue{number repository{nameWithOwner}}} pageInfo{hasNextPage endCursor}}';
export const hookChildren =
  'subIssues(first:50){nodes{id number title body state stateReason labels(first:100){nodes{id name} pageInfo{hasNextPage endCursor}} blockedBy(first:100){nodes{id number} pageInfo{hasNextPage endCursor}} ' +
  hookItems +
  '} pageInfo{hasNextPage endCursor}}';
export const retainedHookQuery =
  'query {viewer{login} repository(owner:"o",name:"r"){issue(number:2073){id number body assignees(first:100){nodes{login}} ' +
  hookItems +
  ' ' +
  hookComments +
  ' ' +
  hookChildren +
  '}}}';
export const hookPresence = 'subIssues(first:50){nodes{id} pageInfo{hasNextPage endCursor}}';
export const optimizedHookRoot = retainedHookQuery
  .replace('id number body assignees', 'id number repository{nameWithOwner} body assignees')
  .replace(hookChildren, hookPresence);
export const optimizedHookGraph =
  'query {repository(owner:"o",name:"r"){issue(number:2073){id number repository{nameWithOwner} body ' +
  hookChildren +
  '}}}';
export const optimizedHookFence =
  'query {viewer{login} repository(owner:"o",name:"r"){issue(number:2073){id number repository{nameWithOwner} body assignees(first:100){nodes{login}} ' +
  hookItems +
  ' ' +
  hookPresence +
  '}}}';

export const optimizedHookContinuations = [
  {
    query:
      'query {repository(owner:"o",name:"r"){issue(number:2073){id number repository{nameWithOwner} body ' +
      hookComments.replace('first:100', 'first:100,after:"page:100"') +
      '}}}',
    family: 'hook-root-continuation',
  },
  {
    query: optimizedHookGraph.replace('subIssues(first:50)', 'subIssues(first:50,after:"page:50")'),
    family: 'hook-graph',
  },
  {
    query:
      'query {repository(owner:"o",name:"r"){issue(number:2073){id number repository{nameWithOwner} body ' +
      hookPresence.replace('first:50', 'first:50,after:"page:50"') +
      '}}}',
    family: 'hook-fence',
  },
];
export const routeShapes = [
  {
    family: 'repository-link',
    query:
      'mutation($project: ID!, $repo: ID!) { linkProjectV2ToRepository(input: { projectId: $project, repositoryId: $repo }) { repository { nameWithOwner } } }',
  },
];
export const retainedHookContinuations = [
  {
    query:
      'query {repository(owner:"o",name:"r"){issue(number:2073){number ' +
      hookComments.replace('first:100', 'first:100,after:"page:100"') +
      '}}}',
    family: 'hook-root-continuation',
  },
  {
    query:
      'query {repository(owner:"o",name:"r"){issue(number:2073){number ' +
      hookChildren.replace('subIssues(first:50)', 'subIssues(first:50,after:"page:50")') +
      '}}}',
    family: 'hook-root-continuation',
  },
];
