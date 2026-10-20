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
