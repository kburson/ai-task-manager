#!/usr/bin/env node
// @story #2163 — strict state-backed subprocess transport; unknown requests refuse.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
const file = process.env.INFLATION_FIXTURE_DATA;
if (!file) throw new Error('inflation-provider:data-path');
const lock = `${file}.lock`;
const deadline = Date.now() + 10000;
while (true) {
  try {
    mkdirSync(lock);
    break;
  } catch (error) {
    if (error.code !== 'EEXIST' || Date.now() > deadline) throw error;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
  }
}
const argv = process.argv.slice(2),
  data = JSON.parse(readFileSync(file, 'utf8'));
const stateBeforeRequest = structuredClone(data.state);
const stdin = argv.includes('-') ? readFileSync(0, 'utf8') : '';
const entry = {
  sequence: data.ledger.length + 1,
  argv,
  stdin,
  checkpoint: 'unrecognized',
  applied: false,
};
const normalizeQuery = (query) => String(query).replace(/\s+/g, ' ').trim();
const queries = new Map();
const pageInfo = { hasNextPage: false, endCursor: null };
const subjectVariables = { owner: 'fixture', repo: 'inflation', issue: data.state.number };
function variablesEqual(actual, expected) {
  return isDeepStrictEqual(actual, expected);
}
function marker(body, name) {
  return body.match(new RegExp(`<!-- ${name}[^>]*-->`))?.[0] ?? null;
}
function classifyBodyWrite(before, after) {
  const values = (body) =>
    JSON.parse(body.match(/<!-- aitm-fields: (.*?) -->/)?.[1] ?? '{}').values;
  const a = values(before),
    b = values(after);
  if (a?.estimate !== b?.estimate || a?.size !== b?.size) return 'fields';
  if (marker(before, 'aitm-estimate-before') !== marker(after, 'aitm-estimate-before'))
    return 'before-record';
  if (
    marker(before, 'aitm-decomposition-publication') !==
    marker(after, 'aitm-decomposition-publication')
  )
    return 'publication';
  if (
    marker(before, 'aitm-decomposition-assessment') !==
    marker(after, 'aitm-decomposition-assessment')
  )
    return 'assessment';
  return 'issue-body';
}
for (const location of [false, true]) {
  const query = `query($owner: String!, $repo: String!, $issue: Int!, $cursor: String) {${location ? ' viewer { login }' : ''}
    repository(owner: $owner, name: $repo) {
      issue(number: $issue) {${location ? ' body state' : ''}
        assignees(first: 100) { nodes { login } }
        projectItems(first: 50, after: $cursor) {
          nodes { id project { id } fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          } }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }`;
  queries.set(normalizeQuery(query), {
    checkpoint: location ? 'location-assignment' : 'assignment',
    variables: { ...subjectVariables, cursor: null },
    response: () => ({
      data: {
        ...(location ? { viewer: { login: data.state.viewer } } : {}),
        repository: {
          issue: {
            ...(location ? { body: data.state.body, state: 'OPEN' } : {}),
            assignees: { nodes: data.state.assignees.map((login) => ({ login })) },
            projectItems: {
              nodes: [
                {
                  id: data.state.itemId,
                  project: { id: data.state.projectId },
                  fieldValueByName: { name: data.state.status },
                },
              ],
              pageInfo,
            },
          },
        },
      },
    }),
  });
}
function register(query, checkpoint, variables, response) {
  queries.set(normalizeQuery(query), { checkpoint, variables, response });
}
const fieldDefinitions = {
  status: ['F_STATUS', 'Status', 'SingleSelect'],
  priority: ['F_PRIORITY', 'Priority', 'SingleSelect'],
  size: ['F_SIZE', 'Size', 'SingleSelect'],
  estimate: ['F_EST', 'Estimate', 'Number'],
  rank: ['F_RANK', 'Rank', 'Number'],
  startTime: ['F_STARTED', 'Started', 'Text'],
  engagedTime: ['F_ENGAGED', 'Engaged', 'Text'],
  sessionTime: ['F_SESSION', 'Session', 'Text'],
  reviewTime: ['F_REVIEW', 'Review', 'Text'],
  planTime: ['F_PLAN', 'Plan', 'Text'],
  disposition: ['F_DISPOSITION', 'Disposition', 'SingleSelect'],
};
function fields() {
  return Object.entries(fieldDefinitions)
    .filter(([key]) => (key === 'status' ? data.state.status : data.state.board[key]) != null)
    .map(([key, [id, name, type]]) => ({
      __typename: `ProjectV2ItemField${type}Value`,
      id: `value_${id}`,
      field: { id, name },
      [type === 'Number' ? 'number' : type === 'SingleSelect' ? 'name' : 'text']:
        key === 'status' ? data.state.status : data.state.board[key],
    }));
}
function projectItem() {
  return {
    id: data.state.itemId,
    project: {
      id: data.state.projectId,
      title: 'Fixture',
      url: 'https://github.com/orgs/fixture/projects/1',
    },
    fieldValueByName: { name: data.state.status, optionId: `status_${data.state.status}` },
    fieldValues: { nodes: fields(), pageInfo },
  };
}
function issueNode() {
  return {
    id: data.state.issueId,
    number: data.state.number,
    title: 'Fictional estimate publication',
    url: `https://github.com/${data.state.repository}/issues/${data.state.number}`,
    body: data.state.body,
    repository: { nameWithOwner: data.state.repository },
  };
}
function comments() {
  return data.state.comments.map((c) => ({
    __typename: 'IssueComment',
    id: c.node_id,
    databaseId: c.id,
    body: c.body,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    url: `https://github.com/${data.state.repository}/issues/${data.state.number}#issuecomment-${c.id}`,
    author: { login: 'operator' },
    issue: { number: data.state.number, repository: { nameWithOwner: data.state.repository } },
  }));
}
function commentPage(offset = 0) {
  const all = comments(),
    size = data.state.commentPageSize ?? 100;
  if (
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > 100 ||
    offset < 0 ||
    offset % size !== 0 ||
    (offset > 0 && offset >= all.length)
  )
    throw new Error('inflation-provider:comment-cursor');
  const end = offset + size;
  return {
    nodes: all.slice(offset, end),
    pageInfo: {
      hasNextPage: end < all.length,
      endCursor: end < all.length ? `comments:${end}` : null,
    },
  };
}
const responseIssue = (value) => ({
  data: { repository: { id: 'R_fixture', nameWithOwner: data.state.repository, issue: value } },
});
register(
  `query($owner: String!, $repo: String!, $issue: Int!) {
  repository(owner: $owner, name: $repo) { issue(number: $issue) { body } }
}`,
  'issue-body-read',
  subjectVariables,
  () => responseIssue({ body: data.state.body })
);
const fieldSelections = [
  '',
  `fieldValues(first: 100) { nodes {
    ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2FieldCommon { id } } }
    ... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2FieldCommon { id } } }
    ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { id } } }
    ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { id } } }
  } pageInfo { hasNextPage } }`,
  'fieldValues(first:100) { nodes { ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2FieldCommon { id } } } ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { id } } } } pageInfo { hasNextPage } }',
];
for (const selection of fieldSelections) {
  register(
    `query($owner: String!, $repo: String!, $issue: Int!, $after: String) {
    repository(owner: $owner, name: $repo) { id issue(number: $issue) {
      id number title url projectItems(first: 50, after: $after) { nodes {
        id project { id title url } fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name optionId } }
        ${selection}
      } pageInfo { hasNextPage endCursor } }
    } }
  }`,
    selection ? 'project-values' : 'membership',
    { ...subjectVariables, after: null },
    () => responseIssue({ ...issueNode(), projectItems: { nodes: [projectItem()], pageInfo } })
  );
}
const timingQuery =
  'query($owner:String!,$name:String!,$issue:Int!,$after:String){repository(owner:$owner,name:$name){nameWithOwner issue(number:$issue){number comments(first:100,after:$after){totalCount nodes{id body} pageInfo{hasNextPage endCursor}}}}}';
const timingMutation = `mutation($id: ID!, $body: String!) {
  updateIssueComment(input: { id: $id, body: $body }) { issueComment { id } }
}`;
const options = {
  F_SIZE: ['XS', 'S', 'M', 'L', 'XL'],
  F_PRIORITY: ['P0', 'P1', 'P2', 'P3'],
  F_DISPOSITION: ['Delivered', 'Replaced', 'Discarded', 'Duplicate', 'Incorporated', 'BLOCKED'],
};
register(
  `query($project: ID!) { node(id: $project) { ... on ProjectV2 { fields(first: 100) { nodes {
  ... on ProjectV2SingleSelectField { id options { id name } }
} } } } }`,
  'field-options',
  { project: data.state.projectId },
  () => ({
    data: {
      node: {
        fields: {
          nodes: Object.entries(options).map(([id, values]) => ({
            id,
            options: values.map((name) => ({ id: `${id}_${name}`, name })),
          })),
        },
      },
    },
  })
);
for (const [type, variable, selection] of [
  ['Float', 'val', 'number: $val'],
  ['String', 'val', 'text: $val'],
  ['String', 'option', 'singleSelectOptionId: $option'],
]) {
  register(
    `mutation($project: ID!, $item: ID!, $field: ID!, $${variable}: ${type}!) {
    updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { ${selection} } }) { projectV2Item { id } }
  }`,
    'project-write',
    (v) => {
      const definition = Object.entries(fieldDefinitions).find(([, [id]]) => id === v.field);
      return (
        definition &&
        variablesEqual(Object.keys(v).sort(), ['project', 'item', 'field', variable].sort()) &&
        v.project === data.state.projectId &&
        v.item === data.state.itemId &&
        (type === 'Float'
          ? definition[1][2] === 'Number' && Number.isFinite(v.val)
          : variable === 'option'
            ? options[v.field]?.some((name) => `${v.field}_${name}` === v.option)
            : definition[1][2] === 'Text' && typeof v.val === 'string')
      );
    },
    (v) => {
      const key = Object.keys(fieldDefinitions).find((key) => fieldDefinitions[key][0] === v.field);
      const value =
        variable === 'option'
          ? options[v.field].find((name) => `${v.field}_${name}` === v.option)
          : v.val;
      entry.checkpoint = key;
      entry.before = data.state.board[key];
      entry.after = value;
      entry.applied = true;
      data.state.board[key] = value;
      return {
        data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: data.state.itemId } } },
      };
    }
  );
}

// Exact production projection query, with fixture-owned subject variables.
register(
  `
  query AitmEstimationProjection($owner: String!, $name: String!, $issue: Int!) {
    repository(owner: $owner, name: $name) {
      issue(number: $issue) {
        body
        comments(first: 100) {
          nodes {
            __typename id databaseId body author { login } createdAt updatedAt
            issue { number repository { nameWithOwner } }
          }
          pageInfo { hasNextPage endCursor }
        }
        projectItems(first: 20) {
          nodes {
            id
            project { id }
            fieldValues(first: 100) {
              nodes {
                ... on ProjectV2ItemFieldNumberValue {
                  number
                  field { ... on ProjectV2FieldCommon { id } }
                }
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  field { ... on ProjectV2FieldCommon { id } }
                }
              }
            }
          }
        }
      }
    }
  }
`,
  'forecast-projection',
  { owner: 'fixture', name: 'inflation', issue: data.state.number },
  () =>
    responseIssue({
      ...issueNode(),
      comments: commentPage(),
      projectItems: { nodes: [projectItem()], pageInfo },
    })
);

register(
  `
  query AitmEstimationProjectionComments(
    $owner: String!
    $name: String!
    $issue: Int!
    $after: String!
  ) {
    repository(owner: $owner, name: $name) {
      issue(number: $issue) {
        number
        repository { nameWithOwner }
        comments(first: 100, after: $after) {
          nodes {
            __typename id databaseId body author { login } createdAt updatedAt
            issue { number repository { nameWithOwner } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`,
  'forecast-page',
  (v) =>
    variablesEqual(Object.keys(v).sort(), ['after', 'issue', 'name', 'owner']) &&
    v.owner === 'fixture' &&
    v.name === 'inflation' &&
    v.issue === data.state.number &&
    typeof v.after === 'string' &&
    /^comments:[1-9][0-9]*$/.test(v.after),
  (v) => responseIssue({ ...issueNode(), comments: commentPage(Number(v.after.slice(9))) })
);

let output;
try {
  if (JSON.stringify(argv) === JSON.stringify(['api', 'user', '--jq', '.login'])) {
    entry.checkpoint = 'viewer';
    output = data.state.viewer;
  } else if (JSON.stringify(argv) === JSON.stringify(['auth', 'status'])) {
    entry.checkpoint = 'auth';
    output = 'Fixture authentication';
  } else if (
    variablesEqual(argv, [
      'issue',
      'view',
      String(data.state.number),
      '-R',
      data.state.repository,
      '--json',
      'body',
      '-q',
      '.body',
    ])
  ) {
    entry.checkpoint = 'issue-body-read';
    output = data.state.body;
  } else if (
    argv.length === 8 &&
    variablesEqual(argv.slice(0, 7), [
      'issue',
      'comment',
      String(data.state.number),
      '-R',
      data.state.repository,
      '--body',
      argv[6],
    ])
  ) {
    throw new Error('inflation-provider:invalid-comment-argv');
  } else if (
    argv.length === 7 &&
    variablesEqual(argv.slice(0, 6), [
      'issue',
      'comment',
      String(data.state.number),
      '-R',
      data.state.repository,
      '--body',
    ])
  ) {
    const id = Math.max(100, ...data.state.comments.map((c) => c.id)) + 1;
    const now = new Date().toISOString();
    const comment = {
      id,
      node_id: `IC_fixture_${id}`,
      body: argv[6],
      issue_url: `https://api.github.com/repos/${data.state.repository}/issues/${data.state.number}`,
      created_at: now,
      updated_at: now,
    };
    entry.checkpoint = 'comment-create';
    entry.applied = true;
    entry.after = comment;
    data.state.comments.push(comment);
    output = `https://github.com/${data.state.repository}/issues/${data.state.number}#issuecomment-${id}`;
  } else if (
    variablesEqual(argv, [
      'api',
      'graphql',
      '-f',
      `query=${timingQuery}`,
      '-f',
      'owner=fixture',
      '-f',
      'name=inflation',
      '-F',
      `issue=${data.state.number}`,
    ])
  ) {
    entry.checkpoint = 'timing-read';
    output = responseIssue({
      number: data.state.number,
      comments: {
        nodes: comments().map(({ id, body }) => ({ id, body })),
        totalCount: data.state.comments.length,
        pageInfo,
      },
    });
  } else if (
    argv.length === 8 &&
    variablesEqual(argv.slice(0, 3), ['api', 'graphql', '-f']) &&
    normalizeQuery(argv[3]) === normalizeQuery(`query=${timingMutation}`) &&
    argv[4] === '-f' &&
    argv[6] === '-f' &&
    argv[5].startsWith('id=') &&
    argv[7].startsWith('body=')
  ) {
    const hits = data.state.comments.filter((c) => c.node_id === argv[5].slice(3));
    if (hits.length !== 1) throw new Error('inflation-provider:comment-target');
    entry.checkpoint = 'timing-write';
    entry.before = hits[0].body;
    entry.after = argv[7].slice(5);
    entry.applied = true;
    hits[0].body = entry.after;
    hits[0].updated_at = new Date().toISOString();
    output = { data: { updateIssueComment: { issueComment: { id: hits[0].node_id } } } };
  } else if (
    ['body', 'number,body', 'comments', 'blockedBy'].some((fields) =>
      ['-R', '--repo'].some((repoFlag) =>
        variablesEqual(argv, [
          'issue',
          'view',
          String(data.state.number),
          repoFlag,
          data.state.repository,
          '--json',
          fields,
        ])
      )
    )
  ) {
    entry.checkpoint = 'issue-read';
    output =
      argv.at(-1) === 'blockedBy'
        ? { blockedBy: { nodes: [], totalCount: 0, pageInfo } }
        : argv.at(-1) === 'comments'
          ? { comments: data.state.comments.map((c) => ({ id: c.node_id, body: c.body })) }
          : argv.at(-1) === 'body'
            ? { body: data.state.body }
            : { number: data.state.number, body: data.state.body };
  } else if (
    variablesEqual(argv, [
      'issue',
      'edit',
      String(data.state.number),
      '-R',
      data.state.repository,
      '--body-file',
      '-',
    ])
  ) {
    entry.checkpoint = classifyBodyWrite(data.state.body, stdin);
    entry.before = data.state.body;
    data.state.body = stdin;
    entry.after = stdin;
    entry.applied = true;
    output = `https://github.com/${data.state.repository}/issues/${data.state.number}`;
  } else if (
    variablesEqual(argv, [
      'api',
      `repos/${data.state.repository}/issues/${data.state.number}/comments`,
      '--paginate',
      '--jq',
      '[.[] | {id, body}]',
    ])
  ) {
    entry.checkpoint = 'rest-comments';
    output = data.state.comments.map(({ id, body }) => ({ id, body }));
  } else if (
    argv.length === 6 &&
    variablesEqual(argv.slice(0, 3), ['api', '-X', 'PATCH']) &&
    argv[4] === '-F' &&
    argv[5].startsWith('body=@')
  ) {
    const hits = data.state.comments.filter(
      (c) => argv[3] === `repos/${data.state.repository}/issues/comments/${c.id}`
    );
    if (hits.length !== 1) throw new Error('inflation-provider:rest-comment-target');
    const target = argv[5].slice(6);
    if (!target.startsWith(data.state.worktreePath + '/.scratch/gh/'))
      throw new Error('inflation-provider:body-file');
    entry.checkpoint = 'audit';
    entry.before = hits[0].body;
    entry.after = readFileSync(target, 'utf8');
    entry.applied = true;
    hits[0].body = entry.after;
    hits[0].updated_at = new Date().toISOString();
    output = hits[0];
  } else if (JSON.stringify(argv) === JSON.stringify(['api', 'graphql', '--input', '-'])) {
    const request = JSON.parse(stdin);
    const operation = queries.get(normalizeQuery(request.query));
    if (
      !operation ||
      !variablesEqual(Object.keys(request).sort(), ['query', 'variables']) ||
      !(typeof operation.variables === 'function'
        ? operation.variables(request.variables)
        : variablesEqual(request.variables, operation.variables))
    )
      throw new Error(`inflation-provider:unrecognized-graphql:${JSON.stringify(request)}`);
    entry.checkpoint = operation.checkpoint;
    output = operation.response(request.variables);
  } else throw new Error(`inflation-provider:unrecognized:${JSON.stringify({ argv, stdin })}`);
  for (const fault of data.faults) {
    if (fault.consumed || fault.checkpoint !== entry.checkpoint) continue;
    fault.seen = (fault.seen ?? 0) + 1;
    if (fault.seen !== fault.occurrence) continue;
    fault.consumed = true;
    entry.fault = structuredClone(fault);
    if (fault.phase === 'before-apply') {
      data.state = stateBeforeRequest;
      entry.applied = false;
      delete entry.after;
    }
    if (fault.action === 'transport-failure')
      throw new Error('inflation-provider:injected-transport-failure');
    if (fault.action === 'malformed-response') {
      output = '{malformed';
      continue;
    }
    const connection = output?.data?.repository?.issue?.comments;
    if (!connection) throw new Error('inflation-provider:response-fault-target');
    if (fault.action === 'duplicate-comment-id') {
      connection.nodes.push(structuredClone(connection.nodes[0]));
      continue;
    }
    if (fault.action === 'truncated-comments') {
      delete connection.pageInfo;
      continue;
    }
    if (fault.action === 'repeated-comment-cursor') {
      connection.pageInfo = { hasNextPage: true, endCursor: 'comments:1' };
      continue;
    }
    throw new Error('inflation-provider:invalid-fault');
  }
  entry.outcome = 'returned';
} catch (error) {
  entry.outcome = 'refused';
  entry.error = error.message;
  process.exitCode = 1;
  output = undefined;
  process.stderr.write(error.message + '\n');
} finally {
  data.ledger.push(entry);
  const temporary = `${file}.${process.pid}`;
  writeFileSync(temporary, JSON.stringify(data));
  renameSync(temporary, file);
  rmSync(lock, { recursive: true });
}
if (output !== undefined)
  process.stdout.write(typeof output === 'string' ? output : JSON.stringify(output));
