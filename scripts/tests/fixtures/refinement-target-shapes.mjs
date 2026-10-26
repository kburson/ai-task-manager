// @story #2073 — reviewed explicit target documents pinned before optimized publication.
export const targetShapes = [
  {
    query:
      'query TargetBinding($owner:String!,$repo:String!,$number:Int!,$item:ID!){repository(owner:$owner,name:$repo){issue(number:$number){id number repository{nameWithOwner}}} node(id:$item){__typename ... on ProjectV2Item{id project{id} content{__typename ... on Issue{id number repository{nameWithOwner}}}}}}',
    family: 'target-binding',
  },
  {
    query:
      'query TargetProjectValues($item:ID!,$project:ID!){node(id:$item){__typename ... on ProjectV2Item{id project{id} content{__typename ... on Issue{id number repository{nameWithOwner}}} fieldValues(first:100){nodes{__typename ... on ProjectV2ItemFieldValueCommon{id field{... on ProjectV2FieldCommon{id}}} ... on ProjectV2ItemFieldNumberValue{number} ... on ProjectV2ItemFieldSingleSelectValue{name optionId} ... on ProjectV2ItemFieldLabelValue{field{... on ProjectV2FieldCommon{id}}} ... on ProjectV2ItemFieldMilestoneValue{field{... on ProjectV2FieldCommon{id}}} ... on ProjectV2ItemFieldPullRequestValue{field{... on ProjectV2FieldCommon{id}}} ... on ProjectV2ItemFieldRepositoryValue{field{... on ProjectV2FieldCommon{id}}} ... on ProjectV2ItemFieldReviewerValue{field{... on ProjectV2FieldCommon{id}}} ... on ProjectV2ItemFieldUserValue{field{... on ProjectV2FieldCommon{id}}} ... on ProjectV2ItemIssueFieldValue{field{... on ProjectV2FieldCommon{id}}}} pageInfo{hasNextPage endCursor}}}} project:node(id:$project){__typename ... on ProjectV2{id fields(first:100){nodes{... on ProjectV2FieldCommon{id dataType project{id}} ... on ProjectV2SingleSelectField{options{id name}}} pageInfo{hasNextPage endCursor}}}}}',
    family: 'target-project',
  },
  {
    query:
      'query TargetProjectValuePage($item:ID!,$after:String!){node(id:$item){__typename ... on ProjectV2Item{id project{id} content{__typename ... on Issue{id number repository{nameWithOwner}}} fieldValues(first:100,after:$after){nodes{__typename ... on ProjectV2ItemFieldValueCommon{id field{... on ProjectV2FieldCommon{id}}} ... on ProjectV2ItemFieldNumberValue{number} ... on ProjectV2ItemFieldSingleSelectValue{name optionId} ... on ProjectV2ItemFieldLabelValue{field{... on ProjectV2FieldCommon{id}}} ... on ProjectV2ItemFieldMilestoneValue{field{... on ProjectV2FieldCommon{id}}} ... on ProjectV2ItemFieldPullRequestValue{field{... on ProjectV2FieldCommon{id}}} ... on ProjectV2ItemFieldRepositoryValue{field{... on ProjectV2FieldCommon{id}}} ... on ProjectV2ItemFieldReviewerValue{field{... on ProjectV2FieldCommon{id}}} ... on ProjectV2ItemFieldUserValue{field{... on ProjectV2FieldCommon{id}}} ... on ProjectV2ItemIssueFieldValue{field{... on ProjectV2FieldCommon{id}}}} pageInfo{hasNextPage endCursor}}}}}',
    family: 'target-project',
  },
  {
    query:
      'query TargetProjectDefinitions($project:ID!,$after:String!){node(id:$project){__typename ... on ProjectV2{id fields(first:100,after:$after){nodes{... on ProjectV2FieldCommon{id dataType project{id}} ... on ProjectV2SingleSelectField{options{id name}}} pageInfo{hasNextPage endCursor}}}}}',
    family: 'target-project',
  },
  {
    query:
      'query TargetBodyFields($issue:ID!){node(id:$issue){__typename ... on Issue{id number repository{nameWithOwner} body}}}',
    family: 'target-body',
  },
];
